import type { HeliusFetcher } from '../helius.js';
import type { RpcProvider, ProviderTransaction } from './types.js';

export class HeliusProvider implements RpcProvider {
  private fetcher: HeliusFetcher;

  constructor(fetcher: HeliusFetcher) {
    this.fetcher = fetcher;
  }

  fetchSwapHistory(address: string, afterTimestamp: number): Promise<ProviderTransaction[]> {
    return this.fetcher.fetchSwapHistory(address, afterTimestamp);
  }

  fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<ProviderTransaction[]> {
    return this.fetcher.fetchEarlySwapsForMint(mint, limit, sortOrder);
  }

  fetchOnePage(address: string, limit: number): Promise<ProviderTransaction[]> {
    return this.fetcher.fetchOnePage(address, limit);
  }

  getTransactionDetails(signature: string): Promise<ProviderTransaction> {
    return this.fetcher.getTransaction(signature);
  }
}
