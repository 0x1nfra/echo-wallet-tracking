export interface ClosedTrade {
  token_mint: string;
  realized_pnl_sol: number;
  cost_basis_sol: number;
}

export function groupIntoClosedTrades(
  _swaps: Array<{
    token_mint: string;
    side: 'buy' | 'sell';
    realized_pnl_sol: number | null;
    cost_basis_sol: number | null;
  }>,
): ClosedTrade[] {
  throw new Error('Not implemented');
}

export function calculateWinRate(_closedTrades: ClosedTrade[]): number {
  throw new Error('Not implemented');
}
