/**
 * Sniper Detector (DETC-03)
 *
 * Flags wallets that consistently buy tokens within the first few slots of launch
 * across many different token launches.
 *
 * Bias: CONSERVATIVE — circumstantial evidence; requires consistent patterns
 * across many launches to avoid false positives.
 *
 * Launch slot approximation: We estimate the token launch slot as the minimum
 * slot across ALL tracked wallets that bought that token. This is an approximation
 * because we only see buys from wallets we track — the actual first buyer may not
 * be in our dataset. However, if a wallet appears at or near the minimum of what
 * we observe, it is very likely an early/sniper buyer.
 *
 * Makes zero Helius API calls — pure DB query, no external HTTP.
 */

import { sql } from 'drizzle-orm';
import { SNIPER } from './thresholds.js';
import type { DetectorConfig, DetectorResult } from './types.js';

// -----------------------------------------------------------------------
// Injectable dependency type (for testing)
// -----------------------------------------------------------------------

export interface SniperDb {
  all: (sqlStr: unknown, params: unknown) => Promise<Array<Record<string, unknown>>>;
}

export interface SniperDeps {
  db: SniperDb;
}

// -----------------------------------------------------------------------
// Raw query result row
// -----------------------------------------------------------------------

interface SniperQueryRow {
  token_mint: string;
  launch_slot: number;
  wallet_entry_slot: number | null;
  other_wallet_count: number;
}

// -----------------------------------------------------------------------
// Evidence detail item
// -----------------------------------------------------------------------

interface EligibleTokenEntry {
  token_mint: string;
  launch_slot: number;
  wallet_entry_slot: number;
  offset: number;
}

// -----------------------------------------------------------------------
// detectSniper
// -----------------------------------------------------------------------

export async function detectSniper(
  config: DetectorConfig,
  deps?: Partial<SniperDeps>
): Promise<DetectorResult> {
  const db = deps?.db ?? (await getDefaultDb());
  const { walletAddress, thresholdMultiplier } = config;

  // ------------------------------------------------------------------
  // Step 1: Query swaps table to get per-token stats in one query
  //
  // For each token_mint:
  //   - launch_slot  = MIN(slot) across ALL wallets (approximated launch)
  //   - wallet_entry_slot = MIN(slot) for our target wallet (null if not a buyer)
  //   - other_wallet_count = distinct other wallets that bought this token
  //
  // HAVING wallet_entry_slot IS NOT NULL ensures we only process tokens
  // the target wallet actually bought.
  // ------------------------------------------------------------------
  const queryResult = await db.all(
    sql`
      SELECT
        s.token_mint,
        MIN(s.slot) AS launch_slot,
        MIN(CASE WHEN s.wallet_address = ${walletAddress} THEN s.slot END) AS wallet_entry_slot,
        COUNT(DISTINCT CASE WHEN s.wallet_address != ${walletAddress} THEN s.wallet_address END) AS other_wallet_count
      FROM swaps s
      WHERE s.side = 'buy'
      GROUP BY s.token_mint
      HAVING wallet_entry_slot IS NOT NULL
    `,
    []
  ) as unknown as SniperQueryRow[];

  // ------------------------------------------------------------------
  // Step 2: Classify each eligible token
  // ------------------------------------------------------------------

  let first_block_entries = 0;
  let total_tokens_with_baseline = 0;
  const eligible_tokens: EligibleTokenEntry[] = [];

  for (const row of queryResult) {
    // Skip tokens where we cannot establish a reliable launch baseline
    if (row.other_wallet_count < SNIPER.MIN_OTHER_WALLETS_FOR_BASELINE) {
      continue;
    }

    // Skip rows where the target wallet entry slot is null (sanity guard)
    if (row.wallet_entry_slot === null) continue;

    total_tokens_with_baseline++;

    const offset = row.wallet_entry_slot - row.launch_slot;
    const isFirstBlock = offset <= SNIPER.FIRST_BLOCK_WINDOW_SLOTS;

    if (isFirstBlock) {
      first_block_entries++;
    }

    eligible_tokens.push({
      token_mint: row.token_mint,
      launch_slot: row.launch_slot,
      wallet_entry_slot: row.wallet_entry_slot,
      offset,
    });
  }

  // ------------------------------------------------------------------
  // Step 3: Apply thresholds with multiplier
  //
  // Note: rate threshold and token count thresholds are NOT multiplied —
  // only the raw launch count thresholds scale with multiplier.
  // ------------------------------------------------------------------
  const effective_suspected = SNIPER.MIN_LAUNCHES_SUSPECTED * thresholdMultiplier;
  const effective_tokens_suspected = SNIPER.MIN_TOKENS_FOR_SUSPECTED; // not multiplied
  const effective_review = SNIPER.MIN_LAUNCHES_REVIEW * thresholdMultiplier;
  const effective_tokens_for_review = SNIPER.MIN_TOKENS_FOR_REVIEW; // not multiplied
  const effective_confirmed_count = SNIPER.MIN_LAUNCHES_CONFIRMED * thresholdMultiplier;
  const effective_confirmed_rate = SNIPER.MIN_RATE_CONFIRMED; // not multiplied
  const effective_tokens_for_rate = SNIPER.MIN_TOKENS_FOR_RATE_CONFIRMED; // not multiplied

  const rate = total_tokens_with_baseline > 0
    ? first_block_entries / total_tokens_with_baseline
    : 0;

  // ------------------------------------------------------------------
  // Step 4: Determine confidence tier
  // ------------------------------------------------------------------

  // No flag if below minimum suspected thresholds
  if (
    first_block_entries < effective_suspected ||
    total_tokens_with_baseline < effective_tokens_suspected
  ) {
    return {
      detector: 'sniper',
      flagged: false,
      confidence: null,
      evidenceSummary: {
        first_block_entries,
        total_tokens: total_tokens_with_baseline,
        rate,
      },
      evidenceDetail: { eligible_tokens },
    };
  }

  // Check confirmed (by count OR by rate)
  const confirmedByCount = first_block_entries >= effective_confirmed_count;
  const confirmedByRate =
    rate >= effective_confirmed_rate &&
    total_tokens_with_baseline >= effective_tokens_for_rate;

  let confidence: 'suspected' | 'review' | 'confirmed_suspicious';

  if (confirmedByCount || confirmedByRate) {
    confidence = 'confirmed_suspicious';
  } else if (
    first_block_entries >= effective_review &&
    total_tokens_with_baseline >= effective_tokens_for_review
  ) {
    confidence = 'review';
  } else {
    confidence = 'suspected';
  }

  return {
    detector: 'sniper',
    flagged: true,
    confidence,
    evidenceSummary: {
      first_block_entries,
      total_tokens: total_tokens_with_baseline,
      rate,
    },
    evidenceDetail: { eligible_tokens },
  };
}

// -----------------------------------------------------------------------
// Production singleton (lazy-loaded to avoid side effects in tests)
// -----------------------------------------------------------------------

async function getDefaultDb(): Promise<SniperDb> {
  const { db } = await import('../db/index.js');
  return {
    all: async (sqlObj: any, _params: unknown) => {
      const built = (sqlObj as any).toQuery({
        escapeName: (n: string) => `"${n}"`,
        escapeParam: () => '?',
      });
      return (db as any).$client.prepare(built.sql).all(...built.params);
    },
  };
}
