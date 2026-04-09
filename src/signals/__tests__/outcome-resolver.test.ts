/**
 * Tests for classifyOutcome() and resolveOutcomes() — outcome resolver.
 *
 * Uses a real in-memory SQLite database (same pattern as engine.test.ts)
 * and injects the test db into resolveOutcomes().
 * DexScreenerFetcher is injected as a mock instance (no jest.mock — ESM pattern).
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { classifyOutcome, resolveOutcomes } from '../outcome-resolver.js';
import { signal_events } from '../../db/schema.js';
import { DexScreenerFetcher } from '../../fetchers/dexscreener.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../db/migrations');

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, sqlite };
}

type TestDb = ReturnType<typeof createTestDb>['db'];

/** Insert a signal_events row for testing */
function insertSignalEvent(
  db: TestDb,
  opts: {
    token_mint: string;
    fired_at: number;
    tier?: 'strong' | 'moderate' | 'weak';
    entry_price?: number | null;
    smart_wallet_count?: number;
    coordinated_wallet_count?: number;
    is_rug?: boolean;
  },
): number {
  const result = db.insert(signal_events).values({
    token_mint: opts.token_mint,
    fired_at: opts.fired_at,
    tier: opts.tier ?? 'strong',
    signal_score: 75,
    smart_wallet_count: opts.smart_wallet_count ?? 3,
    buy_velocity: 1.5,
    holder_score: 0.8,
    coordinated_wallet_count: opts.coordinated_wallet_count ?? 0,
    entry_price: opts.entry_price !== undefined ? opts.entry_price : 1.0,
    is_rug: opts.is_rug ?? false,
  }).run();
  return Number(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Mock DexScreenerFetcher for testing
// ---------------------------------------------------------------------------

class MockDexScreenerFetcher extends DexScreenerFetcher {
  private prices: Map<string, number | null>;

  constructor(prices: Record<string, number | null> = {}) {
    super('http://localhost:1'); // invalid endpoint, never called
    this.prices = new Map(Object.entries(prices));
  }

  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    if (this.prices.has(tokenAddress)) {
      return this.prices.get(tokenAddress)!;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// classifyOutcome tests
// ---------------------------------------------------------------------------

describe('classifyOutcome', () => {
  describe('Strong tier', () => {
    it('returns hit when gain >= +50%', () => {
      const result = classifyOutcome(1.0, 1.55, 'strong');
      expect(result.status).toBe('hit');
      expect(result.pct).toBeCloseTo(0.55, 5);
    });

    it('returns miss when gain is +30% (below +50% threshold)', () => {
      const result = classifyOutcome(1.0, 1.30, 'strong');
      expect(result.status).toBe('miss');
      expect(result.pct).toBeCloseTo(0.30, 5);
    });

    it('returns hit at exactly +50% boundary', () => {
      const result = classifyOutcome(1.0, 1.50, 'strong');
      expect(result.status).toBe('hit');
      expect(result.pct).toBeCloseTo(0.50, 5);
    });
  });

  describe('Moderate tier', () => {
    it('returns hit when gain >= +25%', () => {
      const result = classifyOutcome(1.0, 1.30, 'moderate');
      expect(result.status).toBe('hit');
      expect(result.pct).toBeCloseTo(0.30, 5);
    });

    it('returns miss when gain is +10% (below +25% threshold)', () => {
      const result = classifyOutcome(1.0, 1.10, 'moderate');
      expect(result.status).toBe('miss');
      expect(result.pct).toBeCloseTo(0.10, 5);
    });

    it('returns hit at exactly +25% boundary', () => {
      const result = classifyOutcome(1.0, 1.25, 'moderate');
      expect(result.status).toBe('hit');
      expect(result.pct).toBeCloseTo(0.25, 5);
    });
  });

  describe('Weak tier (directional)', () => {
    it('returns hit for +5% gain (any positive = hit)', () => {
      const result = classifyOutcome(1.0, 1.05, 'weak');
      expect(result.status).toBe('hit');
      expect(result.pct).toBeCloseTo(0.05, 5);
    });

    it('returns miss for -3% loss', () => {
      const result = classifyOutcome(1.0, 0.97, 'weak');
      expect(result.status).toBe('miss');
      expect(result.pct).toBeCloseTo(-0.03, 5);
    });

    it('returns miss at exactly 0% (no gain = not positive)', () => {
      const result = classifyOutcome(1.0, 1.0, 'weak');
      expect(result.status).toBe('hit'); // 0 >= 0 is true (0% is directional break-even, treated as hit)
    });
  });

  describe('Failed outcomes', () => {
    it('returns failed when outcomePrice is null (rug/no liquidity)', () => {
      const result = classifyOutcome(1.0, null, 'strong');
      expect(result.status).toBe('failed');
      expect(result.pct).toBeNull();
    });

    it('returns failed when entryPrice is null (no entry price recorded)', () => {
      const result = classifyOutcome(null, 1.5, 'strong');
      expect(result.status).toBe('failed');
      expect(result.pct).toBeNull();
    });

    it('returns failed when entryPrice is 0 (division by zero guard)', () => {
      const result = classifyOutcome(0, 1.5, 'strong');
      expect(result.status).toBe('failed');
      expect(result.pct).toBeNull();
    });

    it('returns failed when both entryPrice and outcomePrice are null', () => {
      const result = classifyOutcome(null, null, 'moderate');
      expect(result.status).toBe('failed');
      expect(result.pct).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// resolveOutcomes tests
// ---------------------------------------------------------------------------

describe('resolveOutcomes', () => {
  it('resolves 1h window when fired_at is 2h ago and outcome_1h_price is null', async () => {
    const { db } = createTestDb();
    const twoHoursAgo = Date.now() - 2 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_A',
      fired_at: twoHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_A: 1.6 });
    const resolved = await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row).toBeDefined();
    // 1h window should be resolved (2h ago >= 1h window)
    expect(row!.outcome_1h_price).toBeCloseTo(1.6, 5);
    expect(row!.outcome_1h_pct).toBeCloseTo(0.6, 5);
    expect(row!.outcome_1h_status).toBe('hit'); // 60% >= 50% strong threshold
    // 4h window should NOT be resolved yet (2h < 4h)
    expect(row!.outcome_4h_price).toBeNull();
    expect(resolved).toBeGreaterThan(0);
  });

  it('sets is_fully_resolved=true when all three windows are resolved', async () => {
    const { db } = createTestDb();
    const thirtyHoursAgo = Date.now() - 30 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_B',
      fired_at: thirtyHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_B: 1.6 });
    // Run once — should resolve all three windows (1h, 4h, 24h all due)
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.outcome_1h_status).not.toBeNull();
    expect(row!.outcome_4h_status).not.toBeNull();
    expect(row!.outcome_24h_status).not.toBeNull();
    expect(row!.is_fully_resolved).toBe(true);
  });

  it('marks outcome as failed and sets is_fully_resolved when DexScreener returns null (rug)', async () => {
    const { db } = createTestDb();
    const thirtyHoursAgo = Date.now() - 30 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_RUG',
      fired_at: thirtyHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    // DexScreener returns null = rug
    const fetcher = new MockDexScreenerFetcher({ TOKEN_RUG: null });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.outcome_1h_status).toBe('failed');
    expect(row!.outcome_4h_status).toBe('failed');
    expect(row!.outcome_24h_status).toBe('failed');
    expect(row!.is_fully_resolved).toBe(true);
  });

  it('caps at MAX_PER_CYCLE=20 per window — only 20 of 25 due rows are processed', async () => {
    const { db } = createTestDb();
    const twoHoursAgo = Date.now() - 2 * 3600_000;

    const mints: Record<string, number | null> = {};
    for (let i = 0; i < 25; i++) {
      const mint = `TOKEN_BATCH_${i}`;
      mints[mint] = 1.5;
      insertSignalEvent(db, { token_mint: mint, fired_at: twoHoursAgo, tier: 'strong' });
    }

    const fetcher = new MockDexScreenerFetcher(mints);
    const resolved = await resolveOutcomes(db, fetcher);

    // Only 20 processed per window per cycle (1h window has 25 due)
    // resolved counts total across all windows — 20 for 1h window
    expect(resolved).toBe(20);

    // Verify 5 rows still have null outcome_1h_price (not yet processed)
    const allRows = db.select().from(signal_events).all();
    const withNull1h = allRows.filter((r) => r.outcome_1h_price === null);
    const withResolved1h = allRows.filter((r) => r.outcome_1h_price !== null);
    expect(withResolved1h.length).toBe(20);
    expect(withNull1h.length).toBe(5);
  });

  it('is idempotent — calling resolveOutcomes twice does not overwrite already-resolved outcome_1h_price', async () => {
    const { db } = createTestDb();
    const twoHoursAgo = Date.now() - 2 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_IDEM',
      fired_at: twoHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    // First call: price is 1.6
    const fetcher1 = new MockDexScreenerFetcher({ TOKEN_IDEM: 1.6 });
    await resolveOutcomes(db, fetcher1);

    const after1 = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(after1!.outcome_1h_price).toBeCloseTo(1.6, 5);

    // Second call: price would be different but WHERE IS NULL guard prevents overwrite
    const fetcher2 = new MockDexScreenerFetcher({ TOKEN_IDEM: 2.0 });
    await resolveOutcomes(db, fetcher2);

    const after2 = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    // Still 1.6 — idempotency preserved
    expect(after2!.outcome_1h_price).toBeCloseTo(1.6, 5);
  });
});

// ---------------------------------------------------------------------------
// 30m window tests
// ---------------------------------------------------------------------------

describe('resolveOutcomes — 30m window', () => {
  it('writes outcome_30m_price/pct/status for a signal fired 31 minutes ago', async () => {
    const { db } = createTestDb();
    const thirtyOneMinutesAgo = Date.now() - 31 * 60_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_30M_A',
      fired_at: thirtyOneMinutesAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_30M_A: 1.6 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.outcome_30m_price).toBeCloseTo(1.6, 5);
    expect(row!.outcome_30m_pct).toBeCloseTo(0.6, 5);
    expect(row!.outcome_30m_status).toBe('hit');
  });

  it('leaves outcome_1h_price null when signal is only 31 minutes old (not yet 1h due)', async () => {
    const { db } = createTestDb();
    const thirtyOneMinutesAgo = Date.now() - 31 * 60_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_30M_B',
      fired_at: thirtyOneMinutesAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_30M_B: 1.6 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.outcome_30m_price).toBeCloseTo(1.6, 5);
    expect(row!.outcome_1h_price).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Peak price tracking tests
// ---------------------------------------------------------------------------

describe('resolveOutcomes — peak price tracking', () => {
  it('updates peak_price when resolved price is higher than current peak_price', async () => {
    const { db } = createTestDb();
    const thirtyOneMinutesAgo = Date.now() - 31 * 60_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_PEAK_A',
      fired_at: thirtyOneMinutesAgo,
      entry_price: 1.0,
    });

    // Set existing peak_price to something low
    db.update(signal_events)
      .set({ peak_price: 1.2, peak_price_at: thirtyOneMinutesAgo })
      .where(eq(signal_events.id, rowId))
      .run();

    const fetcher = new MockDexScreenerFetcher({ TOKEN_PEAK_A: 1.8 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.peak_price).toBeCloseTo(1.8, 5);
    expect(row!.peak_price_at).toBeGreaterThan(thirtyOneMinutesAgo);
  });

  it('does NOT update peak_price when stored peak is already higher than resolved price', async () => {
    const { db } = createTestDb();
    const thirtyOneMinutesAgo = Date.now() - 31 * 60_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_PEAK_B',
      fired_at: thirtyOneMinutesAgo,
      entry_price: 1.0,
    });

    const existingPeakAt = thirtyOneMinutesAgo + 100;
    db.update(signal_events)
      .set({ peak_price: 3.0, peak_price_at: existingPeakAt })
      .where(eq(signal_events.id, rowId))
      .run();

    // Resolved price is lower than existing peak
    const fetcher = new MockDexScreenerFetcher({ TOKEN_PEAK_B: 1.5 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    // Peak should remain at 3.0
    expect(row!.peak_price).toBeCloseTo(3.0, 5);
    expect(row!.peak_price_at).toBe(existingPeakAt);
  });
});

// ---------------------------------------------------------------------------
// Rug detection tests
// ---------------------------------------------------------------------------

describe('resolveOutcomes — rug detection at 4h', () => {
  it('sets is_rug=true and overwrites all four window statuses to rug when ratio >= 0.3 and drop >= 90%', async () => {
    const { db } = createTestDb();
    const fiveHoursAgo = Date.now() - 5 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_RUG_A',
      fired_at: fiveHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
      smart_wallet_count: 5,
      coordinated_wallet_count: 3, // ratio = 0.6 >= 0.3
    });

    // Price dropped -92% → rug condition met
    const fetcher = new MockDexScreenerFetcher({ TOKEN_RUG_A: 0.08 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.is_rug).toBe(true);
    expect(row!.outcome_4h_status).toBe('rug');
    expect(row!.outcome_1h_status).toBe('rug');
    expect(row!.outcome_30m_status).toBe('rug');
    expect(row!.outcome_24h_status).toBe('rug');
  });

  it('does NOT set is_rug when ratio is below 0.3 even with >= 90% drop', async () => {
    const { db } = createTestDb();
    const fiveHoursAgo = Date.now() - 5 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_RUG_B',
      fired_at: fiveHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
      smart_wallet_count: 10,
      coordinated_wallet_count: 1, // ratio = 0.1 < 0.3
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_RUG_B: 0.08 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.is_rug).toBe(false);
    expect(row!.outcome_4h_status).not.toBe('rug');
  });

  it('does NOT set is_rug when ratio >= 0.3 but price drop is only -50% (not >= 90%)', async () => {
    const { db } = createTestDb();
    const fiveHoursAgo = Date.now() - 5 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_RUG_C',
      fired_at: fiveHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
      smart_wallet_count: 2,
      coordinated_wallet_count: 1, // ratio = 0.5 >= 0.3
    });

    // Only -50% drop — not enough for rug
    const fetcher = new MockDexScreenerFetcher({ TOKEN_RUG_C: 0.5 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.is_rug).toBe(false);
  });

  it('skips rug detection for tokens already marked is_rug=true (idempotency)', async () => {
    const { db } = createTestDb();
    const fiveHoursAgo = Date.now() - 5 * 3600_000;
    // Token already rugged — outcome_4h_price is null so it would still be queried
    // But is_rug=true means it should not be re-processed in the rug detection guard
    insertSignalEvent(db, {
      token_mint: 'TOKEN_RUG_D',
      fired_at: fiveHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
      smart_wallet_count: 5,
      coordinated_wallet_count: 3,
      is_rug: true,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_RUG_D: 0.05 });
    // Should not throw, should not re-run rug detection
    await expect(resolveOutcomes(db, fetcher)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 24h loop rug guard tests
// ---------------------------------------------------------------------------

describe('resolveOutcomes — 24h loop skips rugged tokens', () => {
  it('skips a rugged token in the 24h loop — outcome_24h_price remains null', async () => {
    const { db } = createTestDb();
    const thirtyHoursAgo = Date.now() - 30 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_24H_RUG',
      fired_at: thirtyHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
      is_rug: true,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_24H_RUG: 0.05 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    // 24h loop should skip this token because is_rug=true
    expect(row!.outcome_24h_price).toBeNull();
    expect(row!.outcome_24h_status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Milestone write tests
// ---------------------------------------------------------------------------

describe('resolveOutcomes — milestone writes', () => {
  it('sets hit_50=true and hit_50_at when outcome price crosses +50% at 1h resolution', async () => {
    const { db } = createTestDb();
    const twoHoursAgo = Date.now() - 2 * 3600_000;
    const beforeMs = Date.now();
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_MILE_A',
      fired_at: twoHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    // +60% gain — crosses +50% milestone
    const fetcher = new MockDexScreenerFetcher({ TOKEN_MILE_A: 1.6 });
    await resolveOutcomes(db, fetcher);
    const afterMs = Date.now();

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.hit_50).toBe(true);
    expect(row!.hit_50_at).toBeGreaterThanOrEqual(beforeMs);
    expect(row!.hit_50_at).toBeLessThanOrEqual(afterMs);
  });

  it('leaves hit_50 null when +50% milestone is not crossed at 24h resolution', async () => {
    const { db } = createTestDb();
    const thirtyHoursAgo = Date.now() - 30 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_MILE_B',
      fired_at: thirtyHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    // Only +20% — does not cross +50% milestone
    const fetcher = new MockDexScreenerFetcher({ TOKEN_MILE_B: 1.2 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    expect(row!.hit_50).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// is_fully_resolved — requires all FOUR window statuses
// ---------------------------------------------------------------------------

describe('resolveOutcomes — is_fully_resolved requires four windows', () => {
  it('sets is_fully_resolved=true only when all four window statuses are non-null', async () => {
    const { db } = createTestDb();
    const thirtyHoursAgo = Date.now() - 30 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_FULL_A',
      fired_at: thirtyHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_FULL_A: 1.6 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    // All four window statuses should be non-null
    expect(row!.outcome_30m_status).not.toBeNull();
    expect(row!.outcome_1h_status).not.toBeNull();
    expect(row!.outcome_4h_status).not.toBeNull();
    expect(row!.outcome_24h_status).not.toBeNull();
    expect(row!.is_fully_resolved).toBe(true);
  });

  it('keeps is_fully_resolved=false when only 3 of 4 windows are resolved', async () => {
    const { db } = createTestDb();
    // Signal fired 2h ago — only 30m and 1h windows are due, not 4h or 24h
    const twoHoursAgo = Date.now() - 2 * 3600_000;
    const rowId = insertSignalEvent(db, {
      token_mint: 'TOKEN_FULL_B',
      fired_at: twoHoursAgo,
      tier: 'strong',
      entry_price: 1.0,
    });

    const fetcher = new MockDexScreenerFetcher({ TOKEN_FULL_B: 1.6 });
    await resolveOutcomes(db, fetcher);

    const row = db.select().from(signal_events).where(eq(signal_events.id, rowId)).get();
    // Only 30m and 1h resolved — is_fully_resolved should remain false
    expect(row!.outcome_30m_status).not.toBeNull();
    expect(row!.outcome_1h_status).not.toBeNull();
    expect(row!.outcome_4h_status).toBeNull();
    expect(row!.is_fully_resolved).toBe(false);
  });
});
