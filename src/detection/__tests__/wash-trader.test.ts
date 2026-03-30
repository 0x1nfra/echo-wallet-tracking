/**
 * Wash Trader Detector Tests (DETC-04)
 *
 * Mock strategy: pass { db, fetcher } as optional deps to detectWashTrader.
 * Uses mock db (in-memory swaps) and mock fetcher (no Helius API calls).
 *
 * Algorithm under test:
 *   - For each buy by target wallet, fetch Helius tx → look for token recipients
 *   - Check if any recipient (wallet B) sold same token within RELATIONSHIP_WINDOW_DAYS
 *   - Count independent circular patterns (unique by token_mint OR wallet_b)
 *   - Apply thresholds (with multiplier) to determine confidence
 *   - Enforce MAX_HELIUS_FETCHES_PER_WALLET cap
 */

import { detectWashTrader } from '../wash-trader.js';
import type { DetectorConfig } from '../types.js';
import { WASH_TRADER } from '../thresholds.js';

// -----------------------------------------------------------------------
// Types for mock DB rows and Helius responses
// -----------------------------------------------------------------------

type MockSwapRow = {
  wallet_address: string;
  tx_signature: string;
  token_mint: string;
  side: 'buy' | 'sell';
  timestamp: number;
};

type MockTokenTransfer = {
  mint: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
};

type MockNativeTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
};

type MockTx = {
  signature: string;
  tokenTransfers?: MockTokenTransfer[];
  nativeTransfers?: MockNativeTransfer[];
};

// -----------------------------------------------------------------------
// Mock db builder
// -----------------------------------------------------------------------

function buildMockDb(swapRows: MockSwapRow[]) {
  return {
    query: {
      swaps: {
        findMany: async (_opts: unknown) => swapRows,
      },
    },
  };
}

// -----------------------------------------------------------------------
// Mock fetcher builder
// -----------------------------------------------------------------------

