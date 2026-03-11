# Phase 3: Bundle/Scam Detection - Research

**Researched:** 2026-03-11
**Domain:** On-chain wallet behavior classification, Solana slot/block coordination detection, SQLite pattern queries, Commander.js CLI extension
**Confidence:** HIGH for architecture and DB patterns (derived from existing codebase); MEDIUM for specific detection thresholds (algorithmic, calibrated from on-chain behavior literature); LOW for wash trader graph traversal edge cases (requires real data validation)

## Summary

Phase 3 classifies each tracked wallet as clean or suspicious before any scoring runs. Four detectors — bundler, dev wallet, sniper, wash trader — evaluate behavioral patterns from data already stored in the `swaps` table. Detection produces tiered confidence records (`suspected` → `review` → `confirmed-suspicious` / `confirmed-passing`) and gates the scoring pipeline: only `confirmed-passing` wallets are eligible.

All detection evidence is derived from existing DB data (the `swaps` table, populated by Phase 2) plus targeted Helius API calls for data not captured during swap import (specifically: native SOL transfers for bundler funding-source tracing and token deployer transfer lookup for dev wallet detection). No new data sources are required beyond what Phase 2 already fetches. The detection engine runs once after `history_complete=true` is set, then incrementally on each monitoring loop cycle (only wallets with new swaps).

The existing schema already contains `detection_status` on the `wallets` table and a `removal_log` table. Phase 3 must add a new `wallet_flags` table (or equivalent) to store per-detector evidence records. The existing `wallets.detection_status` enum (`pending`, `passing`, `suspected`, `review`, `confirmed`) is partially aligned but needs refinement to support the full tier system and the confirmed-suspicious / confirmed-passing distinction.

**Primary recommendation:** Implement a `src/detection/` module with one file per detector plus a shared `engine.ts` orchestrator. Store flag records in a new `wallet_flags` Drizzle table. Wire detection into the import flow (run after `history_complete=true`) and expose three new CLI commands: `wallet review`, `wallet clear-flag`, and a detection trigger command.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary**
- Classify wallets as clean or suspicious using four detectors (bundler, dev wallet, sniper, wash trader) with tiered confidence gating. Only wallets with "confirmed passing" status are eligible for scoring. Detection runs before any metrics are calculated. Creating new CLI commands for override and review is in scope. The dashboard display of detection flags is out of scope (Phase 7).

**Detection thresholds**
- Bias by type: Flag more aggressively for bundlers and dev wallets (high certainty, low false-positive risk). Flag more conservatively for snipers and wash traders (circumstantial evidence, higher false-positive risk).
- Specific thresholds: Claude's Discretion — pick sensible defaults and document them. Thresholds are initial hypotheses expected to be tuned against real transaction data.
- Dev wallet: First-signal is sufficient (direct deployer transfer is very low false-positive). Implement what's reliably detectable from Helius enhanced transactions.
- Bundler: Require multiple independent events across separate tokens/launches before flagging.
- Sniper: Apply a higher bar (conservative) — flag only consistent patterns, not lucky early buyers.
- Wash trader "related" definition: Claude's Discretion — define relationship heuristics based on what's detectable from Helius data (shared funding source and/or direct SOL/token transfers between wallets are both reasonable signals).

**Confidence tier progression**
- Tiers: `suspected` → `review` → `confirmed-suspicious` / `confirmed-passing`
- Escalation: Automatic (evidence accumulates) + user can manually force-promote or force-demote at any stage.
- Confirmed passing: Absence of flags after `history_complete=true` is sufficient — no active positive evidence required. Claude's Discretion on exact implementation.
- Re-evaluation during monitoring: Claude's Discretion — incremental re-evaluation (only wallets with new transactions) is preferred given the 30s loop.

**Flagged wallet visibility in CLI**
- Flagged wallets (suspected/review/confirmed-suspicious) appear in a separate section from clean wallets in `wallet list` output.
- Status label is shown alongside each flagged wallet.

**False positive handling**
- Override command: `wallet clear-flag <address>` — explicit CLI command to override detection.
- Evidence before confirming: Display the flagging reason and evidence, then prompt "Are you sure?" before clearing.
- Re-flagging after clear: Cleared wallets require significantly stronger evidence to be re-flagged by the same detector (not immune, but raised threshold).
- Surfacing flagged wallets: Dedicated `wallet review` command lists all wallets awaiting human review.

**Multi-flag behavior**
- Resolution: Highest severity wins — the worst active flag determines the wallet's overall tier status.
- Severity ranking (highest to lowest): Bundler > Dev wallet > Wash trader > Sniper
- Partial clear: After clearing one flag with others remaining, status re-evaluates based on the highest remaining flag. Claude's Discretion on exact implementation.
- Detection storage: Claude's Discretion — store enough detail for the dashboard phase to display meaningful data (at minimum: flag types, evidence summary, confidence level, timestamps).

