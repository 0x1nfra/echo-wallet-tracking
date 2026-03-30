/**
 * Dev Wallet Detector (DETC-02)
 *
 * Flags wallets that received a direct token transfer from the token deployer
 * in the creation transaction or within DEPLOYER_TRANSFER_LOOKFORWARD_TXS
 * transactions after creation.
 *
 * Bias: AGGRESSIVE — a direct deployer transfer is very high confidence.
 * First signal is always sufficient; threshold multiplier does NOT apply.
 *
 * Limitation note: Helius `GET /v0/addresses/{mint}/transactions` accepts
 * wallet addresses but may return empty for mint addresses. This implementation
 * tries fetching via the mint address using fetchTransactions; if the fetcher
 * returns an empty array, the wallet's own swap tx is used as a fallback
 * (the deployer transfer is sometimes in the same tx as the wallet's swap).
 */

import { DEV_WALLET } from './thresholds.js';
import type { DetectorConfig, DetectorResult } from './types.js';

// -----------------------------------------------------------------------
// Injectable dependency types (for testing / production)
// -----------------------------------------------------------------------

export interface DevWalletDb {
  query: {
    swaps: {
      findMany: (opts: { where?: unknown; columns?: unknown }) => Promise<
        Array<{
          wallet_address: string;
          tx_signature: string;
          token_mint: string;
          side: string;
        }>
      >;
    };
  };
}

export interface DevWalletFetcher {
  fetchTransactions: (
    address: string,
    limit?: number
  ) => Promise<
    Array<{
      signature: string;
      feePayer: string;
      tokenTransfers?: Array<{
        mint: string;
        fromUserAccount: string;
        toUserAccount: string;
        tokenAmount: number;
      }>;
    }>
  >;
  getTransaction?: (signature: string) => Promise<{
    signature: string;
    feePayer: string;
    tokenTransfers?: Array<{
      mint: string;
      fromUserAccount: string;
      toUserAccount: string;
      tokenAmount: number;
    }>;
  }>;
}

export interface DevWalletDeps {
  db: DevWalletDb;
  fetcher: DevWalletFetcher;
}

// -----------------------------------------------------------------------
// detectDevWallet
// -----------------------------------------------------------------------

export async function detectDevWallet(
  config: DetectorConfig,
  deps?: Partial<DevWalletDeps>
): Promise<DetectorResult> {
  // Resolve deps — production uses singletons, tests inject mocks
  const db = deps?.db ?? (await getDefaultDb());
  const fetcher = deps?.fetcher ?? (await getDefaultFetcher());

  const { walletAddress } = config;
  // Note: thresholdMultiplier does NOT affect dev wallet — one deployer transfer
  // is always sufficient (locked decision: aggressive bias, first signal = confirmed)

  // ------------------------------------------------------------------
  // Step 1: Get all distinct token_mints from buy swaps for this wallet
  // ------------------------------------------------------------------
  const allSwaps = await db.query.swaps.findMany({ where: undefined, columns: undefined });
  const buySwaps = allSwaps.filter(
    (s) => s.side === 'buy' && s.wallet_address === walletAddress
  );

  const tokenMints = [...new Set(buySwaps.map((s) => s.token_mint))];

  if (tokenMints.length === 0) {
    return notFlagged();
  }

  // ------------------------------------------------------------------
  // Step 2: For each token_mint, fetch early transactions and look for
  //         a deployer → walletAddress token transfer
  // ------------------------------------------------------------------
  for (const tokenMint of tokenMints) {
    // Try to fetch the earliest transactions for this mint address
    // These are typically oldest-first when fetched with a small limit
    let txs = await fetcher.fetchTransactions(tokenMint, 20);

    // Fallback: if mint-address fetch returns empty, check the wallet's own swap tx
    // (deployer transfer is sometimes included in the same transaction as the swap)
    if (txs.length === 0) {
      const walletSwapsForToken = buySwaps.filter((s) => s.token_mint === tokenMint);
      const fallbackTxSigs = walletSwapsForToken.map((s) => s.tx_signature);

      if (fetcher.getTransaction && fallbackTxSigs.length > 0) {
        for (const sig of fallbackTxSigs.slice(0, 3)) {
          try {
            const tx = await fetcher.getTransaction(sig);
            txs = [tx];
            break;
          } catch {
            // skip
          }
        }
      }
    }

    if (txs.length === 0) continue;

    // The first tx (creation tx) — feePayer is the presumed deployer
    const creationTx = txs[0];
    const deployer = creationTx.feePayer;

    // Check creation tx and up to DEPLOYER_TRANSFER_LOOKFORWARD_TXS subsequent txs
    const windowTxs = txs.slice(0, 1 + DEV_WALLET.DEPLOYER_TRANSFER_LOOKFORWARD_TXS);

    for (const tx of windowTxs) {
      const transfers = tx.tokenTransfers ?? [];
      for (const transfer of transfers) {
        if (
          transfer.mint === tokenMint &&
          transfer.toUserAccount === walletAddress &&
          transfer.fromUserAccount === deployer
        ) {
          // Found a confirmed deployer → wallet transfer — return immediately
          return {
            detector: 'dev_wallet',
            flagged: true,
            confidence: DEV_WALLET.CONFIDENCE_ON_FIRST_SIGNAL,
            evidenceSummary: {
              token_mint: tokenMint,
              deployer_address: deployer,
              transfer_tx_signature: tx.signature,
            },
            evidenceDetail: {
              tokenTransfer: transfer,
              creation_tx_signature: creationTx.signature,
            },
          };
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3: No deployer transfer found across all tokens → not flagged
  // ------------------------------------------------------------------
  return notFlagged();
}

function notFlagged(): DetectorResult {
  return {
    detector: 'dev_wallet',
    flagged: false,
    confidence: null,
    evidenceSummary: {},
    evidenceDetail: {},
  };
}

// -----------------------------------------------------------------------
// Production singletons (lazy-loaded to avoid import side effects in tests)
// -----------------------------------------------------------------------

async function getDefaultDb(): Promise<DevWalletDb> {
  const { db } = await import('../db/index.js');
  return db as unknown as DevWalletDb;
}

async function getDefaultFetcher(): Promise<DevWalletFetcher> {
  const { createProviderRouter } = await import('../fetchers/providers/index.js');
  const f = createProviderRouter();

  // Adapt HeliusFetcher to DevWalletFetcher interface
  return {
    fetchTransactions: async (address: string, limit = 20) => {
      // Fetch a single page of transactions for the mint address.
      // We only need the earliest txs (creation tx + a few after) to find
      // the deployer — no need to paginate through all history.
      try {
        const txs = await f.fetchOnePage(address, Math.min(limit, 100));
        return txs as any[];
      } catch {
        return [];
      }
    },
    // getTransaction not available on ProviderRouter (locked decision: only bundler/wash-trader use it)
  };
}
