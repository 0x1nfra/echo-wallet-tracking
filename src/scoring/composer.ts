import { normalizeSharpeLike } from '../metrics/sharpe.js';

export interface ComputedMetrics {
  sharpeRatio: number;
  winRateDecimal: number;        // 0.0-1.0
  recencyScore: number;          // 0-100
  maxDrawdown: number;           // 0.0-1.0 (percentage as decimal)
  tradeCount: number;            // total swap rows
  recentTradeCount: number;      // swaps in last 180 days
  distinctTokensTraded: number;  // unique token_mints with sells in last 180 days
}

export interface WalletScoreResult {
  total: number;                 // 5-95 clamped
  riskAdjustedReturn: number;   // 0-100 sub-score (40% weight)
  winRate: number;               // 0-100 sub-score (20% weight)
  consistencyRecency: number;    // 0-100 sub-score (20% weight)
  activityHealth: number;        // 0-100 sub-score (20% weight)
}

// Weight constants
const WEIGHT_RISK_ADJUSTED_RETURN = 0.40;
const WEIGHT_WIN_RATE = 0.20;
const WEIGHT_CONSISTENCY_RECENCY = 0.20;
const WEIGHT_ACTIVITY_HEALTH = 0.20;

// Clamping bounds
const TOTAL_MIN = 5;
const TOTAL_MAX = 95;

/**
 * Composes a wallet score from computed metrics.
 * Combines five sub-scores into a final 5-95 bounded total.
 */
export function composeScore(metrics: ComputedMetrics): WalletScoreResult {
  // riskAdjustedReturn: tanh-normalized Sharpe ratio [0-100]
  const riskAdjustedReturn = normalizeSharpeLike(metrics.sharpeRatio);

  // winRate: simple conversion from decimal to percentage [0-100]
  const winRate = Math.round(metrics.winRateDecimal * 100);

  // consistencyRecency: recency score with drawdown penalty [0-100]
  const drawdownPenalty = Math.round(metrics.maxDrawdown * 50);
  const consistencyRecency = Math.max(0, Math.min(100, metrics.recencyScore - drawdownPenalty));

  // activityHealth: blend of trade frequency and token diversity [0-100]
  const frequencyScore = Math.min(100, metrics.recentTradeCount * 2);
  const diversityScore = Math.min(100, metrics.distinctTokensTraded * 5);
  const activityHealth = Math.min(
    100,
    Math.round(0.6 * frequencyScore + 0.4 * diversityScore),
  );

  // Weighted combination
  const raw =
    riskAdjustedReturn * WEIGHT_RISK_ADJUSTED_RETURN +
    winRate * WEIGHT_WIN_RATE +
    consistencyRecency * WEIGHT_CONSISTENCY_RECENCY +
    activityHealth * WEIGHT_ACTIVITY_HEALTH;

  // Clamp total to [5, 95]
  const total = Math.max(TOTAL_MIN, Math.min(TOTAL_MAX, Math.round(raw)));

  return { total, riskAdjustedReturn, winRate, consistencyRecency, activityHealth };
}
