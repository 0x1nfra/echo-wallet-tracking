/**
 * Dev Wallet Detector Tests (DETC-02)
 *
 * Mock strategy: pass { db, fetcher } as optional deps to detectDevWallet.
 * Uses plain async functions (no jest.fn()) for ESM compatibility.
 *
 * Algorithm under test:
 * 1. Get distinct token_mints the wallet has bought
 * 2. For each token_mint, fetch early transactions to find creation tx
 * 3. Check if toUserAccount === walletAddress in tokenTransfers of creation tx
 *    or up to DEPLOYER_TRANSFER_LOOKFORWARD_TXS subsequent txs
 * 4. First match → immediately return confirmed_suspicious (aggressive bias)
 * 5. No match across all tokens → flagged=false
 */

import { detectDevWallet } from '../dev-wallet.js';
import type { DetectorConfig } from '../types.js';
import { DEV_WALLET } from '../thresholds.js';

// -----------------------------------------------------------------------
// Mock types
// -----------------------------------------------------------------------

type MockTokenTransfer = {
  mint: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
};

type MockTx = {
  signature: string;
  feePayer: string;
  tokenTransfers?: MockTokenTransfer[];
};

type MockSwapRow = {
  wallet_address: string;
  tx_signature: string;
  token_mint: string;
  side: string;
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

/**
 * Build a mock fetcher. fetchTransactions(address, limit) returns txList for that address.
 * 'txsByAddress' maps mint address → array of transactions (oldest-first).
 */
function buildMockFetcher(txsByAddress: Record<string, MockTx[]>) {
  return {
    fetchTransactions: async (address: string, _limit?: number) => {
      return txsByAddress[address] ?? [];
    },
    getTransaction: async (sig: string) => {
      // Search all mock tx lists for the sig
      for (const txList of Object.values(txsByAddress)) {
        const found = txList.find((t) => t.signature === sig);
        if (found) return found;
      }
      throw new Error(`Mock: tx not found: ${sig}`);
    },
  };
}

// -----------------------------------------------------------------------
// Test wallets and addresses
// -----------------------------------------------------------------------

const WALLET = 'TargetWallet1111111111111111111111111111111';
const DEPLOYER = 'DeployerAddress11111111111111111111111111111';
const TOKEN_A = 'TokenMintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'TokenMintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const RANDOM_SENDER = 'RandomSender111111111111111111111111111111';

// Creation tx: deployer sends token to target wallet (direct allocation)
function makeCreationTxWithTransferToWallet(tokenMint: string): MockTx {
  return {
    signature: `creation-tx-${tokenMint}`,
    feePayer: DEPLOYER,
    tokenTransfers: [
      {
        mint: tokenMint,
        fromUserAccount: DEPLOYER,
        toUserAccount: WALLET,
        tokenAmount: 1_000_000_000,
      },
    ],
  };
}

// Creation tx: deployer sends token to some other wallets, not to WALLET
function makeCreationTxWithoutTransferToWallet(tokenMint: string): MockTx {
  return {
    signature: `creation-tx-${tokenMint}`,
    feePayer: DEPLOYER,
    tokenTransfers: [
      {
        mint: tokenMint,
        fromUserAccount: DEPLOYER,
        toUserAccount: 'SomeOtherWallet111111111111111111111111111',
        tokenAmount: 5_000_000_000,
      },
    ],
  };
}

// Follow-up tx after creation (within LOOKFORWARD_TXS window): deployer sends to WALLET
function makeFollowUpTxWithTransfer(txNum: number, tokenMint: string): MockTx {
  return {
    signature: `followup-tx-${txNum}-${tokenMint}`,
    feePayer: DEPLOYER,
    tokenTransfers: [
      {
        mint: tokenMint,
        fromUserAccount: DEPLOYER,
        toUserAccount: WALLET,
        tokenAmount: 500_000_000,
      },
    ],
  };
}

// DEX swap tx: WALLET buys token through a DEX (not from deployer)
function makeDexSwapTx(tokenMint: string): MockTx {
  return {
    signature: `dex-swap-${tokenMint}`,
    feePayer: WALLET,
    tokenTransfers: [
      {
        mint: tokenMint,
        fromUserAccount: RANDOM_SENDER, // liquidity pool, not deployer
        toUserAccount: WALLET,
        tokenAmount: 1_000_000,
      },
    ],
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('detectDevWallet (DETC-02)', () => {
  // --- Direct deployer transfer in creation tx → immediately confirmed_suspicious ---
  it('returns confirmed_suspicious when wallet received token from deployer in creation tx', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps: MockSwapRow[] = [
      { wallet_address: WALLET, tx_signature: 'swap-a', token_mint: TOKEN_A, side: 'buy' },
    ];

    // Creation tx for TOKEN_A includes deployer → WALLET transfer
    const txsByAddress: Record<string, MockTx[]> = {
      [TOKEN_A]: [makeCreationTxWithTransferToWallet(TOKEN_A)],
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txsByAddress);

    const result = await detectDevWallet(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
    expect(result.detector).toBe('dev_wallet');
  });

  // --- Deployer transfer in tx 2 after creation (within LOOKFORWARD_TXS=3) → confirmed_suspicious ---
  it('returns confirmed_suspicious when deployer transfer is in tx 2 after creation (within lookforward)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps: MockSwapRow[] = [
      { wallet_address: WALLET, tx_signature: 'swap-a', token_mint: TOKEN_A, side: 'buy' },
    ];

    // No transfer in creation tx, but tx at index 1 (2nd tx) has deployer → WALLET
    const txsByAddress: Record<string, MockTx[]> = {
      [TOKEN_A]: [
        makeCreationTxWithoutTransferToWallet(TOKEN_A), // no direct transfer
        makeFollowUpTxWithTransfer(1, TOKEN_A),          // tx 1: deployer → WALLET
      ],
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txsByAddress);

    const result = await detectDevWallet(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
  });

  // --- Wallet bought token on DEX (not from deployer) → flagged=false ---
  it('returns flagged=false when wallet bought token on DEX with no deployer transfer', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps: MockSwapRow[] = [
      { wallet_address: WALLET, tx_signature: 'dex-swap-a', token_mint: TOKEN_A, side: 'buy' },
    ];

    // Creation tx: no transfer to WALLET. Only DEX swaps after.
    const txsByAddress: Record<string, MockTx[]> = {
      [TOKEN_A]: [
        makeCreationTxWithoutTransferToWallet(TOKEN_A),
        makeDexSwapTx(TOKEN_A),
        makeDexSwapTx(TOKEN_A),
      ],
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txsByAddress);

    const result = await detectDevWallet(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- Wallet with no buys → flagged=false ---
  it('returns flagged=false when wallet has no buy swaps', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const db = buildMockDb([]);
    const fetcher = buildMockFetcher({});

    const result = await detectDevWallet(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- thresholdMultiplier does NOT affect dev wallet — one signal always sufficient ---
  it('returns confirmed_suspicious with thresholdMultiplier=4.0 (multiplier irrelevant for dev wallet)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 4.0 };

    const swaps: MockSwapRow[] = [
      { wallet_address: WALLET, tx_signature: 'swap-a', token_mint: TOKEN_A, side: 'buy' },
    ];

    const txsByAddress: Record<string, MockTx[]> = {
      [TOKEN_A]: [makeCreationTxWithTransferToWallet(TOKEN_A)],
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txsByAddress);

    const result = await detectDevWallet(config, { db: db as any, fetcher: fetcher as any });

    // Even with multiplier=4.0, one deployer transfer is always sufficient
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
  });

  // --- Returns immediately on first match (doesn't check all tokens) ---
  it('stops checking after first confirmed deployer transfer (first signal)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    let token_b_fetched = false;

    const swaps: MockSwapRow[] = [
      { wallet_address: WALLET, tx_signature: 'swap-a', token_mint: TOKEN_A, side: 'buy' },
      { wallet_address: WALLET, tx_signature: 'swap-b', token_mint: TOKEN_B, side: 'buy' },
    ];

    // TOKEN_A triggers immediately; TOKEN_B should NOT be fetched
    const db = buildMockDb(swaps);
    const fetcher = {
      fetchTransactions: async (address: string, _limit?: number) => {
        if (address === TOKEN_B) {
          token_b_fetched = true;
        }
        if (address === TOKEN_A) {
          return [makeCreationTxWithTransferToWallet(TOKEN_A)];
        }
        return [];
      },
      getTransaction: async (sig: string) => {
        throw new Error(`Not expected: ${sig}`);
      },
    };

    const result = await detectDevWallet(config, { db: db as any, fetcher: fetcher as any });

    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
    expect(token_b_fetched).toBe(false);
  });

  // --- evidenceSummary includes token_mint and deployer_address ---
  it('includes token_mint and deployer_address in evidenceSummary when flagged', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const swaps: MockSwapRow[] = [
      { wallet_address: WALLET, tx_signature: 'swap-a', token_mint: TOKEN_A, side: 'buy' },
    ];

    const txsByAddress: Record<string, MockTx[]> = {
      [TOKEN_A]: [makeCreationTxWithTransferToWallet(TOKEN_A)],
    };

    const db = buildMockDb(swaps);
    const fetcher = buildMockFetcher(txsByAddress);

    const result = await detectDevWallet(config, { db: db as any, fetcher: fetcher as any });

    expect(result.evidenceSummary).toMatchObject({
      token_mint: TOKEN_A,
      deployer_address: DEPLOYER,
    });
    expect(typeof (result.evidenceSummary as any).transfer_tx_signature).toBe('string');
  });
});
