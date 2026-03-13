export function calculateMaxDrawdown(
  _swaps: Array<{ side: 'buy' | 'sell'; realized_pnl_sol: number | null; timestamp: number }>,
): number {
  throw new Error('Not implemented');
}
