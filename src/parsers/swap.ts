/**
 * Swap parser and FIFO cost basis calculator
 */

import {
  DEX_PROGRAM_IDS_MAP,
  type HeliusTransaction,
  type HeliusSwapEvent,
  type SwapRow,
} from '../types/transaction.js';

/**
 * Identify the DEX name for a transaction by scanning its instruction programIds
 * against the DEX_PROGRAM_IDS_MAP entries.
 * Returns null if no matching programId is found.
 */
function identifyDex(tx: HeliusTransaction): string | null {
  if (!tx.instructions || tx.instructions.length === 0) return null;

  for (const instruction of tx.instructions) {
    for (const [dexName, programIds] of Object.entries(DEX_PROGRAM_IDS_MAP)) {
      if (programIds.includes(instruction.programId)) {
        return dexName;
      }
    }
  }

  return null;
}

/**
 * Parse an array of Helius transactions into normalized SwapRow objects.
 *
 * - Only processes transactions with type === 'SWAP'
 * - Only processes SOL↔token swaps (skips token-to-token)
 * - Skips transactions with unknown programIds (not in DEX_PROGRAM_IDS_MAP)
 * - cost_basis_sol and realized_pnl_sol are set to null — populated by applyFifo
 */
export function parseSwaps(
  txs: HeliusTransaction[],
  walletAddress: string
): SwapRow[] {
  const results: SwapRow[] = [];

  for (const tx of txs) {
    // Only process SWAP transactions
    if (tx.type !== 'SWAP') continue;

    // Identify DEX — skip unknown programIds
    const dex = identifyDex(tx);
    if (dex === null) continue;

    // Normalize events.swap to array
    if (!tx.events?.swap) continue;
    const swapEvents: HeliusSwapEvent[] = Array.isArray(tx.events.swap)
      ? tx.events.swap
      : [tx.events.swap];

    if (swapEvents.length === 0) continue;

    // Use first swap event
    const swapEvent = swapEvents[0];

    const hasNativeInput = !!swapEvent.nativeInput;
    const hasNativeOutput = !!swapEvent.nativeOutput;
    const hasTokenInputs =
      swapEvent.tokenInputs && swapEvent.tokenInputs.length > 0;
    const hasTokenOutputs =
      swapEvent.tokenOutputs && swapEvent.tokenOutputs.length > 0;

    // Skip token-to-token swaps (no native SOL involved)
    if (!hasNativeInput && !hasNativeOutput) continue;

    // Determine fee in SOL
    // tx.fee is in lamports (Helius API returns lamports for fee)
    const fee_sol = typeof tx.fee === 'number' ? tx.fee / 1e9 : null;

    if (hasNativeInput && hasTokenOutputs) {
      // BUY: SOL in, tokens out
      const nativeInput = swapEvent.nativeInput!;
      const tokenOutput = swapEvent.tokenOutputs![0];
      const sol_amount = Number(nativeInput.amount) / 1e9;
      const decimals = tokenOutput.rawTokenAmount.decimals;
      const token_amount =
        Number(tokenOutput.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);

      results.push({
        wallet_address: walletAddress,
        tx_signature: tx.signature,
        dex,
        token_mint: tokenOutput.mint,
        side: 'buy',
        token_amount,
        sol_amount,
        timestamp: tx.timestamp,
        slot: tx.slot,
        fee_sol,
        cost_basis_sol: null,
        realized_pnl_sol: null,
      });
    } else if (hasNativeOutput && hasTokenInputs) {
      // SELL: tokens in, SOL out
      const nativeOutput = swapEvent.nativeOutput!;
      const tokenInput = swapEvent.tokenInputs![0];
      const sol_amount = Number(nativeOutput.amount) / 1e9;
      const decimals = tokenInput.rawTokenAmount.decimals;
      const token_amount =
        Number(tokenInput.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);

      results.push({
        wallet_address: walletAddress,
        tx_signature: tx.signature,
        dex,
        token_mint: tokenInput.mint,
        side: 'sell',
        token_amount,
        sol_amount,
        timestamp: tx.timestamp,
        slot: tx.slot,
        fee_sol,
        cost_basis_sol: null,
        realized_pnl_sol: null,
      });
    }
    // Otherwise: unusual shape — skip
  }

  return results;
}

interface FifoLot {
  tokenAmount: number;
  pricePerToken: number; // SOL per token
}

/**
 * Apply FIFO cost basis to an array of SwapRow objects.
 *
 * - Sorts by timestamp ASC before processing
 * - BUY: records a lot and sets cost_basis_sol = sol_amount, realized_pnl_sol = null
 * - SELL: consumes matching lots FIFO for the token_mint
 *   - Full match: cost_basis_sol = total consumed SOL, realized_pnl_sol = sol_amount - cost_basis_sol
 *   - Partial orphan (lots exhausted mid-sell): cost_basis_sol = null, realized_pnl_sol = null
 *   - Full orphan (no lots): cost_basis_sol = null, realized_pnl_sol = null
 * - Returns new array (does not mutate input)
 */
export function applyFifo(swaps: SwapRow[]): SwapRow[] {
  const EPSILON = 1e-9;

  // Sort by timestamp ASC (do not mutate input — sort a copy of indices)
  const sorted = [...swaps].sort((a, b) => a.timestamp - b.timestamp);

  // Track buy lots per token mint
  const lots = new Map<string, FifoLot[]>();

  const result: SwapRow[] = sorted.map(swap => {
    const row = { ...swap };

    if (swap.side === 'buy') {
      // Record lot
      const pricePerToken =
        swap.token_amount > 0 ? swap.sol_amount / swap.token_amount : 0;
      const tokenLots = lots.get(swap.token_mint) ?? [];
      tokenLots.push({ tokenAmount: swap.token_amount, pricePerToken });
      lots.set(swap.token_mint, tokenLots);

      row.cost_basis_sol = swap.sol_amount;
      row.realized_pnl_sol = null;
    } else {
      // SELL: consume FIFO lots
      const tokenLots = lots.get(swap.token_mint);

      if (!tokenLots || tokenLots.length === 0) {
        // Full orphan
        row.cost_basis_sol = null;
        row.realized_pnl_sol = null;
      } else {
        let remaining = swap.token_amount;
        let totalCostSol = 0;
        let orphaned = false;

        for (const lot of tokenLots) {
          if (remaining <= EPSILON) break;

          const consumed = Math.min(remaining, lot.tokenAmount);
          totalCostSol += consumed * lot.pricePerToken;
          lot.tokenAmount -= consumed;
          remaining -= consumed;

          if (remaining <= EPSILON) break;
        }

        // Remove exhausted lots
        lots.set(
          swap.token_mint,
          tokenLots.filter(l => l.tokenAmount > EPSILON)
        );

        if (remaining > EPSILON) {
          // Lots ran out mid-sell (partial orphan)
          orphaned = true;
        }

        if (orphaned) {
          row.cost_basis_sol = null;
          row.realized_pnl_sol = null;
        } else {
          row.cost_basis_sol = totalCostSol;
          row.realized_pnl_sol = swap.sol_amount - totalCostSol;
        }
      }
    }

    return row;
  });

  return result;
}
