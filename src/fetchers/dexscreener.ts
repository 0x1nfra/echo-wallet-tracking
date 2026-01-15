/**
 * DexScreener API fetcher for token prices
 */

import axios, { AxiosInstance } from 'axios';
import type { DexScreenerResponse, DexScreenerPair } from '../types/index';

export class DexScreenerFetcher {
  private client: AxiosInstance;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private cacheTtlMs: number = 60000; // 1 min

  constructor(endpoint: string = 'https://api.dexscreener.com/latest') {
    this.client = axios.create({
      baseURL: endpoint,
      timeout: 10000, // 10 second timeout
    });
  }

  /**
   * Get token price on Solana
   * @param tokenAddress - Token mint address
   * @param useCache - Whether to use cached price (default: true)
   * @returns Price in USD, or null if not found
   */
  async getTokenPrice(tokenAddress: string, useCache: boolean = true): Promise<number | null> {
    try {
      // Check cache first
      if (useCache) {
        const cached = this.priceCache.get(tokenAddress);
        if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
          return cached.price;
        }
      }

      const response = await this.client.get<DexScreenerResponse>(`/dex/tokens/${tokenAddress}`);

      const pairs = response.data.pairs;
      if (!pairs || pairs.length === 0) {
        console.warn(`No price data found for token: ${tokenAddress}`);
        return null;
      }

      // Find the Solana pair with highest liquidity
      const solanaPairs = pairs.filter((pair: DexScreenerPair) => pair.chainId === 'solana');
      if (solanaPairs.length === 0) {
        console.warn(`No Solana pairs found for token: ${tokenAddress}`);
        return null;
      }

      // Sort by liquidity (highest first)
      const bestPair = solanaPairs.sort((a: DexScreenerPair, b: DexScreenerPair) => {
        const liquidityA = a.liquidity?.usd || 0;
        const liquidityB = b.liquidity?.usd || 0;
        return liquidityB - liquidityA;
      })[0];

      // Return price in USD
      if (!bestPair.priceUsd || bestPair.priceUsd.trim() === '') {
        console.warn(`Price USD is missing or empty for token: ${tokenAddress}`);
        return null;
      }

      const priceInUsd = parseFloat(bestPair.priceUsd);
      if (!isFinite(priceInUsd) || priceInUsd <= 0) {
        console.warn(`Invalid price for token ${tokenAddress}: ${bestPair.priceUsd}`);
        return null;
      }

      // Cache the result
      this.priceCache.set(tokenAddress, {
        price: priceInUsd,
        timestamp: Date.now(),
      });

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
   * Get prices for multiple tokens with controlled concurrency
   * @param tokenAddresses - Array of token mint addresses
   * @param concurrency - Max concurrent requests (default: 3)
   * @returns Map of token address to price in USD
   */
  async getTokenPrices(
    tokenAddresses: string[],
    concurrency: number = 3
  ): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();

    // Process in batches with controlled concurrency
    for (let i = 0; i < tokenAddresses.length; i += concurrency) {
      const batch = tokenAddresses.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (address) => {
          const price = await this.getTokenPrice(address);
          return { address, price };
        })
      );

      results.forEach(({ address, price }) => {
        if (price !== null) {
          priceMap.set(address, price);
        }
      });

