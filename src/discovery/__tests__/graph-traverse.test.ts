/**
 * Tests for fetchCoTraders() — graph traversal for co-trader discovery.
 *
 * Mock strategy: pass optional fetcher dep to fetchCoTraders
 * to avoid hitting real Helius API (matches project ESM pattern).
 */

import { fetchCoTraders } from '../../discovery/graph-traverse.js';
import type { HeliusTransaction } from '../../types/index.js';
import type { CoTraderFetcher } from '../../discovery/graph-traverse.js';

/** Build a minimal HeliusTransaction with a feePayer and token mint */
function makeSwapTx(feePayer: string, mint: string): HeliusTransaction {
  return {
    signature: `sig-${feePayer}-${mint}`,
    timestamp: 1_700_000_000,
    feePayer,
    type: 'SWAP',
    tokenTransfers: [{ mint, fromUserAccount: 'pool', toUserAccount: feePayer, tokenAmount: 100 }],
  } as unknown as HeliusTransaction;
}

/** Build a mock fetcher that returns controlled responses */
function buildMockFetcher(opts: {
  pageResults?: Record<string, HeliusTransaction[]>;
  earlySwapResults?: Record<string, HeliusTransaction[]>;
}): CoTraderFetcher {
  return {
    fetchOnePage: async (address: string, _limit: number) => {
      return opts.pageResults?.[address] ?? [];
    },
    fetchEarlySwapsForMint: async (mint: string, _limit: number, _sortOrder: string) => {
      return opts.earlySwapResults?.[mint] ?? [];
    },
  };
}

describe('fetchCoTraders', () => {
  // Test 1: deduplication — same co-trader found via two different mints appears once
  it('deduplicates co-traders found via multiple mints', async () => {
    const knownAddr = 'known_wallet_A';

    const fetcher = buildMockFetcher({
      pageResults: {
        [knownAddr]: [
          makeSwapTx(knownAddr, 'MINT_1'),
          makeSwapTx(knownAddr, 'MINT_2'),
        ],
      },
      earlySwapResults: {
        MINT_1: [makeSwapTx('co_trader_X', 'MINT_1')],
        MINT_2: [makeSwapTx('co_trader_X', 'MINT_2')], // same co_trader again
      },
    });

    const result = await fetchCoTraders([knownAddr], fetcher);

    expect(result).toContain('co_trader_X');
    // Should appear only once despite being found in both mints
    const count = result.filter(a => a === 'co_trader_X').length;
    expect(count).toBe(1);
  });

  // Test 2: exclusion — address in knownAddresses input set is NOT returned
  it('excludes known smart-money addresses from co-trader results', async () => {
    const knownAddr = 'known_wallet_B';
    const knownAddr2 = 'known_wallet_C';

    const fetcher = buildMockFetcher({
      pageResults: {
        [knownAddr]: [makeSwapTx(knownAddr, 'MINT_1')],
        [knownAddr2]: [],
      },
      earlySwapResults: {
        MINT_1: [
          makeSwapTx(knownAddr, 'MINT_1'),   // known address — should be excluded
          makeSwapTx(knownAddr2, 'MINT_1'),  // also known — should be excluded
          makeSwapTx('outsider_1', 'MINT_1'), // not known — should be included
        ],
      },
    });

    const result = await fetchCoTraders([knownAddr, knownAddr2], fetcher);

    expect(result).not.toContain(knownAddr);
    expect(result).not.toContain(knownAddr2);
    expect(result).toContain('outsider_1');
  });

  // Test 3: 30-address cap — when algorithm finds 40+ co-traders, returns exactly 30
  it('caps results at 30 unique co-trader addresses', async () => {
    const knownAddr = 'known_wallet_D';

    // 40 unique co-traders from one mint
    const earlyTxs = Array.from({ length: 40 }, (_, i) =>
      makeSwapTx(`co_trader_${i}`, 'MINT_BIG'),
    );

    const fetcher = buildMockFetcher({
      pageResults: {
        [knownAddr]: [makeSwapTx(knownAddr, 'MINT_BIG')],
      },
      earlySwapResults: {
        MINT_BIG: earlyTxs,
      },
    });

    const result = await fetchCoTraders([knownAddr], fetcher);

    expect(result).toHaveLength(30);
  });

  // Test 4: empty result — when fetchOnePage returns no txs, returns []
  it('returns empty array when fetchOnePage returns no transactions', async () => {
    const knownAddr = 'known_wallet_E';

    const fetcher = buildMockFetcher({
      pageResults: {
        [knownAddr]: [], // no txs
      },
      earlySwapResults: {},
    });

    const result = await fetchCoTraders([knownAddr], fetcher);

    expect(result).toEqual([]);
  });
});
