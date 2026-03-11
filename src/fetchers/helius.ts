/**
 * Helius API fetcher for Solana transactions
 */

import axios, { AxiosInstance } from 'axios';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import type { HeliusTransaction } from '../types/index.js';

// Free tier: 2 req/s Enhanced API
const heliusQueue = new PQueue({ interval: 1000, intervalCap: 2 });

export class HeliusFetcher {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string, endpoint: string = 'https://api-mainnet.helius-rpc.com/v0') {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: endpoint,
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Fetch all swap transactions for a wallet address with pagination, rate limiting, and retry.
   * @param address - Solana wallet address
   * @param afterTimestamp - Unix seconds lower bound; 0 = no lower bound (--full-history)
   * @returns Array of Helius transactions
   */
  async fetchSwapHistory(
    address: string,
    afterTimestamp: number  // Unix seconds; 0 = no lower bound (--full-history)
  ): Promise<HeliusTransaction[]> {
    const allTxs: HeliusTransaction[] = [];
    let beforeSignature: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const params: Record<string, string | number> = {
        'api-key': this.apiKey,
        limit: 100,
        type: 'SWAP',
      };
      if (afterTimestamp > 0) params['gte-time'] = afterTimestamp;
      if (beforeSignature) params['before-signature'] = beforeSignature;

      const txs = await pRetry(
        () => heliusQueue.add(async () => {
          const res = await this.client.get(
            `/addresses/${address}/transactions`,
            { params }
          );
          return res.data as HeliusTransaction[];
        }),
        {
          retries: 3,
          onFailedAttempt: (error) => {
            // Do not retry auth errors
            if ((error as any).response?.status === 401) throw error;
          },
        }
      );

      if (!txs || txs.length === 0) { hasMore = false; break; }

      allTxs.push(...txs);

      const oldest = txs[txs.length - 1];
      // Stop when we've gone past the time window or got a partial page
      if ((afterTimestamp > 0 && oldest.timestamp < afterTimestamp) || txs.length < 100) {
        hasMore = false;
      } else {
        beforeSignature = oldest.signature;
      }
    }

    return allTxs;
  }

  /**
   * Fetch all transactions for a wallet address
   * @param address - Solana wallet address
   * @param days - Number of days to look back (default: 30)
   * @returns Array of parsed transactions
   */
  async getTransactions(address: string, days: number = 30): Promise<HeliusTransaction[]> {
    try {
      console.log(`Fetching transactions for ${address} (last ${days} days)...`);

      // Calculate timestamp for lookback period
      const beforeTimestamp = Math.floor(Date.now() / 1000); // Current time
      const afterTimestamp = beforeTimestamp - days * 24 * 60 * 60; // X days ago

      const allTransactions: HeliusTransaction[] = [];
      let beforeSignature: string | undefined = undefined;
      let hasMore = true;

      // Helius pagination - fetch in batches
      while (hasMore) {
        const response = await this.client.get('/addresses/' + address + '/transactions', {
          params: {
            'api-key': this.apiKey,
            'before-signature': beforeSignature,
            limit: 100, // Max per request
          },
        });

        const transactions: HeliusTransaction[] = response.data;

        if (!transactions || transactions.length === 0) {
          hasMore = false;
          break;
        }

        // Filter by timestamp
        const filteredTransactions = transactions.filter(
          (tx) => tx.timestamp >= afterTimestamp && tx.timestamp <= beforeTimestamp
        );

        allTransactions.push(...filteredTransactions);

        // Check if we've gone past our time window
        const oldestTx = transactions[transactions.length - 1];
        if (oldestTx.timestamp < afterTimestamp) {
          hasMore = false;
          break;
        }

        // Pagination: use last signature for next batch
        beforeSignature = oldestTx.signature;

        // Safety check: if we got less than limit, we're at the end
        if (transactions.length < 100) {
          hasMore = false;
        }

        console.log(`  Fetched ${allTransactions.length} transactions so far...`);
      }

      console.log(`✓ Total transactions fetched: ${allTransactions.length}`);
      return allTransactions;
    } catch (error) {
      // TODO: Implement automatic retry with exponential backoff
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error('Helius API rate limit exceeded. Please wait a moment and try again.');
        }
        if (error.response?.status === 401) {
          throw new Error('Invalid Helius API key. Check your .env file.');
        }
        throw new Error(`Helius API error: ${error.response?.data?.error || error.message}`);
      }
      throw new Error(`Failed to fetch transactions: ${error}`);
    }
  }

  /**
   * Get parsed transaction details for a specific signature
   * @param signature - Transaction signature
   * @returns Parsed transaction details
   */
  async getTransaction(signature: string): Promise<HeliusTransaction> {
    try {
      const response = await this.client.post(
        '/v0/transactions',
        { transactions: [signature] },
        { params: { 'api-key': this.apiKey } }
      );

      const transactions: HeliusTransaction[] = response.data;
      if (!transactions || transactions.length === 0) {
        throw new Error(`Transaction not found: ${signature}`);
      }

      return transactions[0];
    } catch (error) {
      // TODO: Implement automatic retry with exponential backoff
      if (axios.isAxiosError(error)) {
        throw new Error(`Helius API error: ${error.response?.data?.error || error.message}`);
      }
      throw new Error(`Failed to fetch transaction: ${error}`);
    }
  }

  /**
   * Check if API key is valid by making a test request
   * @returns true if valid, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test with a known Solana address (Solana treasury)
      const testAddress = 'So11111111111111111111111111111111111111112';
      await this.client.get('/addresses/' + testAddress + '/transactions', {
        params: {
          'api-key': this.apiKey,
          limit: 1,
        },
      });
      return true;
    } catch (error) {
      console.error('Helius connection test failed:', error);
      return false;
    }
  }
}

/**
 * Create a Helius fetcher instance with config from environment
 */
export function createHeliusFetcher(): HeliusFetcher {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error('HELIUS_API_KEY not found in environment variables');
  }
  return new HeliusFetcher(apiKey);
}