### Claude's Discretion
- Exact bundler coordination threshold (number of wallets, block window)
- Exact sniper threshold (number of launches required)
- Exact wash trader relationship definition
- Confirmed passing implementation details (absence-of-flags baseline)
- Incremental vs. full re-evaluation decision
- Tier recalculation logic after partial flag clear
- Detection record schema (what fields to store)
- Progress reporting / logging during detection runs

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DETC-01 | System detects bundler wallets (same-block coordinated buys from wallets sharing a funding source) | Slot field already in `swaps` table; native transfer funding source lookup via Helius `nativeTransfers` field on stored transactions; GROUP BY slot + token_mint query pattern identifies coordination; shared-funder linkage requires additional Helius fetch for pre-swap SOL transfers |
| DETC-02 | System detects dev wallets (wallet received tokens directly from the token deployer address) | Helius `tokenTransfers` field captures direct token transfers; dev wallet signal = token transfer FROM deployer address in same tx as mint creation; requires looking up token creation transactions via Helius to identify deployer; once detected, one signal is sufficient to flag |
| DETC-03 | System detects sniper bots (wallet consistently buys in first 2-3 blocks of token launches) | Slot field in `swaps` enables slot-relative-to-launch comparison; requires knowing token launch slot (first recorded buy across all wallets for a given token_mint, or Helius token creation event); conservative threshold: ≥5 launches where wallet bought within 3 blocks of launch slot |
| DETC-04 | System detects wash traders (circular trades between related wallets) | Helius `nativeTransfers` and `tokenTransfers` on swap transactions capture wallet relationships; circular pattern = wallet A buys → sends tokens to B → B sells, with SOL flowing back; relationship definition: direct SOL/token transfer within N days of coordinated trades |
| DETC-05 | System applies tiered confidence to detection (suspected → review → confirmed) before flagging a wallet | Tier logic implemented in detection engine; thresholds per detector type; existing `detection_status` column on `wallets` table partially supports this but enum needs extension |
| DETC-06 | Only wallets with passing detection status are eligible for scoring | Scoring pipeline checks `detection_status = 'confirmed-passing'` before computing metrics; wallets at any other status are skipped, not removed |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new dependencies required)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| drizzle-orm | ^0.45.1 | ORM — schema definition, migrations, queries | Already used for all DB operations; detection tables follow same pattern |
| better-sqlite3 | ^12.6.2 | Synchronous SQLite driver | Detection runs synchronously during import and monitoring loop; fits existing WAL-mode db setup |
| commander | ^11.1.0 | CLI framework | Already used for `wallet` command group; new subcommands (`review`, `clear-flag`) follow same pattern |
| inquirer | ^9.2.12 | Interactive CLI prompts | Already installed; used for "Are you sure?" confirmation on `clear-flag` |
| chalk | ^5.3.0 | Terminal colors | Already used in `wallet list`; needed for detection status display |
| cli-table3 | ^0.6.3 | Tabular CLI output | Already used in `wallet list`; used for `wallet review` output |
| axios | ^1.6.2 | HTTP client | Already used; needed for targeted Helius lookups (native transfers, token creation events) |
| p-queue | ^9.1.0 | Rate-limited async queue | Already installed; needed for any supplemental Helius API calls during detection |

### New Dependencies Required
None. All required libraries are already present.

**Installation:**
```bash
# No new packages needed
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline SQLite queries for detection | Separate graph DB (Neo4j) for wash trader relationships | Graph DB is overkill; relationship depth needed (1-2 hops) is solvable with SQLite self-joins; add complexity only if wash trader detection proves insufficient |
| inquirer for confirmation prompt | readline directly | inquirer already installed and provides consistent UX; readline is lower-level |
| Drizzle migrations for new tables | Raw SQL schema | Drizzle migrations are the established pattern in this codebase; stay consistent |

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── detection/
│   ├── engine.ts          # Orchestrator: runs all detectors, manages tiers, triggers re-eval
│   ├── bundler.ts         # DETC-01: same-block coordination + shared funder detection
│   ├── dev-wallet.ts      # DETC-02: deployer token transfer detection
│   ├── sniper.ts          # DETC-03: first-block launch entry pattern detection
│   ├── wash-trader.ts     # DETC-04: circular trade relationship detection
│   ├── thresholds.ts      # All detection constants as named exports (easy to tune)
│   └── types.ts           # DetectionFlag, DetectorResult, TierStatus interfaces
├── db/
│   └── schema.ts          # Add: wallet_flags table, detection_overrides table
├── commands/
│   └── wallet.ts          # Add: wallet review, wallet clear-flag subcommands
└── importers/
    └── history.ts         # Extend: trigger detection after history_complete=true
```

### Pattern 1: Detection Flag Storage Schema
**What:** New `wallet_flags` table storing per-detector evidence records. Each row = one active flag from one detector on one wallet.
**When to use:** Written by detectors when evidence threshold is crossed; read by engine to compute overall tier; read by `wallet review` and `wallet clear-flag` CLI commands.

```typescript
// src/db/schema.ts — add these tables
export const wallet_flags = sqliteTable('wallet_flags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wallet_address: text('wallet_address').notNull(),
  detector: text('detector', {
    enum: ['bundler', 'dev_wallet', 'sniper', 'wash_trader'],
  }).notNull(),
  confidence: text('confidence', {
    enum: ['suspected', 'review', 'confirmed_suspicious'],
  }).notNull(),
  evidence_summary: text('evidence_summary').notNull(), // JSON string: key facts for display
  evidence_detail: text('evidence_detail'),             // JSON string: full evidence for dashboard (Phase 7)
  cleared: integer('cleared', { mode: 'boolean' }).notNull().default(false),
  cleared_at: integer('cleared_at', { mode: 'number' }),
  cleared_by: text('cleared_by'),                       // 'user' | 'auto'
  threshold_multiplier: real('threshold_multiplier').notNull().default(1.0), // raised after clear
  created_at: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  updated_at: integer('updated_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});
```

**Key design decisions:**
- `evidence_summary`: short JSON string (e.g., `{"token": "ABC", "coordinated_wallets": 3, "shared_funder": "xxx"}`). Used by `wallet review` CLI immediately.
- `evidence_detail`: full evidence blob stored for Phase 7 dashboard display. Can be large. Store as JSON string.
- `cleared`: soft-delete flag. Cleared flags are not deleted — they inform the raised threshold for re-flagging.
- `threshold_multiplier`: after a clear, the detector for this wallet uses `BASE_THRESHOLD * threshold_multiplier` before re-flagging. Start at 2.0x after first clear.

