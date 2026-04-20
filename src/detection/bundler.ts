/**
 * Bundler Detector (DETC-01)
 *
 * Flags wallets that participate in coordinated buys (same slot, same token)
 * with 3+ co-buyers AND a common SOL funder that is not a known system account.
 *
 * Bias: AGGRESSIVE — requires multiple independent coordination events with
 * shared funder, which is very high confidence of bundled behavior.
 */

import { eq, and } from 'drizzle-orm';
import { BUNDLER } from './thresholds.js';
import type { DetectorConfig, DetectorResult } from './types.js';

// -----------------------------------------------------------------------
// Injectable dependency types (for testing / production)
// -----------------------------------------------------------------------

export interface BundlerDb {
  query: {
    swaps: {
      findMany: (opts: {
        where?: unknown;
        columns?: unknown;
      }) => Promise<Array<{
        wallet_address: string;
        tx_signature: string;
        token_mint: string;
        slot: number;
        side: string;
      }>>;
    };
  };
}

export interface BundlerFetcher {
  getTransaction: (signature: string) => Promise<{
    signature: string;
    nativeTransfers?: Array<{
      fromUserAccount: string;
      toUserAccount: string;
      amount: number;
    }>;
  }>;
}

export interface BundlerDeps {
  db: BundlerDb;
  fetcher: BundlerFetcher;
}

// -----------------------------------------------------------------------
// Coordination event: one confirmed (slot, token) with shared non-system funder
// -----------------------------------------------------------------------

interface CoordinationEvent {
  slot: number;
  token_mint: string;
  co_buyers: string[];
  shared_funder: string;
  tx_signature: string;
}

// -----------------------------------------------------------------------
// detectBundler
// -----------------------------------------------------------------------

