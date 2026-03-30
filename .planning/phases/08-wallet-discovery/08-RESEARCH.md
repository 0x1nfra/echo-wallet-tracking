# Phase 8: Wallet Discovery - Research

**Researched:** 2026-03-16
**Domain:** Solana on-chain wallet discovery via Helius API; SQLite schema extension for probation status; CLI command extension
**Confidence:** HIGH (stack is fully known; Helius API verified via official docs; patterns established by prior phases)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Discovery command UX:** Fit within existing `wallet` subcommand pattern consistent with `wallet add`, `wallet list`, etc.
- **Progress output:** Streaming log lines while running (e.g. "Fetching early buyers... Found 23 candidates... Scoring... Added 5 wallets")
- **Score threshold:** Default 70 (from roadmap), user can override per-run with `--min-score` flag
- **Already-tracked wallets:** Skip silently — no output when a discovered wallet is already being tracked
- **Traversal trigger:** Automatic after direct discovery — one command does both (extract early buyers + traverse graph)
- **CLI wallet list:** Two-section display — active wallets + probationary wallets shown separately
- **Dashboard:** Probationary wallets visible in their own section or tab (separate from active wallets)

### Claude's Discretion

- Command placement (wallet discover vs discover top-level)
- Final output format (all candidates vs added-only table)
- Dry-run flag decision
- Rejected wallet persistence
- Early buyer definition (time window vs first-N vs both)
- Graph traversal depth default and whether `--depth` flag is exposed
- Co-trader relationship definition
- Traversal scoring gate (same as direct vs stricter)
- Probation graduation notification
- Manual promotion command

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | User can trigger discovery from a token contract address to extract wallets that bought early and profited | Helius `/addresses/{mint}/transactions?type=SWAP&sort-order=asc` fetches early swaps; wallet buyer extraction from `tokenTransfers` in response |
| DISC-02 | System scores each candidate wallet and only adds those scoring above 70 | Existing `importWalletHistory` + `scoreWallet` pipeline reused; threshold gate applied before `db.insert(wallets)` |
| DISC-03 | Newly discovered wallets enter 7-day probation status and are excluded from signal scoring during probation | New `probation_until` column on `wallets`; signal engine query extended with `isNull(wallets.probation_until) OR lt(wallets.probation_until, nowMs)` guard |
| DISC-04 | System discovers additional wallet candidates via graph traversal (wallets that co-traded with known smart money) | For each already-tracked smart money wallet, fetch recent SWAP transactions; extract co-trader addresses that bought same tokens in same time window |
</phase_requirements>

---

## Summary

Phase 8 adds wallet discovery as a new `wallet discover <CA>` subcommand within the existing `wallet` command group. Discovery works in two stages: (1) direct extraction of early buyers from the token's mint address transaction history using the Helius Enhanced Transactions API, followed by (2) graph traversal — examining co-traders of already-tracked smart money wallets who appeared in the same token's early activity.

