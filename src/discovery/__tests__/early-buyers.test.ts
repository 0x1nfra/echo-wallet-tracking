/**
 * Early buyer extraction tests (DISC-01)
 *
 * Mock strategy: pass optional fetcher dep to fetchEarlyBuyers
 * to avoid hitting real Helius API.
 * Uses plain async functions (no jest.fn()) for ESM compatibility.
 */

import { fetchEarlyBuyers } from '../../discovery/early-buyers.js';
import type { HeliusTransaction } from '../../types/index.js';

const LAUNCH_TS = 1_700_000_000; // Arbitrary launch timestamp
const THIRTY_MINUTES = 1800;

function makeSwapTx(feePayer: string, offsetSeconds: number): HeliusTransaction {
  return {
    signature: `sig-${feePayer}-${offsetSeconds}`,
    timestamp: LAUNCH_TS + offsetSeconds,
    feePayer,
    type: 'SWAP',
  } as unknown as HeliusTransaction;
}

function makeTransferTx(feePayer: string, offsetSeconds: number): HeliusTransaction {
  return {
    signature: `sig-transfer-${feePayer}-${offsetSeconds}`,
    timestamp: LAUNCH_TS + offsetSeconds,
    feePayer,
    type: 'TRANSFER',
  } as unknown as HeliusTransaction;
}

function buildMockFetcher(txs: HeliusTransaction[]) {
  return {
    fetchEarlySwapsForMint: async (_mint: string, _limit: number, _sortOrder: string) => txs,
  };
}

describe('fetchEarlyBuyers', () => {
  it('Case 1: happy path — returns all 5 unique wallets within 30 min', async () => {
    const txs = [
      makeSwapTx('A', 0),
      makeSwapTx('B', 100),
      makeSwapTx('C', 500),
      makeSwapTx('D', 900),
      makeSwapTx('E', THIRTY_MINUTES - 1),
    ];
    const fetcher = buildMockFetcher(txs);

    const result = await fetchEarlyBuyers('MINT123', fetcher);

    expect(result).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('Case 2: time filter — txs after 30-minute window excluded', async () => {
    const txs = [
      makeSwapTx('A', 0),
      makeSwapTx('B', 100),
      makeSwapTx('C', 500),
      makeSwapTx('D', 2000), // after 30 min
      makeSwapTx('E', 2500), // after 30 min
    ];
    const fetcher = buildMockFetcher(txs);

    const result = await fetchEarlyBuyers('MINT123', fetcher);

    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('Case 3: deduplication — same wallet bought multiple times early', async () => {
    const txs = [
      makeSwapTx('A', 0),
      makeSwapTx('A', 100), // duplicate
      makeSwapTx('B', 200),
      makeSwapTx('C', 300),
    ];
    const fetcher = buildMockFetcher(txs);

    const result = await fetchEarlyBuyers('MINT123', fetcher);

    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('Case 4: cap at 50 — returns exactly 50 when more than 50 unique early buyers', async () => {
    // 60 unique wallets, all within 30 min (60 * 10 = 600s < 1800s)
    const txs = Array.from({ length: 60 }, (_, i) =>
      makeSwapTx(`wallet-${i}`, i * 10)
    );
    const fetcher = buildMockFetcher(txs);

    const result = await fetchEarlyBuyers('MINT123', fetcher);

    expect(result).toHaveLength(50);
  });

  it('Case 5: empty result — no txs returned', async () => {
    const fetcher = buildMockFetcher([]);

    const result = await fetchEarlyBuyers('MINT123', fetcher);

    expect(result).toEqual([]);
  });

  it('Case 6: non-SWAP txs filtered out', async () => {
    const txs = [
      makeSwapTx('A', 0),
      makeTransferTx('B', 100), // not a SWAP — should be filtered
      makeSwapTx('C', 200),
      makeTransferTx('D', 300), // not a SWAP — should be filtered
    ];
    const fetcher = buildMockFetcher(txs);

    const result = await fetchEarlyBuyers('MINT123', fetcher);

    expect(result).toEqual(['A', 'C']);
  });
});
