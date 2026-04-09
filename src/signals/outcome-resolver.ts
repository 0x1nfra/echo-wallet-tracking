/**
 * Outcome Resolver — resolves pending outcome windows per cycle.
 *
 * Queries signal_events rows with due outcome windows and writes outcome
 * price/pct/status using DexScreener prices. Classifies outcomes using
 * per-tier thresholds. Caps at MAX_PER_CYCLE = 20 tokens per window per
 * cycle to respect DexScreener rate limits.
 *
 * Requirements: QUAL-01, OUTCOME-01, OUTCOME-02, OUTCOME-03, OUTCOME-04
 */
import { and, isNull, lte, eq, sql, isNotNull } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { signal_events } from '../db/schema.js';
import { DexScreenerFetcher } from '../fetchers/dexscreener.js';

export const MAX_PER_CYCLE = 20;

// Accuracy thresholds (documented per user decision in CONTEXT.md):
// Strong:   hit if price gain >= +50% within window
// Moderate: hit if price gain >= +25% within window
// Weak:     directional only — any non-negative return = hit
const HIT_THRESHOLDS: Record<'strong' | 'moderate' | 'weak', number | null> = {
  strong: 0.50,
  moderate: 0.25,
  weak: null, // null = directional
};

// Milestone thresholds — read once at module load time (not inside hot loops)
// Format: comma-separated percentages e.g. '50,100,300'
const MILESTONES: number[] = (process.env.OUTCOME_MILESTONES ?? '50,100,300').split(',').map(Number);

// Column key mapping for milestone flags (hit_N, hit_N_at)
const MILESTONE_COLUMNS: Record<number, {
  hit: 'hit_50' | 'hit_100' | 'hit_300';
  hit_at: 'hit_50_at' | 'hit_100_at' | 'hit_300_at';
}> = {
  50:  { hit: 'hit_50',  hit_at: 'hit_50_at'  },
  100: { hit: 'hit_100', hit_at: 'hit_100_at' },
  300: { hit: 'hit_300', hit_at: 'hit_300_at' },
};

/**
 * Classify an outcome for a single signal event window.
 *
 * Returns `{ status: 'failed', pct: null }` for rugs (null outcomePrice)
 * or missing/zero entry prices. Otherwise applies tier-specific thresholds.
 */
export function classifyOutcome(
  entryPrice: number | null,
  outcomePrice: number | null,
  tier: 'strong' | 'moderate' | 'weak',
): { status: 'hit' | 'miss' | 'failed'; pct: number | null } {
  if (outcomePrice === null) return { status: 'failed', pct: null };
  if (entryPrice === null || entryPrice === 0) return { status: 'failed', pct: null };

  const pct = (outcomePrice - entryPrice) / entryPrice;
  const threshold = HIT_THRESHOLDS[tier];

  // Directional (weak): non-negative = hit, negative = miss
  if (threshold === null) return { status: pct >= 0 ? 'hit' : 'miss', pct };
  return { status: pct >= threshold ? 'hit' : 'miss', pct };
}

/**
 * Update peak_price for a signal event if the resolved price is higher.
 * Runs after every window resolution — piggybacks on existing cycle.
 */
function updatePeakPrice(
  db: typeof defaultDb,
  eventId: number,
  outcomePrice: number | null,
  nowMs: number,
): void {
  if (outcomePrice === null) return;

  const current = db.select({
    peak_price: signal_events.peak_price,
  })
    .from(signal_events)
    .where(eq(signal_events.id, eventId))
    .get();

  if (!current) return;

  const currentPeak = current.peak_price;
  if (currentPeak === null || outcomePrice > currentPeak) {
    db.update(signal_events)
      .set({ peak_price: outcomePrice, peak_price_at: nowMs })
      .where(eq(signal_events.id, eventId))
      .run();
  }
}

/**
 * Write milestone hit flags when entry/outcome price ratio crosses configured thresholds.
 * Only writes if the flag is not already set (idempotency).
 */
function updateMilestones(
  db: typeof defaultDb,
  eventId: number,
  entryPrice: number | null,
  outcomePrice: number | null,
  nowMs: number,
): void {
  if (outcomePrice === null || entryPrice === null || entryPrice === 0) return;

  const pct = (outcomePrice - entryPrice) / entryPrice;
  const pctPct = pct * 100; // convert to percentage points

  const current = db.select({
    hit_50: signal_events.hit_50,
    hit_100: signal_events.hit_100,
    hit_300: signal_events.hit_300,
  })
    .from(signal_events)
    .where(eq(signal_events.id, eventId))
    .get();

  if (!current) return;

  for (const milestone of MILESTONES) {
    if (pctPct < milestone) continue;

    const cols = MILESTONE_COLUMNS[milestone];
    if (!cols) continue; // unknown milestone — skip

    // Check if already set to avoid unnecessary writes
    const alreadySet = current[cols.hit];
    if (!alreadySet) {
      db.update(signal_events)
        .set({ [cols.hit]: true, [cols.hit_at]: nowMs })
        .where(eq(signal_events.id, eventId))
        .run();
    }
  }
}

