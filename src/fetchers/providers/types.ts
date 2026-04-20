import type { HeliusTransaction } from '../../types/index.js';

/**
 * Canonical output type for all provider methods.
 * Aliased to HeliusTransaction to avoid churn in existing callsites.
 * ShyftProvider normalizes internally to this shape before returning.
 */
export type ProviderTransaction = HeliusTransaction;

/**
 * Abstraction over any Solana RPC provider that supports enhanced transaction data.
 * Implemented by HeliusProvider (primary) and ShyftProvider (fallback).
 *
 * getTransactionDetails is consumed by bundler.ts and wash-trader.ts via the
 * shared ProviderRouter — unlike the other three methods, it THROWS on
 * provider exhaustion rather than returning empty results (see router.ts).
 */
export interface RpcProvider {
  fetchSwapHistory(address: string, afterTimestamp: number): Promise<ProviderTransaction[]>;
  fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<ProviderTransaction[]>;
  fetchOnePage(address: string, limit: number): Promise<ProviderTransaction[]>;
  getTransactionDetails(signature: string): Promise<ProviderTransaction>;
}
