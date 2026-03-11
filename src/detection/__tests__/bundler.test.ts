/**
 * Bundler Detector Tests (DETC-01)
 *
 * Mock strategy: pass { db, fetcher } as optional deps to detectBundler
 * to avoid hitting real SQLite or Helius API.
 * Uses plain async functions (no jest.fn()) for ESM compatibility.
 */

import { detectBundler } from '../bundler.js';
import type { DetectorConfig } from '../types.js';

// -----------------------------------------------------------------------
// Minimal mock types
// -----------------------------------------------------------------------

type MockSwapRow = {
  wallet_address: string;
  tx_signature: string;
  token_mint: string;
  slot: number;
  side: string;
};

type MockNativeTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
};

type MockTx = {
  signature: string;
  nativeTransfers?: MockNativeTransfer[];
};

function buildMockDb(swapRows: MockSwapRow[]) {
  return {
    query: {
      swaps: {
        findMany: async (_opts: unknown) => swapRows,
      },
    },
  };
}

function buildMockFetcher(txMap: Record<string, MockTx>) {
  return {
    getTransaction: async (sig: string) => {
      const tx = txMap[sig];
      if (!tx) throw new Error(`Mock: tx not found: ${sig}`);
      return tx;
    },
  };
}

// -----------------------------------------------------------------------
// Helpers: build coordination events (slot+token groups)
// -----------------------------------------------------------------------

const WALLET = 'TestWallet111111111111111111111111111111111';
const OTHER_A = 'OtherWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER_B = 'OtherWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const FUNDER = 'SharedFunderXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

/**
 * Build swap rows for one coordination event:
 * same slot, same token_mint, WALLET + two others buying.
 */
function makeCoordinationGroup(
  slot: number,
  tokenMint: string,
  sig: string,
  wallets = [WALLET, OTHER_A, OTHER_B]
): MockSwapRow[] {
  return wallets.map((w, i) => ({
    wallet_address: w,
    tx_signature: i === 0 ? sig : `other-sig-${slot}-${i}`,
    token_mint: tokenMint,
    slot,
    side: 'buy',
  }));
}

/**
 * Build a Helius tx response with a shared funder sending SOL to recipients.
 */