### Pattern 2: Tier Resolution Engine
**What:** Computes the overall `detection_status` for a wallet from its active flags. Implements the "highest severity wins" rule. Writes the result to `wallets.detection_status`.
**When to use:** Called after any detector runs or after a flag is cleared.

```typescript
// src/detection/engine.ts

// Severity order (highest to lowest)
const SEVERITY_ORDER = ['bundler', 'dev_wallet', 'wash_trader', 'sniper'] as const;

// Tier order (highest to lowest)
const TIER_ORDER: DetectionTier[] = ['confirmed_suspicious', 'review', 'suspected'];

function computeOverallStatus(flags: ActiveFlag[]): DetectionStatus {
  if (flags.length === 0) return 'confirmed_passing';

  // Find worst (highest severity) detector among active flags
  const worstDetector = SEVERITY_ORDER.find(d => flags.some(f => f.detector === d));
  if (!worstDetector) return 'confirmed_passing';

  // Among flags from worst detector, find highest confidence tier
  const worstFlags = flags.filter(f => f.detector === worstDetector);
  for (const tier of TIER_ORDER) {
    if (worstFlags.some(f => f.confidence === tier)) {
      return tier === 'confirmed_suspicious' ? 'confirmed_suspicious' : tier as DetectionStatus;
    }
  }

  return 'confirmed_passing';
}
```

**DB write pattern:**
```typescript
// After computing overall status, write to wallets table
db.update(wallets)
  .set({ detection_status: overallStatus })
  .where(eq(wallets.address, walletAddress))
  .run();
```

### Pattern 3: Detector Interface
**What:** Common interface all four detectors implement. Engine calls each detector and processes results uniformly.
**When to use:** Implemented by all four detector files.

```typescript
// src/detection/types.ts
export interface DetectorResult {
  detector: 'bundler' | 'dev_wallet' | 'sniper' | 'wash_trader';
  flagged: boolean;
  confidence: 'suspected' | 'review' | 'confirmed_suspicious' | null; // null if not flagged
  evidenceSummary: Record<string, unknown>; // key facts for CLI display
  evidenceDetail: Record<string, unknown>;  // full evidence for Phase 7 dashboard
}

export interface DetectorConfig {
  walletAddress: string;
  thresholdMultiplier: number; // 1.0 normally; raised after a user clear
}

// Each detector exports this signature:
export async function detect(config: DetectorConfig): Promise<DetectorResult>;
```

### Pattern 4: Bundler Detection — Same-Block Coordination
**What:** Identifies wallets that bought the same token in the same slot as other tracked wallets AND share a funding source with those wallets.
**When to use:** During initial detection and incremental re-evaluation.

**Algorithm:**
1. Query `swaps` for all `(slot, token_mint, wallet_address)` buy triples.
2. Group by `(slot, token_mint)`: if ≥ 3 distinct wallets bought the same token in the same slot, mark this as a coordination event.
3. For each coordination event involving the target wallet: check whether any participant wallets share a common funding source.
4. Funding source check: query Helius for `nativeTransfers` on the transaction signatures from the coordination event. If a common sender funded multiple participants within the same transaction or N blocks prior, record as shared funder.
5. Threshold: ≥ 2 independent coordination events (across different tokens/launches) with shared funder evidence → `suspected`. ≥ 3 events → `review`. ≥ 5 events → `confirmed_suspicious`.

```sql
-- Step 1: Find same-slot buys for the same token involving target wallet
SELECT s1.slot, s1.token_mint, COUNT(DISTINCT s1.wallet_address) as wallet_count
FROM swaps s1
WHERE s1.side = 'buy'
  AND s1.token_mint IN (
    SELECT DISTINCT token_mint FROM swaps WHERE wallet_address = ? AND side = 'buy'
  )
GROUP BY s1.slot, s1.token_mint
HAVING COUNT(DISTINCT s1.wallet_address) >= 3
```

**Thresholds (in `thresholds.ts`):**
```typescript
export const BUNDLER = {
  MIN_WALLETS_IN_SAME_SLOT: 3,       // Minimum co-buyers in same slot to be a coordination candidate
  MIN_EVENTS_SUSPECTED: 2,            // Independent events with shared funder to flag as suspected
  MIN_EVENTS_REVIEW: 3,               // Events to escalate to review
  MIN_EVENTS_CONFIRMED: 5,            // Events to confirm suspicious
  FUNDING_LOOKBACK_BLOCKS: 5,         // How many blocks prior to check for shared funder transfer
} as const;
```

**Helius supplemental call for native transfers:**
The `swaps` table does not store `nativeTransfers` from the original Helius response. Detection needs to fetch this for specific transaction signatures. Use `HeliusFetcher.getTransaction(signature)` which already exists and returns the full `HeliusTransaction` including `nativeTransfers`.

### Pattern 5: Dev Wallet Detection — Deployer Token Transfer
**What:** Identifies wallets that received tokens directly from the token deployer address in the same transaction as or immediately after token deployment.
**When to use:** During initial detection. Only needs to run once per wallet-token pair (one signal is sufficient to flag).

**Algorithm:**
1. For each token mint in the wallet's buy history, fetch the token creation transaction via Helius (look for the earliest transaction on that mint address).
2. Check `tokenTransfers` in that transaction for a transfer TO the target wallet FROM the deployer (fee payer / mint authority).
3. Also check the N=3 transactions immediately following the mint creation for direct deployer → wallet token transfers.
4. One confirmed match → immediately `confirmed_suspicious` (high certainty, aggressive flagging per locked decision).

