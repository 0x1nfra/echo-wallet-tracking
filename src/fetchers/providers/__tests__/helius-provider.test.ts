/**
 * HeliusProvider delegation tests (11-01)
 *
 * Verifies that HeliusProvider correctly delegates all three RpcProvider methods
 * to the injected HeliusFetcher without adding any logic.
 *
 * Mock strategy: plain object mocks (no jest.fn()) for ESM compatibility.
 * Follows injectable mock pattern from Phases 3, 6, and 8.
 */

import { HeliusProvider } from '../helius-provider.js';
import type { HeliusFetcher } from '../../helius.js';
import type { HeliusTransaction } from '../../../types/index.js';

function makeTx(signature: string): HeliusTransaction {
  return {
    signature,
    slot: 1,
    timestamp: 1_700_000_000,
    fee: 5000,
    feePayer: 'wallet1',
    success: true,
    type: 'SWAP',
    source: 'RAYDIUM',
  } as unknown as HeliusTransaction;
}

describe('HeliusProvider', () => {
  describe('fetchSwapHistory', () => {
    it('delegates to fetcher.fetchSwapHistory with correct args and returns its value', async () => {
      const expected = [makeTx('sig-swap-1'), makeTx('sig-swap-2')];
      let capturedAddress: string | undefined;
      let capturedAfterTimestamp: number | undefined;

      const mockFetcher = {
        fetchSwapHistory: async (address: string, afterTimestamp: number) => {
          capturedAddress = address;
          capturedAfterTimestamp = afterTimestamp;
          return expected;
        },
      } as unknown as HeliusFetcher;

      const provider = new HeliusProvider(mockFetcher);
      const result = await provider.fetchSwapHistory('wallet-addr', 123);

      expect(capturedAddress).toBe('wallet-addr');
      expect(capturedAfterTimestamp).toBe(123);
      expect(result).toBe(expected);
    });
  });

  describe('fetchEarlySwapsForMint', () => {
    it('delegates to fetcher.fetchEarlySwapsForMint with correct args and returns its value', async () => {
      const expected = [makeTx('sig-early-1')];
      let capturedMint: string | undefined;
      let capturedLimit: number | undefined;
      let capturedSortOrder: string | undefined;

      const mockFetcher = {
        fetchEarlySwapsForMint: async (mint: string, limit: number, sortOrder: 'asc' | 'desc') => {
          capturedMint = mint;
          capturedLimit = limit;
          capturedSortOrder = sortOrder;
          return expected;
        },
      } as unknown as HeliusFetcher;

      const provider = new HeliusProvider(mockFetcher);
      const result = await provider.fetchEarlySwapsForMint('MINT123', 50, 'asc');

      expect(capturedMint).toBe('MINT123');
      expect(capturedLimit).toBe(50);
      expect(capturedSortOrder).toBe('asc');
      expect(result).toBe(expected);
    });
  });

  describe('fetchOnePage', () => {
    it('delegates to fetcher.fetchOnePage with correct args and returns its value', async () => {
      const expected = [makeTx('sig-page-1'), makeTx('sig-page-2'), makeTx('sig-page-3')];
      let capturedAddress: string | undefined;
      let capturedLimit: number | undefined;

      const mockFetcher = {
        fetchOnePage: async (address: string, limit: number) => {
          capturedAddress = address;
          capturedLimit = limit;
          return expected;
        },
      } as unknown as HeliusFetcher;

      const provider = new HeliusProvider(mockFetcher);
      const result = await provider.fetchOnePage('wallet-addr', 20);

      expect(capturedAddress).toBe('wallet-addr');
      expect(capturedLimit).toBe(20);
      expect(result).toBe(expected);
    });
  });
});
