/**
 * Token Signal Engine — DB-integrated computation layer.
 *
 * Queries confirmed-passing smart wallets, assembles TokenSignalInputs per token,
 * calls the pure scorer, and persists results via upsert.
 *
 * Requirements: SGNL-02
 */
import { and, eq, gte, inArray, gt, isNull, lt, or } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { swaps, wallets, wallet_metrics, wallet_flags, token_signals, signal_events } from '../db/schema.js';
import { computeSignalScore } from './scorer.js';
import { DexScreenerFetcher } from '../fetchers/dexscreener.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalCycleSummary {
  /** Tokens upserted with signalScore > 0 */
  updated: number;
  /** Tokens that existed with signal_score > 0 but now score 0 (marked inactive) */
  suppressed: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute and persist token signals for all eligible tokens.
 *
 * Accepts an optional `db` parameter for testability (defaults to the shared
 * singleton from db/index.ts). In production, call with no arguments.
 *
 * Eligibility: confirmed-passing tracked wallets (status='tracked' AND
 * detection_status='confirmed_passing').
 *
 * Token scope: all distinct token_mints with smart wallet swaps in last 24h,
 * UNION existing token_signals records with signal_score > 0 (to catch stale
 * records that need to be marked inactive).
 *
 * Upsert rules:
 *   - signalScore > 0: full upsert, increment `updated`
 *   - signalScore === 0 AND existing record with score > 0: mark inactive, increment `suppressed`
 *   - signalScore === 0 AND no existing record: skip (do not insert)
 */