**What Helius enhanced transactions expose:**
- `tokenTransfers[].fromUserAccount` — the sender
- `tokenTransfers[].toUserAccount` — the recipient
- `tokenTransfers[].mint` — the token mint
- `feePayer` — typically the deployer for creation transactions

**Limitation:** Helius history for a token mint address (not a wallet) requires the "Get Transactions" endpoint with the mint address as the address parameter. This is the same endpoint used for wallets. Confidence is HIGH that this works; the deployer address should appear as `feePayer` on the creation transaction.

**Thresholds:**
```typescript
export const DEV_WALLET = {
  DEPLOYER_TRANSFER_LOOKFORWARD_TXS: 3,  // Check this many txs after mint creation
  CONFIDENCE_ON_FIRST_SIGNAL: 'confirmed_suspicious', // Immediately confirmed (high certainty)
} as const;
```

### Pattern 6: Sniper Detection — First-Block Launch Entry
**What:** Identifies wallets that consistently buy tokens within the first 2-3 blocks (slots) of a token's launch. Conservative threshold: must be consistent across ≥ 5 launches.
**When to use:** During initial detection and incremental re-evaluation.

**Algorithm:**
1. For each token_mint in the wallet's buy history, determine the "launch slot" = the minimum slot value across ALL wallets' buys of that token in the `swaps` table.
2. Compute: `wallet_entry_slot - launch_slot` for each token. If ≤ 3 slots, count as a first-block entry.
3. Count how many tokens the wallet has first-block entries for.
4. Threshold (conservative):
   - ≥ 5 first-block entries out of ≥ 8 bought tokens → `suspected`
   - ≥ 8 first-block entries out of ≥ 10 bought tokens → `review`
   - ≥ 12 first-block entries OR ≥ 80% first-block rate over ≥ 15 tokens → `confirmed_suspicious`

**Important caveat:** "Launch slot" is estimated as the minimum slot seen across all tracked wallets — this may not be the true launch slot if the first buyer is not a tracked wallet. This is an intentional approximation; using Helius to look up the token creation transaction for exact launch slot is more accurate but costly. The planner should implement the min-slot approximation first and add Helius lookup as an enhancement.

```sql
-- Compute launch slot for each token (approximation from tracked wallets only)
SELECT s.token_mint,
       MIN(s.slot) as launch_slot,
       MIN(CASE WHEN s.wallet_address = ? THEN s.slot END) as wallet_entry_slot
FROM swaps s
WHERE s.side = 'buy'
GROUP BY s.token_mint
HAVING wallet_entry_slot IS NOT NULL
```

**Thresholds:**
```typescript
export const SNIPER = {
  FIRST_BLOCK_WINDOW_SLOTS: 3,         // Slots after launch slot to count as "first block"
  MIN_LAUNCHES_SUSPECTED: 5,           // Min first-block entries for suspected
  MIN_TOKENS_FOR_SUSPECTED: 8,         // Min total tokens to have rate calculated
  MIN_LAUNCHES_REVIEW: 8,
  MIN_TOKENS_FOR_REVIEW: 10,
  MIN_LAUNCHES_CONFIRMED: 12,
  MIN_RATE_CONFIRMED: 0.80,            // 80% first-block rate threshold
  MIN_TOKENS_FOR_RATE_CONFIRMED: 15,   // Min tokens to apply rate threshold
} as const;
```

### Pattern 7: Wash Trader Detection — Circular Trade Relationships
**What:** Identifies wallets engaged in circular trades with related wallets (wallet A buys, sends to B, B sells). "Related" means: direct SOL or token transfer between wallets within 7 days of the coordinated trade.
**When to use:** During initial detection; most expensive detector (requires cross-wallet analysis).

**Algorithm:**
1. Get all buy signatures for the target wallet from `swaps`.
2. For each buy, fetch the Helius transaction (already have `nativeTransfers` and `tokenTransfers` on the transaction).
3. Check if any `toUserAccount` in `tokenTransfers` (token sends after buy) is also in the `swaps` table as a seller of the same token.
4. Check if any wallet in `nativeTransfers` (SOL sends) that later appears as a buyer of the same token in `swaps` — i.e., SOL flows back to the original buyer.
5. Circular pattern = wallet A buys token X → transfers token X to wallet B → wallet B sells token X → wallet B sends SOL to wallet A (all within a time window).
6. Threshold (conservative given circumstantial nature):
   - ≥ 2 independent circular patterns → `suspected`
   - ≥ 4 independent circular patterns → `review`
   - ≥ 7 independent circular patterns → `confirmed_suspicious`

