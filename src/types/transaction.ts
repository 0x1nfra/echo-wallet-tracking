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
