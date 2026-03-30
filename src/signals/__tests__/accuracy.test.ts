/**
 * Tests for getAccuracyStats() — accuracy aggregation query.
 *
 * Uses a real in-memory SQLite database (same pattern as engine.test.ts).
 * Validates per-tier hit rate aggregation with minimum sample gate (N=20).
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAccuracyStats, MIN_SAMPLE } from '../accuracy.js';
import { signal_events } from '../../db/schema.js';

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

/** Insert a fully-resolved signal_events row with specific outcome */
function insertResolvedEvent(
  db: TestDb,
  opts: {
    token_mint: string;
    tier: 'strong' | 'moderate' | 'weak';
    outcome_24h_status: 'hit' | 'miss' | 'failed';
    entry_price?: number | null;
    outcome_1h_pct?: number;
    outcome_4h_pct?: number;
    outcome_24h_pct?: number;
  },
): void {
  const entryPrice = opts.entry_price !== undefined ? opts.entry_price : 1.0;
  db.insert(signal_events).values({
    token_mint: opts.token_mint,
    fired_at: Date.now() - 30 * 3600_000, // 30h ago — all windows past
    tier: opts.tier,
    signal_score: 75,
    smart_wallet_count: 3,
    buy_velocity: 1.5,
    holder_score: 0.8,
    coordinated_wallet_count: 0,
    entry_price: entryPrice,
    // Fully resolved: all three windows complete
    outcome_1h_price: 1.1,
    outcome_1h_pct: opts.outcome_1h_pct ?? 0.1,
    outcome_1h_status: 'hit',
    outcome_4h_price: 1.2,
    outcome_4h_pct: opts.outcome_4h_pct ?? 0.2,
    outcome_4h_status: 'hit',
    outcome_24h_price: opts.outcome_24h_status === 'failed' ? null : 1.5,
    outcome_24h_pct: opts.outcome_24h_pct ?? (opts.outcome_24h_status === 'failed' ? null : 0.5),
    outcome_24h_status: opts.outcome_24h_status,
    is_fully_resolved: true,
  }).run();
}

/** Insert an unresolved signal_events row (missing outcome windows) */
function insertUnresolvedEvent(db: TestDb, token_mint: string, tier: 'strong' | 'moderate' | 'weak'): void {
  db.insert(signal_events).values({
    token_mint,
    fired_at: Date.now() - 30 * 60 * 1000, // 30 min ago — 1h window not due yet
    tier,
    signal_score: 60,
    smart_wallet_count: 2,
    buy_velocity: 1.0,
    holder_score: 0.6,
    coordinated_wallet_count: 0,
    entry_price: 1.0,
    // No outcome columns set — not resolved
    is_fully_resolved: false,
  }).run();
}

// ---------------------------------------------------------------------------
// MIN_SAMPLE constant export
// ---------------------------------------------------------------------------