**Relationship definition (Claude's Discretion):**
A wallet is "related" to the target if ANY of the following are true in the `nativeTransfers` or `tokenTransfers` fields of their respective transactions, within a 7-day window:
- Wallet sent SOL to the target wallet
- Wallet received SOL from the target wallet
- Wallet sent tokens to the target wallet
- Wallet received tokens from the target wallet

```typescript
export const WASH_TRADER = {
  RELATIONSHIP_WINDOW_DAYS: 7,         // Days window to consider wallets related
  MIN_CIRCULAR_PATTERNS_SUSPECTED: 2,
  MIN_CIRCULAR_PATTERNS_REVIEW: 4,
  MIN_CIRCULAR_PATTERNS_CONFIRMED: 7,
  MAX_HELIUS_FETCHES_PER_WALLET: 50,  // Cap API calls per wallet during detection
} as const;
```

### Pattern 8: wallets.detection_status Enum Extension
**What:** The existing `detection_status` column uses `enum: ['pending', 'passing', 'suspected', 'review', 'confirmed']`. Phase 3 needs to distinguish `confirmed_passing` from `confirmed_suspicious`.
**How:** Extend the enum values in the Drizzle schema. SQLite doesn't enforce enums at the DB level (only ORM level), so no destructive migration is needed — just update the schema.ts and add a no-op migration file (following the same pattern as `0001_parse_errors.sql`).

```typescript
// Updated wallets table detection_status column
detection_status: text('detection_status', {
  enum: ['pending', 'suspected', 'review', 'confirmed_suspicious', 'confirmed_passing'],
}),
```

**Migration file:** Add `0002_detection_status.sql` with a comment noting that SQLite doesn't enforce the enum change — ORM level only.

### Pattern 9: CLI Commands — wallet review and wallet clear-flag
**What:** Two new subcommands added to the existing `wallet` Commander group.
**When to use:** User-triggered at any time.

```typescript
// wallet review — list all wallets awaiting human review
wallet
  .command('review')
  .description('List all wallets flagged for review')
  .action(() => {
    // Query wallet_flags JOIN wallets WHERE cleared = false AND detection_status != 'confirmed_passing'
    // Display: address, label, detection_status, flags (detector + confidence + evidence_summary)
    // Group by wallet; show all active flags per wallet
  });

// wallet clear-flag <address> — interactive override
wallet
  .command('clear-flag <address>')
  .description('Clear detection flags for a wallet')
  .option('--detector <type>', 'Clear only a specific detector flag (bundler|dev_wallet|sniper|wash_trader)')
  .action(async (address, options) => {
    // 1. Fetch active flags for wallet (and optionally filter by detector)
    // 2. Display each flag: detector, confidence, evidence_summary
    // 3. inquirer.confirm("Are you sure you want to clear these flags?")
    // 4. On confirm: SET cleared=true, cleared_by='user', cleared_at=now() on flag rows
    //    Raise threshold_multiplier = 2.0 on those flag rows
    // 5. Recompute wallet detection_status from remaining active flags
    // 6. Display result: "Flags cleared. Wallet is now: confirmed_passing"
  });
```

**inquirer confirm pattern (already installed):**
```typescript
import inquirer from 'inquirer';

const { confirmed } = await inquirer.prompt([{
  type: 'confirm',
  name: 'confirmed',
  message: 'Are you sure you want to clear these flags?',
  default: false,
}]);
```

### Pattern 10: wallet list — Flagged Wallet Separate Section
**What:** The existing `wallet list` command must display flagged wallets in a separate section below clean wallets.
**When to use:** `echo wallet list` — always shows both sections.

```typescript
// Extended wallet list:
// Section 1: "Clean Wallets" — detection_status IN ('confirmed_passing', 'pending', NULL)
// Section 2: "Flagged Wallets" — detection_status IN ('suspected', 'review', 'confirmed_suspicious')
// Each flagged wallet row: address, label, detection_status (colored), active flag types
```

### Pattern 11: Detection Trigger — After History Import
**What:** Detection runs automatically after `history_complete=true` is set for a wallet. Incremental re-evaluation runs on each monitoring loop cycle for wallets that have new swaps.
**When to use:** Called from `importWalletHistory()` after the completion `db.update()` call.

```typescript
// In importers/history.ts, after marking history_complete=true:
await runDetection(address);

// In monitoring loop (Phase 5), for incremental re-evaluation:
if (wallet.history_complete && hasNewSwaps(wallet.address)) {
  await runDetection(wallet.address, { incrementalOnly: true });
}
```

**runDetection signature:**
```typescript
// src/detection/engine.ts
export async function runDetection(
  walletAddress: string,
  options?: { incrementalOnly?: boolean }
): Promise<void>;
```

### Anti-Patterns to Avoid
- **Running detection before `history_complete=true`:** Partial history produces false-negative results (wallet looks clean because evidence not yet imported). Always gate detection on `history_complete`.
- **Deleting cleared flags:** Cleared flags must be soft-deleted (cleared=true) to preserve the raised threshold for re-flagging and for Phase 7 dashboard history display.
- **Storing raw transaction payloads in evidence fields:** Only store derived facts (wallet addresses, slot numbers, counts, mint addresses) — not raw Helius responses. This keeps storage small and evidence human-readable.
- **Checking `wallets.detection_status` for scoring eligibility by checking 'passing':** The enum value should be `confirmed_passing` (not `passing`) to avoid ambiguity with the old schema value. Old `passing` value must be migrated or made equivalent to `confirmed_passing`.
- **Computing tier from flags in application code repeatedly:** Always write the computed tier back to `wallets.detection_status` after any flag change, so scoring queries can use a simple `WHERE detection_status = 'confirmed_passing'` without recomputing.
- **Fetching all transactions for every wallet on every monitoring loop cycle:** Incremental detection should only re-run detectors for wallets that have received new swaps since `last_checked_at`. Check `swaps WHERE wallet_address = ? AND timestamp > last_checked_at` first; skip if empty.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive CLI confirmation | Custom readline prompts | `inquirer` (already installed) | Handles terminal edge cases, cancel behavior, default values correctly |
| Rate limiting supplemental Helius calls | Custom sleep/retry | `p-queue` + `p-retry` (already installed) | Already wired in helius.ts; detection calls must go through same queue |
| Tier resolution algorithm | Complex if/else trees per detector | Simple sorted-priority lookup table in engine.ts | Severity ranking is data, not logic; a constant array + find() is clearest |
| Evidence diff tracking | Custom change detection | Timestamp comparison against `last_checked_at` in wallets table | Already stored; use `WHERE timestamp > last_checked_at` in swaps query |
| DB schema management for new tables | Raw SQL scripts | Drizzle schema + migration files (same as existing pattern) | Consistent with existing codebase; Drizzle handles migration ordering |

**Key insight:** All complexity in this phase is algorithmic (detection logic), not infrastructure. The infrastructure (DB, CLI, HTTP) is already solved by existing code. Focus implementation effort on the four detection algorithms, not on building new tooling.

---

## Common Pitfalls

### Pitfall 1: Detection Before history_complete
**What goes wrong:** Detection runs immediately when a wallet is added, before all historical swaps are imported. The bundler and sniper detectors see partial data and produce false negatives (clean result). Wallet is then flagged `confirmed_passing` prematurely — this status persists even after the full history reveals suspicious patterns (re-evaluation may not run if the monitoring loop skips confirmed-passing wallets).
**Why it happens:** It's tempting to run detection in the wallet-add flow before the import completes.
**How to avoid:** Gate ALL detection on `history_complete=true`. Set `detection_status=NULL` (or `pending`) on wallet add; only transition to any tier after import completes AND detection runs.
**Warning signs:** Wallet added with `--full-history` but shows `confirmed_passing` within seconds of being added.

### Pitfall 2: Helius API Credit Burn During Detection
**What goes wrong:** Detection, especially the bundler and dev-wallet detectors, requires fetching individual transaction details from Helius for native transfer and token transfer data. A wallet with 500 swaps could trigger 500 additional Helius API calls during detection.
**Why it happens:** The `swaps` table only stores swap data — native transfer details (SOL funding) and deployer transfer details are not stored during Phase 2 import.
**How to avoid:** (a) Cap per-wallet Helius fetches during detection (see `MAX_HELIUS_FETCHES_PER_WALLET` in wash trader thresholds). (b) For bundler detection, only fetch the native transfers for coordination-event transactions (a small subset of all swaps). (c) For dev wallet, only fetch transactions for token mints with no prior dev-wallet flag. (d) Consider storing `nativeTransfers` and `tokenTransfers` during Phase 2 import in a supplemental table — this is a schema enhancement the planner should evaluate.
**Warning signs:** Helius free tier exhausted rapidly after adding a single wallet.

### Pitfall 3: Shared Funder False Positives on Jupiter/Aggregator Routes
**What goes wrong:** A popular DEX aggregator (Jupiter) routes many wallets' transactions through a shared intermediate account. Detection sees multiple wallets' transactions with a common `nativeTransfers` source and flags them all as having a "shared funder" — but the shared account is Jupiter's routing pool, not a coordination wallet.
**Why it happens:** Bundler detection looks for common SOL senders across coordination-event transactions. Jupiter-routed transactions may share a system program account in native transfers.
**How to avoid:** Build a `KNOWN_SYSTEM_ACCOUNTS` exclusion list (Jupiter program `JUP6LkbZbjS...`, system program `11111111111111111111111111111111`, and other known router/aggregator accounts). Exclude these from "shared funder" consideration. This list should be a constant in `thresholds.ts`.
**Warning signs:** Every wallet using Jupiter is flagged as a bundler with the same "shared funder" address.

### Pitfall 4: Launch Slot Approximation Skews Sniper Detection
**What goes wrong:** Sniper detection uses `MIN(slot)` across all tracked wallets as the launch slot. If no tracked wallet bought at launch, the approximated launch slot is later than the true launch slot. This makes all buys appear to be near-launch, potentially over-flagging non-sniper wallets.
**Why it happens:** The `swaps` table only contains data for tracked wallets. True launch slot requires querying the token creation transaction from Helius.
**How to avoid:** Document this as a known approximation. Apply the sniper threshold only to wallets where the target wallet's entry slot is ≤ 3 slots from the minimum observed across ALL tracked wallets. If only one tracked wallet has a buy for that token, skip it (can't determine if it was truly launch timing). Minimum: ≥ 3 other tracked wallets must have buys for the same token to establish a meaningful launch slot baseline.
**Warning signs:** Many wallets flagged as snipers despite clearly not being bots (e.g., they buy tokens days after launch but appear "early" because no other tracked wallet bought earlier).

