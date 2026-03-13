/**
 * Wash Trader Detector (DETC-04)
 *
 * Flags wallets that engage in circular trading patterns where:
 *   1. Wallet A (target) buys a token
 *   2. Token is transferred to Wallet B (seen in tokenTransfers of buy tx)
 *   3. Wallet B sells the same token within RELATIONSHIP_WINDOW_DAYS
 *
 * This buy → transfer → sell chain is the primary evidence of wash trading.
 * Requiring explicit SOL-back transfer is ideal but may not always appear in
 * nativeTransfers; the chain alone counts as circumstantial evidence.
 *
 * Bias: CONSERVATIVE — requires MIN_CIRCULAR_PATTERNS_SUSPECTED=2 independent
 * patterns before flagging. Independence = different token_mint OR different wallet_b.
 *
 * Respects MAX_HELIUS_FETCHES_PER_WALLET to prevent rate limit exhaustion.
 * Returns fetch_limit_hit: true in evidenceSummary when cap is reached.
 */

import { WASH_TRADER } from './thresholds.js';
import type { DetectorConfig, DetectorResult } from './types.js';

// -----------------------------------------------------------------------
// Injectable dependency types (for testing / production)
// -----------------------------------------------------------------------

export interface WashTraderDb {
  query: {
    swaps: {
      findMany: (opts: { where?: unknown; columns?: unknown }) => Promise<Array<{
        wallet_address: string;
        tx_signature: string;
        token_mint: string;
        side: string;
        timestamp: number;
      }>>;
    };
  };
}

export interface WashTraderFetcher {
  getTransaction: (signature: string) => Promise<{
    signature: string;
    tokenTransfers?: Array<{
      mint: string;
      fromUserAccount: string;
      toUserAccount: string;
      tokenAmount: number;
    }>;
    nativeTransfers?: Array<{
      fromUserAccount: string;
      toUserAccount: string;
      amount: number;
    }>;
  }>;
}

export interface WashTraderDeps {
  db: WashTraderDb;
  fetcher: WashTraderFetcher;
}

// -----------------------------------------------------------------------
// Internal pattern record
// -----------------------------------------------------------------------

interface CircularPattern {
  token_mint: string;
  wallet_b: string;
  buy_tx: string;
  sell_tx: string;
}

// -----------------------------------------------------------------------
// Independence key: a pattern is independent if it has a unique (token_mint, wallet_b)
// -----------------------------------------------------------------------
function patternKey(p: CircularPattern): string {
  return `${p.token_mint}::${p.wallet_b}`;
}

// -----------------------------------------------------------------------
// detectWashTrader
// -----------------------------------------------------------------------