function makeFundedTx(sig: string, funder: string, recipients: string[]): MockTx {
  return {
    signature: sig,
    nativeTransfers: recipients.map((r) => ({
      fromUserAccount: funder,
      toUserAccount: r,
      amount: 1_000_000_000,
    })),
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('detectBundler (DETC-01)', () => {
  // --- 0 coordination events: flagged=false ---
  it('returns flagged=false when wallet has no coordination events', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };
    const db = buildMockDb([]);
    const fetcher = buildMockFetcher({});

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
    expect(result.detector).toBe('bundler');
  });

  // --- 1 event (below MIN_EVENTS_SUSPECTED=2): flagged=false ---
  it('returns flagged=false when wallet has only 1 coordination event (below threshold)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps = makeCoordinationGroup(100, 'TOKEN_A', 'sig-a');
    const txMap = { 'sig-a': makeFundedTx('sig-a', FUNDER, [WALLET, OTHER_A, OTHER_B]) };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- 2 events with shared funder, thresholdMultiplier=1.0: suspected ---
  it('returns suspected when wallet has 2 coordination events with shared funder', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps = [
      ...makeCoordinationGroup(100, 'TOKEN_A', 'sig-a'),
      ...makeCoordinationGroup(200, 'TOKEN_B', 'sig-b'),
    ];
    const txMap = {
      'sig-a': makeFundedTx('sig-a', FUNDER, [WALLET, OTHER_A, OTHER_B]),
      'sig-b': makeFundedTx('sig-b', FUNDER, [WALLET, OTHER_A, OTHER_B]),
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('suspected');
  });

  // --- 3 events with shared funder: review ---
  it('returns review when wallet has 3 coordination events with shared funder', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps = [
      ...makeCoordinationGroup(100, 'TOKEN_A', 'sig-a'),
      ...makeCoordinationGroup(200, 'TOKEN_B', 'sig-b'),
      ...makeCoordinationGroup(300, 'TOKEN_C', 'sig-c'),
    ];
    const txMap = {
      'sig-a': makeFundedTx('sig-a', FUNDER, [WALLET, OTHER_A, OTHER_B]),
      'sig-b': makeFundedTx('sig-b', FUNDER, [WALLET, OTHER_A, OTHER_B]),
      'sig-c': makeFundedTx('sig-c', FUNDER, [WALLET, OTHER_A, OTHER_B]),
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('review');
  });

  // --- 5 events with shared funder: confirmed_suspicious ---
  it('returns confirmed_suspicious when wallet has 5 coordination events with shared funder', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const tokens = ['TOKEN_A', 'TOKEN_B', 'TOKEN_C', 'TOKEN_D', 'TOKEN_E'];
    const swaps = tokens.flatMap((t, i) =>
      makeCoordinationGroup(100 + i * 100, t, `sig-${t}`)
    );
    const txMap = Object.fromEntries(
      tokens.map((t) => [
        `sig-${t}`,
        makeFundedTx(`sig-${t}`, FUNDER, [WALLET, OTHER_A, OTHER_B]),
      ])
    );

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
  });

  // --- 4 events but thresholdMultiplier=2.0 → suspected (needs 4 for suspected, 6 for review) ---
  it('returns suspected (not review) when 4 events but thresholdMultiplier=2.0 raises bar', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 2.0 };

    const tokens = ['TOKEN_A', 'TOKEN_B', 'TOKEN_C', 'TOKEN_D'];
    const swaps = tokens.flatMap((t, i) =>
      makeCoordinationGroup(100 + i * 100, t, `sig-${t}`)
    );
    const txMap = Object.fromEntries(
      tokens.map((t) => [
        `sig-${t}`,
        makeFundedTx(`sig-${t}`, FUNDER, [WALLET, OTHER_A, OTHER_B]),
      ])
    );

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    // multiplier=2.0: suspected needs >=4, review needs >=6
    // 4 events → >= suspected(4) but < review(6) → suspected
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('suspected');
  });

  // --- shared funder is excluded system account (JUP6...): flagged=false ---
  it('returns flagged=false when shared funder is a known system account', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    // Jupiter v6 address from BUNDLER.KNOWN_SYSTEM_ACCOUNTS
    const jupiterFunder = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaW7grrKgrWqK';

    const swaps = [
      ...makeCoordinationGroup(100, 'TOKEN_A', 'sig-a'),
      ...makeCoordinationGroup(200, 'TOKEN_B', 'sig-b'),
    ];
    const txMap = {
      'sig-a': makeFundedTx('sig-a', jupiterFunder, [WALLET, OTHER_A, OTHER_B]),
      'sig-b': makeFundedTx('sig-b', jupiterFunder, [WALLET, OTHER_A, OTHER_B]),
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- fewer than MIN_WALLETS_IN_SAME_SLOT co-buyers: flagged=false ---
  it('returns flagged=false when slot group has fewer than MIN_WALLETS_IN_SAME_SLOT buyers', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    // Only 2 wallets in same slot (MIN_WALLETS_IN_SAME_SLOT = 3)
    const smallGroup = [WALLET, OTHER_A];
    const swaps = [
      ...makeCoordinationGroup(100, 'TOKEN_A', 'sig-a', smallGroup),
      ...makeCoordinationGroup(200, 'TOKEN_B', 'sig-b', smallGroup),
    ];
    const txMap = {
      'sig-a': makeFundedTx('sig-a', FUNDER, [WALLET, OTHER_A]),
      'sig-b': makeFundedTx('sig-b', FUNDER, [WALLET, OTHER_A]),
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- evidenceSummary structure ---
  it('includes coordination_events and sample_tokens in evidenceSummary when flagged', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps = [
      ...makeCoordinationGroup(100, 'TOKEN_A', 'sig-a'),
      ...makeCoordinationGroup(200, 'TOKEN_B', 'sig-b'),
    ];
    const txMap = {
      'sig-a': makeFundedTx('sig-a', FUNDER, [WALLET, OTHER_A, OTHER_B]),
      'sig-b': makeFundedTx('sig-b', FUNDER, [WALLET, OTHER_A, OTHER_B]),
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(result.evidenceSummary).toMatchObject({
      coordination_events: 2,
    });
    expect(Array.isArray((result.evidenceSummary as any).sample_tokens)).toBe(true);
  });

  // --- evidenceDetail structure ---
  it('includes events array in evidenceDetail when flagged', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps = [
      ...makeCoordinationGroup(100, 'TOKEN_A', 'sig-a'),
      ...makeCoordinationGroup(200, 'TOKEN_B', 'sig-b'),
    ];
    const txMap = {
      'sig-a': makeFundedTx('sig-a', FUNDER, [WALLET, OTHER_A, OTHER_B]),
      'sig-b': makeFundedTx('sig-b', FUNDER, [WALLET, OTHER_A, OTHER_B]),
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txMap);

    const result = await detectBundler(config, { db: db as any, fetcher: fetcher as any });

    expect(Array.isArray((result.evidenceDetail as any).events)).toBe(true);
    expect((result.evidenceDetail as any).events.length).toBe(2);
  });
});
