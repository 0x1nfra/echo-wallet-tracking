import {
  groupIntoClosedTrades,
  calculateWinRate,
} from '../win-rate.js';
import { calculateRealizedPnl } from '../pnl.js';
import { calculateSharpeRatio, normalizeSharpeLike } from '../sharpe.js';
import { calculateMaxDrawdown } from '../drawdown.js';
import { calculateRecencyScore } from '../recency.js';

// -------------------------------------------------------------------
// groupIntoClosedTrades
// -------------------------------------------------------------------
describe('groupIntoClosedTrades', () => {
  it('returns [] when there are no swaps', () => {
    expect(groupIntoClosedTrades([])).toEqual([]);
  });

  it('returns [] when all swaps are buys (no sells)', () => {
    const swaps = [
      { token_mint: 'AAA', side: 'buy' as const, realized_pnl_sol: null, cost_basis_sol: 0.5 },
    ];
    expect(groupIntoClosedTrades(swaps)).toEqual([]);
  });

  it('groups a single token with one sell into a closed trade', () => {
    const swaps = [
      { token_mint: 'AAA', side: 'buy' as const, realized_pnl_sol: null, cost_basis_sol: 1.0 },
      { token_mint: 'AAA', side: 'sell' as const, realized_pnl_sol: 0.5, cost_basis_sol: 1.0 },
    ];
    const result = groupIntoClosedTrades(swaps);
    expect(result).toHaveLength(1);
    expect(result[0].token_mint).toBe('AAA');
    expect(result[0].realized_pnl_sol).toBeCloseTo(0.5);
  });

  it('groups multiple tokens correctly', () => {
    const swaps = [
      { token_mint: 'AAA', side: 'sell' as const, realized_pnl_sol: 1.0, cost_basis_sol: 2.0 },
      { token_mint: 'BBB', side: 'sell' as const, realized_pnl_sol: -0.5, cost_basis_sol: 1.0 },
      { token_mint: 'CCC', side: 'buy' as const, realized_pnl_sol: null, cost_basis_sol: 0.5 },
    ];
    const result = groupIntoClosedTrades(swaps);
    expect(result).toHaveLength(2);
    const mints = result.map((t) => t.token_mint);
    expect(mints).toContain('AAA');
    expect(mints).toContain('BBB');
    expect(mints).not.toContain('CCC');
  });

  it('sums realized_pnl_sol across multiple sells for the same token', () => {
    const swaps = [
      { token_mint: 'AAA', side: 'sell' as const, realized_pnl_sol: 1.0, cost_basis_sol: 2.0 },
      { token_mint: 'AAA', side: 'sell' as const, realized_pnl_sol: 0.5, cost_basis_sol: 1.0 },
    ];
    const result = groupIntoClosedTrades(swaps);
    expect(result).toHaveLength(1);
    expect(result[0].realized_pnl_sol).toBeCloseTo(1.5);
    expect(result[0].cost_basis_sol).toBeCloseTo(3.0);
  });

  it('excludes sells with null realized_pnl_sol from the aggregate', () => {
    const swaps = [
      { token_mint: 'AAA', side: 'sell' as const, realized_pnl_sol: null, cost_basis_sol: null },
    ];
    const result = groupIntoClosedTrades(swaps);
    // token has a sell but pnl is null — still counts as closed trade (orphan sell)
    // implementation detail: plan says "at least one sell and non-null realized_pnl_sol"
    // → a token with all-null pnl sells should NOT produce a closed trade
    expect(result).toHaveLength(0);
  });
});

