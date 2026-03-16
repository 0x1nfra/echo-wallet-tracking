/**
 * Early buyer discovery from token mint transactions.
 *
 * Identifies wallets that purchased a token within the first 30 minutes
 * after the first recorded swap — direct discovery candidates.
 */

import { createHeliusFetcher } from '../fetchers/helius.js';
import type { HeliusTransaction } from '../types/index.js';

/** Window after launch (seconds) to consider a buyer "early" */
const EARLY_WINDOW_SECONDS = 30 * 60; // 1800 seconds

/** Max early buyers to return (discovery candidate cap) */
const MAX_EARLY_BUYERS = 50;

/** Minimal interface for the fetcher dependency — enables testing without real API calls */
interface EarlySwapsFetcher {
  fetchEarlySwapsForMint(
    mint: string,
    limit: number,
    sortOrder: 'asc' | 'desc'
  ): Promise<HeliusTransaction[]>;
}

/**
 * Fetch unique wallet addresses that bought a token within 30 minutes of its launch.
 *
 * Algorithm:
 *  1. Fetch earliest 200 SWAP txs for the mint (oldest-first)
 *  2. Use timestamp of first tx as launchTimestamp
 *  3. Filter to txs within launchTimestamp + EARLY_WINDOW_SECONDS
 *  4. Filter to type === 'SWAP' only
 *  5. Deduplicate by feePayer wallet address
 *  6. Cap at MAX_EARLY_BUYERS (50)
 *
 * @param mint - Solana token mint address
 * @param fetcher - Optional fetcher override for testing (uses createHeliusFetcher() by default)
 * @returns Up to 50 unique wallet addresses of early buyers
 */
export async function fetchEarlyBuyers(
  mint: string,
  fetcher?: EarlySwapsFetcher
): Promise<string[]> {
  const f = fetcher ?? createHeliusFetcher();

  const txs = await f.fetchEarlySwapsForMint(mint, 200, 'asc');

  if (txs.length === 0) {
    return [];
  }

  // Use the first tx timestamp as the launch anchor
  const launchTimestamp = txs[0].timestamp;
  const cutoff = launchTimestamp + EARLY_WINDOW_SECONDS;

  const seen = new Set<string>();
  const buyers: string[] = [];

  for (const tx of txs) {
    // Stop processing once we hit the 50-buyer cap
    if (buyers.length >= MAX_EARLY_BUYERS) break;

    // Skip txs outside the 30-minute launch window
    if (tx.timestamp > cutoff) continue;

    // Only SWAP transactions count
    if (tx.type !== 'SWAP') continue;

    // Deduplicate by wallet address
    if (seen.has(tx.feePayer)) continue;

    seen.add(tx.feePayer);
    buyers.push(tx.feePayer);
  }

  return buyers;
}
