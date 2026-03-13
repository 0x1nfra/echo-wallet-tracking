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

export function composeScore(_metrics: ComputedMetrics): WalletScoreResult {
  throw new Error('Not implemented');
}
