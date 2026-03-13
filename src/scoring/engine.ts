import { and, asc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallets, swaps, wallet_metrics, score_history } from '../db/schema.js';
import {
  groupIntoClosedTrades,
  calculateWinRate,
  calculateRealizedPnl,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateRecencyScore,
} from '../metrics/index.js';
import { composeScore } from './composer.js';
import type { ComputedMetrics, WalletScoreResult } from './composer.js';

const WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const ACTIVITY_FLOOR = 20;
const CONFIDENCE_DAMPENER_DENOMINATOR = 50;

type SwapRow = typeof swaps.$inferSelect;

function computeMetrics(walletSwaps: SwapRow[], nowMs: number): ComputedMetrics {
  const closedTrades = groupIntoClosedTrades(walletSwaps);
  const rawSharpe = calculateSharpeRatio(closedTrades);
  // Confidence dampener: scale down by min(1.0, tradeCount/50)
  const sharpeRatio = rawSharpe * Math.min(1.0, closedTrades.length / CONFIDENCE_DAMPENER_DENOMINATOR);

  const winRateDecimal = calculateWinRate(closedTrades);
  const recencyScore = calculateRecencyScore(walletSwaps, nowMs);
  const maxDrawdown = calculateMaxDrawdown(walletSwaps);

  const tradeCount = walletSwaps.length;
  const cutoff = nowMs - WINDOW_MS;
  const recentTradeCount = walletSwaps.filter(s => s.timestamp >= cutoff).length;

  const recentSells = walletSwaps.filter(s => s.side === 'sell' && s.timestamp >= cutoff);
  const distinctTokenSet = new Set(recentSells.map(s => s.token_mint));
  const distinctTokensTraded = distinctTokenSet.size;

  return {
    sharpeRatio,
    winRateDecimal,
    recencyScore,
    maxDrawdown,
    tradeCount,
    recentTradeCount,
    distinctTokensTraded,
  };
}

function persistScore(
  walletAddress: string,
  metrics: ComputedMetrics,
  scoreResult: WalletScoreResult,
  nowMs: number,
): void {
  // Upsert wallet_metrics
  db.insert(wallet_metrics).values({
    wallet_address: walletAddress,
    win_rate: metrics.winRateDecimal,
    realized_pnl_sol: null, // calculated separately if needed
    sharpe_ratio: metrics.sharpeRatio,
    max_drawdown: metrics.maxDrawdown,
    recency_score: metrics.recencyScore,
    score_total: scoreResult.total,
    score_risk_adjusted: scoreResult.riskAdjustedReturn,
    score_win_rate: scoreResult.winRate,
    score_consistency_recency: scoreResult.consistencyRecency,
    score_activity_health: scoreResult.activityHealth,
    trade_count: metrics.tradeCount,
    recent_trade_count: metrics.recentTradeCount,
    calculated_at: nowMs,
  }).onConflictDoUpdate({
    target: wallet_metrics.wallet_address,
    set: {
      win_rate: metrics.winRateDecimal,
      sharpe_ratio: metrics.sharpeRatio,
      max_drawdown: metrics.maxDrawdown,
      recency_score: metrics.recencyScore,
      score_total: scoreResult.total,
      score_risk_adjusted: scoreResult.riskAdjustedReturn,
      score_win_rate: scoreResult.winRate,
      score_consistency_recency: scoreResult.consistencyRecency,
      score_activity_health: scoreResult.activityHealth,
      trade_count: metrics.tradeCount,
      recent_trade_count: metrics.recentTradeCount,
      calculated_at: nowMs,
    },
  }).run();

  // Update wallets.score
  db.update(wallets)
    .set({ score: scoreResult.total })
    .where(eq(wallets.address, walletAddress))
    .run();

  // Append score_history row
  db.insert(score_history)
    .values({ wallet_address: walletAddress, score: scoreResult.total, scored_at: nowMs })
    .run();
}

/**
 * Score a single wallet. Returns silently without writing data if the wallet
 * does not pass the eligibility gate or dormancy guard.
 */
export function scoreWallet(walletAddress: string, nowMs: number = Date.now()): void {
  // 1. Eligibility gate
  const wallet = db.select().from(wallets).where(eq(wallets.address, walletAddress)).get();
  if (!wallet) return;
  if (wallet.history_complete !== true) return;
  if (wallet.detection_status !== 'confirmed_passing') return;

  // 2. Load all swaps ordered by timestamp asc
  const walletSwaps = db.select().from(swaps)
    .where(eq(swaps.wallet_address, walletAddress))
    .orderBy(asc(swaps.timestamp))
    .all();

  // 3. Activity floor
  if (walletSwaps.length < ACTIVITY_FLOOR) return;

  // 4. Compute metrics
  const metrics = computeMetrics(walletSwaps, nowMs);

  // 5. Dormancy guard: no recent trades → null score, return
  if (metrics.recentTradeCount < 1) {
    db.update(wallets)
      .set({ score: null })
      .where(eq(wallets.address, walletAddress))
      .run();
    return;
  }

  // 6. Compose score
  const scoreResult = composeScore(metrics);

  // 7. Persist
  persistScore(walletAddress, metrics, scoreResult, nowMs);
}

/**
 * Score a wallet only if new swaps exist since the last scoring run.
 */
export function scoreWalletIfNeeded(walletAddress: string): void {
  const existing = db.select().from(wallet_metrics)
    .where(eq(wallet_metrics.wallet_address, walletAddress))
    .get();

  if (!existing || existing.calculated_at === null) {
    scoreWallet(walletAddress);
    return;
  }

  // Check for any swaps newer than the last calculated_at
  const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
    .where(and(
      eq(swaps.wallet_address, walletAddress),
      gt(swaps.timestamp, existing.calculated_at),
    ))
    .get();

  if (!hasNewSwaps) return;

  scoreWallet(walletAddress);
}

/**
 * Score all eligible wallets (history_complete=true AND detection_status='confirmed_passing').
 * Returns { scored, skipped } counts.
 */
export function scoreAllEligible(): { scored: number; skipped: number } {
  const eligibleWallets = db.select({ address: wallets.address }).from(wallets)
    .where(and(
      eq(wallets.history_complete, true),
      eq(wallets.detection_status, 'confirmed_passing'),
    ))
    .all();

  let scored = 0;
  let skipped = 0;

  for (const { address } of eligibleWallets) {
    const nowMs = Date.now();
    const walletSwaps = db.select().from(swaps)
      .where(eq(swaps.wallet_address, address))
      .orderBy(asc(swaps.timestamp))
      .all();

    // Activity floor check
    if (walletSwaps.length < ACTIVITY_FLOOR) {
      skipped++;
      continue;
    }

    const metrics = computeMetrics(walletSwaps, nowMs);

    // Dormancy guard
    if (metrics.recentTradeCount < 1) {
      db.update(wallets).set({ score: null }).where(eq(wallets.address, address)).run();
      skipped++;
      continue;
    }

    const scoreResult = composeScore(metrics);
    persistScore(address, metrics, scoreResult, nowMs);
    scored++;
  }

  return { scored, skipped };
}