/**
 * Resolve pending outcome windows for signal_events.
 *
 * Processes four windows: 30m (1,800s), 1h (3600s), 4h (14400s), 24h (86400s).
 * For each window, fetches at most MAX_PER_CYCLE=20 due rows from DB,
 * calls DexScreener for current price, classifies outcome, and writes
 * outcome_Xh_price / outcome_Xh_pct / outcome_Xh_status back to the row.
 *
 * Uses IS NULL guard in WHERE clause to ensure idempotency — already-resolved
 * windows are never overwritten.
 *
 * After all windows are processed, marks is_fully_resolved=true for rows
 * where all FOUR outcome statuses are non-null (30m + 1h + 4h + 24h).
 *
 * Also runs 90-day retention cleanup at the start of each cycle.
 *
 * Peak price and milestone flags are updated after each window resolution.
 *
 * Rug detection runs at the 4h window: if bundler ratio >= 0.3 AND price
 * drop >= 90%, all four window statuses are overwritten to 'rug'.
 *
 * @returns Total number of window resolutions written in this cycle.
 */
export async function resolveOutcomes(
  db: typeof defaultDb = defaultDb,
  fetcher: DexScreenerFetcher = new DexScreenerFetcher(),
): Promise<number> {
  const nowMs = Date.now();
  let resolved = 0;

  // 90-day retention cleanup: delete fully-resolved events older than 90 days
  const ninetyDaysAgo = nowMs - 90 * 24 * 60 * 60 * 1000;
  db.delete(signal_events)
    .where(and(
      eq(signal_events.is_fully_resolved, true),
      lte(signal_events.fired_at, ninetyDaysAgo),
    ))
    .run();

  // ---------------------------------------------------------------------------
  // 30m window (1,800,000 ms) — processed FIRST before 1h/4h/24h
  // ---------------------------------------------------------------------------
  const due30m = db.select({
    id: signal_events.id,
    token_mint: signal_events.token_mint,
    entry_price: signal_events.entry_price,
    tier: signal_events.tier,
  })
    .from(signal_events)
    .where(and(
      isNull(signal_events.outcome_30m_price),
      lte(signal_events.fired_at, nowMs - 1_800_000),
    ))
    .limit(MAX_PER_CYCLE)
    .all();

  for (const row of due30m) {
    const outcomePrice = await fetcher.getTokenPrice(row.token_mint);
    const { status, pct } = classifyOutcome(
      row.entry_price,
      outcomePrice,
      row.tier as 'strong' | 'moderate' | 'weak',
    );

    db.update(signal_events)
      .set({
        outcome_30m_price: outcomePrice,
        outcome_30m_pct: pct,
        outcome_30m_status: status,
      })
      .where(and(
        eq(signal_events.id, row.id),
        isNull(signal_events.outcome_30m_price), // idempotency guard
      ))
      .run();

    updatePeakPrice(db, row.id, outcomePrice, nowMs);
    updateMilestones(db, row.id, row.entry_price, outcomePrice, nowMs);
    resolved++;
    await new Promise((r) => setTimeout(r, 200));
  }

  // ---------------------------------------------------------------------------
  // 1h window (3,600,000 ms)
  // ---------------------------------------------------------------------------
  const due1h = db.select({
    id: signal_events.id,
    token_mint: signal_events.token_mint,
    entry_price: signal_events.entry_price,
    tier: signal_events.tier,
  })
    .from(signal_events)
    .where(and(
      isNull(signal_events.outcome_1h_price),
      lte(signal_events.fired_at, nowMs - 3_600_000),
    ))
    .limit(MAX_PER_CYCLE)
    .all();

  for (const row of due1h) {
    const outcomePrice = await fetcher.getTokenPrice(row.token_mint);
    const { status, pct } = classifyOutcome(
      row.entry_price,
      outcomePrice,
      row.tier as 'strong' | 'moderate' | 'weak',
    );

    db.update(signal_events)
      .set({
        outcome_1h_price: outcomePrice,
        outcome_1h_pct: pct,
        outcome_1h_status: status,
      })
      .where(and(
        eq(signal_events.id, row.id),
        isNull(signal_events.outcome_1h_price), // idempotency guard
      ))
      .run();

    updatePeakPrice(db, row.id, outcomePrice, nowMs);
    updateMilestones(db, row.id, row.entry_price, outcomePrice, nowMs);
    resolved++;
    // 200ms delay between DexScreener calls — consistent with DexScreenerFetcher rate-limit handling
    await new Promise((r) => setTimeout(r, 200));
  }

  // ---------------------------------------------------------------------------
  // 4h window (14,400,000 ms)
  // ---------------------------------------------------------------------------
  const due4h = db.select({
    id: signal_events.id,
    token_mint: signal_events.token_mint,
    entry_price: signal_events.entry_price,
    tier: signal_events.tier,
  })
    .from(signal_events)
    .where(and(
      isNull(signal_events.outcome_4h_price),
      lte(signal_events.fired_at, nowMs - 14_400_000),
    ))
    .limit(MAX_PER_CYCLE)
    .all();

  for (const row of due4h) {
    const outcomePrice = await fetcher.getTokenPrice(row.token_mint);
    const { status, pct } = classifyOutcome(
      row.entry_price,
      outcomePrice,
      row.tier as 'strong' | 'moderate' | 'weak',
    );

    // Rug detection: runs only at 4h window, only for non-rug events
    const rugCandidate = db.select({
      coordinated_wallet_count: signal_events.coordinated_wallet_count,
      smart_wallet_count: signal_events.smart_wallet_count,
      is_rug: signal_events.is_rug,
    })
      .from(signal_events)
      .where(eq(signal_events.id, row.id))
      .get();

    if (
      rugCandidate &&
      !rugCandidate.is_rug &&
      rugCandidate.smart_wallet_count > 0 &&
      (rugCandidate.coordinated_wallet_count / rugCandidate.smart_wallet_count) >= 0.3 &&
      pct !== null && pct <= -0.90
    ) {
      // Overwrite ALL FOUR window statuses to 'rug' (including 24h which may not yet be resolved)
      db.update(signal_events)
        .set({
          is_rug: true,
          outcome_30m_status: 'rug',
          outcome_1h_status: 'rug',
          outcome_4h_status: 'rug',
          outcome_24h_status: 'rug',
        })
        .where(eq(signal_events.id, row.id))
        .run();
      // Still write the 4h price and pct for data completeness
      db.update(signal_events)
        .set({ outcome_4h_price: outcomePrice, outcome_4h_pct: pct })
        .where(eq(signal_events.id, row.id))
        .run();

      updatePeakPrice(db, row.id, outcomePrice, nowMs);
      resolved++;
      await new Promise((r) => setTimeout(r, 200));
      continue; // skip the normal 4h write below
    }

    db.update(signal_events)
      .set({
        outcome_4h_price: outcomePrice,
        outcome_4h_pct: pct,
        outcome_4h_status: status,
      })
      .where(and(
        eq(signal_events.id, row.id),
        isNull(signal_events.outcome_4h_price), // idempotency guard
      ))
      .run();

    updatePeakPrice(db, row.id, outcomePrice, nowMs);
    updateMilestones(db, row.id, row.entry_price, outcomePrice, nowMs);
    resolved++;
    await new Promise((r) => setTimeout(r, 200));
  }

  // ---------------------------------------------------------------------------
  // 24h window (86,400,000 ms) — skip tokens already classified as rug at 4h
  // ---------------------------------------------------------------------------
  const due24h = db.select({
    id: signal_events.id,
    token_mint: signal_events.token_mint,
    entry_price: signal_events.entry_price,
    tier: signal_events.tier,
  })
    .from(signal_events)
    .where(and(
      isNull(signal_events.outcome_24h_price),
      lte(signal_events.fired_at, nowMs - 86_400_000),
      eq(signal_events.is_rug, false), // skip tokens already classified as rug at 4h
    ))
    .limit(MAX_PER_CYCLE)
    .all();

  for (const row of due24h) {
    const outcomePrice = await fetcher.getTokenPrice(row.token_mint);
    const { status, pct } = classifyOutcome(
      row.entry_price,
      outcomePrice,
      row.tier as 'strong' | 'moderate' | 'weak',
    );

    db.update(signal_events)
      .set({
        outcome_24h_price: outcomePrice,
        outcome_24h_pct: pct,
        outcome_24h_status: status,
      })
      .where(and(
        eq(signal_events.id, row.id),
        isNull(signal_events.outcome_24h_price), // idempotency guard
      ))
      .run();

    updatePeakPrice(db, row.id, outcomePrice, nowMs);
    updateMilestones(db, row.id, row.entry_price, outcomePrice, nowMs);
    resolved++;
    await new Promise((r) => setTimeout(r, 200));
  }

  // ---------------------------------------------------------------------------
  // Mark is_fully_resolved for rows where all FOUR windows are now complete
  // (30m + 1h + 4h + 24h)
  // ---------------------------------------------------------------------------
  db.update(signal_events)
    .set({ is_fully_resolved: true })
    .where(and(
      eq(signal_events.is_fully_resolved, false),
      isNotNull(signal_events.outcome_30m_status),
      sql`${signal_events.outcome_1h_status} IS NOT NULL`,
      sql`${signal_events.outcome_4h_status} IS NOT NULL`,
      sql`${signal_events.outcome_24h_status} IS NOT NULL`,
    ))
    .run();

  return resolved;
}