      // Delay between batches (300/min = 5/sec, so 3 concurrent = ~1.6/sec)
      if (i + concurrency < tokenAddresses.length) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
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
      return pairs.filter((pair: DexScreenerPair) => pair.chainId === 'solana');
    } catch (error) {
      // TODO: Implement automatic retry with exponential backoff
      if (axios.isAxiosError(error)) {
        console.warn(`Failed to fetch pairs for ${tokenAddress}:`, error.message);
      }
      return [];
    }
  }

  /**
   * Get token price and market cap data
   * @param tokenAddress - Token mint address
   * @returns Object with price, marketCap, and liquidity, or null if not found
   */
  async getTokenData(tokenAddress: string): Promise<{
    priceUsd: number;
    marketCap?: number;
    liquidity?: number;
    fdv?: number;
  } | null> {
    try {
      const response = await this.client.get<DexScreenerResponse>(`/dex/tokens/${tokenAddress}`);

      const pairs = response.data.pairs;
      if (!pairs || pairs.length === 0) {
        console.warn(`No data found for token: ${tokenAddress}`);
        return null;
      }

      const solanaPairs = pairs.filter((pair: DexScreenerPair) => pair.chainId === 'solana');
      if (solanaPairs.length === 0) {
        console.warn(`No Solana pairs found for token: ${tokenAddress}`);
        return null;
      }

      // Sort by liquidity (highest first)
      const bestPair = solanaPairs.sort((a: DexScreenerPair, b: DexScreenerPair) => {
        const liquidityA = a.liquidity?.usd || 0;
        const liquidityB = b.liquidity?.usd || 0;
        return liquidityB - liquidityA;
      })[0];

      if (!bestPair.priceUsd || bestPair.priceUsd.trim() === '') {
        console.warn(`Price USD is missing for token: ${tokenAddress}`);
        return null;
      }

      const priceInUsd = parseFloat(bestPair.priceUsd);
      if (!isFinite(priceInUsd) || priceInUsd <= 0) {
        console.warn(`Invalid price for token ${tokenAddress}: ${bestPair.priceUsd}`);
        return null;
      }

      return {
        priceUsd: priceInUsd,
        marketCap: bestPair.marketCap,
        liquidity: bestPair.liquidity?.usd,
        fdv: bestPair.fdv,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error(
            'DexScreener API rate limit exceeded. Please wait a moment and try again.'
          );
        }
        console.warn(`Failed to fetch data for ${tokenAddress}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Get comprehensive token information
   * @param tokenAddress - Token mint address
   * @returns Token info including price, symbol, name, market cap, etc.
   */
  async getTokenInfo(tokenAddress: string): Promise<{
    address: string;
    symbol: string;
    name: string;
    priceUsd: number | null;
    fdv: number | null;
    marketCap: number | null;
    pairAddress: string;
  } | null> {
    try {
      const response = await this.client.get<DexScreenerResponse>(`/dex/tokens/${tokenAddress}`);

      const pairs = response.data.pairs;
      if (!pairs || pairs.length === 0) {
        console.warn(`No data found for token: ${tokenAddress}`);
        return null;
      }

      // Find the Solana pair with highest liquidity
      const solanaPairs = pairs.filter((pair: DexScreenerPair) => pair.chainId === 'solana');
      if (solanaPairs.length === 0) {
        console.warn(`No Solana pairs found for token: ${tokenAddress}`);
        return null;
      }

      // Sort by liquidity (highest first)
      const bestPair = solanaPairs.sort((a: DexScreenerPair, b: DexScreenerPair) => {
        const liquidityA = a.liquidity?.usd || 0;
        const liquidityB = b.liquidity?.usd || 0;
        return liquidityB - liquidityA;
      })[0];

      // Extract token information from the best pair
      const isBaseToken = bestPair.baseToken?.address === tokenAddress;
      const tokenData = isBaseToken ? bestPair.baseToken : bestPair.quoteToken;

      const tokenInfo = {
        address: tokenAddress,
        symbol: tokenData?.symbol || 'UNKNOWN',
        name: tokenData?.name || 'Unknown Token',
        priceUsd: null as number | null,
        fdv: bestPair.fdv || null,
        marketCap: bestPair.marketCap || null,
        pairAddress: bestPair.pairAddress,
      };

      // Get price in USD
      if (bestPair.priceUsd && bestPair.priceUsd.trim() !== '') {
        const priceInUsd = parseFloat(bestPair.priceUsd);
        if (isFinite(priceInUsd) && priceInUsd > 0) {
          tokenInfo.priceUsd = priceInUsd;
        }
      }

      return tokenInfo;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error(
            'DexScreener API rate limit exceeded. Please wait a moment and try again.'
          );
        }
        console.warn(`Failed to fetch info for ${tokenAddress}:`, error.message);
      }
      return null;
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