function buildMockFetcher(txMap: Record<string, MockTx>) {
  return {
    getTransaction: async (sig: string): Promise<MockTx> => {
      const tx = txMap[sig];
      if (!tx) throw new Error(`Mock: tx not found: ${sig}`);
      return tx;
    },
  };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const WALLET = 'WashTraderWallet11111111111111111111111111111';
const WALLET_B = 'RelatedWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const WALLET_C = 'RelatedWalletCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const BASE_TIMESTAMP = 1_700_000_000; // Unix seconds (matches swaps.timestamp storage)
const WINDOW_SEC = WASH_TRADER.RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60;

/**
 * Build one complete circular pattern:
 *   WALLET buys TOKEN at t=0
 *   WALLET_B receives token (in tx tokenTransfers)
 *   WALLET_B sells TOKEN at t=1 (within RELATIONSHIP_WINDOW_DAYS)
 */
function buildCircularPattern(opts: {
  token_mint: string;
  buy_sig: string;
  sell_sig: string;
  wallet_b?: string;
  buy_timestamp?: number;
}): {
  swapRows: MockSwapRow[];
  txMap: Record<string, MockTx>;
} {
  const wallet_b = opts.wallet_b ?? WALLET_B;
  const buy_ts = opts.buy_timestamp ?? BASE_TIMESTAMP;
  const sell_ts = buy_ts + WINDOW_SEC / 2; // well within window

  const swapRows: MockSwapRow[] = [
    {
      wallet_address: WALLET,
      tx_signature: opts.buy_sig,
      token_mint: opts.token_mint,
      side: 'buy',
      timestamp: buy_ts,
    },
    {
      wallet_address: wallet_b,
      tx_signature: opts.sell_sig,
      token_mint: opts.token_mint,
      side: 'sell',
      timestamp: sell_ts,
    },
  ];

  const txMap: Record<string, MockTx> = {
    [opts.buy_sig]: {
      signature: opts.buy_sig,
      tokenTransfers: [
        {
          mint: opts.token_mint,
          fromUserAccount: WALLET,
          toUserAccount: wallet_b,
          tokenAmount: 1_000_000,
        },
      ],
    },
    [opts.sell_sig]: {
      signature: opts.sell_sig,
      nativeTransfers: [
        {
          fromUserAccount: wallet_b,
          toUserAccount: WALLET,
          amount: 1_000_000_000,
        },
      ],
    },
  };

  return { swapRows, txMap };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('detectWashTrader (DETC-04)', () => {
  // --- 0 circular patterns → flagged=false ---
  it('returns flagged=false when wallet has no circular patterns', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    // WALLET buys a token but nobody sells it back
    const swapRows: MockSwapRow[] = [
      {
        wallet_address: WALLET,
        tx_signature: 'buy-sig-1',
        token_mint: 'TOKEN_A',
        side: 'buy',
        timestamp: BASE_TIMESTAMP,
      },
    ];
    const txMap: Record<string, MockTx> = {
      'buy-sig-1': {
        signature: 'buy-sig-1',
        tokenTransfers: [], // no recipients
      },
    };

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(swapRows) as any, fetcher: buildMockFetcher(txMap) as any }
    );

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
    expect(result.detector).toBe('wash_trader');
  });

  // --- 1 pattern (below MIN_CIRCULAR_PATTERNS_SUSPECTED=2) → flagged=false ---
  it('returns flagged=false when wallet has only 1 circular pattern (below threshold)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const p1 = buildCircularPattern({ token_mint: 'TOKEN_A', buy_sig: 'buy-1', sell_sig: 'sell-1' });

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(p1.swapRows) as any, fetcher: buildMockFetcher(p1.txMap) as any }
    );

    // 1 < MIN_CIRCULAR_PATTERNS_SUSPECTED(2) → flagged=false
    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- 2 independent patterns → suspected ---
  it('returns suspected when wallet has 2 independent circular patterns', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const p1 = buildCircularPattern({ token_mint: 'TOKEN_A', buy_sig: 'buy-1', sell_sig: 'sell-1' });
    const p2 = buildCircularPattern({
      token_mint: 'TOKEN_B',
      buy_sig: 'buy-2',
      sell_sig: 'sell-2',
      buy_timestamp: BASE_TIMESTAMP + 1000,
    });

    const allSwaps = [...p1.swapRows, ...p2.swapRows];
    const allTxs = { ...p1.txMap, ...p2.txMap };

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(allSwaps) as any, fetcher: buildMockFetcher(allTxs) as any }
    );

    // 2 >= MIN_CIRCULAR_PATTERNS_SUSPECTED(2) → suspected
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('suspected');
  });

  // --- 4 patterns → review ---
  it('returns review when wallet has 4 independent circular patterns', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const patterns = ['TOKEN_A', 'TOKEN_B', 'TOKEN_C', 'TOKEN_D'].map((mint, i) =>
      buildCircularPattern({
        token_mint: mint,
        buy_sig: `buy-${i}`,
        sell_sig: `sell-${i}`,
        buy_timestamp: BASE_TIMESTAMP + i * 1000,
      })
    );

    const allSwaps = patterns.flatMap((p) => p.swapRows);
    const allTxs = Object.assign({}, ...patterns.map((p) => p.txMap));

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(allSwaps) as any, fetcher: buildMockFetcher(allTxs) as any }
    );

    // 4 >= MIN_CIRCULAR_PATTERNS_REVIEW(4) → review
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('review');
  });

  // --- 7 patterns → confirmed_suspicious ---
  it('returns confirmed_suspicious when wallet has 7 independent circular patterns', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const patterns = Array.from({ length: 7 }, (_, i) =>
      buildCircularPattern({
        token_mint: `TOKEN_${i}`,
        buy_sig: `buy-${i}`,
        sell_sig: `sell-${i}`,
        buy_timestamp: BASE_TIMESTAMP + i * 1000,
      })
    );

    const allSwaps = patterns.flatMap((p) => p.swapRows);
    const allTxs = Object.assign({}, ...patterns.map((p) => p.txMap));

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(allSwaps) as any, fetcher: buildMockFetcher(allTxs) as any }
    );

    // 7 >= MIN_CIRCULAR_PATTERNS_CONFIRMED(7) → confirmed_suspicious
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
  });

  // --- 2 patterns but thresholdMultiplier=2.0 → flagged=false (needs 4 for suspected) ---
  it('returns flagged=false with thresholdMultiplier=2.0 when only 2 circular patterns exist', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 2.0 };

    const p1 = buildCircularPattern({ token_mint: 'TOKEN_A', buy_sig: 'buy-1', sell_sig: 'sell-1' });
    const p2 = buildCircularPattern({
      token_mint: 'TOKEN_B',
      buy_sig: 'buy-2',
      sell_sig: 'sell-2',
      buy_timestamp: BASE_TIMESTAMP + 1000,
    });

    const allSwaps = [...p1.swapRows, ...p2.swapRows];
    const allTxs = { ...p1.txMap, ...p2.txMap };

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(allSwaps) as any, fetcher: buildMockFetcher(allTxs) as any }
    );

    // effective_suspected = 2 * 2.0 = 4 → 2 < 4 → flagged=false
    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- patterns with same token_mint (not independent) → count as 1 ---
  it('counts patterns with same token_mint and same wallet_b as a single pattern', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    // Two buys of the same token_mint, both with WALLET_B receiving — not independent
    const buy_ts1 = BASE_TIMESTAMP;
    const buy_ts2 = BASE_TIMESTAMP + 1000;
    const sell_ts = buy_ts1 + WINDOW_SEC / 2;

    const swapRows: MockSwapRow[] = [
      { wallet_address: WALLET, tx_signature: 'buy-1', token_mint: 'TOKEN_A', side: 'buy', timestamp: buy_ts1 },
      { wallet_address: WALLET, tx_signature: 'buy-2', token_mint: 'TOKEN_A', side: 'buy', timestamp: buy_ts2 },
      { wallet_address: WALLET_B, tx_signature: 'sell-1', token_mint: 'TOKEN_A', side: 'sell', timestamp: sell_ts },
    ];

    const txMap: Record<string, MockTx> = {
      'buy-1': {
        signature: 'buy-1',
        tokenTransfers: [{ mint: 'TOKEN_A', fromUserAccount: WALLET, toUserAccount: WALLET_B, tokenAmount: 500_000 }],
      },
      'buy-2': {
        signature: 'buy-2',
        tokenTransfers: [{ mint: 'TOKEN_A', fromUserAccount: WALLET, toUserAccount: WALLET_B, tokenAmount: 500_000 }],
      },
    };

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(swapRows) as any, fetcher: buildMockFetcher(txMap) as any }
    );

    // same token_mint + same wallet_b → counts as 1 pattern
    // 1 < MIN_CIRCULAR_PATTERNS_SUSPECTED(2) → flagged=false
    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- fetch cap: evidenceSummary includes fetch_limit_hit: true when cap reached ---
  it('caps Helius fetches at MAX_HELIUS_FETCHES_PER_WALLET and includes fetch_limit_hit in evidenceSummary', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    // Create MAX_HELIUS_FETCHES_PER_WALLET + 5 buy transactions for WALLET
    const manyBuys: MockSwapRow[] = Array.from({ length: WASH_TRADER.MAX_HELIUS_FETCHES_PER_WALLET + 5 }, (_, i) => ({
      wallet_address: WALLET,
      tx_signature: `buy-${i}`,
      token_mint: `TOKEN_${i}`,
      side: 'buy' as const,
      timestamp: BASE_TIMESTAMP + i * 1000,
    }));

    // Each buy tx has no token transfers → no circular patterns
    const txMap: Record<string, MockTx> = Object.fromEntries(
      manyBuys.map((s) => [s.tx_signature, { signature: s.tx_signature, tokenTransfers: [] }])
    );

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(manyBuys) as any, fetcher: buildMockFetcher(txMap) as any }
    );

    // Should not throw, should include fetch_limit_hit: true
    expect(result.flagged).toBe(false);
    expect((result.evidenceSummary as any).fetch_limit_hit).toBe(true);
  });

  // --- evidenceSummary structure when flagged ---
  it('includes circular_patterns count and related_wallets in evidenceSummary when flagged', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const p1 = buildCircularPattern({ token_mint: 'TOKEN_A', buy_sig: 'buy-1', sell_sig: 'sell-1' });
    const p2 = buildCircularPattern({
      token_mint: 'TOKEN_B',
      buy_sig: 'buy-2',
      sell_sig: 'sell-2',
      buy_timestamp: BASE_TIMESTAMP + 1000,
    });

    const allSwaps = [...p1.swapRows, ...p2.swapRows];
    const allTxs = { ...p1.txMap, ...p2.txMap };

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(allSwaps) as any, fetcher: buildMockFetcher(allTxs) as any }
    );

    expect(result.evidenceSummary).toMatchObject({ circular_patterns: 2 });
    expect(Array.isArray((result.evidenceSummary as any).related_wallets)).toBe(true);
  });

  // --- evidenceDetail structure when flagged ---
  it('includes patterns array in evidenceDetail when flagged', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const p1 = buildCircularPattern({ token_mint: 'TOKEN_A', buy_sig: 'buy-1', sell_sig: 'sell-1' });
    const p2 = buildCircularPattern({
      token_mint: 'TOKEN_B',
      buy_sig: 'buy-2',
      sell_sig: 'sell-2',
      buy_timestamp: BASE_TIMESTAMP + 1000,
    });

    const allSwaps = [...p1.swapRows, ...p2.swapRows];
    const allTxs = { ...p1.txMap, ...p2.txMap };

    const result = await detectWashTrader(
      config,
      { db: buildMockDb(allSwaps) as any, fetcher: buildMockFetcher(allTxs) as any }
    );

    expect(Array.isArray((result.evidenceDetail as any).patterns)).toBe(true);
    expect((result.evidenceDetail as any).patterns.length).toBe(2);
  });
});