### Pitfall 5: Re-flagging After Clear With Original Thresholds
**What goes wrong:** A user clears a bundler flag. On the next monitoring cycle, detection re-runs and immediately re-flags the wallet with the same evidence.
**Why it happens:** The cleared flag's evidence is still valid; detection produces the same result without any threshold adjustment.
**How to avoid:** Read `threshold_multiplier` from the cleared flag row before running the detector. Pass this to the detector's threshold comparison: `evidence_count >= BASE_THRESHOLD * threshold_multiplier`. After a clear, `threshold_multiplier` should be set to 2.0, meaning the wallet needs twice the evidence to be re-flagged.
**Warning signs:** User runs `clear-flag`, receives "cleared" confirmation, then the next `wallet list` shows the wallet flagged again.

### Pitfall 6: Incorrect detection_status Enum Values in Queries
**What goes wrong:** The old schema had `detection_status` enum values of `['pending', 'passing', 'suspected', 'review', 'confirmed']`. Phase 3 changes these to `['pending', 'suspected', 'review', 'confirmed_suspicious', 'confirmed_passing']`. Code that checks `detection_status === 'passing'` or `detection_status === 'confirmed'` silently fails to match anything.
**Why it happens:** Schema migration changes the value strings but existing application code still uses old string literals.
**How to avoid:** Phase 3 must (a) update the schema enum values, (b) search all existing code for old detection_status string literals and update them, (c) add a data migration comment to handle any wallets already stored with old status values (though in practice the DB should be fresh or nearly fresh at this phase).
**Warning signs:** Scoring pipeline skips all wallets including ones that should be eligible; or `wallet list` never shows any wallets in the flagged section.

