/**
 * Outcome Resolver — resolves pending outcome windows per cycle.
 *
 * Queries signal_events rows with due outcome windows and writes outcome
 * price/pct/status using DexScreener prices. Classifies outcomes using
 * per-tier thresholds. Caps at MAX_PER_CYCLE = 20 tokens per window per
 * cycle to respect DexScreener rate limits.
 *
 * Requirements: QUAL-01
 */
import { and, isNull, lte, eq, sql } from 'drizzle-orm';
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
 * Resolve pending outcome windows for signal_events.
 *
 * Processes three windows: 1h (3600s), 4h (14400s), 24h (86400s).
 * For each window, fetches at most MAX_PER_CYCLE=20 due rows from DB,
 * calls DexScreener for current price, classifies outcome, and writes
 * outcome_Xh_price / outcome_Xh_pct / outcome_Xh_status back to the row.
 *
 * Uses IS NULL guard in WHERE clause to ensure idempotency — already-resolved
 * windows are never overwritten.
 *
 * After all windows are processed, marks is_fully_resolved=true for rows
 * where all three outcome statuses are non-null.
 *
 * Also runs 90-day retention cleanup at the start of each cycle.
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

    resolved++;
    await new Promise((r) => setTimeout(r, 200));
  }

  // ---------------------------------------------------------------------------
  // 24h window (86,400,000 ms)
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

    resolved++;
    await new Promise((r) => setTimeout(r, 200));
  }

  // ---------------------------------------------------------------------------
  // Mark is_fully_resolved for rows where all three windows are now complete
  // ---------------------------------------------------------------------------
  db.update(signal_events)
    .set({ is_fully_resolved: true })
    .where(and(
      eq(signal_events.is_fully_resolved, false),
      sql`${signal_events.outcome_1h_status} IS NOT NULL`,
      sql`${signal_events.outcome_4h_status} IS NOT NULL`,
      sql`${signal_events.outcome_24h_status} IS NOT NULL`,
    ))
    .run();

  return resolved;
}
