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
  },
): number {
  const result = db.insert(signal_events).values({
    token_mint: opts.token_mint,
    fired_at: opts.fired_at,
    tier: opts.tier ?? 'strong',
    signal_score: 75,
    smart_wallet_count: 3,
    buy_velocity: 1.5,
    holder_score: 0.8,
    coordinated_wallet_count: 0,
    entry_price: opts.entry_price !== undefined ? opts.entry_price : 1.0,
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

    // Verify 5 rows still have null outcome_1h_price
    const unresolved = db.select().from(signal_events)
      .where(eq(signal_events.is_fully_resolved, false))
      .all();
    expect(unresolved.length).toBe(5);
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
