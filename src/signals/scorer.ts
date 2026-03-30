/**
 * Token Signal Scorer — pure computation, no database I/O.
 *
 * Accepts pre-loaded holder data and returns a typed signal result.
 * All database queries live in engine.ts; this module is fully unit-testable.
 *
 * Requirements: SGNL-01, SGNL-03
 */

// ---------------------------------------------------------------------------
// Formula constants
// ---------------------------------------------------------------------------

/** Minimum number of current smart wallet holders required to emit a signal. */
const MIN_SMART_WALLETS = 2;

/** Weight given to PnL-weighted holder quality in the composite score. */
const WEIGHT_PNL_HOLDER_QUALITY = 0.40;

/** Weight given to buy velocity (1-hour window) in the composite score. */
const WEIGHT_BUY_VELOCITY = 0.35;

/** Weight given to smart wallet count in the composite score. */
const WEIGHT_SMART_WALLET_COUNT = 0.25;

/**
 * Buy velocity normalization ceiling.
 * 5 buys/hr from smart wallets → velocity sub-score of 100.
 * Formula: Math.min(100, buysLast1h * BUY_VELOCITY_SCALE)
 */
const BUY_VELOCITY_SCALE = 20;

/**
 * Wallet count normalization ceiling.
 * 10 current holders → count sub-score of 100.
 * Formula: Math.min(100, holderCount * WALLET_COUNT_SCALE)
 */
const WALLET_COUNT_SCALE = 10;

/** Coordination penalty strength: at ratio=1.0 the multiplier reaches (1 - COORDINATION_PENALTY). */
const COORDINATION_PENALTY = 0.7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input data required to compute a token's signal score. */
export interface TokenSignalInputs {
  /** Token mint address (passed through for reference). */
  tokenMint: string;

  /**
   * All smart wallet entries for this token.
   * May include non-current holders (isCurrentHolder=false) — they are excluded
   * from sub-score calculations but used to preserve the full input contract.
   */
  smartWalletHolders: Array<{
    /** Wallet public key. */
    walletAddress: string;
    /** Per-wallet quality score from wallet_metrics.score_total (0-95). */
    walletScore: number;
    /** True when the wallet has an active bundler flag (cleared=false). */
    isCoordinated: boolean;
    /** True when the wallet's net position in this token is positive (buy_amt > sell_amt). */
    isCurrentHolder: boolean;
  }>;

  /** Count of distinct smart wallet buy swaps in the last 1-hour window. */
  buysLast1h: number;

  /** Count of distinct smart wallet sell swaps in the last 1-hour window. */
  sellsLast1h: number;

  /**
   * Total smart wallet buy swaps in the last 24-hour window.
   * Used as secondary eligibility check alongside the current-holder floor.
   */
  totalSmartBuysLast24h: number;
}

/** Computed signal result returned by computeSignalScore(). */
export interface TokenSignalResult {
  /** Final signal score in [0, 100] (integer). */
  signalScore: number;

  /** Human-readable tier label derived from signalScore. */
  signalTier: 'strong' | 'moderate' | 'weak' | 'inactive';

  /** Count of wallets with isCurrentHolder=true (after filtering). */
  smartWalletCount: number;

  /** Raw buysLast1h passed through for reference. */
  buyVelocity1h: number;

  /** Normalized buy velocity sub-score (0-100). */
  buyVelocityScore: number;

  /**
   * Sell pressure ratio in [0.0, 1.0].
   * exitPressure = sellsLast1h / (buysLast1h + sellsLast1h)
   * NOT included in signalScore — stored for Phase 7 overlay.
   */
  exitPressure: number;

  /** Weighted average of current holder walletScores (0-100). */
  pnlWeightedHolderScore: number;

  /**
   * Coordination multiplier applied to rawScore.
   * 1.0 = no discount (no coordinated holders).
   * 0.3 = maximum discount (all holders coordinated).
   */
  coordinationDiscount: number;

