/**
 * ShyftProvider unit tests (11-03)
 *
 * Tests normalization, API call shape, pagination, and filtering.
 * Mock strategy: constructor-injected axios instance (avoids ESM jest.mock issues).
 * Follows injectable mock pattern from Phases 3, 6, and 8.
 */

import { ShyftProvider } from '../shyft-provider.js';

// ------- helpers -------

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

function makePage(count: number, baseTimestamp = 1_700_000_000): ShyftRawTx[] {
  return Array.from({ length: count }, (_, i) => ({
    signatures: [`sig-${i}`],
    slot: 1000 + i,
    timestamp: baseTimestamp - i * 60,
    fee: 5000,
    fee_payer: 'wallet1',
    status: 'Success',
    type: 'UNKNOWN',
    actions: [],
  }));
}

function makeSwapTx(sig: string, timestamp = 1_700_000_000): ShyftRawTx {
  return {
    signatures: [sig],
    slot: 9999,
    timestamp,
    fee: 5000,
    fee_payer: 'wallet1',
    status: 'Success',
    type: 'SWAP',
    actions: [{ type: 'SWAP', info: {} }],
  };
}

/**
 * Creates a ShyftRawTx with a single native-transfer action of the specified type.
 * Used by Wave 1 to test extractNativeTransfers across observed D-03 variants.
 */
function makeNativeTransferTx(
  sig: string,
  actionType: string,
  sender: string,
  receiver: string,
  amount: number,
  timestamp = 1_700_000_000
): ShyftRawTx {
  return {
    signatures: [sig],
    slot: 9999,
    timestamp,
    fee: 5000,
    fee_payer: sender,
    status: 'Success',
    type: 'TRANSFER',
    actions: [
      {
        type: actionType,
        info: {
          sender,
          receiver,
          amount,
        },
      },
    ],
  };
}

/**
 * Creates a minimal fake AxiosInstance for testing.
 * `responses` is a queue — each call pops the next response.
 */
function makeAxiosInstance(responses: unknown[]) {
  let callCount = 0;
  const capturedCalls: Array<{ url: string; params: Record<string, unknown>; headers: Record<string, unknown> }> = [];

  const get = async (url: string, config: { params?: Record<string, unknown>; headers?: Record<string, unknown> } = {}) => {
    capturedCalls.push({ url, params: config.params ?? {}, headers: config.headers ?? {} });
    const response = responses[callCount] ?? { data: { result: [] } };
    callCount++;
    return response;
  };

  const instance = {
    get,
    capturedCalls,
    getCallCount: () => callCount,
    // Axios.create() returns an AxiosInstance — we fake just enough of it
    create: () => ({ get }),
  } as unknown as import('axios').AxiosInstance & { capturedCalls: typeof capturedCalls; getCallCount: () => number };
  return instance;
}

// ------- tests -------

