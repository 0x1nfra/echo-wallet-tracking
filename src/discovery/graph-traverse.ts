/**
 * Graph traversal for co-trader discovery.
 *
 * Finds wallets that co-traded the same tokens within the early window of
 * any token currently held by known smart-money addresses (depth=1 only).
 *
 * Requirements: DISC-04
 */

import { createHeliusFetcher } from '../fetchers/helius.js';
import type { HeliusTransaction } from '../types/index.js';

/** Maximum unique co-trader addresses to return */
const CO_TRADER_CAP = 30;

/** Max mints to check per known address (rate-limit budget) */
const MAX_MINTS_PER_ADDRESS = 5;

/** Minimal fetcher interface — enables testing without real API calls */
export interface CoTraderFetcher {
  fetchOnePage(address: string, limit: number): Promise<HeliusTransaction[]>;
  fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<HeliusTransaction[]>;
}

/**
 * Fetch co-traders: wallets that appear in the first 30 minutes of ANY token
 * currently held by at least one known-smart-money address.
 *
 * Algorithm:
 *  1. For each known address, fetch recent txs via fetchOnePage (limit=100)
 *  2. Extract unique token_mints from those txs (max 5 per address)
 *  3. For each unique mint, fetch early swaps via fetchEarlySwapsForMint
 *  4. Collect all feePayer addresses from early swap results
 *  5. Exclude any address already in the knownAddresses input set
 *  6. Deduplicate and cap at 30 unique results
 *
 * @param knownAddresses - Known smart-money wallet addresses to traverse from
 * @param fetcher - Optional fetcher override for testing
 * @returns Up to 30 unique co-trader wallet addresses
 */
export async function fetchCoTraders(
  knownAddresses: string[],
  fetcher?: CoTraderFetcher,
): Promise<string[]> {
  const f = fetcher ?? createHeliusFetcher();
  const knownSet = new Set(knownAddresses);
  const seen = new Set<string>();
  const coTraders: string[] = [];

  // Collect all unique mints from all known addresses
  const allMints = new Set<string>();

  for (const address of knownAddresses) {
    const txs = await f.fetchOnePage(address, 100);

    // Extract unique token_mints from this address's recent transactions
    // Helius txs may have tokenTransfers with mint info
    const mintsSeen = new Set<string>();
    let mintCount = 0;

    for (const tx of txs) {
      if (mintCount >= MAX_MINTS_PER_ADDRESS) break;

      // Extract mints from tokenTransfers
      if (tx.tokenTransfers) {
        for (const transfer of tx.tokenTransfers) {
          if (transfer.mint && !mintsSeen.has(transfer.mint)) {
            mintsSeen.add(transfer.mint);
            allMints.add(transfer.mint);
            mintCount++;
            if (mintCount >= MAX_MINTS_PER_ADDRESS) break;
          }
        }
      }
    }
  }

  // For each unique mint, fetch early buyers and collect co-traders
  for (const mint of allMints) {
    if (coTraders.length >= CO_TRADER_CAP) break;

    const earlyTxs = await f.fetchEarlySwapsForMint(mint, 100, 'asc');

    for (const tx of earlyTxs) {
      if (coTraders.length >= CO_TRADER_CAP) break;

      const addr = tx.feePayer;

      // Exclude known smart-money addresses
      if (knownSet.has(addr)) continue;

      // Deduplicate
      if (seen.has(addr)) continue;

      seen.add(addr);
      coTraders.push(addr);
    }
  }

  return coTraders;
}