describe('MIN_SAMPLE constant', () => {
  it('exports MIN_SAMPLE = 20', () => {
    expect(MIN_SAMPLE).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// getAccuracyStats tests
// ---------------------------------------------------------------------------

describe('getAccuracyStats', () => {
  it('returns empty array for empty database', () => {
    const { db } = createTestDb();
    const stats = getAccuracyStats(db);
    expect(stats).toEqual([]);
  });

  it('returns empty array when only unresolved rows exist', () => {
    const { db } = createTestDb();
    insertUnresolvedEvent(db, 'TOKEN_UNRESOLVED_A', 'strong');
    insertUnresolvedEvent(db, 'TOKEN_UNRESOLVED_B', 'moderate');

    const stats = getAccuracyStats(db);
    expect(stats).toEqual([]);
  });

  it('returns hit_rate_24h=0.75 for 20 fully-resolved Strong rows (15 hit, 5 miss)', () => {
    const { db } = createTestDb();

    for (let i = 0; i < 15; i++) {
      insertResolvedEvent(db, { token_mint: `STRONG_HIT_${i}`, tier: 'strong', outcome_24h_status: 'hit' });
    }
    for (let i = 0; i < 5; i++) {
      insertResolvedEvent(db, { token_mint: `STRONG_MISS_${i}`, tier: 'strong', outcome_24h_status: 'miss' });
    }

    const stats = getAccuracyStats(db);
    expect(stats.length).toBe(1);
    const strong = stats[0];
    expect(strong.tier).toBe('strong');
    expect(strong.total_resolved).toBe(20);
    expect(strong.hits_24h).toBe(15);
    expect(strong.hit_rate_24h).toBeCloseTo(0.75, 5);
  });

  it('returns hit_rate_24h=null for only 5 resolved Strong rows (below MIN_SAMPLE=20)', () => {
    const { db } = createTestDb();

    for (let i = 0; i < 5; i++) {
      insertResolvedEvent(db, { token_mint: `STRONG_FEW_${i}`, tier: 'strong', outcome_24h_status: 'hit' });
    }

    const stats = getAccuracyStats(db);
    expect(stats.length).toBe(1);
    const strong = stats[0];
    expect(strong.total_resolved).toBe(5);
    expect(strong.hit_rate_24h).toBeNull();
  });

  it('returns separate rows per tier for mixed Strong + Moderate', () => {
    const { db } = createTestDb();

    for (let i = 0; i < 20; i++) {
      insertResolvedEvent(db, { token_mint: `STRONG_MIX_${i}`, tier: 'strong', outcome_24h_status: 'hit' });
    }
    for (let i = 0; i < 20; i++) {
      insertResolvedEvent(db, {
        token_mint: `MODERATE_MIX_${i}`,
        tier: 'moderate',
        outcome_24h_status: i < 10 ? 'hit' : 'miss',
      });
    }

    const stats = getAccuracyStats(db);
    expect(stats.length).toBe(2);

    const strong = stats.find((s) => s.tier === 'strong');
    const moderate = stats.find((s) => s.tier === 'moderate');

    expect(strong).toBeDefined();
    expect(strong!.hit_rate_24h).toBeCloseTo(1.0, 5);
    expect(moderate).toBeDefined();
    expect(moderate!.hit_rate_24h).toBeCloseTo(0.5, 5);
  });

  it('counts failed outcomes in denominator: 15 hit + 3 miss + 2 failed = 0.75 hit rate', () => {
    const { db } = createTestDb();

    for (let i = 0; i < 15; i++) {
      insertResolvedEvent(db, { token_mint: `FAIL_HIT_${i}`, tier: 'strong', outcome_24h_status: 'hit' });
    }
    for (let i = 0; i < 3; i++) {
      insertResolvedEvent(db, { token_mint: `FAIL_MISS_${i}`, tier: 'strong', outcome_24h_status: 'miss' });
    }
    for (let i = 0; i < 2; i++) {
      insertResolvedEvent(db, { token_mint: `FAIL_RUG_${i}`, tier: 'strong', outcome_24h_status: 'failed' });
    }

    const stats = getAccuracyStats(db);
    expect(stats.length).toBe(1);
    const strong = stats[0];
    expect(strong.total_resolved).toBe(20);
    expect(strong.hits_24h).toBe(15);
    expect(strong.hit_rate_24h).toBeCloseTo(0.75, 5); // 15/20
  });

  it('excludes rows with entry_price=null from all aggregates', () => {
    const { db } = createTestDb();

    // 20 normal rows with entry_price set
    for (let i = 0; i < 20; i++) {
      insertResolvedEvent(db, { token_mint: `ENTRY_NORMAL_${i}`, tier: 'strong', outcome_24h_status: 'hit' });
    }

    // 5 rows with null entry_price — should be excluded from denominator
    for (let i = 0; i < 5; i++) {
      db.insert(signal_events).values({
        token_mint: `ENTRY_NULL_${i}`,
        fired_at: Date.now() - 30 * 3600_000,
        tier: 'strong',
        signal_score: 75,
        smart_wallet_count: 3,
        buy_velocity: 1.5,
        holder_score: 0.8,
        coordinated_wallet_count: 0,
        entry_price: null, // No entry price — must be excluded
        outcome_1h_price: 1.1,
        outcome_1h_pct: 0.1,
        outcome_1h_status: 'hit',
        outcome_4h_price: 1.2,
        outcome_4h_pct: 0.2,
        outcome_4h_status: 'hit',
        outcome_24h_price: 1.5,
        outcome_24h_pct: 0.5,
        outcome_24h_status: 'hit',
        is_fully_resolved: true,
      }).run();
    }

    const stats = getAccuracyStats(db);
    expect(stats.length).toBe(1);
    const strong = stats[0];
    // Only 20 rows counted (null entry_price excluded)
    expect(strong.total_resolved).toBe(20);
    expect(strong.hit_rate_24h).toBeCloseTo(1.0, 5);
  });

  it('avg_return_24h correctly averages non-null outcome_24h_pct values', () => {
    const { db } = createTestDb();

    // Insert 20 rows with specific 24h pct values
    for (let i = 0; i < 20; i++) {
      insertResolvedEvent(db, {
        token_mint: `AVG_RETURN_${i}`,
        tier: 'strong',
        outcome_24h_status: 'hit',
        outcome_24h_pct: 0.5,
      });
    }

    const stats = getAccuracyStats(db);
    expect(stats.length).toBe(1);
    const strong = stats[0];
    expect(strong.avg_return_24h).toBeCloseTo(0.5, 5);
  });
});
