/**
 * Transaction and swap-related types
 */

export interface Transaction {
  signature: string;
  timestamp: number; // Unix timestamp
  blockTime: number;
  slot: number;
  success: boolean;
  fee: number; // SOL
  instructions: TransactionInstruction[];
}

export interface TransactionInstruction {
  programId: string;
  data: string;
  accounts: string[];
}

export type SwapType = 'buy' | 'sell';

export type DexType = 'raydium' | 'jupiter' | 'pump.fun' | 'orca' | 'unknown';

export interface Swap {
  signature: string;
  timestamp: number;
  type: SwapType;
  tokenAddress: string;
  tokenSymbol: string;
  amountSol: number;
  amountTokens: number;
  pricePerToken: number;
  dex: DexType;
}

export interface ParsedTransaction {
  wallet: string;
  swaps: Swap[];
  rawTransactions: Transaction[];
}

// DEX program ID registry — flat keys for test compatibility (e.g. DEX_PROGRAM_IDS.RAYDIUM)
export const DEX_PROGRAM_IDS = {
  RAYDIUM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',   // AMM v4 (primary)
  JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',   // Aggregator v6
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Bonding curve (original)
  ORCA: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',      // Whirlpool
  METEORA: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // DLMM (primary)
} as const;

// DEX program ID map — grouped arrays covering all program IDs per DEX (multi-program DEXes)
export const DEX_PROGRAM_IDS_MAP: Record<string, string[]> = {
  'pump.fun': [
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Bonding curve (original)
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',  // PumpSwap AMM (March 2025)
  ],
  'raydium': [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',  // AMM v4
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',  // CPMM
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',  // CLMM
  ],
  'jupiter': [
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Aggregator v6
  ],
  'orca': [
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Whirlpool
  ],
  'meteora': [
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // DLMM
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',  // DAMM v2
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',  // DAMM v1
  ],
};

// Helius swap event structure (nested via events.swap)
export interface HeliusSwapEvent {
  nativeInput?: { account: string; amount: string };
  nativeOutput?: { account: string; amount: string };
  tokenInputs?: Array<{
    mint: string;
    rawTokenAmount: { tokenAmount: string; decimals: number };
    userAccount: string;
  }>;
  tokenOutputs?: Array<{
    mint: string;
    rawTokenAmount: { tokenAmount: string; decimals: number };
    userAccount: string;
  }>;
  innerSwaps?: HeliusSwapEvent[];
}

// Helius instruction structure
export interface HeliusInstruction {
  programId: string;
  accounts?: string[];
  data?: string;
}

// Helius API response types
export interface HeliusTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  fee: number;
  feePayer: string;
  success: boolean;
  type: string;
  source: string;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  events?: {
    swap?: HeliusSwapEvent | HeliusSwapEvent[];
  };
  instructions?: HeliusInstruction[];
}

export interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard?: string;
}

export interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

// DexScreener API response types
export interface DexScreenerToken {
  address: string;
  name: string;
  symbol: string;
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexScreenerToken;
  quoteToken: DexScreenerToken;
  priceNative: string;
  priceUsd?: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

// SwapRow — shape for DB insertion into the swaps table
export interface SwapRow {
  wallet_address: string;
  tx_signature: string;
  dex: string;
  token_mint: string;
  side: 'buy' | 'sell';
  token_amount: number;
  sol_amount: number;
  timestamp: number;
  slot: number;
  fee_sol: number | null;
  cost_basis_sol: number | null;
  realized_pnl_sol: number | null;
}
