import { composeScore } from '../composer.js';
import type { ComputedMetrics, WalletScoreResult } from '../composer.js';

// Helper to build a ComputedMetrics object with sensible defaults
function makeMetrics(overrides: Partial<ComputedMetrics> = {}): ComputedMetrics {
  return {
    sharpeRatio: 1.0,
    winRateDecimal: 0.6,
    recencyScore: 60,
    maxDrawdown: 0.1,
    tradeCount: 30,
    recentTradeCount: 25,
    distinctTokensTraded: 10,
    ...overrides,
  };
}

describe('composeScore', () => {
  describe('sub-score calculations', () => {
    it('riskAdjustedReturn equals normalizeSharpeLike(sharpeRatio)', () => {
      // normalizeSharpeLike(1.0) = 73
      const result = composeScore(makeMetrics({ sharpeRatio: 1.0 }));
      expect(result.riskAdjustedReturn).toBe(73);
    });

    it('winRate sub-score = round(winRateDecimal * 100)', () => {
      const result = composeScore(makeMetrics({ winRateDecimal: 0.75 }));
      expect(result.winRate).toBe(75);
    });

    it('winRate sub-score = 0 for winRateDecimal=0', () => {
      const result = composeScore(makeMetrics({ winRateDecimal: 0 }));
      expect(result.winRate).toBe(0);
    });

    it('winRate sub-score = 100 for winRateDecimal=1.0', () => {
      const result = composeScore(makeMetrics({ winRateDecimal: 1.0 }));
      expect(result.winRate).toBe(100);
    });

    it('consistencyRecency = recencyScore minus drawdown penalty, clamped to [0,100]', () => {
      // recencyScore=60, maxDrawdown=0.4 → penalty = round(0.4 * 50) = 20 → 60 - 20 = 40
      const result = composeScore(makeMetrics({ recencyScore: 60, maxDrawdown: 0.4 }));
      expect(result.consistencyRecency).toBe(40);
    });

    it('consistencyRecency is clamped to 0 (cannot be negative)', () => {
      // recencyScore=10, maxDrawdown=1.0 → penalty = 50 → 10 - 50 = -40 → clamped to 0
      const result = composeScore(makeMetrics({ recencyScore: 10, maxDrawdown: 1.0 }));
      expect(result.consistencyRecency).toBe(0);
    });

    it('consistencyRecency is clamped to 100', () => {
      // recencyScore=100, maxDrawdown=0 → penalty = 0 → 100 (no clamp needed but stays at 100)
      const result = composeScore(makeMetrics({ recencyScore: 100, maxDrawdown: 0 }));
      expect(result.consistencyRecency).toBe(100);
    });

    it('activityHealth = 0.6 * frequencyScore + 0.4 * diversityScore, clamped to [0,100]', () => {
      // recentTradeCount=50 → frequencyScore = min(100, 100) = 100
      // distinctTokensTraded=20 → diversityScore = min(100, 100) = 100
      // activityHealth = 0.6 * 100 + 0.4 * 100 = 100
      const result = composeScore(makeMetrics({ recentTradeCount: 50, distinctTokensTraded: 20 }));
      expect(result.activityHealth).toBe(100);
    });

    it('activityHealth: frequencyScore caps at 100 (50 trades)', () => {
      // recentTradeCount=50 → frequencyScore = min(100, 50*2) = 100
      const result = composeScore(makeMetrics({ recentTradeCount: 50, distinctTokensTraded: 0 }));
      expect(result.activityHealth).toBe(60); // 0.6 * 100 + 0.4 * 0
    });

    it('activityHealth: diversityScore caps at 100 (20 tokens)', () => {
      // distinctTokensTraded=20 → diversityScore = min(100, 20*5) = 100
      const result = composeScore(makeMetrics({ recentTradeCount: 0, distinctTokensTraded: 20 }));
      expect(result.activityHealth).toBe(40); // 0.6 * 0 + 0.4 * 100
    });
  });

  describe('total score weights and clamping', () => {
    it('returns 5 as minimum (not 0), even for worst possible inputs', () => {
      const worst = makeMetrics({
        sharpeRatio: -10,
        winRateDecimal: 0,
        recencyScore: 0,
        maxDrawdown: 1.0,
        recentTradeCount: 0,
        distinctTokensTraded: 0,
      });
      const result = composeScore(worst);
      expect(result.total).toBe(5);
    });

    it('returns 95 as maximum (not 100), even for best possible inputs', () => {
      const best = makeMetrics({
        sharpeRatio: 10,
        winRateDecimal: 1.0,
        recencyScore: 100,
        maxDrawdown: 0,
        recentTradeCount: 100,
        distinctTokensTraded: 100,
      });
      const result = composeScore(best);
      expect(result.total).toBe(95);
    });

    it('total score is within [5, 95] for all valid inputs', () => {
      const variations: Partial<ComputedMetrics>[] = [
        { sharpeRatio: 0 },
        { sharpeRatio: 3, winRateDecimal: 0.5 },
        { recencyScore: 50, maxDrawdown: 0.5 },
        { recentTradeCount: 10, distinctTokensTraded: 5 },
      ];
      for (const v of variations) {
        const result = composeScore(makeMetrics(v));
        expect(result.total).toBeGreaterThanOrEqual(5);
        expect(result.total).toBeLessThanOrEqual(95);
      }
    });
  });

  describe('bundler vs genuine trader separation (ROADMAP success criterion)', () => {
    it('bundler profile scores < 65', () => {
      // Bundler: high win rate but poor Sharpe (volatile), high drawdown, low diversity
      const bundler = makeMetrics({
        winRateDecimal: 0.80,
        sharpeRatio: 0.35,
        maxDrawdown: 0.45,
        recentTradeCount: 30,
        distinctTokensTraded: 5,
        recencyScore: 70,
      });
      const result = composeScore(bundler);
      expect(result.total).toBeLessThan(65);
    });

    it('genuine trader profile scores > 75', () => {
      // Genuine trader: moderate win rate, high Sharpe, low drawdown, good diversity
      const trader = makeMetrics({
        winRateDecimal: 0.60,
        sharpeRatio: 1.50,
        maxDrawdown: 0.10,
        recentTradeCount: 25,
        distinctTokensTraded: 12,
        recencyScore: 65,
      });
      const result = composeScore(trader);
      expect(result.total).toBeGreaterThan(75);
    });

    it('genuine trader scores materially higher than bundler (difference >= 10 points)', () => {
      const bundler = makeMetrics({
        winRateDecimal: 0.80,
        sharpeRatio: 0.35,
        maxDrawdown: 0.45,
        recentTradeCount: 30,
        distinctTokensTraded: 5,
        recencyScore: 70,
      });
      const trader = makeMetrics({
        winRateDecimal: 0.60,
        sharpeRatio: 1.50,
        maxDrawdown: 0.10,
        recentTradeCount: 25,
        distinctTokensTraded: 12,
        recencyScore: 65,
      });
      const bundlerScore = composeScore(bundler);
      const traderScore = composeScore(trader);
      expect(traderScore.total - bundlerScore.total).toBeGreaterThanOrEqual(10);
    });
  });

  describe('WalletScoreResult shape', () => {
    it('returns all required fields', () => {
      const result: WalletScoreResult = composeScore(makeMetrics());
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('riskAdjustedReturn');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('consistencyRecency');
      expect(result).toHaveProperty('activityHealth');
    });

    it('all sub-scores are numbers in [0, 100]', () => {
      const result = composeScore(makeMetrics());
      expect(result.riskAdjustedReturn).toBeGreaterThanOrEqual(0);
      expect(result.riskAdjustedReturn).toBeLessThanOrEqual(100);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
      expect(result.consistencyRecency).toBeGreaterThanOrEqual(0);
      expect(result.consistencyRecency).toBeLessThanOrEqual(100);
      expect(result.activityHealth).toBeGreaterThanOrEqual(0);
      expect(result.activityHealth).toBeLessThanOrEqual(100);
    });
  });
});