describe('ShyftProvider', () => {
  describe('fetchSwapHistory', () => {
    it('calls Shyft API with x-api-key header and returns normalized result', async () => {
      const rawTxs = [makeSwapTx('sig-a', 1_700_001_000), makeSwapTx('sig-b', 1_700_000_500)];
      const mockAxios = makeAxiosInstance([{ data: { result: rawTxs } }]);

      const provider = new ShyftProvider('test-api-key', mockAxios);
      const result = await provider.fetchSwapHistory('wallet-addr', 0);

      expect(result).toHaveLength(2);
      expect(result[0].signature).toBe('sig-a');
      expect(result[0].source).toBe('SHYFT_NORMALIZED');
      expect(result[0].type).toBe('SWAP');
      expect(result[0].events).toBeUndefined();

      // Verify x-api-key in headers (not query param)
      const call = mockAxios.capturedCalls[0];
      expect(call.headers['x-api-key']).toBe('test-api-key');
      expect(call.params['account']).toBe('wallet-addr');
    });

    it('filters out transactions older than afterTimestamp', async () => {
      const after = 1_700_000_000;
      const rawTxs = [
        makeSwapTx('sig-new', after + 500),   // should keep
        makeSwapTx('sig-old', after - 100),   // should filter out (timestamp <= after)
        makeSwapTx('sig-exact', after),       // should filter out (timestamp === after, not strictly greater)
      ];
      const mockAxios = makeAxiosInstance([{ data: { result: rawTxs } }]);

      const provider = new ShyftProvider('key', mockAxios);
      const result = await provider.fetchSwapHistory('wallet-addr', after);

      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe('sig-new');
    });

    it('caps pagination at 3 pages even if pages are full', async () => {
      const fullPage = makePage(100, 1_700_100_000);
      const responses = [
        { data: { result: fullPage } },
        { data: { result: fullPage } },
        { data: { result: fullPage } },
      ];
      const mockAxios = makeAxiosInstance(responses);

      const provider = new ShyftProvider('key', mockAxios);
      await provider.fetchSwapHistory('wallet-addr', 0);

      expect(mockAxios.getCallCount()).toBe(3);
    });

    it('stops pagination early when page has fewer than 100 results', async () => {
      const partialPage = makePage(5, 1_700_000_000);
      const mockAxios = makeAxiosInstance([{ data: { result: partialPage } }]);

      const provider = new ShyftProvider('key', mockAxios);
      await provider.fetchSwapHistory('wallet-addr', 0);

      expect(mockAxios.getCallCount()).toBe(1);
    });
  });

  describe('normalizeShyftTx', () => {
    it('maps all fields correctly from a raw Shyft transaction', async () => {
      const raw: ShyftRawTx = {
        signatures: ['sig-normalize'],
        slot: 42,
        timestamp: 1_700_000_123,
        fee: 5000,
        fee_payer: 'payer-wallet',
        status: 'Success',
        type: 'SWAP',
        actions: [{ type: 'SWAP', info: {} }],
      };
      const mockAxios = makeAxiosInstance([{ data: { result: [raw] } }]);

      const provider = new ShyftProvider('key', mockAxios);
      const [tx] = await provider.fetchOnePage('addr', 1);

      expect(tx.signature).toBe('sig-normalize');
      expect(tx.slot).toBe(42);
      expect(tx.timestamp).toBe(1_700_000_123);
      expect(tx.fee).toBe(5000);
      expect(tx.feePayer).toBe('payer-wallet');
      expect(tx.success).toBe(true);
      expect(tx.type).toBe('SWAP');
      expect(tx.source).toBe('SHYFT_NORMALIZED');
      expect(tx.events).toBeUndefined();
    });

    it('maps status=Fail to success=false', async () => {
      const raw: ShyftRawTx = {
        signatures: ['sig-fail'],
        slot: 1,
        timestamp: 1_700_000_000,
        fee: 5000,
        fee_payer: 'payer',
        status: 'Fail',
        actions: [],
      };
      const mockAxios = makeAxiosInstance([{ data: { result: [raw] } }]);

      const provider = new ShyftProvider('key', mockAxios);
      const [tx] = await provider.fetchOnePage('addr', 1);

      expect(tx.success).toBe(false);
    });

    it('extracts token transfers from SPL_TRANSFER actions', async () => {
      const raw: ShyftRawTx = {
        signatures: ['sig-transfer'],
        slot: 1,
        timestamp: 1_700_000_000,
        fee: 5000,
        fee_payer: 'payer',
        status: 'Success',
        type: 'TRANSFER',
        actions: [
          {
            type: 'SPL_TRANSFER',
            info: {
              sender: 'sender-wallet',
              receiver: 'receiver-wallet',
              amount: 1000,
              token_address: 'TOKEN_MINT',
              sender_token_account: 'sender-ta',
              receiver_token_account: 'receiver-ta',
            },
          },
        ],
      };
      const mockAxios = makeAxiosInstance([{ data: { result: [raw] } }]);

      const provider = new ShyftProvider('key', mockAxios);
      const [tx] = await provider.fetchOnePage('addr', 1);

      expect(tx.tokenTransfers).toHaveLength(1);
      expect(tx.tokenTransfers![0].fromUserAccount).toBe('sender-wallet');
      expect(tx.tokenTransfers![0].toUserAccount).toBe('receiver-wallet');
      expect(tx.tokenTransfers![0].mint).toBe('TOKEN_MINT');
      expect(tx.tokenTransfers![0].tokenAmount).toBe(1000);
    });

    it('extracts native transfers from SOL_TRANSFER actions', async () => {
      const raw: ShyftRawTx = {
        signatures: ['sig-sol'],
        slot: 1,
        timestamp: 1_700_000_000,
        fee: 5000,
        fee_payer: 'payer',
        status: 'Success',
        type: 'TRANSFER',
        actions: [
          {
            type: 'SOL_TRANSFER',
            info: {
              sender: 'from-wallet',
              receiver: 'to-wallet',
              amount: 500000000,
            },
          },
        ],
      };
      const mockAxios = makeAxiosInstance([{ data: { result: [raw] } }]);

      const provider = new ShyftProvider('key', mockAxios);
      const [tx] = await provider.fetchOnePage('addr', 1);

      expect(tx.nativeTransfers).toHaveLength(1);
      expect(tx.nativeTransfers![0].fromUserAccount).toBe('from-wallet');
      expect(tx.nativeTransfers![0].toUserAccount).toBe('to-wallet');
      expect(tx.nativeTransfers![0].amount).toBe(500000000);
    });
  });

  describe('fetchEarlySwapsForMint', () => {
    it('passes sort_order param to Shyft API', async () => {
      const mockAxios = makeAxiosInstance([{ data: { result: [] } }]);
      const provider = new ShyftProvider('key', mockAxios);

      await provider.fetchEarlySwapsForMint('MINT123', 50, 'asc');

      const call = mockAxios.capturedCalls[0];
      expect(call.params['sort_order']).toBe('asc');
      expect(call.params['account']).toBe('MINT123');
    });

    it('caps tx_num at 100 even if limit > 100', async () => {
      const mockAxios = makeAxiosInstance([{ data: { result: [] } }]);
      const provider = new ShyftProvider('key', mockAxios);

      await provider.fetchEarlySwapsForMint('MINT123', 200, 'desc');

      const call = mockAxios.capturedCalls[0];
      expect(call.params['tx_num']).toBeLessThanOrEqual(100);
    });
  });

  describe('fetchOnePage', () => {
    it('passes tx_num = limit to Shyft API', async () => {
      const mockAxios = makeAxiosInstance([{ data: { result: [] } }]);
      const provider = new ShyftProvider('key', mockAxios);

      await provider.fetchOnePage('wallet-addr', 25);

      const call = mockAxios.capturedCalls[0];
      expect(call.params['tx_num']).toBe(25);
    });

    it('caps tx_num at 100 when limit > 100', async () => {
      const mockAxios = makeAxiosInstance([{ data: { result: [] } }]);
      const provider = new ShyftProvider('key', mockAxios);

      await provider.fetchOnePage('wallet-addr', 150);

      const call = mockAxios.capturedCalls[0];
      expect(call.params['tx_num']).toBe(100);
    });

    it('returns normalized transactions with events=undefined', async () => {
      const rawTxs = [makeSwapTx('sig-page', 1_700_000_000)];
      const mockAxios = makeAxiosInstance([{ data: { result: rawTxs } }]);

      const provider = new ShyftProvider('key', mockAxios);
      const result = await provider.fetchOnePage('wallet-addr', 10);

      expect(result).toHaveLength(1);
      expect(result[0].events).toBeUndefined();
      expect(result[0].source).toBe('SHYFT_NORMALIZED');
    });
  });

  it('makeNativeTransferTx helper builds correct raw tx shape (wave-0 scaffolding)', () => {
    const raw = makeNativeTransferTx('sig-native-1', 'SOL_TRANSFER', 'fromWallet', 'toWallet', 1_000_000);
    expect(raw.signatures).toEqual(['sig-native-1']);
    expect(raw.actions).toHaveLength(1);
    expect(raw.actions[0].type).toBe('SOL_TRANSFER');
    expect(raw.actions[0].info).toMatchObject({
      sender: 'fromWallet',
      receiver: 'toWallet',
      amount: 1_000_000,
    });
    expect(raw.status).toBe('Success');
  });
});
