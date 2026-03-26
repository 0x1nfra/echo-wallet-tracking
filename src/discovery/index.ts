/**
 * Discovery orchestrator — runDiscovery(mint, options).
 *
 * Fetches early buyers and co-traders for a given token mint,
 * scores each candidate, and adds qualifying wallets to tracking.
 *
 * Requirements: DISC-02, DISC-03, DISC-04
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { wallets, discoveryCandidates, discoveryRuns } from '../db/schema.js';
import { fetchEarlyBuyers } from './early-buyers.js';
import { fetchCoTraders } from './graph-traverse.js';
import { importWalletHistory } from '../importers/history.js';
import { scoreAllEligible } from '../scoring/engine.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DiscoveryOptions {
  /** Minimum score for a candidate to be added. Default: 70 */
  minScore?: number;
  /** Dry run mode — score candidates but do not persist new wallets. Default: false */
  dryRun?: boolean;
  /** Optional dep injection for testing */
  _deps?: DiscoveryDeps;
}

export interface DiscoveryResult {
  runId: number;
  totalCandidates: number;
  added: number;
  rejected: number;
  alreadyTracked: number;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Injectable deps (for testing without real API/scoring calls)
// ---------------------------------------------------------------------------

export interface DiscoveryDeps {
  fetchEarlyBuyersFn: (mint: string) => Promise<string[]>;
  fetchCoTradersFn: (known: string[]) => Promise<string[]>;
  importHistoryFn: (address: string, opts: { fullHistory: boolean }) => Promise<void>;
  scoreAllEligibleFn: () => { scored: number; skipped: number };
  dbOverride?: typeof defaultDb;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROBATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

interface EvalResult {
  result: 'added' | 'rejected' | 'already_tracked' | 'dry_run';
  score: number | null;
}

async function evaluateCandidate(
  address: string,
  source: 'direct' | 'graph',
  runId: number,
  minScore: number,
  dryRun: boolean,
  deps: DiscoveryDeps,
  db: typeof defaultDb,
): Promise<EvalResult> {
  // 1. Already-tracked check (any status)
  const existingByAddress = db.select({ id: wallets.id })
    .from(wallets)
    .where(eq(wallets.address, address))
    .get();

  if (existingByAddress) {
    console.log(`Candidate ${address} already_tracked — skipping`);
    db.insert(discoveryCandidates).values({
      run_id: runId,
      address,
      source,
      score: null,
      result: 'already_tracked',
    }).run();
    return { result: 'already_tracked', score: null };
  }

  // 2. Insert wallet as status='importing', detection_status='pending'
  if (!dryRun) {
    db.insert(wallets).values({
      address,
      status: 'importing',
      detection_status: 'pending',
    }).run();
  }

  let score: number | null = null;

  try {
    if (!dryRun) {
      // 3. Import wallet history
      await deps.importHistoryFn(address, { fullHistory: true });

      // 4. Score all eligible wallets (includes this candidate after history_complete=true)
      deps.scoreAllEligibleFn();

      // 5. Re-read wallet row to get computed score and detection_status
      const walletRow = db.select({
        score: wallets.score,
        detection_status: wallets.detection_status,
      })
        .from(wallets)
        .where(eq(wallets.address, address))
        .get();

      score = walletRow?.score ?? null;
      const detectionStatus = walletRow?.detection_status;

      // 6. If detection_status='confirmed_suspicious' → reject
      if (detectionStatus === 'confirmed_suspicious') {
        db.delete(wallets).where(eq(wallets.address, address)).run();
        db.insert(discoveryCandidates).values({
          run_id: runId,
          address,
          source,
          score,
          result: 'rejected',
        }).run();
        return { result: 'rejected', score };
      }
    }

    // 7. If score < minScore → reject
    if (score === null || score < minScore) {
      if (!dryRun) {
        db.delete(wallets).where(eq(wallets.address, address)).run();
      }
      db.insert(discoveryCandidates).values({
        run_id: runId,
        address,
        source,
        score,
        result: dryRun ? 'dry_run' : 'rejected',
      }).run();
      return { result: dryRun ? 'dry_run' : 'rejected', score };
    }

    // 8. Score >= minScore → set probation_until 7 days from now
    if (!dryRun) {
      db.update(wallets)
        .set({ probation_until: Date.now() + PROBATION_MS })
        .where(eq(wallets.address, address))
        .run();
    }

    db.insert(discoveryCandidates).values({
      run_id: runId,
      address,
      source,
      score,
      result: dryRun ? 'dry_run' : 'added',
    }).run();

    return { result: dryRun ? 'dry_run' : 'added', score };
  } catch (err) {
    console.error(`Error importing/scoring candidate ${address}:`, err);
    // Cleanup partial insert
    if (!dryRun) {
      try {
        db.delete(wallets).where(eq(wallets.address, address)).run();
      } catch {
        // Ignore cleanup errors
      }
    }
    db.insert(discoveryCandidates).values({
      run_id: runId,
      address,
      source,
      score: null,
      result: 'rejected',
    }).run();
    return { result: 'rejected', score: null };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover and evaluate new wallet candidates for a given token mint.
 *
 * Phase 1 (direct): Fetch early buyers via fetchEarlyBuyers
 * Phase 2 (graph): Fetch co-traders via fetchCoTraders from confirmed smart wallets
 *
 * Each candidate is scored via importWalletHistory + scoreAllEligible.
 * Candidates passing minScore are added with probation_until set 7 days out.
 */
export async function runDiscovery(
  mint: string,
  options?: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const minScore = options?.minScore ?? 70;
  const dryRun = options?.dryRun ?? false;
  const db = options?._deps?.dbOverride ?? defaultDb;

  const deps: DiscoveryDeps = options?._deps ?? {
    fetchEarlyBuyersFn: (m) => fetchEarlyBuyers(m),
    fetchCoTradersFn: (known) => fetchCoTraders(known),
    importHistoryFn: (addr, opts) => importWalletHistory(addr, opts),
    scoreAllEligibleFn: () => scoreAllEligible(),
  };

  // Insert discovery_runs row and capture the new row id atomically
  const insertResult = db.insert(discoveryRuns).values({
    token_mint: mint,
    dry_run: dryRun,
  }).run();

  const runId = Number(insertResult.lastInsertRowid);

  let added = 0;
  let rejected = 0;
  let alreadyTracked = 0;

  // Phase 1: Direct candidates (early buyers)
  console.log(`Fetching early buyers for ${mint}...`);
  const directCandidates = await deps.fetchEarlyBuyersFn(mint);
  console.log(`Found ${directCandidates.length} direct candidates...`);
  console.log('Scoring candidates...');

  for (const address of directCandidates) {
    const evalResult = await evaluateCandidate(
      address, 'direct', runId, minScore, dryRun, deps, db,
    );
    if (evalResult.result === 'added') added++;
    else if (evalResult.result === 'already_tracked') alreadyTracked++;
    else if (evalResult.result === 'rejected') rejected++;
    // dry_run: counts as neither added nor rejected in totals
  }

  console.log(`Added ${added} wallets (rejected ${rejected})`);

  // Phase 2: Graph candidates (co-traders of confirmed smart wallets)
  console.log('Fetching co-traders (graph traversal)...');

  const confirmedSmartWallets = db.select({ address: wallets.address })
    .from(wallets)
    .where(
      eq(wallets.status, 'tracked'),
    )
    .all()
    .map(w => w.address);

  const graphCandidates = await deps.fetchCoTradersFn(confirmedSmartWallets);
  console.log(`Found ${graphCandidates.length} co-trader candidates...`);

  for (const address of graphCandidates) {
    const evalResult = await evaluateCandidate(
      address, 'graph', runId, minScore, dryRun, deps, db,
    );
    if (evalResult.result === 'added') added++;
    else if (evalResult.result === 'already_tracked') alreadyTracked++;
    else if (evalResult.result === 'rejected') rejected++;
  }

  const totalCandidates = directCandidates.length + graphCandidates.length;

  // Update discovery_runs with completion data
  db.update(discoveryRuns)
    .set({
      completed_at: Date.now(),
      total_candidates: totalCandidates,
      added_count: added,
      rejected_count: rejected,
    })
    .where(eq(discoveryRuns.id, runId))
    .run();

  console.log('Discovery complete.');

  return {
    runId,
    totalCandidates,
    added,
    rejected,
    alreadyTracked,
    dryRun,
  };
}
