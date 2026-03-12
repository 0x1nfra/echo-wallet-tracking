/**
 * Wash Trader Detector (DETC-04) — stub for RED phase
 */

import type { DetectorConfig, DetectorResult } from './types.js';

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

export async function detectWashTrader(
  _config: DetectorConfig,
  _deps?: Partial<WashTraderDeps>
): Promise<DetectorResult> {
  throw new Error('Not implemented');
}