Discovered wallets are scored using the existing `importWalletHistory` + `scoreWallet` pipeline. Only wallets scoring above the threshold (default 70, `--min-score` override) are added to the `wallets` table. Wallets below threshold are either logged for auditability or discarded (Claude's discretion: logging them in a `discovery_candidates` table is recommended — see Architecture Patterns). All admitted wallets are given a `probation_until` timestamp (7 days from discovery) during which they are visible in the CLI `wallet list` probation section and the dashboard, but excluded from signal scoring.

The critical constraint for this phase is the Helius free-tier API rate: 10 RPS for Enhanced APIs (DAS) and 2 RPS for DAS-specific endpoints. The existing `heliusQueue` singleton (concurrency: 5) already handles rate limiting via `p-queue` + `p-retry`. Discovery runs are inherently sequential by design (it is a user-triggered CLI command, not a background loop), so rate budget is consumed only during the discovery window.

**Primary recommendation:** Place discovery as `wallet discover <CA>` within `src/commands/wallet.ts`, reuse the full existing import+score pipeline per candidate wallet, and gate signal engine queries on `probation_until IS NULL OR probation_until < now`. A new SQLite migration adds `probation_until` to `wallets` and a `discovery_candidates` table for audit/rejection persistence.

---

## Standard Stack

### Core (all already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `HeliusFetcher` (existing) | internal | Fetch SWAP transactions by address | Already rate-limited via heliusQueue; pRetry with 429 backoff already implemented |
| `better-sqlite3` / drizzle-orm | existing | Schema extension for `probation_until` and `discovery_candidates` | All prior schema changes used this pattern |
| `commander` | 11.1.0 | `wallet discover` subcommand | All CLI commands already use this |
| `ora` | 8.0.1 | Spinner during long discovery runs | Already available; streaming log lines satisfy the progress requirement |
| `chalk` + `cli-table3` | existing | Final output table | Same pattern as `wallet list` and `wallet score --all` |
| `p-queue` + `p-retry` | existing | Rate limiting during multi-wallet candidate scoring | Already wired via `heliusQueue` singleton in `helius.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dayjs` | 1.11.10 | `probation_until` date arithmetic | Computing 7-day window |
| `@solana/web3.js` | 1.87.6 | Address validation (base58 check) | Validate CA argument before first API call |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Helius Enhanced Transactions for mint SWAP history | Solana RPC `getSignaturesForAddress` + `getParsedTransaction` | Helius is pre-parsed and includes SwapEvent with token amounts; raw RPC requires two calls per tx and manual DEX parsing |
| `discovery_candidates` audit table | Discard rejected wallets | Audit table costs one SQL migration but enables future analysis of rejection patterns |

**Installation:** No new packages needed. All dependencies are already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
├── commands/
│   └── wallet.ts              # Add wallet.discover subcommand here
├── discovery/
│   ├── early-buyers.ts        # fetchEarlyBuyers(ca, limit, windowSecs): Promise<string[]>
│   ├── graph-traverse.ts      # fetchCoTraders(smartWallets, ca, windowSecs): Promise<string[]>
│   └── index.ts               # barrel: runDiscovery(ca, opts)
├── db/
│   └── migrations/
│       └── 0007_wallet_discovery.sql  # probation_until + discovery_candidates table
```

### Pattern 1: Early Buyer Extraction via Helius

**What:** Query the token mint's SWAP transaction history chronologically (oldest first) to identify which wallet addresses appeared in the first N buy transactions within an early time window.

**When to use:** Phase 1 of every discovery run.

**Early buyer definition (Claude's discretion recommendation):** Combine first-N AND time-window. Take the first 200 SWAP transactions for the mint (sortOrder: asc), filtered to within 30 minutes of the mint creation block time. This bounds the API cost to 2 pages (100 tx/page) and captures the "smart money enters early" signal reliably.

**Helius endpoint used:** `GET /v0/addresses/{mint}/transactions?api-key={key}&type=SWAP&sort-order=asc&limit=100`

**Buyer extraction from response:** Each `HeliusTransaction.tokenTransfers` contains `fromUserAccount` / `toUserAccount`. The buyer is `toUserAccount` when `toTokenAccount` receives the token (i.e., the wallet receiving the mint token). Alternatively, inspect `events.swap.tokenOutputs[].userAccount` in the SwapEvent.

**API cost estimate:**
- 2 pages × 1 Enhanced API call each = 2 API calls to get 200 early transactions for a mint
- At free tier (10 RPS Enhanced API): completes in <1 second
- Source: Helius docs confirmed `limit: 100` per request, `type=SWAP` filter supported

**Example:**
```typescript
// Source: Helius docs — /v0/addresses/{address}/transactions
// src/discovery/early-buyers.ts
async function fetchEarlyBuyers(
  fetcher: HeliusFetcher,
  mintAddress: string,
  maxBuyers: number = 200,
  earlyWindowMinutes: number = 30,
): Promise<string[]> {
  // Fetch first page with ascending sort (oldest first = earliest buyers)
  // Use fetcher.fetchOnePage() with sort-order=asc override
  // Extract toUserAccount from tokenTransfers where toMint === mintAddress
  // Filter to within earlyWindowMinutes of the first transaction's timestamp
  // Deduplicate addresses, return unique buyers
}
```

### Pattern 2: Graph Traversal — Co-Trader Discovery

**What:** For each already-tracked smart money wallet (status='tracked', detection_status='confirmed_passing'), fetch their recent SWAP history and find other wallets that also bought the same token within the same early-window timeframe.

**When to use:** Automatically after Phase 1 (direct extraction) within the same `wallet discover` command run.

**Co-trader definition (Claude's discretion recommendation):** Two wallets are co-traders if they both bought the same token within a 60-minute window of each other AND at least one is already tracked smart money. This is a stronger signal than simply appearing in the same token's buyer list.

**Traversal depth (Claude's discretion recommendation):** Depth 1 only. Depth 2 (co-traders of co-traders) would multiply API calls quadratically and would exceed free-tier budget within a single run. Do NOT expose `--depth` flag — the added complexity provides marginal signal benefit vs. API cost risk.

**Traversal gate (Claude's discretion recommendation):** Use the same threshold as direct discovery (`--min-score` value). No stricter gate needed; the scoring engine (win rate, Sharpe, recency) already adjusts for thin history.

**API cost estimate for traversal:**
- For each tracked smart money wallet (assume 20 wallets): 1 API call to get recent swaps = 20 calls
- For each co-trader candidate (assume 50 unique addresses across all): 1 full history import = 50 × (history pages) calls
- Worst case with 50 candidates × 10 pages average: 500 additional calls
- At free tier 10 RPS: completes in ~50 seconds of API time (acceptable for a CLI command)
- Rate limiting is handled by the existing `heliusQueue` singleton

**Example:**
```typescript
// src/discovery/graph-traverse.ts
async function fetchCoTraders(
  fetcher: HeliusFetcher,
  smartWalletAddresses: string[],
  tokenMint: string,
  earlyWindowSec: number,
): Promise<string[]> {
  const coTraders = new Set<string>();
  for (const smart of smartWalletAddresses) {
    // fetchOnePage(smart) to get recent swaps
    // Filter swaps touching tokenMint
    // For each matching swap, look at other wallet addresses in the tokenTransfers
    // that are within earlyWindowSec of smart's buy time
    // These are co-traders
  }
  return [...coTraders];
}
```

### Pattern 3: Probation via Schema Column (Not a New Status)

**What:** Add `probation_until INTEGER` (millisecond timestamp) to the `wallets` table. Probation is defined as `probation_until IS NOT NULL AND probation_until > now`. After 7 days, the column's value is in the past and the wallet naturally exits probation — no graduation job needed.

**Why a column instead of a new status enum value:** Avoids touching the 11 existing `eq(wallets.status, 'tracked')` queries scattered across the codebase. Probationary wallets ARE tracked — they just have a non-null `probation_until`. This is consistent with the Phase 2 precedent (SQLite enum expansion is schema-only, no SQL enforcement).

**Signal engine exclusion:** Add one `AND` clause to the smart wallet query in `src/signals/engine.ts`:
```typescript
// In computeAllTokenSignals() — Step 1 query
.where(and(
  eq(wallets.status, 'tracked'),
  eq(wallets.detection_status, 'confirmed_passing'),
  or(
    isNull(wallets.probation_until),
    lt(wallets.probation_until, nowMs),  // past → graduated
  ),
))
```

**Probation graduation (Claude's discretion recommendation):** Silent auto-graduation (no Telegram notification). The wallet simply starts contributing to token signals when `probation_until < now`. A notification adds complexity for marginal operational value — the user can check `wallet list` to see graduated wallets.

**Manual promotion (Claude's discretion recommendation):** Do NOT implement `wallet promote <address>`. The 7-day probation is a quality gate. Bypassing it undermines the signal integrity that the whole system is built on. Keep it consistent.

### Pattern 4: Candidate Persistence for Audit

**What:** A `discovery_candidates` table logs every evaluated address with its result (added, rejected_score, rejected_detection, duplicate_skip, duplicate_already_tracked).

**Why log rejections:** Enables the user to review what was found, debug threshold tuning, and potentially manually promote strong rejects. Costs one migration and one insert per candidate.

**Schema:**
```sql
CREATE TABLE discovery_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,           -- UUID per discovery run
  token_mint TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  source TEXT NOT NULL,           -- 'direct' | 'graph'
  score REAL,                     -- null if not scoreable
  result TEXT NOT NULL,           -- 'added' | 'rejected_score' | 'rejected_detection' | 'skipped_duplicate' | 'error'
  discovered_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
```

### Pattern 5: Streaming Progress Output

**What:** Use `console.log` lines (not `ora` spinner) for each stage, matching the stated UX requirement of "streaming log lines while running."

**Why not ora spinner:** Spinner is good for single-operation wait. Discovery has multiple distinct stages where knowing the count at each stage is more useful than a spinner animation.

**Example output flow:**
```
[discover] Fetching early buyers for CA: 7xKXtg2...
[discover] Found 23 candidates (direct)
[discover] Importing history for 23 wallets... (this may take a few minutes)
[discover] Scoring... wallet 1/23
...
[discover] Running graph traversal...
[discover] Found 12 co-trader candidates
[discover] Importing history for 12 co-traders...
[discover] Scoring... co-trader 1/12
[discover] Discovery complete — 5 added, 18 rejected (score), 2 skipped (already tracked)
```

### Anti-Patterns to Avoid

- **Adding 'probation' as a new status enum value:** Breaks all 11 existing `eq(wallets.status, 'tracked')` query sites; `probation_until` column is far less invasive.
- **Running discovery in the background/monitoring loop:** Discovery is expensive (many API calls, full history imports). It must remain user-triggered only.
- **Depth-2 graph traversal:** API call count grows O(candidates²); at free tier (10 RPS) this will take tens of minutes and likely exhaust the 1M monthly credit budget for a single run.
- **Skipping the scoring gate before `db.insert(wallets)`:** Discovered wallets that fail scoring must NOT enter the tracker — this is the core quality guarantee.
- **Triggering full detection on every candidate before scoring:** Detection is heavy. Gate on score first; skip detection entirely for rejected candidates (saves API calls).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting API calls during batch imports | Custom sleep loop | Existing `heliusQueue` (p-queue concurrency:5) in `helius.ts` | Already handles concurrent requests; adding sleep loops would serialize unnecessarily |
| Retry on 429 during discovery | Manual retry count | Existing `pRetry` in `fetchSwapHistory` | Already configured with 5 retries and exponential backoff |
| Address validation | Custom regex | `@solana/web3.js` `PublicKey` constructor | Throws on invalid base58; catches malformed CA before any API calls |
| History import + FIFO cost basis | Custom implementation | Existing `importWalletHistory()` | All parse/FIFO/detection wiring already correct; reuse exactly as `wallet add` uses it |
| Scoring pipeline | Custom implementation | Existing `scoreWallet()` | History must be complete before scoring; scoring engine already checks this gate |

**Key insight:** Phase 8 is almost entirely orchestration of existing services. The discovery command's job is: call APIs to get candidate addresses → pipe each through the existing import+score pipeline → gate on score threshold → set probation column.

---

## Common Pitfalls

### Pitfall 1: Helius DAS Rate Limit (2 RPS vs 10 RPS)

**What goes wrong:** The `getTokenAccounts` DAS endpoint is rate-limited at 2 req/s on the free tier (not 10 req/s like Enhanced Transactions). If the discovery code uses `getTokenAccounts` to enumerate holders, it will hit 429s very quickly.

**Why it happens:** DAS and Enhanced API have separate rate buckets. The existing `heliusQueue` is calibrated for Enhanced APIs (10 RPS effective via concurrency:5).

**How to avoid:** Use the Enhanced Transactions API `/addresses/{mint}/transactions?type=SWAP&sort-order=asc` approach (existing `HeliusFetcher.fetchOnePage()`) instead of `getTokenAccounts`. This endpoint is already integrated, rate-limited correctly, and returns parsed swap data including buyer addresses — which is exactly what early buyer extraction needs.

**Warning signs:** Seeing 429 errors during early buyer fetch; candidate list returns empty.

### Pitfall 2: Candidate Import Volume Exceeds Session Budget

**What goes wrong:** A popular token CA might yield 100+ early buyer candidates. Importing full 180-day history for 100 wallets requires ~100 × (average 5 pages) = 500 API calls, taking ~50 seconds at free tier. If the user is impatient and Ctrl+C mid-run, wallets are stuck in `status='importing'`.

**Why it happens:** `importWalletHistory` sets status='importing' before starting and 'tracked' on completion. The existing `resumeImportingWallets` recovery handles orphaned imports at next startup. But during a single discovery run, a very large CA input can create many simultaneous importing wallets.

**How to avoid:** Cap candidate count. Recommendation: hard cap at 50 direct candidates + 30 graph candidates (80 total). Display the cap in progress output. This bounds single-run API usage to ~800 calls max (~80 seconds at free tier).

**Warning signs:** Discovery command hangs for more than 2 minutes; `wallet list` shows many `importing` entries.

### Pitfall 3: Scoring Gate Ordering — Score Before Insert, Not After

**What goes wrong:** If the code inserts the wallet into `wallets` table (as 'tracked') and THEN scores it, a crash between insert and scoring leaves an unscored tracked wallet in the registry — exactly the "noise" the system exists to filter out.

**Why it happens:** It's tempting to reuse `wallet add` logic verbatim (which inserts first, then imports, then scores). But `wallet add` is manual — the user explicitly chose that wallet.

**How to avoid:** For discovered wallets, insert as `status='importing'` → import history → score → if score >= threshold, update to `status='tracked'` with `probation_until = now + 7d` → otherwise delete the row and log to `discovery_candidates` as rejected. This ensures the wallets table never contains an unscored discovered wallet.

**Warning signs:** `wallet list` shows tracked wallets with no score.

### Pitfall 4: Signal Engine Probation Exclusion Not Propagated

**What goes wrong:** `probation_until` column added to schema but the signal engine's smart wallet query is not updated — probationary wallets contribute to token signals from day 1, defeating the probation purpose.

**Why it happens:** The query in `src/signals/engine.ts` only filters on `status='tracked'` and `detection_status='confirmed_passing'`. Adding the `probation_until` column doesn't automatically affect it.

**How to avoid:** The signal engine query fix is a mandatory part of this phase (DISC-03). It must be part of the same migration wave as the schema change.

**Warning signs:** A newly discovered wallet immediately appears as a smart money holder in the dashboard signal feed.

### Pitfall 5: Drizzle Migration Timestamp Ordering

**What goes wrong:** Manual migration journal entry has a `when` timestamp ≤ the last migration's `when` value (1773510000001 from migration 0006). Drizzle's SQLiteDialect.migrate() only applies migrations where `folderMillis > lastDbMigration[2]`.

**Why it happens:** This has already bitten the project in Phase 6 (migration 0005 journal timestamp fix logged in STATE.md). Same pattern applies here for migration 0007.

**How to avoid:** Use `when: 1773510000002` (one millisecond after migration 0006's timestamp) in the `__drizzle_migrations` journal entry. Manually write migration SQL and register in journal per the Phase 4 and Phase 6 precedent.

**Warning signs:** Migration 0007 exists on disk but `discovery_candidates` table doesn't appear in the database; no error thrown.

### Pitfall 6: Already-Tracked Wallet Silent Skip Logic

**What goes wrong:** The check for "already tracked" uses the wrong status filter. A wallet could be in `status='removed'` — if you check `status IN ('tracked','probation')` only, removed wallets get re-added without proper re-import.

**Why it happens:** The wallets table retains rows for removed wallets (status='removed') for restoration purposes.

**How to avoid:** Before importing a discovered candidate, check if a row exists with ANY status. If status='tracked' or status='importing' or status='probation' → skip silently. If status='removed' → treat as a new discovery (existing swap data is preserved, re-score will work). Log appropriately.

---

## Code Examples

Verified patterns from this codebase:

### Adding a subcommand to `wallet` command group

```typescript
// Source: src/commands/wallet.ts — existing pattern for all wallet.* commands
wallet
  .command('discover <ca>')
  .description('Discover smart money wallets from a token contract address')
  .option('--min-score <n>', 'Minimum score threshold for adding wallets (default: 70)', '70')
  .option('--dry-run', 'Preview what would be added without writing to DB')
  .action(async (ca: string, options: { minScore: string; dryRun?: boolean }) => {
    // ... streaming log output + runDiscovery()
  });
```

### Manual migration pattern (established in Phase 4 and Phase 6)

```sql
-- src/db/migrations/0007_wallet_discovery.sql
ALTER TABLE `wallets` ADD `probation_until` integer;
--> statement-breakpoint
CREATE TABLE `discovery_candidates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` text NOT NULL,
  `token_mint` text NOT NULL,
  `wallet_address` text NOT NULL,
  `source` text NOT NULL,
  `score` real,
  `result` text NOT NULL,
  `discovered_at` integer NOT NULL DEFAULT (unixepoch('now') * 1000)
);
```

### Signal engine probation guard

```typescript
// Source: src/signals/engine.ts — extend existing query
import { and, eq, isNull, lt, or } from 'drizzle-orm';

