/**
 * Calculates maximum drawdown as a fraction of peak cumulative PnL.
 * Only considers sell-side swaps with non-null realized_pnl_sol, sorted by timestamp.
 * Returns 0 if no qualifying sells or no drawdown occurred.
 * Result is in [0, 1].
 */
export function calculateMaxDrawdown(
  swaps: Array<{ side: 'buy' | 'sell'; realized_pnl_sol: number | null; timestamp: number }>,
): number {
  const sells = swaps
    .filter((s) => s.side === 'sell' && s.realized_pnl_sol !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (sells.length === 0) return 0;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const sell of sells) {
    cumulative += sell.realized_pnl_sol as number;
    if (cumulative > peak) {
      peak = cumulative;
    }
    if (peak > 0) {
      const drawdown = (peak - cumulative) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}
