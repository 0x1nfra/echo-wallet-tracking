// src/types/transaction.ts

/**
 * Raw transaction from blockchain
 */
export interface Transaction {
  signature: string;
  timestamp: number; // Unix timestamp in seconds
  blockTime: number;
  slot: number;
  fee: number; // SOL (lamports converted)
}

/**
 * Parsed swap transaction
 */
export type SwapType = 'buy' | 'sell';

export interface Swap {
  signature: string;
  timestamp: number;
  type: SwapType;

  // Token info
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string;

  // Amounts (in native units)
  amountSol: number;
  amountTokens: number;
  pricePerTokenSol: number; // SOL per token (raw)

  // USD values (enriched later)
  amountUsd?: number; // Trade value in USD
  pricePerTokenUsd: number; // Token price in USD
  marketCapUsd?: number; // Market cap at time of trade

  // DEX info
  dex: 'raydium' | 'jupiter' | 'pump.fun' | 'orca' | 'meteora' | 'unknown';

  // Optional metadata
  poolAddress?: string;
  slippage?: number;
}

/**
 * Parsed wallet swaps history
 */
export interface WalletSwaps {
  wallet: string;
  swaps: Swap[];
  totalSwaps: number;
  uniqueTokens: number;
  oldestSwap?: number; // timestamp
  newestSwap?: number; // timestamp
}

/**
 * DEX program IDs for identification
 */
export const DEX_PROGRAM_IDS = {
  RAYDIUM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  ORCA: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  METEORA: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
} as const;

/**
 * SOL token addresses (native SOL and wrapped SOL)
 */
export const SOL_ADDRESSES = {
  NATIVE: 'So11111111111111111111111111111111111111112', // Native SOL
  WRAPPED: 'So11111111111111111111111111111111111111112', // WSOL (same address)
} as const;

/**
 * Enhanced transaction from Helius with parsed data
 */
export interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  fee: number;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: Array<{
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      userAccount: string;
    }>;
  }>;
  events?: {
    swap?: Array<{
      nativeInput?: {
        account: string;
        amount: string;
      };
      nativeOutput?: {
        account: string;
        amount: string;
      };
      tokenInputs?: Array<{
        mint: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        userAccount: string;
      }>;
      tokenOutputs?: Array<{
        mint: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        userAccount: string;
      }>;
    }>;
  };
  instructions?: Array<{
    programId: string;
    data?: string;
  }>;
}
