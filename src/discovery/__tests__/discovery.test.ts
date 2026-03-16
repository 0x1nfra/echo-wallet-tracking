/**
 * Tests for runDiscovery() — the discovery orchestrator.
 *
 * Uses a real in-memory SQLite database (same pattern as signal engine tests)
 * and injectable dep overrides to avoid real API/scoring calls.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../db/schema.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { runDiscovery } from '../index.js';
import { wallets, discoveryCandidates } from '../../db/schema.js';

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

/** Build no-op injectable deps that simulate scoring with a configurable score */
function buildDeps(db: TestDb, opts: {
  directCandidates?: string[];
  graphCandidates?: string[];
  /** Score to assign when re-reading from DB after scoreAllEligible */
  candidateScore?: number;
  /** detection_status to simulate after scoring */
  detectionStatus?: string;
  /** Map of address → score for fine-grained control */
  scoreMap?: Record<string, number | null>;
  /** Whether importHistoryFn should throw */
  throwOnImport?: boolean;
}) {
  return {
    fetchEarlyBuyersFn: async (_mint: string) => opts.directCandidates ?? [],
    fetchCoTradersFn: async (_known: string[]) => opts.graphCandidates ?? [],
    importHistoryFn: async (address: string, _o: { fullHistory: boolean }) => {
      if (opts.throwOnImport) throw new Error('Import error');
      // Simulate history import: set history_complete=true, status='tracked'
      db.update(wallets)
        .set({
          status: 'tracked',
          history_complete: true,
          detection_status: (opts.detectionStatus ?? 'confirmed_passing') as any,
        })
        .where(eq(wallets.address, address))
        .run();
    },
    scoreAllEligibleFn: () => {
      // Simulate scoring: write score to each tracked wallet
      const tracked = db.select({ address: wallets.address })
        .from(wallets)
        .where(eq(wallets.status, 'tracked'))
        .all();
      for (const { address } of tracked) {
        const score = opts.scoreMap?.[address] ?? opts.candidateScore ?? 75;
        db.update(wallets)
          .set({ score })
          .where(eq(wallets.address, address))
          .run();
      }
      return { scored: tracked.length, skipped: 0 };
    },
    dbOverride: db,
  };
}

describe('runDiscovery', () => {
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

  // Test 1: candidate above threshold is added with probation_until set 7 days out
  it('adds candidate above minScore threshold with probation_until set 7 days in future', async () => {
    const beforeMs = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const deps = buildDeps(db, {
      directCandidates: ['candidate_A'],
      candidateScore: 80,
    });

    const result = await runDiscovery('MINT_ABOVE', { minScore: 70, _deps: deps });

    expect(result.added).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.alreadyTracked).toBe(0);

    // Wallet should exist in DB
    const walletRow = db.select().from(wallets).where(eq(wallets.address, 'candidate_A')).get();
    expect(walletRow).toBeDefined();
    expect(walletRow!.probation_until).toBeGreaterThanOrEqual(beforeMs + sevenDaysMs - 1000);
    expect(walletRow!.probation_until).toBeLessThanOrEqual(beforeMs + sevenDaysMs + 5000);

    // discoveryCandidates row with result='added'
    const candRow = db.select().from(discoveryCandidates)
      .where(eq(discoveryCandidates.address, 'candidate_A'))
      .get();
    expect(candRow).toBeDefined();
    expect(candRow!.result).toBe('added');
    expect(candRow!.score).toBe(80);
  });

  // Test 2: candidate below threshold is deleted and logged as 'rejected'
  it('rejects candidate below minScore — deletes wallet row and logs rejected', async () => {
    const deps = buildDeps(db, {
      directCandidates: ['candidate_B'],
      candidateScore: 40, // below minScore=70
    });

    const result = await runDiscovery('MINT_BELOW', { minScore: 70, _deps: deps });

    expect(result.added).toBe(0);
    expect(result.rejected).toBe(1);

    // Wallet should NOT exist in DB (deleted)
    const walletRow = db.select().from(wallets).where(eq(wallets.address, 'candidate_B')).get();
    expect(walletRow).toBeUndefined();

    // discoveryCandidates row with result='rejected'
    const candRow = db.select().from(discoveryCandidates)
      .where(eq(discoveryCandidates.address, 'candidate_B'))
      .get();
    expect(candRow).toBeDefined();
    expect(candRow!.result).toBe('rejected');
    expect(candRow!.score).toBe(40);
  });

  // Test 3: already-tracked wallet is skipped without import, logged as 'already_tracked'
  it('skips already-tracked wallet without importing, logs already_tracked', async () => {
    // Pre-insert wallet as tracked
    db.insert(wallets).values({
      address: 'candidate_C',
      status: 'tracked',
      detection_status: 'confirmed_passing',
    }).run();

    let importCalled = false;
    const deps = buildDeps(db, {
      directCandidates: ['candidate_C'],
      candidateScore: 80,
    });
    // Wrap importHistoryFn to detect calls
    const originalImport = deps.importHistoryFn;
    deps.importHistoryFn = async (address, opts) => {
      if (address === 'candidate_C') importCalled = true;
      return originalImport(address, opts);
    };

    const result = await runDiscovery('MINT_TRACKED', { minScore: 70, _deps: deps });

    expect(result.alreadyTracked).toBe(1);
    expect(result.added).toBe(0);
    expect(importCalled).toBe(false);

    // discoveryCandidates row with result='already_tracked'
    const candRow = db.select().from(discoveryCandidates)
      .where(eq(discoveryCandidates.address, 'candidate_C'))
      .get();
    expect(candRow).toBeDefined();
    expect(candRow!.result).toBe('already_tracked');
  });

  // Test 4: dry-run=true does not insert wallet rows, logs result='dry_run'
  it('dry-run does not insert wallet rows; logs dry_run to discoveryCandidates', async () => {
    const deps = buildDeps(db, {
      directCandidates: ['candidate_D'],
      candidateScore: 80,
    });

    const result = await runDiscovery('MINT_DRY', {
      minScore: 70,
      dryRun: true,
      _deps: deps,
    });

    expect(result.dryRun).toBe(true);
    expect(result.added).toBe(0);

    // Wallet should NOT be in DB in dry-run mode
    const walletRow = db.select().from(wallets).where(eq(wallets.address, 'candidate_D')).get();
    expect(walletRow).toBeUndefined();

    // discoveryCandidates row with result='dry_run'
    const candRow = db.select().from(discoveryCandidates)
      .where(eq(discoveryCandidates.address, 'candidate_D'))
      .get();
    expect(candRow).toBeDefined();
    expect(candRow!.result).toBe('dry_run');
  });
});