### Pitfall 7: Detection Engine Blocking the Monitoring Loop
**What goes wrong:** Detection runs synchronously within the 30-second monitoring loop. Wallet with 1000 swaps and 200 Helius fetches takes 2+ minutes. The monitoring loop blocks, missing the next cycle.
**Why it happens:** Detection is implemented as a blocking synchronous call in the monitoring loop body.
**How to avoid:** Run detection as an async operation and don't await it in the tight monitoring loop. Alternatively, limit detection to only wallets that (a) haven't been detected yet OR (b) have new swaps, and skip expensive Helius fetches during monitoring cycles (use only DB data for incremental re-evaluation, reserving API calls for initial detection only).
**Warning signs:** Monitoring loop cycle time exceeds 30 seconds; CLI becomes unresponsive during detection.

---

## Code Examples

### Detection Engine Orchestration
```typescript
// src/detection/engine.ts
import { detectBundler } from './bundler.js';
import { detectDevWallet } from './dev-wallet.js';
import { detectSniper } from './sniper.js';
import { detectWashTrader } from './wash-trader.js';
import { db } from '../db/index.js';
import { wallets, wallet_flags } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export async function runDetection(walletAddress: string): Promise<void> {
  // Read existing cleared flags to get threshold multipliers per detector
  const clearedFlags = db.select().from(wallet_flags)
    .where(and(
      eq(wallet_flags.wallet_address, walletAddress),
      eq(wallet_flags.cleared, true)
    )).all();

  const multiplierFor = (detector: string) =>
    Math.max(...clearedFlags
      .filter(f => f.detector === detector)
      .map(f => f.threshold_multiplier), 1.0);

  // Run all four detectors
  const results = await Promise.all([
    detectBundler({ walletAddress, thresholdMultiplier: multiplierFor('bundler') }),
    detectDevWallet({ walletAddress, thresholdMultiplier: multiplierFor('dev_wallet') }),
    detectSniper({ walletAddress, thresholdMultiplier: multiplierFor('sniper') }),
    detectWashTrader({ walletAddress, thresholdMultiplier: multiplierFor('wash_trader') }),
  ]);

  // Upsert flag records for flagged detectors
  for (const result of results) {
    if (result.flagged && result.confidence) {
      db.insert(wallet_flags).values({
        wallet_address: walletAddress,
        detector: result.detector,
        confidence: result.confidence,
        evidence_summary: JSON.stringify(result.evidenceSummary),
        evidence_detail: JSON.stringify(result.evidenceDetail),
      })
      .onConflictDoUpdate({
        target: [wallet_flags.wallet_address, wallet_flags.detector],
        set: {
          confidence: result.confidence,
          evidence_summary: JSON.stringify(result.evidenceSummary),
          evidence_detail: JSON.stringify(result.evidenceDetail),
          updated_at: Date.now(),
        }
      }).run();
    }
  }

  // Recompute and store overall tier
  const activeFlags = db.select().from(wallet_flags)
    .where(and(
      eq(wallet_flags.wallet_address, walletAddress),
      eq(wallet_flags.cleared, false)
    )).all();

  const overallStatus = computeOverallStatus(activeFlags);
  db.update(wallets)
    .set({ detection_status: overallStatus, last_checked_at: Date.now() })
    .where(eq(wallets.address, walletAddress))
    .run();
}
```

### Confirmed Passing Baseline
```typescript
// A wallet becomes confirmed_passing when:
// 1. history_complete = true, AND
// 2. No active (non-cleared) flags exist in wallet_flags

// This is implemented in computeOverallStatus:
function computeOverallStatus(activeFlags: WalletFlag[]): DetectionStatus {
  const uncleared = activeFlags.filter(f => !f.cleared);
  if (uncleared.length === 0) return 'confirmed_passing';
  // ... severity resolution logic
}
```

### Incremental Re-evaluation Guard
```typescript
// Skip re-evaluation if no new swaps since last check
export async function runDetectionIfNeeded(walletAddress: string): Promise<void> {
  const wallet = db.select().from(wallets)
    .where(eq(wallets.address, walletAddress))
    .get();

  if (!wallet?.history_complete) return; // Not yet eligible

  const lastChecked = wallet.last_checked_at ?? 0;
  const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
    .where(and(
      eq(swaps.wallet_address, walletAddress),
      gt(swaps.timestamp, lastChecked)
    ))
    .get();

  if (!hasNewSwaps) return; // No new data, skip

  await runDetection(walletAddress);
}
```