const smartWalletRows = db.select({ address: wallets.address })
  .from(wallets)
  .where(and(
    eq(wallets.status, 'tracked'),
    eq(wallets.detection_status, 'confirmed_passing'),
    or(
      isNull(wallets.probation_until),
      lt(wallets.probation_until, nowMs),
    ),
  ))
  .all();
```

### Wallet list — probation section (CLI)

```typescript
// Source: pattern from existing two-section list in src/commands/wallet.ts
const probationRows = allRows.filter(r =>
  r.probation_until !== null && r.probation_until > Date.now()
);
// Render as separate section with "PROBATION UNTIL" column
```

### HeliusFetcher.fetchOnePage for mint discovery

```typescript
// Source: src/fetchers/helius.ts — fetchOnePage already exists
// Use it with a modified endpoint for ascending sort order:
// GET /addresses/{mint}/transactions?type=SWAP&sort-order=asc&limit=100
// Note: fetchOnePage doesn't support sort-order param currently.
// Discovery module will need to call the endpoint directly via heliusQueue
// OR extend HeliusFetcher with a fetchEarlySwapsForMint() method.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global heliusQueue interval/intervalCap | Concurrency: 5 p-queue | Phase 5 | Allows parallel wallet fetches during monitoring loop |
| Single-status wallet tracking | Multi-status with `status` enum | Phase 1 | `importing` stage enables crash recovery |
| No rate awareness | pRetry with 429-specific backoff | Phase 5 | Discovery inherits this for free |

