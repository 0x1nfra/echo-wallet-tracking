/**
 * Sniper Detector Tests (DETC-03)
 *
 * Mock strategy: pass { db, fetcher } as optional deps to detectSniper.
 * The sniper detector makes zero Helius API calls — it only queries the swaps table.
 * We mock the db via a custom SniperDb interface.
 *
 * Algorithm under test:
 *   - For each token_mint the wallet bought, compute launch_slot = MIN(slot) across all wallets
 *   - Skip tokens with fewer than MIN_OTHER_WALLETS_FOR_BASELINE other wallets
 *   - Count first-block entries where offset <= FIRST_BLOCK_WINDOW_SLOTS
 *   - Apply thresholds (with multiplier) to determine confidence
 */

import { detectSniper } from '../sniper.js';
import type { DetectorConfig } from '../types.js';
import { SNIPER } from '../thresholds.js';

// -----------------------------------------------------------------------
// Types for raw query rows (what the SQL query returns)
// -----------------------------------------------------------------------

type SniperQueryRow = {
  token_mint: string;
  launch_slot: number;
  wallet_entry_slot: number | null;
  other_wallet_count: number;
};

// -----------------------------------------------------------------------
// Mock db builder
// The sniper detector uses a raw SQL query that returns SniperQueryRow[].
// We inject a db with an `all` method that returns mock rows.
// -----------------------------------------------------------------------

