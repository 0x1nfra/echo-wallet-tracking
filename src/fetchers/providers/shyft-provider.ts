import axios, { AxiosInstance } from 'axios';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import type { RpcProvider, ProviderTransaction } from './types.js';
import type { HeliusTokenTransfer, HeliusNativeTransfer } from '../../types/index.js';

const SHYFT_BASE = 'https://api.shyft.to';
const MAX_PAGES = 3;
// Shyft free tier: conservative concurrency
const shyftQueue = new PQueue({ concurrency: 2 });

// Internal raw types (never exported — Shyft types stay inside ShyftProvider)
interface ShyftAction {
  type: string;
  info: Record<string, unknown>;
}

interface ShyftRawTx {
  signatures: string[];
  slot: number;
  timestamp: number;
  fee: number;
  fee_payer: string;
  status: string;
  type?: string;
  actions: ShyftAction[];
}

export class ShyftProvider implements RpcProvider {
  private client: AxiosInstance;
  private apiKey: string;

  /**
   * @param apiKey  Shyft API key (x-api-key header)
   * @param axiosInstance  Optional injected axios instance (for testing)
   */
  constructor(apiKey: string, axiosInstance?: AxiosInstance) {
    this.apiKey = apiKey;
    this.client = axiosInstance ?? axios.create({ baseURL: SHYFT_BASE, timeout: 30_000 });
  }

  private async fetchPage(account: string, params: Record<string, unknown>): Promise<ShyftRawTx[]> {
    return pRetry(
      () => shyftQueue.add(async () => {
        const res = await this.client.get('/sol/v1/transaction/history', {
          params: { account, network: 'mainnet-beta', enable_raw: false, ...params },
          headers: { 'x-api-key': this.apiKey },
        });
        return (res?.data?.result ?? []) as ShyftRawTx[];
      }),
      {
        retries: 3,
        onFailedAttempt: async (error) => {
          const status = (error as { response?: { status?: number } }).response?.status;
          if (status === 401) throw error; // never retry auth failures
          if (status === 429) {
            const delayMs = Math.pow(2, error.attemptNumber) * 1000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        },
      }
    ) as Promise<ShyftRawTx[]>;
  }

  async fetchSwapHistory(address: string, afterTimestamp: number): Promise<ProviderTransaction[]> {
    const allTxs: ShyftRawTx[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params: Record<string, unknown> = { tx_num: 100 };
      if (cursor) params.before_tx_signature = cursor;

      const txs = await this.fetchPage(address, params);
      if (!txs || txs.length === 0) break;

      allTxs.push(...txs);

      const oldest = txs[txs.length - 1];
      // Stop early if this is the last page or we've gone past the afterTimestamp
      if (txs.length < 100 || (afterTimestamp > 0 && oldest.timestamp <= afterTimestamp)) break;
      cursor = oldest.signatures[0];
    }

    // In-memory timestamp filter (Shyft has no gte-time query param)
    const filtered = afterTimestamp > 0
      ? allTxs.filter(tx => tx.timestamp > afterTimestamp)
      : allTxs;

    return filtered.map(tx => this.normalize(tx));
  }

  async fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<ProviderTransaction[]> {
    const txs = await this.fetchPage(mint, { tx_num: Math.min(limit, 100), sort_order: sortOrder });
    return (txs ?? []).map(tx => this.normalize(tx));
  }

  async fetchOnePage(address: string, limit: number): Promise<ProviderTransaction[]> {
    const txs = await this.fetchPage(address, { tx_num: Math.min(limit, 100) });
    return (txs ?? []).map(tx => this.normalize(tx));
  }

  private normalize(raw: ShyftRawTx): ProviderTransaction {
    return {
      signature: raw.signatures?.[0] ?? '',
      slot: raw.slot ?? 0,
      timestamp: raw.timestamp,
      fee: raw.fee ?? 0,
      feePayer: raw.fee_payer ?? '',
      success: raw.status === 'Success',
      type: (raw.actions ?? []).some(a => a.type === 'SWAP' || a.type === 'TOKEN_SWAP')
        ? 'SWAP'
        : (raw.type ?? 'UNKNOWN'),
      source: 'SHYFT_NORMALIZED',
      tokenTransfers: this.extractTokenTransfers(raw.actions ?? []),
      nativeTransfers: this.extractNativeTransfers(raw.actions ?? []),
      events: undefined, // Force tokenTransfers fallback path in parseSwaps
    };
  }

  private extractTokenTransfers(actions: ShyftAction[]): HeliusTokenTransfer[] {
    const transfers: HeliusTokenTransfer[] = [];
    for (const action of actions) {
      if (action.type === 'SPL_TRANSFER' || action.type === 'TOKEN_TRANSFER') {
        const info = action.info;
        if (info.sender && info.receiver && info.token_address) {
          transfers.push({
            fromUserAccount: String(info.sender),
            toUserAccount: String(info.receiver),
            fromTokenAccount: String(info.sender_token_account ?? info.sender),
            toTokenAccount: String(info.receiver_token_account ?? info.receiver),
            tokenAmount: Number(info.amount ?? 0),
            mint: String(info.token_address),
          });
        }
      }
    }
    return transfers;
  }

  private extractNativeTransfers(actions: ShyftAction[]): HeliusNativeTransfer[] {
    const transfers: HeliusNativeTransfer[] = [];
    for (const action of actions) {
      if (action.type === 'SOL_TRANSFER') {
        const info = action.info;
        if (info.sender && info.receiver) {
          transfers.push({
            fromUserAccount: String(info.sender),
            toUserAccount: String(info.receiver),
            amount: Number(info.amount ?? 0),
          });
        }
      }
    }
    return transfers;
  }
}
