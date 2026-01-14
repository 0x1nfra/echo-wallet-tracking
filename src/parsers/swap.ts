// src/parsers/swap.ts

import {
  Swap,
  SwapType,
  DEX_PROGRAM_IDS,
  SOL_ADDRESSES,
  HeliusEnhancedTransaction,
} from '../types/transaction.js';

/**
 * Parse swaps from Helius enhanced transactions
 */
export function parseSwaps(
  transactions: HeliusEnhancedTransaction[],
  walletAddress: string
): Swap[] {
  const swaps: Swap[] = [];

  for (const tx of transactions) {
    // Skip non-swap transactions
    if (tx.type !== 'SWAP' && !tx.events?.swap) {
      continue;
    }

    try {
      const swap = parseSwap(tx, walletAddress);
      if (swap) {
        swaps.push(swap);
      }
    } catch (error) {
      console.error(`Failed to parse swap ${tx.signature}:`, error);
      // Continue processing other transactions
    }
  }

  return swaps;
}

/**
 * Parse a single swap transaction
 */
function parseSwap(tx: HeliusEnhancedTransaction, walletAddress: string): Swap | null {
  // Try parsing from swap events first (most reliable)
  if (tx.events?.swap?.[0]) {
    return parseSwapFromEvents(tx);
  }

  // Fallback to token transfers
  if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    return parseSwapFromTransfers(tx, walletAddress);
  }

  return null;
}

/**
 * Parse swap from Helius swap events (preferred method)
 */
function parseSwapFromEvents(tx: HeliusEnhancedTransaction): Swap | null {
  const swapEvent = tx.events!.swap![0];

  // Determine if buy or sell based on SOL flow
  const solInput = swapEvent.nativeInput;
  const solOutput = swapEvent.nativeOutput;
  const tokenInputs = swapEvent.tokenInputs || [];
  const tokenOutputs = swapEvent.tokenOutputs || [];

  let type: SwapType;
  let amountSol: number;
  let amountTokens: number;
  let tokenMint: string;
  let decimals: number;

  if (solInput && tokenOutputs.length > 0) {
    // Buy: SOL -> Token
    type = 'buy';
    amountSol = parseFloat(solInput.amount) / 1e9; // Convert lamports to SOL
    const tokenOutput = tokenOutputs[0];
    tokenMint = tokenOutput.mint;
    decimals = tokenOutput.rawTokenAmount.decimals;
    amountTokens = parseFloat(tokenOutput.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);
  } else if (solOutput && tokenInputs.length > 0) {
    // Sell: Token -> SOL
    type = 'sell';
    amountSol = parseFloat(solOutput.amount) / 1e9;
    const tokenInput = tokenInputs[0];
    tokenMint = tokenInput.mint;
    decimals = tokenInput.rawTokenAmount.decimals;
    amountTokens = parseFloat(tokenInput.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);
  } else {
    // Token-to-token swap (not SOL pair) - skip for now
    return null;
  }

  const pricePerToken = amountSol / amountTokens;

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    type,
    tokenAddress: tokenMint,
    tokenSymbol: 'UNKNOWN', // Will be enriched later
    amountSol,
    amountTokens,
    pricePerToken,
    dex: identifyDex(tx),
  };
}

/**
 * Parse swap from token transfers (fallback method)
 */
function parseSwapFromTransfers(tx: HeliusEnhancedTransaction, walletAddress: string): Swap | null {
  const transfers = tx.tokenTransfers || [];

  // Find SOL and token transfers involving the wallet
  let solTransfer: { amount: number; direction: 'in' | 'out' } | null = null;
  let tokenTransfer: {
    mint: string;
    amount: number;
    decimals: number;
    direction: 'in' | 'out';
  } | null = null;

  // Check native transfers for SOL
  if (tx.nativeTransfers) {
    for (const transfer of tx.nativeTransfers) {
      if (transfer.fromUserAccount === walletAddress) {
        solTransfer = {
          amount: transfer.amount / 1e9,
          direction: 'out',
        };
      } else if (transfer.toUserAccount === walletAddress) {
        solTransfer = {
          amount: transfer.amount / 1e9,
          direction: 'in',
        };
      }
    }
  }

  // Check token transfers
  for (const transfer of transfers) {
    const isSOL = transfer.mint === SOL_ADDRESSES.NATIVE || transfer.mint === SOL_ADDRESSES.WRAPPED;

    if (isSOL) {
      // This is a wrapped SOL transfer
      if (transfer.fromUserAccount === walletAddress) {
        solTransfer = {
          amount: transfer.tokenAmount,
          direction: 'out',
        };
      } else if (transfer.toUserAccount === walletAddress) {
        solTransfer = {
          amount: transfer.tokenAmount,
          direction: 'in',
        };
      }
    } else {
      // This is a token transfer
      if (transfer.fromUserAccount === walletAddress) {
        tokenTransfer = {
          mint: transfer.mint,
          amount: transfer.tokenAmount,
          decimals: 9, // Assume 9 decimals for now
          direction: 'out',
        };
      } else if (transfer.toUserAccount === walletAddress) {
        tokenTransfer = {
          mint: transfer.mint,
          amount: transfer.tokenAmount,
          decimals: 9,
          direction: 'in',
        };
      }
    }
  }

  // Must have both SOL and token transfers
  if (!solTransfer || !tokenTransfer) {
    return null;
  }

  // Determine swap type
  let type: SwapType;
  let amountSol: number;
  let amountTokens: number;

  if (solTransfer.direction === 'out' && tokenTransfer.direction === 'in') {
    // Buy: SOL out, Token in
    type = 'buy';
    amountSol = solTransfer.amount;
    amountTokens = tokenTransfer.amount;
  } else if (solTransfer.direction === 'in' && tokenTransfer.direction === 'out') {
    // Sell: Token out, SOL in
    type = 'sell';
    amountSol = solTransfer.amount;
    amountTokens = tokenTransfer.amount;
  } else {
    // Unexpected transfer pattern
    return null;
  }

  const pricePerToken = amountSol / amountTokens;

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    type,
    tokenAddress: tokenTransfer.mint,
    tokenSymbol: 'UNKNOWN',
    amountSol,
    amountTokens,
    pricePerToken,
    dex: identifyDex(tx),
  };
}

/**
 * Identify which DEX was used for the swap
 */
function identifyDex(tx: HeliusEnhancedTransaction): Swap['dex'] {
  if (!tx.instructions) {
    return 'unknown';
  }

  for (const instruction of tx.instructions) {
    const programId = instruction.programId;

    if (programId === DEX_PROGRAM_IDS.RAYDIUM) {
      return 'raydium';
    }
    if (programId === DEX_PROGRAM_IDS.JUPITER) {
      return 'jupiter';
    }
    if (programId === DEX_PROGRAM_IDS.PUMP_FUN) {
      return 'pump.fun';
    }
    if (programId === DEX_PROGRAM_IDS.ORCA) {
      return 'orca';
    }
    if (programId === DEX_PROGRAM_IDS.METEORA) {
      return 'meteora';
    }
  }

  return 'unknown';
}

/**
 * Enrich swaps with token metadata (symbols, etc)
 */
export async function enrichSwaps(swaps: Swap[]): Promise<Swap[]> {
  // TODO: Fetch token metadata from DexScreener or other sources
  // For now, just return swaps as-is
  return swaps;
}
