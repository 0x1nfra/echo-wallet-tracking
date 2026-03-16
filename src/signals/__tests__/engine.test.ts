/**
 * Tests for computeAllTokenSignals() — the DB-integrated signal engine.
 *
 * Uses a real in-memory SQLite database (same pattern as other integration tests)
 * and passes the test db instance to computeAllTokenSignals().
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { computeAllTokenSignals } from '../engine.js';
import {
  wallets,
  swaps,
  wallet_metrics,
  wallet_flags,
  token_signals,
} from '../../db/schema.js';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestDb = ReturnType<typeof createTestDb>['db'];

/** Insert a confirmed-passing smart wallet */
function insertSmartWallet(db: TestDb, address: string, scoreTotal = 70): void {
  db.insert(wallets).values({
    address,
    status: 'tracked',
    detection_status: 'confirmed_passing',
  }).run();
  db.insert(wallet_metrics).values({
    wallet_address: address,
    score_total: scoreTotal,
  }).run();
}

/** Insert a swap (timestamp in Unix seconds) */
function insertSwap(
  db: TestDb,
  walletAddress: string,
  tokenMint: string,
  side: 'buy' | 'sell',
  tokenAmount: number,
  timestampSec: number,
): void {
  const sig = `sig_${Math.random().toString(36).slice(2)}`;
  db.insert(swaps).values({
    wallet_address: walletAddress,
    tx_signature: sig,
    dex: 'raydium',
    token_mint: tokenMint,
    side,
    token_amount: tokenAmount,
    sol_amount: 1.0,
    timestamp: timestampSec,
    slot: 1,
  }).run();
}

