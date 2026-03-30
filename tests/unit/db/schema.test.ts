import { createTestDb } from './setup.js';
import {
  wallets,
  swaps,
  wallet_metrics,
  token_signals,
  removal_log,
} from '../../../src/db/schema.js';

describe('DB Schema - table insert and select', () => {
  let testDb: ReturnType<typeof createTestDb>;

  beforeAll(() => {
    testDb = createTestDb();
  });

  afterAll(() => {
    testDb.sqlite.close();
  });

  it('wallets: inserts and retrieves a row', async () => {
    const { db } = testDb;
    await db.insert(wallets).values({
      address: 'test_wallet_address_1',
      label: 'Test Wallet',
    });

    const rows = await db.select().from(wallets).all();
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.address === 'test_wallet_address_1');
    expect(row).toBeDefined();
    expect(row?.label).toBe('Test Wallet');
    expect(row?.status).toBe('tracked');
    expect(row?.history_complete).toBe(false);
  });

  it('swaps: inserts and retrieves a row', async () => {
    const { db } = testDb;
    await db.insert(swaps).values({
      wallet_address: 'test_wallet_address_1',
      tx_signature: 'unique_tx_sig_123',
      dex: 'raydium',
      token_mint: 'TokenMintAddress123',
      side: 'buy',
      token_amount: 1000.5,
      sol_amount: 0.5,
      timestamp: Date.now(),
      slot: 123456789,
    });

    const rows = await db.select().from(swaps).all();
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.tx_signature === 'unique_tx_sig_123');
    expect(row).toBeDefined();
    expect(row?.dex).toBe('raydium');
    expect(row?.side).toBe('buy');
    expect(row?.token_amount).toBe(1000.5);
  });

  it('wallet_metrics: inserts and retrieves a row', async () => {
    const { db } = testDb;
    await db.insert(wallet_metrics).values({
      wallet_address: 'test_wallet_address_1',
      win_rate: 0.65,
      realized_pnl_sol: 12.5,
      sharpe_ratio: 1.8,
      calculated_at: Date.now(),
    });

    const rows = await db.select().from(wallet_metrics).all();
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.wallet_address === 'test_wallet_address_1');
    expect(row).toBeDefined();
    expect(row?.win_rate).toBe(0.65);
    expect(row?.realized_pnl_sol).toBe(12.5);
  });

  it('token_signals: inserts and retrieves a row', async () => {
    const { db } = testDb;
    await db.insert(token_signals).values({
      token_mint: 'SomeTokenMintAddress456',
      signal_score: 0.87,
      smart_wallet_count: 5,
      buy_velocity_1h: 0.15,
    });

    const rows = await db.select().from(token_signals).all();
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.token_mint === 'SomeTokenMintAddress456');
    expect(row).toBeDefined();
    expect(row?.signal_score).toBe(0.87);
    expect(row?.smart_wallet_count).toBe(5);
  });

  it('removal_log: inserts and retrieves a row', async () => {
    const { db } = testDb;
    await db.insert(removal_log).values({
      wallet_address: 'test_wallet_address_1',
      reason: 'bundler_detected',
      detection_details: 'Found bundler pattern in transactions',
    });

    const rows = await db.select().from(removal_log).all();
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.reason === 'bundler_detected');
    expect(row).toBeDefined();
    expect(row?.wallet_address).toBe('test_wallet_address_1');
    expect(row?.removed_by).toBe('auto');
    expect(row?.detection_details).toBe('Found bundler pattern in transactions');
  });
});
