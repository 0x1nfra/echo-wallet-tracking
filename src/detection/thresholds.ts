// ============================================================
// BUNDLER DETECTION (DETC-01)
// Bias: AGGRESSIVE — high certainty, low false-positive risk
// Require multiple independent events with shared funder before flagging
// ============================================================
export const BUNDLER = {
  // Minimum distinct wallets buying same token in same slot to be a coordination candidate
  MIN_WALLETS_IN_SAME_SLOT: 3,
  // Independent coordination events (different tokens/launches) with shared funder
  MIN_EVENTS_SUSPECTED: 2,
  MIN_EVENTS_REVIEW: 3,
  MIN_EVENTS_CONFIRMED: 5,
  // How many blocks prior to check for shared funder SOL transfer
  FUNDING_LOOKBACK_BLOCKS: 5,
  // Known system/aggregator accounts to EXCLUDE from "shared funder" consideration
  // (Prevents false positives from Jupiter routing pools, system program, etc.)
  KNOWN_SYSTEM_ACCOUNTS: new Set([
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaW7grrKgrWqK', // Jupiter v6
    '11111111111111111111111111111111',                           // System program
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',              // SPL Token program
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1qj5',             // Associated Token Account program
  ]),
  // Cap on Helius API fetches per wallet during bundler detection
  MAX_HELIUS_FETCHES: 30,
} as const;

// ============================================================
// DEV WALLET DETECTION (DETC-02)
// Bias: AGGRESSIVE — direct deployer transfer is very low false-positive
// First-signal is sufficient to confirm
// ============================================================
export const DEV_WALLET = {
  // How many transactions after mint creation to check for deployer → wallet transfers
  DEPLOYER_TRANSFER_LOOKFORWARD_TXS: 3,
  // One confirmed deployer transfer → immediately confirmed_suspicious
  CONFIDENCE_ON_FIRST_SIGNAL: 'confirmed_suspicious' as const,
} as const;

// ============================================================
// SNIPER DETECTION (DETC-03)
// Bias: CONSERVATIVE — circumstantial evidence; flag only consistent patterns
// Must be consistent across multiple launches
// ============================================================
export const SNIPER = {
  // Slots after approximate launch slot to count as "first block" entry
  FIRST_BLOCK_WINDOW_SLOTS: 3,
  // Min first-block entries for suspected (requires at least MIN_TOKENS_FOR_SUSPECTED buys total)
  MIN_LAUNCHES_SUSPECTED: 5,
  MIN_TOKENS_FOR_SUSPECTED: 8,
  // Min first-block entries for review
  MIN_LAUNCHES_REVIEW: 8,
  MIN_TOKENS_FOR_REVIEW: 10,
  // Confirmed: either absolute count OR rate threshold
  MIN_LAUNCHES_CONFIRMED: 12,
  MIN_RATE_CONFIRMED: 0.80,     // 80% first-block rate
  MIN_TOKENS_FOR_RATE_CONFIRMED: 15,
  // Minimum OTHER tracked wallets that bought the same token to establish launch slot baseline
  // (avoids flagging when there's no meaningful launch slot reference)
  MIN_OTHER_WALLETS_FOR_BASELINE: 3,
} as const;

// ============================================================
// WASH TRADER DETECTION (DETC-04)
// Bias: CONSERVATIVE — circular patterns are circumstantial; require multiple
// "Related" = direct SOL or token transfer between wallets within RELATIONSHIP_WINDOW_DAYS
// ============================================================
export const WASH_TRADER = {
  // Days window to consider two wallets "related" based on direct transfers
  RELATIONSHIP_WINDOW_DAYS: 7,
  // Independent circular trade patterns required before flagging
  MIN_CIRCULAR_PATTERNS_SUSPECTED: 2,
  MIN_CIRCULAR_PATTERNS_REVIEW: 4,
  MIN_CIRCULAR_PATTERNS_CONFIRMED: 7,
  // Cap Helius API fetches per wallet (wash trader can fetch many txs)
  MAX_HELIUS_FETCHES_PER_WALLET: 50,
} as const;

// ============================================================
// THRESHOLD MULTIPLIER (false positive protection)
// After user clears a flag, the detector uses BASE * threshold_multiplier
// before re-flagging. Multiplier doubles on each clear, capped at MAX.
// ============================================================
export const MAX_THRESHOLD_MULTIPLIER = 4.0;
export const CLEAR_THRESHOLD_MULTIPLIER_FACTOR = 2.0; // multiply by this on each clear

// ============================================================
// SEVERITY ORDER (for tier resolution)
// Highest severity first — used by engine to compute overall wallet status
// ============================================================
export const SEVERITY_ORDER = ['bundler', 'dev_wallet', 'wash_trader', 'sniper'] as const;
