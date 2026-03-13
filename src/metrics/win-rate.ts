export interface ClosedTrade {
  token_mint: string;
  realized_pnl_sol: number;
  cost_basis_sol: number;
}

/**
 * Groups swap rows into closed trades.
 * A closed trade = a token_mint that has at least one sell with non-null realized_pnl_sol.
 * Sums realized_pnl_sol and cost_basis_sol across all sells for that token.
 */
export function groupIntoClosedTrades(
  swaps: Array<{
    token_mint: string;
    side: 'buy' | 'sell';
    realized_pnl_sol: number | null;
    cost_basis_sol: number | null;
  }>,
): ClosedTrade[] {
  const tokenMap = new Map<string, { pnl: number; cost: number; hasPnl: boolean }>();

  for (const swap of swaps) {
    if (swap.side !== 'sell') continue;
    if (swap.realized_pnl_sol === null) continue;

    const entry = tokenMap.get(swap.token_mint) ?? { pnl: 0, cost: 0, hasPnl: false };
    entry.pnl += swap.realized_pnl_sol;
    entry.cost += swap.cost_basis_sol ?? 0;
    entry.hasPnl = true;
    tokenMap.set(swap.token_mint, entry);
  }

  const result: ClosedTrade[] = [];
  for (const [token_mint, { pnl, cost, hasPnl }] of tokenMap) {
    if (hasPnl) {
      result.push({ token_mint, realized_pnl_sol: pnl, cost_basis_sol: cost });
    }
  }
  return result;
}

/**
 * Calculates win rate as a decimal 0.0–1.0.
 * A winning trade has realized_pnl_sol > 0.
 * Returns 0 for empty array.
 */
export function calculateWinRate(closedTrades: ClosedTrade[]): number {
  if (closedTrades.length === 0) return 0;
  const wins = closedTrades.filter((t) => t.realized_pnl_sol > 0).length;
  return wins / closedTrades.length;
}