**Deprecated/outdated:**
- `HeliusFetcher.getTransactions()` (old method): Still present in `helius.ts` but superseded by `fetchSwapHistory` and `fetchOnePage`. Discovery should use `fetchOnePage` or a new `fetchEarlySwapsForMint()` method — not the old `getTransactions`.

---

## Discretion Recommendations (Summary)

All Claude's Discretion items resolved here for the planner:

| Area | Recommendation | Rationale |
|------|---------------|-----------|
| Command placement | `wallet discover <CA>` (within wallet subcommand group) | Consistent with `wallet add`, `wallet list`; avoids a new top-level command |
| Final output format | Added-only table + summary line for rejections | "Added 5 wallets" is what matters operationally; rejected count as summary is enough |
| Dry-run flag | Include `--dry-run` | High utility: lets user preview token CA quality before committing 5+ minute import runs |
| Rejected wallet persistence | Persist to `discovery_candidates` table | Auditability worth the migration cost |
| Early buyer definition | First 200 SWAP txs within 30 minutes of launch | Bounded API cost; captures smart money early signal |
| Traversal depth | Depth 1 only; no `--depth` flag | Free-tier budget constraint; quadratic API cost at depth 2 is unacceptable |
| Co-trader definition | Same token bought within 60 minutes of a tracked smart wallet's buy | Strong overlap signal without requiring same block |
| Traversal scoring gate | Same threshold as direct (`--min-score`) | No reason to apply a stricter gate; scoring engine handles thin history |
| Probation graduation | Silent auto-graduation (no notification) | Low operational value; adds complexity |
| Manual promotion | Do NOT implement `wallet promote` | Probation is a quality gate; bypassing it undermines signal integrity |
| Candidate cap | 50 direct + 30 graph (80 max per run) | Bounds single-run at ~800 API calls; ~80 seconds at free tier |

