import { computeSignalScore, getSignalTier, TokenSignalInputs } from '../scorer.js';

// Helper to build a standard TokenSignalInputs object with sensible defaults
function makeInputs(overrides: Partial<TokenSignalInputs> = {}): TokenSignalInputs {
  return {
    tokenMint: 'So11111111111111111111111111111111111111112',
    smartWalletHolders: [],
    buysLast1h: 0,
    sellsLast1h: 0,
    totalSmartBuysLast24h: 0,
    ...overrides,
  };
}

// Helper to build a smart wallet holder entry
function makeHolder(
  walletScore: number,
  isCoordinated = false,
  isCurrentHolder = true,
) {
  return {
    walletAddress: `wallet_${Math.random().toString(36).slice(2)}`,
    walletScore,
    isCoordinated,
    isCurrentHolder,
  };
}

describe('computeSignalScore', () => {
  // Test 1 — Minimum wallet floor: 1 current holder → score=0, tier='inactive'
  it('returns signalScore=0 and inactive tier when fewer than 2 current holders are present (1 holder)', () => {
    const inputs = makeInputs({
      smartWalletHolders: [makeHolder(80)],
      buysLast1h: 10,
      totalSmartBuysLast24h: 20,
    });
    const result = computeSignalScore(inputs);
    expect(result.signalScore).toBe(0);
    expect(result.signalTier).toBe('inactive');
  });

  // Test 2 — Zero holders: 0 holders → score=0, tier='inactive'
  it('returns signalScore=0 and inactive tier when there are 0 holders', () => {
    const inputs = makeInputs({
      smartWalletHolders: [],
      buysLast1h: 5,
      totalSmartBuysLast24h: 10,
    });
    const result = computeSignalScore(inputs);
    expect(result.signalScore).toBe(0);
    expect(result.signalTier).toBe('inactive');
  });

  // Test 3 — Score formula weights: 2 holders (walletScore=80 each), buysLast1h=5, no coordination
  // pnlWeightedHolderScore=80, buyVelocityScore=100, walletCountScore=20
  // rawScore = 80*0.40 + 100*0.35 + 20*0.25 = 32 + 35 + 5 = 72
  it('computes signal score correctly using the 40/35/25 weight formula', () => {
    const inputs = makeInputs({
      smartWalletHolders: [makeHolder(80), makeHolder(80)],
      buysLast1h: 5,
      sellsLast1h: 0,
      totalSmartBuysLast24h: 5,
    });
    const result = computeSignalScore(inputs);
    expect(result.pnlWeightedHolderScore).toBe(80);
    expect(result.buyVelocityScore).toBe(100);
    expect(result.signalScore).toBe(72);
    expect(result.signalTier).toBe('strong');
  });

  // Test 4 — Score clamp high: signalScore never exceeds 100
  it('clamps signalScore to 100 for extreme inputs', () => {
    // 10 holders with walletScore=95, buysLast1h=100 → raw score well above 100
    const inputs = makeInputs({
      smartWalletHolders: Array.from({ length: 10 }, () => makeHolder(95)),
      buysLast1h: 100,
      sellsLast1h: 0,
      totalSmartBuysLast24h: 100,
    });
    const result = computeSignalScore(inputs);
    expect(result.signalScore).toBeLessThanOrEqual(100);
    expect(result.signalScore).toBeGreaterThan(0);
  });

  // Test 5 — Score clamp low: signalScore is never negative
  it('clamps signalScore to 0 (never negative) for any extreme input', () => {
    const inputs = makeInputs({
      // All coordinated except exactly 2 to pass floor — but heavy coordination
      smartWalletHolders: [
        makeHolder(1, false, true),
        makeHolder(1, false, true),
      ],
      buysLast1h: 0,
      sellsLast1h: 0,
      totalSmartBuysLast24h: 0,
    });
    const result = computeSignalScore(inputs);
    expect(result.signalScore).toBeGreaterThanOrEqual(0);
  });

  // Test 6 — Exit pressure: exits do NOT affect signalScore but exitPressure is returned
  it('does not include exit pressure in signalScore but returns it in result', () => {
    const holdersNoSell = [makeHolder(80), makeHolder(80)];
    const holdersWithSell = [makeHolder(80), makeHolder(80)];

    const noSellInputs = makeInputs({
      smartWalletHolders: holdersNoSell,
      buysLast1h: 5,
      sellsLast1h: 0,
      totalSmartBuysLast24h: 5,
    });
    const withSellInputs = makeInputs({
      smartWalletHolders: holdersWithSell,
      buysLast1h: 5,
      sellsLast1h: 10,
      totalSmartBuysLast24h: 5,
    });

    const noSellResult = computeSignalScore(noSellInputs);
    const withSellResult = computeSignalScore(withSellInputs);

    // Same score (exit pressure does not affect signal score)
    expect(noSellResult.signalScore).toBe(withSellResult.signalScore);

    // But exitPressure differs
    expect(noSellResult.exitPressure).toBe(0);
    expect(withSellResult.exitPressure).toBeGreaterThan(0);
  });

  // Test 7 — Exit pressure formula: 3 sells, 7 buys → exitPressure = 3/10 = 0.30
  it('computes exitPressure as sells / (buys + sells)', () => {
    const inputs = makeInputs({
      smartWalletHolders: [makeHolder(80), makeHolder(80)],
      buysLast1h: 7,
      sellsLast1h: 3,
      totalSmartBuysLast24h: 7,
    });
    const result = computeSignalScore(inputs);
    expect(result.exitPressure).toBeCloseTo(0.3, 5);
  });

  // Test 8 — All coordinated: all isCoordinated=true → score=0, tier='inactive', coordinationDiscount=0.3
  it('suppresses signal entirely when all current holders are coordinated', () => {
    const inputs = makeInputs({
      smartWalletHolders: [
        makeHolder(80, true),
        makeHolder(80, true),
        makeHolder(80, true),
      ],
      buysLast1h: 5,
      totalSmartBuysLast24h: 5,
    });
    const result = computeSignalScore(inputs);
    expect(result.signalScore).toBe(0);
    expect(result.signalTier).toBe('inactive');
    expect(result.coordinationDiscount).toBeCloseTo(0.3, 5);
  });

  // Test 9 — Partial coordination: 4 holders, 2 coordinated (ratio=0.5) → coordinationDiscount=0.65
  it('applies partial coordination discount proportionally (ratio=0.5 → multiplier=0.65)', () => {
    const holders = [
      makeHolder(80, true),
      makeHolder(80, true),
      makeHolder(80, false),
      makeHolder(80, false),
    ];
    const inputs = makeInputs({
      smartWalletHolders: holders,
      buysLast1h: 5,
      totalSmartBuysLast24h: 5,
    });
    const result = computeSignalScore(inputs);

    // coordinationDiscount = 1.0 - (0.5 * 0.7) = 0.65
    expect(result.coordinationDiscount).toBeCloseTo(0.65, 5);

    // signalScore should be rawScore * 0.65 (rounded)
    // rawScore = 80*0.40 + 100*0.35 + 40*0.25 = 32+35+10 = 77
    // discounted = round(77 * 0.65) = round(50.05) = 50
    const expectedRaw = 80 * 0.40 + 100 * 0.35 + 40 * 0.25; // = 77
    expect(result.signalScore).toBe(Math.round(expectedRaw * 0.65));
  });

  // Test 10 — No coordination: coordinationDiscount=1.0 (no change to score)
  it('applies no coordination discount when no holders are coordinated (discount=1.0)', () => {
    const inputs = makeInputs({
      smartWalletHolders: [makeHolder(80, false), makeHolder(80, false)],
      buysLast1h: 5,
      totalSmartBuysLast24h: 5,
    });
    const result = computeSignalScore(inputs);
    expect(result.coordinationDiscount).toBe(1.0);
  });

  // Test 11 — Tier boundaries
  it('assigns correct tier for exact boundary values', () => {
    // score=65 → strong
    expect(getSignalTier(65)).toBe('strong');
    // score=64 → moderate
    expect(getSignalTier(64)).toBe('moderate');
    // score=35 → moderate
    expect(getSignalTier(35)).toBe('moderate');
    // score=34 → weak
    expect(getSignalTier(34)).toBe('weak');
    // score=0 → inactive
    expect(getSignalTier(0)).toBe('inactive');
  });

  // Test 12 — coordinatedWalletCount matches isCoordinated=true AND isCurrentHolder=true
  it('counts coordinatedWalletCount as only current holders with isCoordinated=true', () => {
    const inputs = makeInputs({
      smartWalletHolders: [
        makeHolder(80, true, true),   // current + coordinated → counts
        makeHolder(80, true, false),  // NOT current holder → should NOT count
        makeHolder(80, false, true),  // current but not coordinated → should NOT count
        makeHolder(80, false, false), // neither → should NOT count
      ],
      buysLast1h: 5,
      totalSmartBuysLast24h: 5,
    });
    const result = computeSignalScore(inputs);
    // Only 1 current holder is coordinated
    expect(result.coordinatedWalletCount).toBe(1);
  });

  // Test 13 — smartWalletCount matches count of isCurrentHolder=true (not total)
  it('counts smartWalletCount as only holders with isCurrentHolder=true', () => {
    const inputs = makeInputs({
      smartWalletHolders: [
        makeHolder(80, false, true),  // current holder → counts
        makeHolder(80, false, true),  // current holder → counts
        makeHolder(80, false, false), // NOT current holder → excluded
      ],
      buysLast1h: 5,
      totalSmartBuysLast24h: 5,
    });
    const result = computeSignalScore(inputs);
    expect(result.smartWalletCount).toBe(2);
  });

  // Test 14 — Token eligibility: totalSmartBuysLast24h=0 AND currentHolders < MIN_SMART_WALLETS → score=0
  it('returns signalScore=0 when totalSmartBuysLast24h=0 and current holders below floor', () => {
    const inputs = makeInputs({
      smartWalletHolders: [makeHolder(80, false, true)], // only 1 current holder
      buysLast1h: 0,
      sellsLast1h: 0,
      totalSmartBuysLast24h: 0,
    });
    const result = computeSignalScore(inputs);
    expect(result.signalScore).toBe(0);
    expect(result.signalTier).toBe('inactive');
  });
});