export async function detectBundler(
  config: DetectorConfig,
  deps?: Partial<BundlerDeps>
): Promise<DetectorResult> {
  // Resolve deps — production uses singletons, tests inject mocks
  const db = deps?.db ?? (await getDefaultDb());
  const fetcher = deps?.fetcher ?? (await getDefaultFetcher());

  const { walletAddress, thresholdMultiplier } = config;

  // ------------------------------------------------------------------
  // Step 1: Load all buy swaps from the DB (we group in JS for testability)
  // ------------------------------------------------------------------
  const allBuySwaps = await db.query.swaps.findMany({
    where: undefined,
    columns: undefined,
  });

  // Filter to buys only
  const buys = allBuySwaps.filter((s) => s.side === 'buy');

  // ------------------------------------------------------------------
  // Step 2: Group by (slot, token_mint) → find coordination candidates
  // A coordination candidate is a group where:
  //   - COUNT(DISTINCT wallet_address) >= BUNDLER.MIN_WALLETS_IN_SAME_SLOT
  //   - The target wallet is one of the buyers
  // ------------------------------------------------------------------
  type GroupKey = `${number}:${string}`;
  const groups = new Map<GroupKey, typeof buys>();

  for (const swap of buys) {
    const key: GroupKey = `${swap.slot}:${swap.token_mint}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(swap);
  }

  // Candidates: groups with enough distinct wallets where our wallet participates
  const candidates: Array<{ slot: number; token_mint: string; swaps: typeof buys }> = [];

  for (const [key, swapGroup] of groups) {
    const [slotStr, tokenMint] = key.split(':') as [string, string];
    const slot = Number(slotStr);

    const distinctWallets = new Set(swapGroup.map((s) => s.wallet_address));
    const walletIsPresent = distinctWallets.has(walletAddress);

    if (walletIsPresent && distinctWallets.size >= BUNDLER.MIN_WALLETS_IN_SAME_SLOT) {
      candidates.push({ slot, token_mint: tokenMint, swaps: swapGroup });
    }
  }

  // ------------------------------------------------------------------
  // Step 3: For each candidate, fetch the target wallet's tx and inspect
  //         nativeTransfers to find a non-system shared funder.
  // ------------------------------------------------------------------
  const confirmedEvents: CoordinationEvent[] = [];
  let heliusFetches = 0;

  for (const candidate of candidates) {
    if (heliusFetches >= BUNDLER.MAX_HELIUS_FETCHES) break;

    // Find the target wallet's swap in this group
    const targetSwap = candidate.swaps.find((s) => s.wallet_address === walletAddress);
    if (!targetSwap) continue;

    let tx: Awaited<ReturnType<BundlerFetcher['getTransaction']>>;
    try {
      tx = await fetcher.getTransaction(targetSwap.tx_signature);
      heliusFetches++;
    } catch {
      // Helius fetch failed for this tx — skip this candidate
      continue;
    }

    if (!tx.nativeTransfers || tx.nativeTransfers.length === 0) continue;

    const co_buyers = [...new Set(candidate.swaps.map((s) => s.wallet_address))];

    // Count how many co-buyers each sender funded
    const senderToRecipients = new Map<string, Set<string>>();
    for (const transfer of tx.nativeTransfers) {
      const sender = transfer.fromUserAccount;
      if (BUNDLER.KNOWN_SYSTEM_ACCOUNTS.has(sender)) continue;
      if (!senderToRecipients.has(sender)) senderToRecipients.set(sender, new Set());
      senderToRecipients.get(sender)!.add(transfer.toUserAccount);
    }

    // A shared funder must have funded at least 2 of the co-buyers
    let sharedFunder: string | null = null;
    for (const [sender, recipients] of senderToRecipients) {
      const fundedBuyers = co_buyers.filter((b) => recipients.has(b));
      if (fundedBuyers.length >= 2) {
        sharedFunder = sender;
        break;
      }
    }

    if (sharedFunder) {
      confirmedEvents.push({
        slot: candidate.slot,
        token_mint: candidate.token_mint,
        co_buyers,
        shared_funder: sharedFunder,
        tx_signature: targetSwap.tx_signature,
      });
    }
  }

  // ------------------------------------------------------------------
  // Step 4: Apply threshold with multiplier and return DetectorResult
  // ------------------------------------------------------------------
  const effective_suspected = Math.ceil(BUNDLER.MIN_EVENTS_SUSPECTED * thresholdMultiplier);
  const effective_review = Math.ceil(BUNDLER.MIN_EVENTS_REVIEW * thresholdMultiplier);
  const effective_confirmed = Math.ceil(BUNDLER.MIN_EVENTS_CONFIRMED * thresholdMultiplier);

  const eventCount = confirmedEvents.length;

  if (eventCount < effective_suspected) {
    return {
      detector: 'bundler',
      flagged: false,
      confidence: null,
      evidenceSummary: {
        coordination_events: eventCount,
        shared_funder_count: 0,
        sample_tokens: [],
      },
      evidenceDetail: { events: confirmedEvents },
    };
  }

  let confidence: 'suspected' | 'review' | 'confirmed_suspicious';
  if (eventCount >= effective_confirmed) {
    confidence = 'confirmed_suspicious';
  } else if (eventCount >= effective_review) {
    confidence = 'review';
  } else {
    confidence = 'suspected';
  }

  const uniqueFunders = new Set(confirmedEvents.map((e) => e.shared_funder));
  const sampleTokens = [...new Set(confirmedEvents.map((e) => e.token_mint))].slice(0, 5);

  return {
    detector: 'bundler',
    flagged: true,
    confidence,
    evidenceSummary: {
      coordination_events: eventCount,
      shared_funder_count: uniqueFunders.size,
      sample_tokens: sampleTokens,
    },
    evidenceDetail: {
      events: confirmedEvents.map((e) => ({
        slot: e.slot,
        token_mint: e.token_mint,
        co_buyers: e.co_buyers,
        shared_funder: e.shared_funder,
        tx_signature: e.tx_signature,
      })),
    },
  };
}

// -----------------------------------------------------------------------
// Production singletons (lazy-loaded to avoid top-level import side effects
// that would break tests)
// -----------------------------------------------------------------------

async function getDefaultDb(): Promise<BundlerDb> {
  const { db } = await import('../db/index.js');
  return db as unknown as BundlerDb;
}

async function getDefaultFetcher(): Promise<BundlerFetcher> {
  // Route through ProviderRouter (Phase 16) to gain Shyft fallback and
  // throw-on-exhaustion semantics. The router exposes getTransactionDetails(sig),
  // which structurally satisfies BundlerFetcher.getTransaction(sig) — both
  // take a string and return a Promise<{ signature, nativeTransfers? }>.
  // Explicit adapter (not `as unknown as BundlerFetcher`) keeps the
  // method-name bridge visible and avoids leaking the full ProviderRouter surface.
  const { sharedProviderRouter } = await import('../fetchers/providers/index.js');
  return {
    getTransaction: (signature: string) =>
      sharedProviderRouter.getTransactionDetails(signature),
  };
}