export async function detectWashTrader(
  config: DetectorConfig,
  deps?: Partial<WashTraderDeps>
): Promise<DetectorResult> {
  const db = deps?.db ?? (await getDefaultDb());
  const fetcher = deps?.fetcher ?? (await getDefaultFetcher());
  const { walletAddress, thresholdMultiplier } = config;

  const windowMs = WASH_TRADER.RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // ------------------------------------------------------------------
  // Step 1: Load all swaps (target wallet buys + all other wallet sells)
  // ------------------------------------------------------------------
  const allSwaps = await db.query.swaps.findMany({ where: undefined, columns: undefined });

  const targetBuys = allSwaps.filter(
    (s) => s.wallet_address === walletAddress && s.side === 'buy'
  );

  // Index all sells by wallet_address+token_mint for fast lookup
  // Keyed as `${wallet_address}::${token_mint}` → array of sell rows
  type SellRow = { wallet_address: string; tx_signature: string; token_mint: string; side: string; timestamp: number };
  const sellIndex = new Map<string, SellRow[]>();

  for (const swap of allSwaps) {
    if (swap.side !== 'sell') continue;
    const key = `${swap.wallet_address}::${swap.token_mint}`;
    if (!sellIndex.has(key)) sellIndex.set(key, []);
    sellIndex.get(key)!.push(swap as SellRow);
  }

  // ------------------------------------------------------------------
  // Step 2: For each target buy, fetch Helius tx and look for circular patterns
  // ------------------------------------------------------------------
  const confirmedPatterns: CircularPattern[] = [];
  const seenPatternKeys = new Set<string>();
  let heliusFetches = 0;
  let fetchLimitHit = false;

  for (const buy of targetBuys) {
    if (heliusFetches >= WASH_TRADER.MAX_HELIUS_FETCHES_PER_WALLET) {
      fetchLimitHit = true;
      break;
    }

    let tx: Awaited<ReturnType<WashTraderFetcher['getTransaction']>>;
    try {
      tx = await fetcher.getTransaction(buy.tx_signature);
      heliusFetches++;
    } catch {
      // Helius fetch failed — skip this buy
      continue;
    }

    // Find token recipients from this buy transaction
    const recipients = new Set<string>();
    for (const transfer of tx.tokenTransfers ?? []) {
      if (
        transfer.mint === buy.token_mint &&
        transfer.fromUserAccount === walletAddress &&
        transfer.toUserAccount !== walletAddress
      ) {
        recipients.add(transfer.toUserAccount);
      }
    }

    if (recipients.size === 0) continue;

    // Check if any recipient sold the same token within the relationship window
    for (const walletB of recipients) {
      const sellKey = `${walletB}::${buy.token_mint}`;
      const sells = sellIndex.get(sellKey) ?? [];

      const matchingSell = sells.find(
        (sell) =>
          sell.timestamp > buy.timestamp &&
          sell.timestamp < buy.timestamp + windowMs
      );

      if (!matchingSell) continue;

      // Circular pattern detected: target bought → transferred to B → B sold within window
      const pattern: CircularPattern = {
        token_mint: buy.token_mint,
        wallet_b: walletB,
        buy_tx: buy.tx_signature,
        sell_tx: matchingSell.tx_signature,
      };

      const key = patternKey(pattern);
      if (!seenPatternKeys.has(key)) {
        seenPatternKeys.add(key);
        confirmedPatterns.push(pattern);
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3: Apply thresholds with multiplier and return DetectorResult
  // ------------------------------------------------------------------
  const effective_suspected = WASH_TRADER.MIN_CIRCULAR_PATTERNS_SUSPECTED * thresholdMultiplier;
  const effective_review = WASH_TRADER.MIN_CIRCULAR_PATTERNS_REVIEW * thresholdMultiplier;
  const effective_confirmed = WASH_TRADER.MIN_CIRCULAR_PATTERNS_CONFIRMED * thresholdMultiplier;

  const patternCount = confirmedPatterns.length;
  const relatedWallets = [...new Set(confirmedPatterns.map((p) => p.wallet_b))];

  const baseSummary = {
    circular_patterns: patternCount,
    related_wallets: relatedWallets,
    ...(fetchLimitHit ? { fetch_limit_hit: true } : {}),
  };

  if (patternCount < effective_suspected) {
    return {
      detector: 'wash_trader',
      flagged: false,
      confidence: null,
      evidenceSummary: baseSummary,
      evidenceDetail: { patterns: confirmedPatterns },
    };
  }

  let confidence: 'suspected' | 'review' | 'confirmed_suspicious';
  if (patternCount >= effective_confirmed) {
    confidence = 'confirmed_suspicious';
  } else if (patternCount >= effective_review) {
    confidence = 'review';
  } else {
    confidence = 'suspected';
  }

  return {
    detector: 'wash_trader',
    flagged: true,
    confidence,
    evidenceSummary: baseSummary,
    evidenceDetail: {
      patterns: confirmedPatterns.map((p) => ({
        token_mint: p.token_mint,
        wallet_b: p.wallet_b,
        buy_tx: p.buy_tx,
        sell_tx: p.sell_tx,
      })),
    },
  };
}

// -----------------------------------------------------------------------
// Production singletons (lazy-loaded to avoid import side effects in tests)
// -----------------------------------------------------------------------

async function getDefaultDb(): Promise<WashTraderDb> {
  const { db } = await import('../db/index.js');
  return db as unknown as WashTraderDb;
}

async function getDefaultFetcher(): Promise<WashTraderFetcher> {
  const { createHeliusFetcher } = await import('../fetchers/helius.js');
  return createHeliusFetcher() as unknown as WashTraderFetcher;
}