export async function computeAllTokenSignals(
  db: typeof defaultDb = defaultDb,
  dexFetcher: DexScreenerFetcher = new DexScreenerFetcher(),
): Promise<SignalCycleSummary> {
  const nowSec = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  const oneHourAgoSec = nowSec - 3600;
  const twentyFourHoursAgoSec = nowSec - 86400;

  // ---------------------------------------------------------------------------
  // Step 1: Query confirmed-passing smart wallets
  // ---------------------------------------------------------------------------
  const smartWalletRows = db.select({ address: wallets.address })
    .from(wallets)
    .where(and(
      eq(wallets.status, 'tracked'),
      eq(wallets.detection_status, 'confirmed_passing'),
      or(isNull(wallets.probation_until), lt(wallets.probation_until, nowMs)),
    ))
    .all();

  if (smartWalletRows.length === 0) {
    return { updated: 0, suppressed: 0 };
  }

  const smartAddresses = smartWalletRows.map(w => w.address);

  // ---------------------------------------------------------------------------
  // Step 2: Distinct token_mints with smart wallet swaps in last 24h
  // ---------------------------------------------------------------------------
  const recentSwapRows = db.select({ token_mint: swaps.token_mint })
    .from(swaps)
    .where(and(
      inArray(swaps.wallet_address, smartAddresses),
      gte(swaps.timestamp, twentyFourHoursAgoSec),
    ))
    .all();

  const recentTokenSet = new Set(recentSwapRows.map(r => r.token_mint));

  // ---------------------------------------------------------------------------
  // Step 3: Existing active token_signals records (signal_score > 0)
  // ---------------------------------------------------------------------------
  const existingActiveRows = db.select({ token_mint: token_signals.token_mint })
    .from(token_signals)
    .where(gt(token_signals.signal_score, 0))
    .all();

  const existingActiveSet = new Set(existingActiveRows.map(r => r.token_mint));

  // Union: process all tokens in either set
  const allTokenMints = new Set([...recentTokenSet, ...existingActiveSet]);

  if (allTokenMints.size === 0) {
    return { updated: 0, suppressed: 0 };
  }

  // ---------------------------------------------------------------------------
  // Step 4: Load wallet_metrics scores for all smart wallets (batch)
  // ---------------------------------------------------------------------------
  const metricsRows = db.select({
    wallet_address: wallet_metrics.wallet_address,
    score_total: wallet_metrics.score_total,
  })
    .from(wallet_metrics)
    .where(inArray(wallet_metrics.wallet_address, smartAddresses))
    .all();

  const walletScoreMap = new Map<string, number>();
  for (const row of metricsRows) {
    walletScoreMap.set(row.wallet_address, row.score_total ?? 0);
  }

  // ---------------------------------------------------------------------------
  // Step 5: Load active bundler flags for all smart wallets (batch)
  // ---------------------------------------------------------------------------
  const flagRows = db.select({ wallet_address: wallet_flags.wallet_address })
    .from(wallet_flags)
    .where(and(
      inArray(wallet_flags.wallet_address, smartAddresses),
      eq(wallet_flags.detector, 'bundler'),
      eq(wallet_flags.cleared, false),
    ))
    .all();

  const coordinatedSet = new Set(flagRows.map(f => f.wallet_address));

  // ---------------------------------------------------------------------------
  // Step 6: Per-token computation
  // ---------------------------------------------------------------------------
  let updated = 0;
  let suppressed = 0;

  for (const tokenMint of allTokenMints) {
    // Read current tier before upsert (for transition detection)
    const existingTier = db.select({ signal_tier: token_signals.signal_tier })
      .from(token_signals)
      .where(eq(token_signals.token_mint, tokenMint))
      .get()?.signal_tier ?? null;

    // Load ALL swaps for this token from smart wallets (no time filter — for holder calc)
    const tokenSwaps = db.select({
      wallet_address: swaps.wallet_address,
      side: swaps.side,
      token_amount: swaps.token_amount,
      timestamp: swaps.timestamp,
    })
      .from(swaps)
      .where(and(
        eq(swaps.token_mint, tokenMint),
        inArray(swaps.wallet_address, smartAddresses),
      ))
      .all();

    // Compute net position per wallet → isCurrentHolder = buyAmt > sellAmt
    const netPositionMap = new Map<string, number>();
    for (const swap of tokenSwaps) {
      const current = netPositionMap.get(swap.wallet_address) ?? 0;
      if (swap.side === 'buy') {
        netPositionMap.set(swap.wallet_address, current + swap.token_amount);
      } else {
        netPositionMap.set(swap.wallet_address, current - swap.token_amount);
      }
    }

    // Build smart wallet holders array (current + non-current, all wallets with any swap)
    const walletSet = new Set(tokenSwaps.map(s => s.wallet_address));
    const smartWalletHolders = Array.from(walletSet).map(addr => ({
      walletAddress: addr,
      walletScore: walletScoreMap.get(addr) ?? 0,
      isCoordinated: coordinatedSet.has(addr),
      isCurrentHolder: (netPositionMap.get(addr) ?? 0) > 0,
    }));

    // Count buysLast1h: swaps.timestamp >= oneHourAgoSec AND side='buy'
    const buysLast1h = tokenSwaps.filter(
      s => s.side === 'buy' && s.timestamp >= oneHourAgoSec,
    ).length;

    // Count sellsLast1h
    const sellsLast1h = tokenSwaps.filter(
      s => s.side === 'sell' && s.timestamp >= oneHourAgoSec,
    ).length;

    // Count totalSmartBuysLast24h
    const totalSmartBuysLast24h = tokenSwaps.filter(
      s => s.side === 'buy' && s.timestamp >= twentyFourHoursAgoSec,
    ).length;

    // Call pure scorer
    const result = computeSignalScore({
      tokenMint,
      smartWalletHolders,
      buysLast1h,
      sellsLast1h,
      totalSmartBuysLast24h,
    });

    // ---------------------------------------------------------------------------
    // Tier transition detection — insert signal_events row on any active tier change
    // ---------------------------------------------------------------------------
    const newTier = result.signalTier;  // 'strong' | 'moderate' | 'weak' | 'inactive'
    const isTransition =
      existingTier !== newTier &&
      newTier !== 'inactive';  // transitions TO inactive are NOT signal fire events

    if (isTransition) {
      // Fetch entry price immediately at transition moment
      const entryPrice = await dexFetcher.getTokenPrice(tokenMint);
      db.insert(signal_events).values({
        token_mint: tokenMint,
        fired_at: nowMs,
        tier: newTier as 'strong' | 'moderate' | 'weak',
        signal_score: result.signalScore,
        smart_wallet_count: result.smartWalletCount,
        buy_velocity: result.buyVelocity1h,
        holder_score: result.pnlWeightedHolderScore,
        coordinated_wallet_count: result.coordinatedWalletCount,
        entry_price: entryPrice,
      }).run();
    }

    const hasExistingRecord = existingActiveSet.has(tokenMint);

    if (result.signalScore > 0) {
      // Full upsert — token is active
      db.insert(token_signals).values({
        token_mint: tokenMint,
        signal_score: result.signalScore,
        signal_tier: result.signalTier,
        smart_wallet_count: result.smartWalletCount,
        buy_velocity_1h: result.buyVelocity1h,
        exit_pressure: result.exitPressure,
        pnl_weighted_holder_score: result.pnlWeightedHolderScore,
        coordination_discount: result.coordinationDiscount,
        coordinated_wallet_count: result.coordinatedWalletCount,
        updated_at: nowMs,
      }).onConflictDoUpdate({
        target: token_signals.token_mint,
        set: {
          signal_score: result.signalScore,
          signal_tier: result.signalTier,
          smart_wallet_count: result.smartWalletCount,
          buy_velocity_1h: result.buyVelocity1h,
          exit_pressure: result.exitPressure,
          pnl_weighted_holder_score: result.pnlWeightedHolderScore,
          coordination_discount: result.coordinationDiscount,
          coordinated_wallet_count: result.coordinatedWalletCount,
          updated_at: nowMs,
        },
      }).run();
      updated++;
    } else if (hasExistingRecord) {
      // Existing active record, score dropped to 0 — mark inactive
      db.insert(token_signals).values({
        token_mint: tokenMint,
        signal_score: 0,
        signal_tier: 'inactive',
        smart_wallet_count: 0,
        buy_velocity_1h: result.buyVelocity1h,
        exit_pressure: result.exitPressure,
        pnl_weighted_holder_score: 0,
        coordination_discount: result.coordinationDiscount,
        coordinated_wallet_count: result.coordinatedWalletCount,
        updated_at: nowMs,
      }).onConflictDoUpdate({
        target: token_signals.token_mint,
        set: {
          signal_score: 0,
          signal_tier: 'inactive',
          smart_wallet_count: 0,
          buy_velocity_1h: result.buyVelocity1h,
          exit_pressure: result.exitPressure,
          pnl_weighted_holder_score: 0,
          coordination_discount: result.coordinationDiscount,
          coordinated_wallet_count: result.coordinatedWalletCount,
          updated_at: nowMs,
        },
      }).run();
      suppressed++;
    }
    // else: score=0 AND no existing record → skip
  }

  return { updated, suppressed };
}