function buildMockDb(rows: SniperQueryRow[]) {
  return {
    all: async (_sql: unknown, _params: unknown) => rows,
  };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const WALLET = 'SniperWallet11111111111111111111111111111111';

/**
 * Build a query result row representing one token mint.
 * wallet_entry_slot defaults to launch_slot (i.e., the wallet bought at launch).
 */
function makeRow(opts: {
  token_mint: string;
  launch_slot: number;
  wallet_entry_slot?: number | null;
  other_wallet_count?: number;
}): SniperQueryRow {
  return {
    token_mint: opts.token_mint,
    launch_slot: opts.launch_slot,
    wallet_entry_slot: opts.wallet_entry_slot ?? opts.launch_slot,
    other_wallet_count: opts.other_wallet_count ?? SNIPER.MIN_OTHER_WALLETS_FOR_BASELINE,
  };
}

/**
 * Build N rows where the wallet bought at launch_slot (first-block entry each time).
 */
function makeFirstBlockRows(count: number, startMint = 0): SniperQueryRow[] {
  return Array.from({ length: count }, (_, i) => makeRow({
    token_mint: `TOKEN_${startMint + i}`,
    launch_slot: 1000 + i * 100,
    wallet_entry_slot: 1000 + i * 100, // offset = 0 → first block
    other_wallet_count: SNIPER.MIN_OTHER_WALLETS_FOR_BASELINE + 2,
  }));
}

/**
 * Build N rows where the wallet bought LATE (well after launch, not first block).
 */
function makeLateRows(count: number, startMint = 100): SniperQueryRow[] {
  return Array.from({ length: count }, (_, i) => makeRow({
    token_mint: `TOKEN_LATE_${startMint + i}`,
    launch_slot: 1000 + i * 100,
    wallet_entry_slot: 1000 + i * 100 + 50, // offset = 50 → far from first block
    other_wallet_count: SNIPER.MIN_OTHER_WALLETS_FOR_BASELINE + 2,
  }));
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('detectSniper (DETC-03)', () => {
  // --- 0 eligible tokens → flagged=false ---
  it('returns flagged=false when wallet has no eligible tokens', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };
    const db = buildMockDb([]);

    const result = await detectSniper(config, { db: db as any });

    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
    expect(result.detector).toBe('sniper');
  });

  // --- 5 first-block entries across 8 tokens → suspected ---
  it('returns suspected when wallet has 5 first-block entries across 8 eligible tokens', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const rows = [
      ...makeFirstBlockRows(5),         // 5 first-block entries
      ...makeLateRows(3, 200),           // 3 late entries — not first-block
    ];
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // 5 >= MIN_LAUNCHES_SUSPECTED(5), 8 >= MIN_TOKENS_FOR_SUSPECTED(8)
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('suspected');
  });

  // --- 4 first-block entries across 8 tokens (below MIN_LAUNCHES_SUSPECTED=5) → flagged=false ---
  it('returns flagged=false when wallet has 4 first-block entries (below threshold)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const rows = [
      ...makeFirstBlockRows(4),
      ...makeLateRows(4, 200),
    ];
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // 4 < MIN_LAUNCHES_SUSPECTED(5) → flagged=false
    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- 8 first-block entries across 10 tokens → review ---
  it('returns review when wallet has 8 first-block entries across 10 eligible tokens', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const rows = [
      ...makeFirstBlockRows(8),
      ...makeLateRows(2, 200),
    ];
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // 8 >= MIN_LAUNCHES_REVIEW(8), 10 >= MIN_TOKENS_FOR_REVIEW(10)
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('review');
  });

  // --- 12 first-block entries across 15 tokens → confirmed_suspicious (by count) ---
  it('returns confirmed_suspicious when wallet has 12 first-block entries (by count threshold)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const rows = [
      ...makeFirstBlockRows(12),
      ...makeLateRows(3, 200),
    ];
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // 12 >= MIN_LAUNCHES_CONFIRMED(12) → confirmed_suspicious
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
  });

  // --- 13 first-block entries across 15 tokens (87% rate, above 80%) → confirmed_suspicious (by rate) ---
  it('returns confirmed_suspicious when wallet has 13/15 first-block entries (rate >= 80%)', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const rows = [
      ...makeFirstBlockRows(13),
      ...makeLateRows(2, 200),
    ];
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // rate = 13/15 = 86.7% >= MIN_RATE_CONFIRMED(80%), 15 >= MIN_TOKENS_FOR_RATE_CONFIRMED(15)
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
  });

  // --- wallet with 5 first-block entries but all tokens have <3 other wallets → flagged=false (no baseline) ---
  it('returns flagged=false when all tokens have fewer than MIN_OTHER_WALLETS_FOR_BASELINE', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    // All rows have other_wallet_count < MIN_OTHER_WALLETS_FOR_BASELINE (3)
    const rows = Array.from({ length: 8 }, (_, i) => makeRow({
      token_mint: `TOKEN_${i}`,
      launch_slot: 1000 + i * 100,
      wallet_entry_slot: 1000 + i * 100, // first-block
      other_wallet_count: SNIPER.MIN_OTHER_WALLETS_FOR_BASELINE - 1, // insufficient baseline
    }));
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // All tokens skipped due to insufficient baseline → 0 eligible → flagged=false
    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- 5 first-block entries, thresholdMultiplier=2.0 → flagged=false (needs 10 for suspected) ---
  it('returns flagged=false with thresholdMultiplier=2.0 when only 5 first-block entries exist', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 2.0 };

    const rows = [
      ...makeFirstBlockRows(5),
      ...makeLateRows(5, 200),
    ];
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // effective_suspected = 5 * 2.0 = 10 → 5 < 10 → flagged=false
    expect(result.flagged).toBe(false);
    expect(result.confidence).toBeNull();
  });

  // --- 15 first-block entries across 15 tokens, thresholdMultiplier=2.0 → review (rate 100% triggers confirmed but count check fails) ---
  it('returns confirmed_suspicious via rate when 15/15 tokens are first-block entries with thresholdMultiplier=2.0', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 2.0 };

    const rows = makeFirstBlockRows(15);
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    // multiplier=2.0:
    //   effective_suspected = 5 * 2 = 10 → 15 >= 10 ✓
    //   effective_tokens_suspected = 8 (not multiplied) → 15 >= 8 ✓
    //   effective_confirmed_count = 12 * 2 = 24 → 15 < 24 (fails count path)
    //   effective_confirmed_rate = 0.80 (not multiplied), effective_tokens_for_rate = 15
    //   rate = 15/15 = 100% >= 80% AND 15 >= 15 → confirmed_suspicious via rate
    expect(result.flagged).toBe(true);
    expect(result.confidence).toBe('confirmed_suspicious');
  });

  // --- evidenceSummary structure ---
  it('includes first_block_entries, total_tokens, and rate in evidenceSummary when flagged', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const rows = makeFirstBlockRows(5, 0);
    const db = buildMockDb([...rows, ...makeLateRows(5, 200)]);

    const result = await detectSniper(config, { db: db as any });

    expect(result.evidenceSummary).toMatchObject({
      first_block_entries: 5,
      total_tokens: 10,
    });
    expect(typeof (result.evidenceSummary as any).rate).toBe('number');
  });

  // --- evidenceDetail structure ---
  it('includes eligible_tokens array in evidenceDetail', async () => {
    const config: DetectorConfig = { walletAddress: WALLET, thresholdMultiplier: 1.0 };

    const rows = makeFirstBlockRows(5);
    const db = buildMockDb(rows);

    const result = await detectSniper(config, { db: db as any });

    expect(Array.isArray((result.evidenceDetail as any).eligible_tokens)).toBe(true);
  });
});