// -------------------------------------------------------------------
// calculateWinRate
// -------------------------------------------------------------------
describe('calculateWinRate', () => {
  it('returns 0 for empty array', () => {
    expect(calculateWinRate([])).toBe(0);
  });

  it('returns 1.0 when all trades are profitable', () => {
    const trades = [
      { token_mint: 'A', realized_pnl_sol: 1.0, cost_basis_sol: 2.0 },
      { token_mint: 'B', realized_pnl_sol: 0.5, cost_basis_sol: 1.0 },
    ];
    expect(calculateWinRate(trades)).toBe(1.0);
  });

  it('returns 0.0 when all trades are losses', () => {
    const trades = [
      { token_mint: 'A', realized_pnl_sol: -1.0, cost_basis_sol: 2.0 },
      { token_mint: 'B', realized_pnl_sol: -0.5, cost_basis_sol: 1.0 },
    ];
    expect(calculateWinRate(trades)).toBe(0.0);
  });

  it('returns 0.75 for 3 wins and 1 loss', () => {
    const trades = [
      { token_mint: 'A', realized_pnl_sol: 1.0, cost_basis_sol: 2.0 },
      { token_mint: 'B', realized_pnl_sol: 0.5, cost_basis_sol: 1.0 },
      { token_mint: 'C', realized_pnl_sol: 0.2, cost_basis_sol: 0.5 },
      { token_mint: 'D', realized_pnl_sol: -0.3, cost_basis_sol: 0.8 },
    ];
    expect(calculateWinRate(trades)).toBe(0.75);
  });
});

// -------------------------------------------------------------------
// calculateRealizedPnl
// -------------------------------------------------------------------
describe('calculateRealizedPnl', () => {
  it('returns 0 when there are no swaps', () => {
    expect(calculateRealizedPnl([])).toBe(0);
  });

  it('returns 0 when there are no sells', () => {
    const swaps = [
      { side: 'buy' as const, realized_pnl_sol: null },
    ];
    expect(calculateRealizedPnl(swaps)).toBe(0);
  });

  it('sums realized_pnl_sol for all sells', () => {
    const swaps = [
      { side: 'sell' as const, realized_pnl_sol: 2.0 },
      { side: 'sell' as const, realized_pnl_sol: -0.5 },
      { side: 'buy' as const, realized_pnl_sol: null },
    ];
    expect(calculateRealizedPnl(swaps)).toBeCloseTo(1.5);
  });

  it('skips null realized_pnl_sol on sells', () => {
    const swaps = [
      { side: 'sell' as const, realized_pnl_sol: 1.0 },
      { side: 'sell' as const, realized_pnl_sol: null },
    ];
    expect(calculateRealizedPnl(swaps)).toBeCloseTo(1.0);
  });

  it('handles all-negative scenario', () => {
    const swaps = [
      { side: 'sell' as const, realized_pnl_sol: -1.0 },
      { side: 'sell' as const, realized_pnl_sol: -2.0 },
    ];
    expect(calculateRealizedPnl(swaps)).toBeCloseTo(-3.0);
  });
});