### wallet review CLI Command
```typescript
wallet
  .command('review')
  .description('List all wallets with active detection flags awaiting review')
  .action(() => {
    // Join wallet_flags with wallets to get label + status
    const flaggedWallets = db
      .select({
        address: wallets.address,
        label: wallets.label,
        detection_status: wallets.detection_status,
      })
      .from(wallets)
      .where(inArray(wallets.detection_status, ['suspected', 'review', 'confirmed_suspicious']))
      .all();

    if (flaggedWallets.length === 0) {
      console.log('No wallets currently flagged for review.');
      return;
    }

    // For each flagged wallet, fetch its active flags
    for (const w of flaggedWallets) {
      const flags = db.select().from(wallet_flags)
        .where(and(
          eq(wallet_flags.wallet_address, w.address),
          eq(wallet_flags.cleared, false)
        )).all();

      // Display wallet header + flag table
      // Include evidence_summary parsed from JSON for each flag
    }
  });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static wallet blacklists | Evidence-based tiered detection | Ongoing in DeFi analytics | Enables graduated response (suspected → confirmed) rather than binary block/allow |
| Full wallet graph analysis (all-pairs) | Targeted detection from existing swap data | This phase design | Avoids O(n²) cross-wallet queries; only looks at wallets that share tokens/slots |
| Separate detection service | In-process detection engine | This phase design | Simpler deployment (no separate process); fits existing CLI + monitoring loop architecture |

**Deprecated/outdated:**
- `wallets.detection_status` enum value `'passing'`: Replace with `'confirmed_passing'` for clarity. `'confirmed'` is ambiguous — replace with either `'confirmed_suspicious'` or `'confirmed_passing'`.
- Old `removal_log` approach: Phase 1 schema included a `removal_log` table for when wallets were flagged and "removed." Phase 3's design is to keep flagged wallets in place (not remove them) and gate scoring. The `removal_log` table still exists and can be used to record detection history, but it should not be the primary detection storage mechanism.

---

## Open Questions

1. **Whether to store nativeTransfers during Phase 2 import to avoid extra Helius calls in Phase 3**
   - What we know: Phase 2 already fetches full `HeliusTransaction` objects including `nativeTransfers` and `tokenTransfers`, but only the parsed `SwapRow` fields are stored. Bundler and wash trader detection need native transfer data.
   - What's unclear: Whether it's better to add a supplemental `tx_transfers` table in Phase 2 or to accept N Helius re-fetches during detection in Phase 3.
   - Recommendation: Store `nativeTransfers` and `tokenTransfers` as a JSON column on a new `raw_transfers` table during Phase 2 import, keyed by `tx_signature`. This avoids all Helius re-fetches during detection. The planner should evaluate this as a potential schema addition to Phase 2's scope or a Phase 3 prerequisite task.
   - Confidence: MEDIUM — feasible with the existing Drizzle + SQLite stack; storage cost is acceptable for the transaction counts expected

2. **Exact upsert behavior for wallet_flags when evidence escalates (suspected → review)**
   - What we know: Drizzle ORM's `onConflictDoUpdate` can update existing rows. The `wallet_flags` table needs a unique constraint to enable this.
   - What's unclear: Should one wallet-detector pair produce exactly one flag row (upserted on re-detection) or multiple rows (historical record)? The dashboard phase (Phase 7) might benefit from a history of escalation events.
   - Recommendation: One active row per wallet-detector pair (upserted), plus a separate `flag_events` table or JSON array in `evidence_detail` tracking the escalation history. Keep the schema simple for Phase 3; the planner can defer event history to Phase 7.
   - Confidence: HIGH — upsert pattern is standard in drizzle-orm; schema decision is internal

3. **Helius token creation transaction lookup — which endpoint**
   - What we know: Helius REST `GET /v0/addresses/{address}/transactions` works for wallet addresses. For looking up transactions for a token mint address (to find deployer), the same endpoint may work with the mint address.
   - What's unclear: Whether Helius Enhanced Transactions API accepts a token mint address as the `address` parameter, or whether it only accepts wallet addresses.
   - Recommendation: The planner should flag dev-wallet detection as requiring an implementation-time API verification. An alternative: use the Helius `getAsset` DAS API or the Solana RPC `getAccountInfo` to find the mint authority (deployer). This may be simpler than transaction history lookup.
   - Confidence: LOW — needs verification during implementation

4. **threshold_multiplier persistence when multiple clears occur**
   - What we know: After one clear, `threshold_multiplier = 2.0`. If the wallet is re-flagged and cleared again, should it become 4.0?
   - What's unclear: Whether exponential multiplier growth (2x, 4x, 8x...) is the intended behavior, or if it should cap.
   - Recommendation: Cap at 4.0x (two clears makes it very hard to re-flag; beyond that the signal would need to be extremely strong regardless). The planner should implement this as a named constant: `MAX_THRESHOLD_MULTIPLIER = 4.0`.
   - Confidence: MEDIUM — this is a product design decision that was left to Claude's discretion

---

## Sources

### Primary (HIGH confidence)
- Existing project codebase — `src/db/schema.ts`, `src/types/transaction.ts`, `src/fetchers/helius.ts`, `src/commands/wallet.ts`, `src/importers/history.ts` — defines exact contracts, existing patterns, and available data
- Drizzle ORM existing patterns — `onConflictDoUpdate`, table definitions, migration pattern — all verified from codebase usage
- Phase 2 RESEARCH.md — documents Helius API structure, `HeliusTransaction` shape including `nativeTransfers`, `tokenTransfers`, `slot`, `feePayer`

### Secondary (MEDIUM confidence)
- Detection algorithm design — bundler coordination, sniper first-block, wash trader circular trade — derived from well-established on-chain analytics patterns; thresholds are initial hypotheses per locked decision
- SQLite GROUP BY self-join for slot coordination analysis — standard SQL pattern; verified conceptually against swaps table schema
- inquirer v9 interactive prompts — verified installed at `^9.2.12`; confirm prompt API is stable

### Tertiary (LOW confidence — requires validation during implementation)
- Helius `GET /v0/addresses/{mint}/transactions` for token creation lookup — not verified; needs implementation-time test
- Shared funder detection via `nativeTransfers` on coordination transactions — pattern is logical but accuracy depends on real Helius transaction shapes for bundled transactions
- Sniper launch-slot approximation accuracy — depends on how many tracked wallets have bought each token; may underperform with small wallet sets

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing libraries well-understood
- Architecture patterns: HIGH — derived from existing codebase structure and established patterns
- Detection algorithms (bundler, dev wallet): HIGH conceptually, MEDIUM on threshold values — thresholds are initial hypotheses per locked decision; need real data tuning
- Detection algorithms (sniper, wash trader): MEDIUM — more complex, higher false-positive risk; thresholds are more speculative
- DB schema changes: HIGH — SQLite + Drizzle pattern is established; enum extension is safe
- CLI extension pattern: HIGH — Commander.js pattern matches existing code exactly
- Helius supplemental API calls: MEDIUM — endpoint verified but exact response shape for mint lookups not confirmed

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (detection thresholds are hypotheses; expect iteration after first real data runs; Helius API surface is stable)