/** Return current Unix seconds */
function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeAllTokenSignals', () => {
  let db: TestDb;
  let sqlite: Database.Database;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  });

  afterEach(() => {
    sqlite.close();
  });

  // Test 1 — No smart wallets → return { updated: 0, suppressed: 0 }
  it('returns zero counts when no confirmed-passing wallets exist', () => {
    const result = computeAllTokenSignals(db);
    expect(result).toEqual({ updated: 0, suppressed: 0 });
  });

  // Test 2 — Smart wallets exist but no swaps in last 24h → zero counts
  it('returns zero counts when smart wallets have no recent swaps', () => {
    insertSmartWallet(db, 'wallet1');
    // Insert swap older than 24h
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, nowSec() - 90_000);
    const result = computeAllTokenSignals(db);
    expect(result).toEqual({ updated: 0, suppressed: 0 });
  });

  // Test 3 — Token with ≥2 current holders and recent buys → updated=1
  it('upserts token signal when ≥2 current holders with recent activity', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 75);
    const recentTs = nowSec() - 1800; // 30 min ago (within 24h and 1h)
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs);

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(1);
    expect(result.suppressed).toBe(0);

    // Verify token_signals row was inserted
    const row = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .get();
    expect(row).toBeDefined();
    expect(row!.signal_score).toBeGreaterThan(0);
    expect(row!.signal_tier).not.toBe('inactive');
    expect(row!.updated_at).toBeDefined();
  });

  // Test 4 — Token with 1 current holder (< MIN_SMART_WALLETS) + no existing record → skip (do not insert)
  it('does NOT insert new record when token score is 0 and no existing record', () => {
    insertSmartWallet(db, 'wallet1', 80);
    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);
    // Only 1 holder → score=0

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(0);
    expect(result.suppressed).toBe(0);

    const row = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .get();
    expect(row).toBeUndefined();
  });

  // Test 5 — Token that previously had active signal but now has < 2 holders → suppressed=1
  it('marks existing active record as inactive when score drops to 0 (suppressed)', () => {
    // Pre-insert an active signal record for tokenA
    db.insert(token_signals).values({
      token_mint: 'tokenA',
      signal_score: 72,
      signal_tier: 'strong',
      smart_wallet_count: 3,
      buy_velocity_1h: 2,
      exit_pressure: 0.1,
      pnl_weighted_holder_score: 75,
      coordination_discount: 1.0,
      updated_at: Date.now() - 60_000,
    }).run();

    // Insert only 1 smart wallet with recent swap (below MIN_SMART_WALLETS)
    insertSmartWallet(db, 'wallet1', 80);
    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(0);
    expect(result.suppressed).toBe(1);

    const row = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .get();
    expect(row).toBeDefined();
    expect(row!.signal_score).toBe(0);
    expect(row!.signal_tier).toBe('inactive');
    expect(row!.smart_wallet_count).toBe(0);
  });

  // Test 6 — Non-smart wallets (status != 'tracked' or detection_status != 'confirmed_passing') are excluded
  it('excludes wallets that are not confirmed-passing', () => {
    // Insert wallets with wrong statuses
    db.insert(wallets).values({ address: 'wallet_removed', status: 'removed', detection_status: 'confirmed_passing' }).run();
    db.insert(wallets).values({ address: 'wallet_suspected', status: 'tracked', detection_status: 'suspected' }).run();

    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet_removed', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet_suspected', 'tokenA', 'buy', 100, recentTs);

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(0);
    expect(result.suppressed).toBe(0);
  });

  // Test 7 — Coordinated wallets (active bundler flag) reduce signal score
  it('applies coordination discount when wallets have active bundler flags', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 80);
    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs);

    // Mark wallet1 as coordinated (bundler flag, not cleared)
    db.insert(wallet_flags).values({
      wallet_address: 'wallet1',
      detector: 'bundler',
      confidence: 'confirmed_suspicious',
      evidence_summary: '{}',
      cleared: false,
    }).run();

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(1);

    const row = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .get();
    expect(row).toBeDefined();
    expect(row!.coordinated_wallet_count).toBe(1);
    // Score should be discounted (lower than if no coordination)
    // Coordination discount = 1 - (0.5 * 0.7) = 0.65
    expect(row!.signal_score).toBeGreaterThan(0);
    expect(row!.coordination_discount).toBeCloseTo(0.65, 2);
  });

  // Test 8 — All holders coordinated → score=0, suppressed if existing record
  it('suppresses token when all current holders are coordinated', () => {
    // Pre-insert active signal
    db.insert(token_signals).values({
      token_mint: 'tokenA',
      signal_score: 50,
      signal_tier: 'moderate',
      smart_wallet_count: 2,
      buy_velocity_1h: 1,
      exit_pressure: 0,
      pnl_weighted_holder_score: 70,
      coordination_discount: 1.0,
      updated_at: Date.now() - 60_000,
    }).run();

    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 80);
    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs);

    // Flag BOTH as coordinated
    for (const addr of ['wallet1', 'wallet2']) {
      db.insert(wallet_flags).values({
        wallet_address: addr,
        detector: 'bundler',
        confidence: 'confirmed_suspicious',
        evidence_summary: '{}',
        cleared: false,
      }).run();
    }

    const result = computeAllTokenSignals(db);
    expect(result.suppressed).toBe(1);
    expect(result.updated).toBe(0);
  });

  // Test 9 — Cleared bundler flags do NOT count as coordinated
  it('ignores cleared bundler flags when computing coordination', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 80);
    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs);

    // Cleared flag — should NOT count
    db.insert(wallet_flags).values({
      wallet_address: 'wallet1',
      detector: 'bundler',
      confidence: 'confirmed_suspicious',
      evidence_summary: '{}',
      cleared: true,
      cleared_at: Date.now(),
    }).run();

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(1);

    const row = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .get();
    expect(row!.coordinated_wallet_count).toBe(0);
    expect(row!.coordination_discount).toBeCloseTo(1.0, 5);
  });

  // Test 10 — Multiple tokens processed in one call
  it('processes multiple tokens in a single call', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 75);
    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet1', 'tokenB', 'buy', 100, recentTs);
    insertSwap(db, 'wallet2', 'tokenB', 'buy', 100, recentTs);

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(2);
    expect(result.suppressed).toBe(0);
  });

  // Test 11 — Upsert: running again updates existing records (no duplicates)
  it('upserts on conflict — running twice does not create duplicate rows', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 75);
    const recentTs = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs);

    computeAllTokenSignals(db);
    computeAllTokenSignals(db); // Second run should upsert, not throw

    const rows = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .all();
    expect(rows.length).toBe(1); // Still only 1 row
    expect(rows[0].signal_score).toBeGreaterThan(0);
  });

  // Test 12 — Timestamp is Unix seconds (24h cutoff correctness)
  it('uses Unix seconds for timestamp cutoffs — excludes swaps older than 24h', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 75);
    // Swaps older than 24h — should not count as recent 24h activity
    const oldTs = nowSec() - 90_000; // 25 hours ago
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, oldTs);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, oldTs);

    const result = computeAllTokenSignals(db);
    // No recent 24h swaps → no tokenA in recent tokens → skip (no existing record either)
    expect(result.updated).toBe(0);
    expect(result.suppressed).toBe(0);
  });

  // Test 13 — buysLast1h counts only swaps within last 1 hour
  it('counts buysLast1h using 1-hour window cutoff', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 80);
    const recentTs24h = nowSec() - 3600 * 2; // 2h ago (in 24h window but NOT in 1h window)
    const recentTs1h = nowSec() - 1800; // 30min ago (in both windows)
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs24h);
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs24h);
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, recentTs1h); // only this counts for 1h
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, recentTs1h); // and this

    const result = computeAllTokenSignals(db);
    expect(result.updated).toBe(1);

    const row = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .get();
    expect(row!.buy_velocity_1h).toBe(2); // Only 2 buys in last hour
  });

  // Test 14 — Net position: wallet that bought then sold all → not a current holder
  // ---------------------------------------------------------------------------
  // Probation guard tests (DISC-03)
  // ---------------------------------------------------------------------------

  // Test P1 — Wallet on active probation (probation_until in future) is excluded
  // Two wallets trade the same token. Without the guard: 2 holders → updated=1.
  // With the probation guard: probation wallet excluded → 1 holder → score=0 → updated=0.
  it('excludes wallet with probation_until in the future from smart wallet query', () => {
    const { db: testDb, sqlite: testSqlite } = createTestDb();
    const futureProbation = Date.now() + 86400000; // 24h from now

    // Insert wallet on probation
    testDb.insert(wallets).values({
      address: 'wallet_probation',
      status: 'tracked',
      detection_status: 'confirmed_passing',
      probation_until: futureProbation,
    }).run();
    testDb.insert(wallet_metrics).values({
      wallet_address: 'wallet_probation',
      score_total: 80,
    }).run();

    // Insert a normal (non-probation) wallet to pair with it
    testDb.insert(wallets).values({
      address: 'wallet_normal_p1',
      status: 'tracked',
      detection_status: 'confirmed_passing',
      // probation_until = null (non-probationary)
    }).run();
    testDb.insert(wallet_metrics).values({
      wallet_address: 'wallet_normal_p1',
      score_total: 75,
    }).run();

    // Both wallets buy the same token in the last 24h
    const ts = nowSec() - 1800;
    for (const addr of ['wallet_probation', 'wallet_normal_p1']) {
      const sig = `sig_p1_${addr}_${Math.random().toString(36).slice(2)}`;
      testDb.insert(swaps).values({
        wallet_address: addr,
        tx_signature: sig,
        dex: 'raydium',
        token_mint: 'tokenProbation',
        side: 'buy',
        token_amount: 100,
        sol_amount: 1.0,
        timestamp: ts,
        slot: 1,
      }).run();
    }

    const result = computeAllTokenSignals(testDb);
    // Wallet on probation excluded → only 1 holder (wallet_normal_p1) → score=0 → updated=0
    expect(result).toEqual({ updated: 0, suppressed: 0 });

    testSqlite.close();
  });

  // Test P2 — Wallet with probation_until in the past IS included
  it('includes wallet with probation_until in the past in smart wallet query', () => {
    const { db: testDb, sqlite: testSqlite } = createTestDb();
    const pastProbation = Date.now() - 86400000; // 24h ago

    testDb.insert(wallets).values({
      address: 'wallet_past_prob',
      status: 'tracked',
      detection_status: 'confirmed_passing',
      probation_until: pastProbation,
    }).run();
    testDb.insert(wallet_metrics).values({
      wallet_address: 'wallet_past_prob',
      score_total: 80,
    }).run();
    testDb.insert(wallets).values({
      address: 'wallet_past_prob_2',
      status: 'tracked',
      detection_status: 'confirmed_passing',
      probation_until: pastProbation,
    }).run();
    testDb.insert(wallet_metrics).values({
      wallet_address: 'wallet_past_prob_2',
      score_total: 75,
    }).run();

    const ts = nowSec() - 1800;
    for (const addr of ['wallet_past_prob', 'wallet_past_prob_2']) {
      const sig = `sig_past_prob_${addr}_${Math.random().toString(36).slice(2)}`;
      testDb.insert(swaps).values({
        wallet_address: addr,
        tx_signature: sig,
        dex: 'raydium',
        token_mint: 'tokenPastProb',
        side: 'buy',
        token_amount: 100,
        sol_amount: 1.0,
        timestamp: ts,
        slot: 1,
      }).run();
    }

    const result = computeAllTokenSignals(testDb);
    // Probation expired → wallet included → 2 holders → signal computed
    expect(result.updated).toBe(1);

    testSqlite.close();
  });

  // Test P3 — Wallet with probation_until = null IS included (non-probationary)
  it('includes wallet with probation_until = null in smart wallet query', () => {
    const { db: testDb, sqlite: testSqlite } = createTestDb();

    testDb.insert(wallets).values({
      address: 'wallet_no_prob',
      status: 'tracked',
      detection_status: 'confirmed_passing',
      // probation_until defaults to null
    }).run();
    testDb.insert(wallet_metrics).values({
      wallet_address: 'wallet_no_prob',
      score_total: 80,
    }).run();
    testDb.insert(wallets).values({
      address: 'wallet_no_prob_2',
      status: 'tracked',
      detection_status: 'confirmed_passing',
    }).run();
    testDb.insert(wallet_metrics).values({
      wallet_address: 'wallet_no_prob_2',
      score_total: 75,
    }).run();

    const ts = nowSec() - 1800;
    for (const addr of ['wallet_no_prob', 'wallet_no_prob_2']) {
      const sig = `sig_no_prob_${addr}_${Math.random().toString(36).slice(2)}`;
      testDb.insert(swaps).values({
        wallet_address: addr,
        tx_signature: sig,
        dex: 'raydium',
        token_mint: 'tokenNoProb',
        side: 'buy',
        token_amount: 100,
        sol_amount: 1.0,
        timestamp: ts,
        slot: 1,
      }).run();
    }

    const result = computeAllTokenSignals(testDb);
    // No probation → wallet included → 2 holders → signal computed
    expect(result.updated).toBe(1);

    testSqlite.close();
  });

  it('correctly computes current holders using net position (buy_amt > sell_amt)', () => {
    insertSmartWallet(db, 'wallet1', 80);
    insertSmartWallet(db, 'wallet2', 80);
    // wallet1 buys 100, sells 100 → net = 0 → NOT a current holder
    const ts = nowSec() - 1800;
    insertSwap(db, 'wallet1', 'tokenA', 'buy', 100, ts);
    insertSwap(db, 'wallet1', 'tokenA', 'sell', 100, ts + 60); // sold all
    // wallet2 buys 100, sells 50 → net > 0 → IS a current holder
    insertSwap(db, 'wallet2', 'tokenA', 'buy', 100, ts);
    insertSwap(db, 'wallet2', 'tokenA', 'sell', 50, ts + 60);

    const result = computeAllTokenSignals(db);
    // Only 1 current holder (wallet2) → score=0, no insert
    expect(result.updated).toBe(0);

    const row = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, 'tokenA'))
      .get();
    expect(row).toBeUndefined();
  });
});