---

## Open Questions

1. **HeliusFetcher sort-order parameter for early buyer fetch**
   - What we know: `fetchOnePage()` exists but doesn't accept `sort-order` or `type` parameters
   - What's unclear: Whether to add a new method `fetchEarlySwapsForMint()` to `HeliusFetcher` or call the Helius endpoint directly in the discovery module
   - Recommendation: Add `fetchEarlySwapsForMint(mint, limit, sortOrder)` to `HeliusFetcher` — keeps API coupling in the fetcher layer, consistent with existing patterns

2. **Helius `getTransactionsForAddress` (RPC method) vs Enhanced API**
   - What we know: `getTransactionsForAddress` costs 100 credits per call and requires Developer plan or higher; Enhanced API is included in free tier
   - What's unclear: Whether free tier has access to `sort-order=asc` on the Enhanced endpoint
   - Recommendation: Use Enhanced Transactions API (`/addresses/{mint}/transactions?sort-order=asc`) which is confirmed free-tier accessible; avoid `getTransactionsForAddress` RPC method due to credit cost

3. **Migration 0007 `when` timestamp**
   - What we know: Must exceed 1773510000001 (migration 0006's `when` value per STATE.md)
   - Recommendation: Use `1773510000002` — established precedent from Phase 6

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest 29.1.1 |
| Config file | `jest.config.cjs` |
| Quick run command | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery` |
| Full suite command | `NODE_OPTIONS=--experimental-vm-modules pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | `fetchEarlyBuyers(mint)` returns deduplicated buyer addresses | unit | `pnpm test -- --testPathPattern discovery/early-buyers` | Wave 0 |
| DISC-01 | Buyer extraction correctly reads `toUserAccount` from tokenTransfers | unit | `pnpm test -- --testPathPattern discovery/early-buyers` | Wave 0 |
| DISC-02 | Wallets below threshold are not inserted into wallets table | unit | `pnpm test -- --testPathPattern discovery` | Wave 0 |
| DISC-02 | Wallets above threshold are inserted with `probation_until` set | unit | `pnpm test -- --testPathPattern discovery` | Wave 0 |
| DISC-03 | Signal engine excludes probationary wallets from smart wallet query | unit | `pnpm test -- --testPathPattern signals/engine` | ❌ Wave 0 — extend existing `src/signals/__tests__/engine.test.ts` |
| DISC-03 | Wallet with `probation_until > now` does not appear in signal computation | unit | same as above | ❌ Wave 0 |
| DISC-03 | Wallet with `probation_until < now` (graduated) appears in signal computation | unit | same as above | ❌ Wave 0 |
| DISC-04 | `fetchCoTraders(smartWallets, tokenMint, windowSec)` returns co-trader addresses | unit | `pnpm test -- --testPathPattern discovery/graph-traverse` | Wave 0 |
| DISC-04 | Already-tracked wallets are excluded from co-trader results | unit | `pnpm test -- --testPathPattern discovery/graph-traverse` | Wave 0 |

### Sampling Rate

- **Per task commit:** `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery`
- **Per wave merge:** `NODE_OPTIONS=--experimental-vm-modules pnpm test` (all 167+ tests)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/discovery/__tests__/early-buyers.test.ts` — covers DISC-01 buyer extraction with mock HeliusTransaction fixtures
- [ ] `src/discovery/__tests__/graph-traverse.test.ts` — covers DISC-04 co-trader extraction with mock swap data
- [ ] `src/discovery/__tests__/discovery.test.ts` — covers DISC-02 threshold gate (mock importWalletHistory + scoreWallet)
- [ ] Extend `src/signals/__tests__/engine.test.ts` — add 3 test cases for probation_until guard (covers DISC-03)
- [ ] Migration 0007 SQL file and drizzle meta journal entry

---

## Sources

### Primary (HIGH confidence)

- Helius official docs `https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress` — Enhanced Transactions API parameters, SWAP type filter, sort-order, pagination
- Helius official docs `https://www.helius.dev/docs/api-reference/das/gettokenaccounts` — DAS getTokenAccounts parameters and pagination
- Helius official docs `https://www.helius.dev/docs/billing/rate-limits` — confirmed free tier: 10 RPS (RPC), 2 RPS (DAS), 1M credits/month
- Helius official pricing `https://www.helius.dev/pricing` — free tier: 10 RPC req/s = 600 req/min max
- Helius RPC docs `https://www.helius.dev/docs/rpc/gettransactionsforaddress` — 100 credits/call, requires Developer plan or higher
- Project codebase `src/fetchers/helius.ts` — heliusQueue concurrency:5, pRetry 5 retries with 429 backoff
- Project codebase `src/signals/engine.ts` — exact query that needs `probation_until` guard added
- Project codebase `src/db/schema.ts` — current wallets enum: `['tracked', 'removed', 'importing']`
- Project STATE.md — "Manual migration journal when must exceed lastDbMigration.created_at" and "migration 0006 when=1773510000001"

### Secondary (MEDIUM confidence)

- `https://www.helius.dev/blog/how-to-get-token-holders-on-solana` — confirmed 1000 token accounts per page limit; pagination via cursor

### Tertiary (LOW confidence)

- Community pattern (Nansen blog, GMGN tooling descriptions) — confirmed that "first 70 buyers" / early buyer analysis is the established smart money discovery pattern in Solana tooling; unverified exact implementation details

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already in use with established patterns
- Architecture: HIGH — Helius endpoint behavior verified via official docs; schema pattern established by 6 prior migrations; signal engine query pattern directly read from source
- API rate limits: HIGH — verified via official Helius pricing and rate-limits pages (2026-03-16)
- Pitfalls: HIGH for migration/schema pitfalls (documented in STATE.md); MEDIUM for API edge cases (early buyer extraction from tokenTransfers requires testing against real Helius responses)

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (Helius rate limits and API structure are stable; 30-day validity)