// -------------------------------------------------------------------
// calculateSharpeRatio
// -------------------------------------------------------------------
describe('calculateSharpeRatio', () => {
  it('returns 0 when there are fewer than 2 trades', () => {
    expect(calculateSharpeRatio([])).toBe(0);
    expect(
      calculateSharpeRatio([{ token_mint: 'A', realized_pnl_sol: 1.0, cost_basis_sol: 2.0 }]),
    ).toBe(0);
  });

  it('returns 0 when all trades have zero cost basis', () => {
    const trades = [
      { token_mint: 'A', realized_pnl_sol: 1.0, cost_basis_sol: 0 },
      { token_mint: 'B', realized_pnl_sol: 0.5, cost_basis_sol: 0 },
    ];
    expect(calculateSharpeRatio(trades)).toBe(0);
  });

  it('caps at 3.0 when all returns are identical (zero variance)', () => {
    const trades = Array.from({ length: 50 }, (_, i) => ({
      token_mint: `TOKEN_${i}`,
      realized_pnl_sol: 1.0,
      cost_basis_sol: 2.0,
    }));
    expect(calculateSharpeRatio(trades)).toBe(3.0);
  });

  it('consistent trader (low variance, decent return) scores higher than high-variance trader', () => {
    const consistentTrades = Array.from({ length: 50 }, (_, i) => ({
      token_mint: `CONS_${i}`,
      realized_pnl_sol: 0.1,
      cost_basis_sol: 1.0,
    }));

    const volatileTrades = Array.from({ length: 50 }, (_, i) => ({
      token_mint: `VOLA_${i}`,
      realized_pnl_sol: i % 2 === 0 ? 3.0 : -2.0,
      cost_basis_sol: 2.0,
    }));

    const consistentSharpe = calculateSharpeRatio(consistentTrades);
    const volatileSharpe = calculateSharpeRatio(volatileTrades);
    expect(consistentSharpe).toBeGreaterThan(volatileSharpe);
  });

  it('applies confidence dampener for small trade counts', () => {
    const smallSample = [
      { token_mint: 'A', realized_pnl_sol: 1.0, cost_basis_sol: 2.0 },
      { token_mint: 'B', realized_pnl_sol: 0.8, cost_basis_sol: 2.0 },
    ];
    const largeSample = Array.from({ length: 50 }, (_, i) => ({
      token_mint: `T${i}`,
      realized_pnl_sol: 0.5,
      cost_basis_sol: 1.0,
    }));

    const smallSharpe = calculateSharpeRatio(smallSample);
    const largeSharpe = calculateSharpeRatio(largeSample);
    // Small sample should be lower due to confidence dampener
    expect(smallSharpe).toBeLessThan(largeSharpe);
  });
});

// -------------------------------------------------------------------
// normalizeSharpeLike
// -------------------------------------------------------------------
describe('normalizeSharpeLike', () => {
  it('returns 50 for sharpe=0', () => {
    expect(normalizeSharpeLike(0)).toBe(50);
  });

  it('returns ~76 for sharpe=1.0', () => {
    expect(normalizeSharpeLike(1.0)).toBe(76);
  });

  it('returns ~96 for sharpe=2.0', () => {
    expect(normalizeSharpeLike(2.0)).toBe(96);
  });

  it('returns ~24 for sharpe=-1.0', () => {
    expect(normalizeSharpeLike(-1.0)).toBe(24);
  });

  it('output is always in [0, 100]', () => {
    expect(normalizeSharpeLike(100)).toBeGreaterThanOrEqual(0);
    expect(normalizeSharpeLike(100)).toBeLessThanOrEqual(100);
    expect(normalizeSharpeLike(-100)).toBeGreaterThanOrEqual(0);
    expect(normalizeSharpeLike(-100)).toBeLessThanOrEqual(100);
  });
});

// -------------------------------------------------------------------
// calculateMaxDrawdown
// -------------------------------------------------------------------
describe('calculateMaxDrawdown', () => {
  it('returns 0 when there are no swaps', () => {
    expect(calculateMaxDrawdown([])).toBe(0);
  });

  it('returns 0 when there are no sells', () => {
    const swaps = [{ side: 'buy' as const, realized_pnl_sol: null, timestamp: 1000 }];
    expect(calculateMaxDrawdown(swaps)).toBe(0);
  });

  it('returns 0 for monotonically increasing PnL', () => {
    const swaps = [
      { side: 'sell' as const, realized_pnl_sol: 2.0, timestamp: 1000 },
      { side: 'sell' as const, realized_pnl_sol: 3.0, timestamp: 2000 },
      { side: 'sell' as const, realized_pnl_sol: 5.0, timestamp: 3000 },
    ];
    expect(calculateMaxDrawdown(swaps)).toBe(0);
  });

  it('calculates drawdown correctly for known sequence', () => {
    // cumulative pnl after each sell: 10, 15, 13, 16
    // peak after sell 2 = 15; then drops to 13 → drawdown = (15-13)/15 ≈ 0.133
    const swaps = [
      { side: 'sell' as const, realized_pnl_sol: 10.0, timestamp: 1000 },
      { side: 'sell' as const, realized_pnl_sol: 5.0, timestamp: 2000 },
      { side: 'sell' as const, realized_pnl_sol: -2.0, timestamp: 3000 },
      { side: 'sell' as const, realized_pnl_sol: 3.0, timestamp: 4000 },
    ];
    const dd = calculateMaxDrawdown(swaps);
    expect(dd).toBeGreaterThan(0);
    expect(dd).toBeLessThan(1);
    // peak = 15, trough = 13 → dd = 2/15 ≈ 0.133
    expect(dd).toBeCloseTo(2 / 15, 3);
  });

  it('returns value in [0, 1] range', () => {
    const swaps = [
      { side: 'sell' as const, realized_pnl_sol: 10.0, timestamp: 1000 },
      { side: 'sell' as const, realized_pnl_sol: -5.0, timestamp: 2000 },
    ];
    const dd = calculateMaxDrawdown(swaps);
    expect(dd).toBeGreaterThanOrEqual(0);
    expect(dd).toBeLessThanOrEqual(1);
  });

  it('ignores buy-side swaps in drawdown calculation', () => {
    const swaps = [
      { side: 'buy' as const, realized_pnl_sol: null, timestamp: 500 },
      { side: 'sell' as const, realized_pnl_sol: 10.0, timestamp: 1000 },
      { side: 'buy' as const, realized_pnl_sol: null, timestamp: 1500 },
      { side: 'sell' as const, realized_pnl_sol: 12.0, timestamp: 2000 },
    ];
    expect(calculateMaxDrawdown(swaps)).toBe(0);
  });
});