  /** Count of current holders with isCoordinated=true. */
  coordinatedWalletCount: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the token signal score and supporting metadata from pre-loaded inputs.
 *
 * Formula:
 *   rawScore = pnlHolderScore * 0.40 + buyVelocityScore * 0.35 + walletCountScore * 0.25
 *   signalScore = round(clamp(rawScore * coordinationDiscount, 0, 100))
 *
 * Early-exit conditions (signalScore = 0, tier = 'inactive'):
 *   - Fewer than MIN_SMART_WALLETS current holders
 *   - All current holders are coordinated (all-coordinated suppression)
 */
export function computeSignalScore(inputs: TokenSignalInputs): TokenSignalResult {
  const { buysLast1h, sellsLast1h } = inputs;

  // Filter to current holders only (isCurrentHolder=true)
  const currentHolders = inputs.smartWalletHolders.filter(h => h.isCurrentHolder);
  const smartWalletCount = currentHolders.length;

  // Exit pressure: sell-side ratio — not used in score, stored for reference
  const totalActivity = buysLast1h + sellsLast1h;
  const exitPressure = totalActivity > 0 ? sellsLast1h / totalActivity : 0;

  // Coordination metadata (computed over current holders only)
  const coordinatedWalletCount = currentHolders.filter(h => h.isCoordinated).length;
  const coordinationRatio = smartWalletCount > 0 ? coordinatedWalletCount / smartWalletCount : 0;
  const coordinationDiscount = 1.0 - coordinationRatio * COORDINATION_PENALTY;

  // --- Early-exit: below minimum wallet floor ---
  if (smartWalletCount < MIN_SMART_WALLETS) {
    return buildInactiveResult({
      smartWalletCount,
      buyVelocity1h: buysLast1h,
      exitPressure,
      coordinationDiscount,
      coordinatedWalletCount,
    });
  }

  // --- Early-exit: all holders are coordinated (all-coordinated suppression) ---
  const allCoordinated = currentHolders.every(h => h.isCoordinated);
  if (allCoordinated) {
    return buildInactiveResult({
      smartWalletCount,
      buyVelocity1h: buysLast1h,
      exitPressure,
      coordinationDiscount,
      coordinatedWalletCount,
    });
  }

  // --- Sub-score 1: PnL-weighted holder quality (0-100) ---
  // Average of walletScore values across current holders (already 0-95, treated as 0-100)
  const totalScore = currentHolders.reduce((sum, h) => sum + h.walletScore, 0);
  const pnlWeightedHolderScore = smartWalletCount > 0 ? totalScore / smartWalletCount : 0;

  // --- Sub-score 2: Buy velocity (0-100) — 5 buys/hr = 100 ---
  const buyVelocityScore = Math.min(100, buysLast1h * BUY_VELOCITY_SCALE);

  // --- Sub-score 3: Wallet count (0-100) — 10 holders = 100 ---
  const walletCountScore = Math.min(100, smartWalletCount * WALLET_COUNT_SCALE);

  // --- Composite raw score ---
  const rawScore =
    pnlWeightedHolderScore * WEIGHT_PNL_HOLDER_QUALITY +
    buyVelocityScore * WEIGHT_BUY_VELOCITY +
    walletCountScore * WEIGHT_SMART_WALLET_COUNT;

  // --- Apply coordination discount as final step ---
  const finalScore = Math.round(Math.max(0, Math.min(100, rawScore * coordinationDiscount)));

  return {
    signalScore: finalScore,
    signalTier: getSignalTier(finalScore),
    smartWalletCount,
    buyVelocity1h: buysLast1h,
    buyVelocityScore,
    exitPressure,
    pnlWeightedHolderScore,
    coordinationDiscount,
    coordinatedWalletCount,
  };
}

/**
 * Maps a 0-100 signal score to a human-readable tier label.
 *
 * Thresholds:
 *   - strong:   score >= 65
 *   - moderate: score >= 35
 *   - weak:     0 < score < 35
 *   - inactive: score === 0
 */
export function getSignalTier(score: number): 'strong' | 'moderate' | 'weak' | 'inactive' {
  if (score === 0) return 'inactive';
  if (score >= 65) return 'strong';
  if (score >= 35) return 'moderate';
  return 'weak';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface InactiveParams {
  smartWalletCount: number;
  buyVelocity1h: number;
  exitPressure: number;
  coordinationDiscount: number;
  coordinatedWalletCount: number;
}

function buildInactiveResult(params: InactiveParams): TokenSignalResult {
  return {
    signalScore: 0,
    signalTier: 'inactive',
    smartWalletCount: params.smartWalletCount,
    buyVelocity1h: params.buyVelocity1h,
    buyVelocityScore: 0,
    exitPressure: params.exitPressure,
    pnlWeightedHolderScore: 0,
    coordinationDiscount: params.coordinationDiscount,
    coordinatedWalletCount: params.coordinatedWalletCount,
  };
}
