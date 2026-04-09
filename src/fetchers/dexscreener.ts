/**
 * DexScreener API fetcher for token prices
 */

import axios, { AxiosInstance } from 'axios';
import type { DexScreenerResponse, DexScreenerPair } from '../types/index.js';

export class DexScreenerFetcher {
  private client: AxiosInstance;

  constructor(endpoint: string = 'https://api.dexscreener.com/latest') {
    this.client = axios.create({
      baseURL: endpoint,
      timeout: 10000, // 10 second timeout
    });
  }

  /**
   * Get token price on Solana
   * @param tokenAddress - Token mint address
   * @returns Price in USD, or null if not found
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    try {
      const response = await this.client.get<DexScreenerResponse>(`/dex/tokens/${tokenAddress}`);

      const pairs = response.data.pairs;
      if (!pairs || pairs.length === 0) {
        console.warn(`No price data found for token: ${tokenAddress}`);
        return null;
      }

      // Find the Solana pair with highest liquidity
      const solanaPairs = pairs.filter((pair) => pair.chainId === 'solana');
      if (solanaPairs.length === 0) {
        console.warn(`No Solana pairs found for token: ${tokenAddress}`);
        return null;
      }

      // Sort by liquidity (highest first)
      const bestPair = solanaPairs.sort((a, b) => {
        const liquidityA = a.liquidity?.usd || 0;
        const liquidityB = b.liquidity?.usd || 0;
        return liquidityB - liquidityA;
      })[0];

      // Return price in USD
      // TODO: add market cap metrics
      if (!bestPair.priceUsd || bestPair.priceUsd.trim() === '') {
        console.warn(`Price USD is missing or empty for token: ${tokenAddress}`);
        return null;
      }
      
      const priceInUsd = parseFloat(bestPair.priceUsd);
      if (!isFinite(priceInUsd)) {
        console.warn(`Price USD cannot be parsed to a finite number for token: ${tokenAddress}`);
        return null;
      }
      
      return priceInUsd;
    } catch (error) {
      // TODO: Implement automatic retry with exponential backoff
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error(
            'DexScreener API rate limit exceeded. Please wait a moment and try again.'
          );
        }
        console.warn(`Failed to fetch price for ${tokenAddress}:`, error.message);
      }
      return null; // Return null instead of throwing for price fetch failures
    }
  }

  /**
   * Get token price and market cap on Solana
   * @param tokenAddress - Token mint address
   * @returns Price in USD and market cap, or nulls if not found
   */
  async getTokenPriceAndMarketCap(tokenAddress: string): Promise<{ price: number | null; marketCap: number | null }> {
    try {
      const response = await this.client.get<DexScreenerResponse>(`/dex/tokens/${tokenAddress}`);
      const pairs = response.data.pairs;
      if (!pairs || pairs.length === 0) return { price: null, marketCap: null };

      const solanaPairs = pairs.filter((pair) => pair.chainId === 'solana');
      if (solanaPairs.length === 0) return { price: null, marketCap: null };

      const bestPair = solanaPairs.sort((a, b) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      )[0];

      const priceUsd = bestPair.priceUsd?.trim();
      const price = priceUsd && priceUsd !== '' ? parseFloat(priceUsd) : null;
      const marketCap = bestPair.marketCap ?? null;

      return {
        price: price !== null && isFinite(price) ? price : null,
        marketCap: marketCap !== null && isFinite(marketCap) ? marketCap : null,
      };
    } catch {
      return { price: null, marketCap: null };
    }
  }

  /**
   * Get prices for multiple tokens in a single batch
   * @param tokenAddresses - Array of token mint addresses
   * @returns Map of token address to price in USD
   */
  async getTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();

    // DexScreener doesn't have batch endpoint, so we do sequential
    // TODO: Could optimize with Promise.all but need rate limit handling
    for (const address of tokenAddresses) {
      const price = await this.getTokenPrice(address);
      if (price !== null) {
        priceMap.set(address, price);
      }
      // Small delay to avoid rate limiting (300/min = 5/sec)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return priceMap;
  }

  /**
   * Get detailed pair information for a token
   * @param tokenAddress - Token mint address
   * @returns Array of pairs trading this token
   */
  async getTokenPairs(tokenAddress: string): Promise<DexScreenerPair[]> {
    try {
      const response = await this.client.get<DexScreenerResponse>(`/dex/tokens/${tokenAddress}`);

      const pairs = response.data.pairs;
      if (!pairs || pairs.length === 0) {
        return [];
      }

      // Filter for Solana pairs only
      return pairs.filter((pair) => pair.chainId === 'solana');
    } catch (error) {
      // TODO: Implement automatic retry with exponential backoff
      if (axios.isAxiosError(error)) {
        console.warn(`Failed to fetch pairs for ${tokenAddress}:`, error.message);
      }
      return [];
    }
  }

  /**
   * Test connection to DexScreener API
   * @returns true if API is accessible
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test with SOL address
      const solAddress = 'So11111111111111111111111111111111111111112';
      await this.getTokenPrice(solAddress);
      return true;
    } catch (error) {
      console.error('DexScreener connection test failed:', error);
      return false;
    }
  }
}

/**
 * Create a DexScreener fetcher instance
 */
export function createDexScreenerFetcher(): DexScreenerFetcher {
  return new DexScreenerFetcher();
}
