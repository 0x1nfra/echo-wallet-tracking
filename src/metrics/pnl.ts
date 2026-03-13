/**
 * Sums realized_pnl_sol for all sell-side swaps with non-null pnl.
 * Returns 0 if there are no qualifying sells.
 */
export function calculateRealizedPnl(
  swaps: Array<{ side: 'buy' | 'sell'; realized_pnl_sol: number | null }>,
): number {
  let total = 0;
  for (const swap of swaps) {
    if (swap.side === 'sell' && swap.realized_pnl_sol !== null) {
      total += swap.realized_pnl_sol;
    }
  }
  return total;
}
