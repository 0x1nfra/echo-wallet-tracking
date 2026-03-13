import type { ClosedTrade } from './win-rate.js';

const SHARPE_CAP = 3.0;
const CONFIDENCE_TRADE_COUNT = 50;

/**
 * Calculates an annualized-like Sharpe ratio from per-trade percentage returns.
 * Return per trade = realized_pnl_sol / cost_basis_sol.
 * Requires cost_basis_sol > 0.
 * Returns 0 for fewer than 2 valid trades.
 * Applies a confidence dampener: multiply by min(1.0, tradeCount / 50).
 * Caps at 3.0.
 */
export function calculateSharpeRatio(closedTrades: ClosedTrade[]): number {
  const validTrades = closedTrades.filter((t) => t.cost_basis_sol > 0);

  if (validTrades.length < 2) return 0;

  const returns = validTrades.map((t) => t.realized_pnl_sol / t.cost_basis_sol);

  const n = returns.length;
  const mean = returns.reduce((sum, r) => sum + r, 0) / n;

  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    // All returns identical — use confidence dampener on cap
    const confidence = Math.min(1.0, n / CONFIDENCE_TRADE_COUNT);
    return SHARPE_CAP * confidence;
  }

  const rawSharpe = mean / stdDev;
  const confidence = Math.min(1.0, n / CONFIDENCE_TRADE_COUNT);
  const dampenedSharpe = rawSharpe * confidence;

  return Math.min(SHARPE_CAP, dampenedSharpe);
}

/**
 * Maps a Sharpe-like ratio to a 0–100 score using tanh normalization.
 * Formula: Math.round(((Math.tanh(sharpe * 0.5) + 1) / 2) * 100)
 * sharpe=0 → 50, sharpe=1.0 → ~76, sharpe=2.0 → ~96, sharpe=-1.0 → ~24
 */
export function normalizeSharpeLike(sharpe: number): number {
  return Math.round(((Math.tanh(sharpe * 0.5) + 1) / 2) * 100);
}