// -------------------------------------------------------------------
// calculateRecencyScore
// -------------------------------------------------------------------
describe('calculateRecencyScore', () => {
  const NOW = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const RECENT = NOW - 10 * DAY_MS;  // 10 days ago — within 180 day window
  const OLD = NOW - 200 * DAY_MS;    // 200 days ago — outside 180 day window

  it('returns 0 when there are no swaps', () => {
    expect(calculateRecencyScore([], NOW)).toBe(0);
  });

  it('returns 0 when all swaps are outside the 180-day window', () => {
    const swaps = [
      { timestamp: OLD },
      { timestamp: OLD - DAY_MS },
    ];
    expect(calculateRecencyScore(swaps, NOW)).toBe(0);
  });

  it('returns 5 for 1 recent swap', () => {
    const swaps = [{ timestamp: RECENT }];
    expect(calculateRecencyScore(swaps, NOW)).toBe(5);
  });

  it('returns 25 for 5 recent swaps', () => {
    const swaps = Array.from({ length: 5 }, () => ({ timestamp: RECENT }));
    expect(calculateRecencyScore(swaps, NOW)).toBe(25);
  });

  it('returns 100 for 50+ recent swaps', () => {
    const swaps = Array.from({ length: 50 }, () => ({ timestamp: RECENT }));
    expect(calculateRecencyScore(swaps, NOW)).toBe(100);

    const swaps60 = Array.from({ length: 60 }, () => ({ timestamp: RECENT }));
    expect(calculateRecencyScore(swaps60, NOW)).toBe(100);
  });

  it('excludes swaps outside 180-day window even when mixed with recent ones', () => {
    const swaps = [
      { timestamp: OLD },
      { timestamp: RECENT },
    ];
    // 1 recent swap → score = 5
    expect(calculateRecencyScore(swaps, NOW)).toBe(5);
  });

  it('uses current time by default (nowMs optional parameter)', () => {
    const swaps = [{ timestamp: RECENT }];
    // Should not throw when nowMs is omitted
    expect(() => calculateRecencyScore(swaps)).not.toThrow();
  });

  it('scales correctly between 5 and 50 recent swaps', () => {
    // At 10 swaps: 25 + (10-5) * (75/45) ≈ 25 + 8.33 ≈ 33
    const swaps10 = Array.from({ length: 10 }, () => ({ timestamp: RECENT }));
    const score = calculateRecencyScore(swaps10, NOW);
    expect(score).toBeGreaterThan(25);
    expect(score).toBeLessThan(100);
  });
});
