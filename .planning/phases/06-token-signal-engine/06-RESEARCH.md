# Phase 6: Token Signal Engine - Research

**Researched:** 2026-03-15
**Domain:** Signal scoring engine — per-token 0-100 score derived from smart wallet activity, computed post-cycle in TypeScript/Drizzle/better-sqlite3
**Confidence:** HIGH — findings derived entirely from direct codebase inspection; no training-data-only claims

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Exit pressure**
- Exit pressure is a **separate indicator** stored alongside the signal score — it does NOT reduce the 0-100 score
- Store as a float field (e.g., `exit_pressure: 0.0–1.0`) on the token_signals record
- The buy signal score reflects buy-side smart money conviction; exit pressure lets Phase 7 show a directional overlay without polluting the score

**Signal tier label**
- Store a human-readable tier alongside the 0-100 score (e.g., `strong` / `moderate` / `weak`)
- Tier boundaries are Claude's discretion — enables easy filtering in Phase 7 without recalculating thresholds

### Claude's Discretion
- **Score formula weights** — Claude picks a balanced weighting across smart wallet count, buy velocity, PnL-weighted holder score. Suggested: PnL-weighted holder quality ~40%, buy velocity (1hr) ~35%, smart wallet count ~25%.
- **Buy velocity window** — Claude picks between strict 1hr or decaying multi-window (1hr primary, 6hr/24hr at reduced weight). Prefer whichever better distinguishes genuine signals from one-off noise.
- **Holder inclusion** — Claude decides whether to count only current holders or all recent buyers. Lean toward current holders for conviction signal, but note wallets that exited.
- **Minimum wallet floor** — Claude sets the minimum smart wallet count needed to emit a signal. Suggest 2 to filter single-wallet noise without being too restrictive.
- **Wallet score gate** — Claude decides if low-scoring wallets are weighted-by-score or excluded below a threshold. Prefer weighting over hard exclusion to preserve nuance.
- **Token eligibility filter** — Claude applies a minimal sanity filter (e.g., tokens with only 1 swap ever or no DEX pair are excluded). Avoid complex filtering; keep it simple.
- **Coordination detection** — Claude picks the approach: reuse existing bundler wallet flags first (no new infrastructure), fall back to funding-source clustering only if needed.
- **Discount mechanism** — Claude picks how coordination is applied (multiplier, cap, or exclusion). Prefer a continuous multiplier over hard cap for smoother scoring.
- **Coordination metadata** — Claude decides whether to store coordination details (e.g., `coordinated_wallet_count`) on the record. Lean toward storing it for Phase 7 explainability.
- **All-coordinated suppression** — Claude decides whether a fully-coordinated token emits a signal. Lean toward suppressing (no signal) when all holders are flagged as coordinated.
- **Signal lifecycle** — Claude decides what happens when a token has no smart wallet holders. Lean toward keeping the record with a stale/inactive marker rather than deleting (useful for Phase 7 history).
- **Computation placement** — Claude decides whether signal computation runs inside the 30s MonitorLoop cycle or as a decoupled post-cycle step. Prefer a post-cycle step for testability.
- **CLI exposure** — Claude decides whether a basic `signal list` CLI command is added. Lean toward adding a minimal one (top tokens by signal) so the engine can be manually verified before Phase 7.
- **History vs upsert** — Claude decides if token_signals is upsert-per-token or time-series. Lean toward latest-only upsert for Phase 6 simplicity; Phase 7 can add history if needed.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SGNL-01 | System computes a per-token signal score (0-100) based on: count of smart wallets holding, buy velocity in last 1h, exit pressure from sells, and PnL-weighted holder score | `token_signals` table already exists in schema with `signal_score`, `smart_wallet_count`, `buy_velocity_1h`, `exit_pressure`, `pnl_weighted_holder_score` columns. `wallet_metrics.score_total` is the per-wallet quality score (0-95). `swaps` table has `side`, `timestamp`, `token_mint`, `wallet_address` — all needed for velocity and pressure queries. New columns needed: `signal_tier` (text) and `coordinated_wallet_count` (integer). |
| SGNL-02 | System updates all token signals after each monitoring cycle completes | `MonitorLoop.runCycle()` in `src/monitor/loop.ts` ends after the wallet loop. Signal engine is called once per cycle after all wallet processing, not per wallet. Integration point: call `runSignalEngine()` at the end of `runCycle()`. |
| SGNL-03 | System discounts a token's signal score when its holders appear coordinated (share a common funding source) | `wallet_flags` table has `detector='bundler'` rows for all wallets identified as bundlers. Query: for each token, find smart wallet holders and cross-reference `wallet_flags` where `detector='bundler'` and `cleared=false`. Coordination discount = continuous multiplier (e.g., 0.5) applied proportionally to fraction of coordinated holders. |
</phase_requirements>

---

## Summary

Phase 6 builds a signal scoring engine that runs once per monitoring cycle after all wallets have been processed. The infrastructure is almost entirely pre-built: the `token_signals` table exists in the initial migration (0000), `wallet_metrics` holds per-wallet quality scores, `swaps` has the buy/sell history needed for velocity and pressure, and `wallet_flags` holds bundler coordination data that can be reused without any new infrastructure.

The core computation is a pure function: given a token mint, query the swaps table for recent activity and join with wallet_metrics for quality scores, then apply a coordination discount using existing bundler flags. The result maps cleanly to the existing `token_signals` schema, with two new columns needed (`signal_tier` and `coordinated_wallet_count`) requiring one migration.

The primary architectural decision is separation: the signal engine runs as a decoupled post-cycle function called from `MonitorLoop.runCycle()`, not inline with individual wallet processing. This mirrors the pattern established by `scoreWalletIfNeeded` and `runDetectionIfNeeded` — isolated, testable computation units that `runCycle()` orchestrates.

**Primary recommendation:** Implement signal scoring as `src/signals/engine.ts` with a single exported `computeAllTokenSignals()` function, called at the end of `MonitorLoop.runCycle()`. Mirror the `scoring/composer.ts` pattern: pure computation function + separate persistence function.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 (installed) | DB queries for swaps, wallet_metrics, wallet_flags, token_signals | Already used throughout; `onConflictDoUpdate` is the upsert pattern |
| better-sqlite3 | ^12.6.2 (installed) | SQLite driver — synchronous execution for all signal queries | All prior phases use this; no async overhead for local queries |
| TypeScript | ^5.3.3 (installed) | Type-safe signal computation | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chalk | ^5.3.0 (installed) | CLI output color coding for `signal list` | Score tier colorization (green/yellow/red) |
| cli-table3 | ^0.6.3 (installed) | Tabular CLI output | `signal list` command displaying top tokens |
| commander | ^11.1.0 (installed) | CLI command registration | Adding `signal` top-level command |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single upsert per token | Time-series inserts | Upsert is simpler, less storage, Phase 7 can add history; chosen per context decision |
| Bundler flags for coordination | New funding-source clustering | Flags already built in Phase 3, no new infrastructure needed |
| Post-cycle function | Per-wallet inline computation | Post-cycle is cleaner: one pass over all tokens, testable in isolation, no partial-cycle states |

**Installation:** No new packages needed. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── signals/
│   ├── engine.ts        # computeAllTokenSignals() — main entry point
│   ├── scorer.ts        # pure score computation (no DB I/O), testable
│   └── __tests__/
│       └── scorer.test.ts
└── commands/
    └── signal.ts        # createSignalCommand() for `signal list` CLI
```

### Pattern 1: Pure Computation + Separate Persistence (mirror scoring/)

**What:** Split signal computation into a pure function (`scorer.ts`) and a persistence function (`engine.ts`). The scorer takes pre-loaded data and returns a typed result. The engine queries the DB, calls the scorer, and writes results.

**When to use:** Always — this is the established project pattern (see `scoring/composer.ts` + `scoring/engine.ts`).

```typescript
// src/signals/scorer.ts
// Source: project pattern from src/scoring/composer.ts

export interface TokenSignalInputs {
  tokenMint: string;
  smartWalletHolders: Array<{
    walletAddress: string;
    walletScore: number;       // from wallet_metrics.score_total
    hasBuyIn1h: boolean;       // buy in last 1 hour window
    isCoordinated: boolean;    // has active bundler flag
    isCurrentHolder: boolean;  // has positive net position
  }>;
  buysLast1h: number;          // count of smart wallet buys in last 1h
  sellsLast1h: number;         // count of smart wallet sells in last 1h
  totalBuysLast24h: number;    // for denominator context
}

export interface TokenSignalResult {
  signalScore: number;              // 0-100, clamped
  signalTier: 'strong' | 'moderate' | 'weak' | 'inactive';
  smartWalletCount: integer;
  buyVelocity1h: number;           // buysLast1h / window_hours normalized to [0,100]
  exitPressure: number;            // 0.0–1.0, NOT part of signal_score
  pnlWeightedHolderScore: number;  // weighted average of holder wallet scores
  coordinationDiscount: number;    // multiplier applied (1.0 = no discount)
  coordinatedWalletCount: number;  // for Phase 7 explainability
}

// Weights (Claude's discretion — locked in scorer.ts as constants)
const WEIGHT_PNL_HOLDER_QUALITY = 0.40;
const WEIGHT_BUY_VELOCITY = 0.35;
const WEIGHT_SMART_WALLET_COUNT = 0.25;

// Tier thresholds
const TIER_STRONG = 65;
const TIER_MODERATE = 35;
// below 35 = weak; 0 = inactive (no eligible holders)

// Minimum floor
const MIN_SMART_WALLETS = 2;
```

### Pattern 2: Post-Cycle Hook in MonitorLoop

**What:** Call `computeAllTokenSignals()` once at the end of `runCycle()`, after the per-wallet loop completes. Returns a summary log line for the cycle log.

**When to use:** Every cycle, unconditionally.

```typescript
// src/monitor/loop.ts — end of runCycle()
// Source: project pattern, mirrors scoring/removal pattern

// After per-wallet loop...
const signalResult = computeAllTokenSignals();
console.log(
  `[monitor] signals updated — ${signalResult.updated} tokens, ${signalResult.suppressed} suppressed`
);
```

### Pattern 3: Upsert with onConflictDoUpdate (mirror wallet_metrics upsert)

**What:** Token signals are latest-only. Use Drizzle's `onConflictDoUpdate` on the `token_mint` unique constraint, updating all columns plus `updated_at`.

**When to use:** All signal writes.

```typescript
// Source: project pattern from src/scoring/engine.ts persistScore()
db.insert(token_signals).values({
  token_mint: result.tokenMint,
  signal_score: result.signalScore,
  signal_tier: result.signalTier,
  smart_wallet_count: result.smartWalletCount,
  buy_velocity_1h: result.buyVelocity1h,
  exit_pressure: result.exitPressure,
  pnl_weighted_holder_score: result.pnlWeightedHolderScore,
  coordination_discount: result.coordinationDiscount,
  coordinated_wallet_count: result.coordinatedWalletCount,
  updated_at: nowMs,
}).onConflictDoUpdate({
  target: token_signals.token_mint,
  set: { /* all fields */ updated_at: nowMs },
}).run();
```

### Pattern 4: Stale/Inactive Marker (not deletion)

**What:** When a token has no smart wallet holders after a cycle, update the existing record to `signal_score = 0`, `signal_tier = 'inactive'`, `smart_wallet_count = 0`, `updated_at = nowMs`. Do not delete the row.

**When to use:** Any token that had a signal record but now has zero eligible smart wallet holders.

### Anti-Patterns to Avoid
- **Running signal computation per-wallet inside the wallet loop:** Leads to partial-state scores (token A's score computed after wallet 1 but before wallet 3's new buys). Always run as a single post-cycle pass over all tokens.
- **Deleting token_signals rows when holders drop to zero:** Breaks Phase 7 history. Use `signal_tier = 'inactive'` marker instead.
- **Hard-excluding wallets below a score threshold:** Loses nuance for wallets near the threshold. Use score-weighted contributions; a wallet with score=20 contributes 20/100ths of its weight.
- **Including removed wallets (status='removed') in holder counts:** Removed wallets are no longer trustworthy signals. Filter to `wallets.status = 'tracked'` with `detection_status = 'confirmed_passing'`.
- **Computing buy velocity across all wallet swaps (not just smart wallets):** Velocity should only count confirmed-passing smart wallets, not all tracked wallets.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upsert | Custom INSERT or UPDATE with existence check | Drizzle `onConflictDoUpdate` | Race-condition safe, one DB round-trip |
| Coordination detection | New funding-source clustering | Existing `wallet_flags` where `detector='bundler'` | Phase 3 already built this; reuse avoids duplication |
| Score normalization | Custom sigmoid/tanh | Direct normalized formulas (same approach as `normalizeSharpeLike`) | Project already has this pattern — keep consistent |
| Wallet quality score | Re-compute wallet metrics | `wallet_metrics.score_total` (already persisted) | Phase 4 computed and stored this; just read it |

**Key insight:** The signal engine is a query + aggregation layer on top of data already computed by Phases 3 and 4. Almost nothing needs to be computed from scratch.

---

## Common Pitfalls

### Pitfall 1: Including Non-Passing Wallets in Smart Wallet Count
**What goes wrong:** Token gets a high signal score because a suspected bundler wallet holds it — inflating smart_wallet_count and pnl_weighted_holder_score.
**Why it happens:** Forgetting to join or filter on `wallets.detection_status = 'confirmed_passing'` AND `wallets.status = 'tracked'`.
**How to avoid:** Always join `swaps` with `wallets` and apply both filters. Only wallets with `detection_status = 'confirmed_passing'` and `status = 'tracked'` are "smart wallets" for signal purposes.
**Warning signs:** Tokens held entirely by newly-added wallets (still in `pending` detection status) showing high scores.

### Pitfall 2: Current Holder vs All-Time Buyer Confusion
**What goes wrong:** A token shows high holder score because 5 smart wallets bought it, but 4 of them have since sold — giving a misleading "still interested" signal.
**Why it happens:** Counting all wallets with any buy swap instead of computing net position.
**How to avoid:** Determine current holders by comparing total buy and sell token amounts per wallet per token. A wallet is a "current holder" if `SUM(token_amount WHERE side='buy') > SUM(token_amount WHERE side='sell')` for that token.
**Warning signs:** Signal scores that don't decay after a token drops off.

### Pitfall 3: Buy Velocity Window Using Wall-Clock Time vs Swap Timestamp
**What goes wrong:** Using `Date.now()` as the 1h anchor instead of the swap `timestamp` field (which is in Unix seconds from on-chain data).
**Why it happens:** Swaps timestamps are in seconds; `Date.now()` returns milliseconds. Off-by-1000x means a 1-hour window becomes either 3.6 seconds or 1000 hours.
**How to avoid:** The `swaps.timestamp` field is Unix seconds (confirmed by parsing code). `Date.now()` is milliseconds. Use `Math.floor(Date.now() / 1000) - 3600` as the 1h cutoff for swaps queries.
**Warning signs:** Buy velocity always 0 or always equal to total buy count.

### Pitfall 4: Missing Migration for New token_signals Columns
**What goes wrong:** `signal_tier` and `coordinated_wallet_count` columns do not exist in the actual SQLite database (they're in schema.ts but no migration adds them).
**Why it happens:** `token_signals` table was created in migration 0000 without these columns. Adding them to `schema.ts` alone does not auto-migrate.
**How to avoid:** Add a new Drizzle migration (e.g., `0005_token_signal_columns.sql`) with `ALTER TABLE token_signals ADD COLUMN signal_tier TEXT` and `ALTER TABLE token_signals ADD COLUMN coordinated_wallet_count INTEGER`.
**Warning signs:** Runtime error "table token_signals has no column named signal_tier" on first cycle.

### Pitfall 5: Coordination Discount Applied Twice
**What goes wrong:** The score is both penalized during PnL-weighted holder score calculation (by excluding coordinated wallets) AND penalized again via the `coordination_discount` multiplier.
**Why it happens:** Design ambiguity about whether coordinated wallets participate in intermediate calculations.
**How to avoid:** Include all eligible smart wallets (including coordinated ones) in ALL intermediate sub-scores. Apply the coordination discount as a single final multiplier on the raw composite score. Store `coordination_discount` as the actual multiplier (e.g., 0.6) for Phase 7 explainability.

### Pitfall 6: Signal Engine Crashing Stops the Monitor Loop
**What goes wrong:** An unhandled exception in `computeAllTokenSignals()` propagates to `runCycle()` and crashes the entire monitoring loop.
**Why it happens:** The signal engine is called at the end of `runCycle()`, which is already wrapped in a try/catch that handles crashes and restarts — but a crash here would abort cycle logging and restart after a delay.
**How to avoid:** Wrap the signal engine call in its own try/catch inside `runCycle()`. Signal computation failure should log a warning and continue — it does not require stopping the monitoring cycle.

---

## Code Examples

Verified patterns from project codebase:

### Querying Smart Wallet Holders for a Token
```typescript
// Source: adapted from src/scoring/engine.ts + src/db/schema.ts
// swaps.timestamp is Unix seconds (see src/parsers/swap.ts)
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { swaps, wallets, wallet_metrics, wallet_flags } from '../db/schema.js';

const oneHourAgoSec = Math.floor(Date.now() / 1000) - 3600;

// Step 1: Get all confirmed-passing tracked wallets
const smartWallets = db.select({ address: wallets.address })
  .from(wallets)
  .where(and(
    eq(wallets.status, 'tracked'),
    eq(wallets.detection_status, 'confirmed_passing'),
  ))
  .all();

const smartWalletAddresses = smartWallets.map(w => w.address);

// Step 2: Get all swaps for a token from smart wallets
const tokenSwaps = db.select()
  .from(swaps)
  .where(and(
    eq(swaps.token_mint, tokenMint),
    inArray(swaps.wallet_address, smartWalletAddresses),
  ))
  .all();
```

### Computing Current Holders (net-position approach)
```typescript
// Source: project pattern — uses swaps table columns confirmed in schema.ts
const holderMap = new Map<string, { buyAmt: number; sellAmt: number }>();
for (const swap of tokenSwaps) {
  if (!holderMap.has(swap.wallet_address)) {
    holderMap.set(swap.wallet_address, { buyAmt: 0, sellAmt: 0 });
  }
  const entry = holderMap.get(swap.wallet_address)!;
  if (swap.side === 'buy') entry.buyAmt += swap.token_amount;
  else entry.sellAmt += swap.token_amount;
}
const currentHolders = [...holderMap.entries()]
  .filter(([, pos]) => pos.buyAmt > pos.sellAmt)
  .map(([addr]) => addr);
```

### Coordination Detection Using Existing Bundler Flags
```typescript
// Source: project pattern — wallet_flags table from src/db/schema.ts
// Reuses Phase 3 detection infrastructure with no new queries
import { and, eq, inArray } from 'drizzle-orm';
import { wallet_flags } from '../db/schema.js';

const bundlerFlags = db.select({ wallet_address: wallet_flags.wallet_address })
  .from(wallet_flags)
  .where(and(
    inArray(wallet_flags.wallet_address, currentHolders),
    eq(wallet_flags.detector, 'bundler'),
    eq(wallet_flags.cleared, false),
  ))
  .all();

const coordinatedSet = new Set(bundlerFlags.map(f => f.wallet_address));
const coordinatedCount = coordinatedSet.size;
const coordinationRatio = currentHolders.length > 0
  ? coordinatedCount / currentHolders.length
  : 0;

// Continuous multiplier: 1.0 (no coordination) → 0.3 (all coordinated)
// Linear scale: multiplier = 1.0 - (coordinationRatio * 0.7)
const coordinationDiscount = 1.0 - (coordinationRatio * 0.7);
```

### Score Composition (recommended weights)
```typescript
// Source: Claude's discretion per CONTEXT.md
// Mirrors composeScore() pattern in src/scoring/composer.ts

const MIN_SMART_WALLETS = 2;
const WEIGHT_PNL_HOLDER_QUALITY = 0.40;
const WEIGHT_BUY_VELOCITY = 0.35;
const WEIGHT_SMART_WALLET_COUNT = 0.25;

function computeSignalScore(inputs: TokenSignalInputs): number {
  const { holders, buysLast1h } = inputs;
  if (holders.length < MIN_SMART_WALLETS) return 0; // below floor → no signal

  // Sub-score 1: PnL-weighted holder quality (0-100)
  const totalWeight = holders.reduce((sum, h) => sum + h.walletScore, 0);
  const pnlHolderScore = totalWeight > 0
    ? Math.min(100, (totalWeight / holders.length))
    : 0;

  // Sub-score 2: Buy velocity (0-100) — 5 buys/hr = score of 100
  const buyVelocityScore = Math.min(100, buysLast1h * 20);

  // Sub-score 3: Smart wallet count (0-100) — 10 holders = score of 100
  const walletCountScore = Math.min(100, holders.length * 10);

  // Composite raw score
  const rawScore =
    pnlHolderScore * WEIGHT_PNL_HOLDER_QUALITY +
    buyVelocityScore * WEIGHT_BUY_VELOCITY +
    walletCountScore * WEIGHT_SMART_WALLET_COUNT;

  // All-coordinated suppression: if all holders are flagged, emit no signal
  const allCoordinated = holders.every(h => h.isCoordinated);
  if (allCoordinated) return 0;

  // Apply coordination discount (continuous multiplier)
  return Math.round(Math.max(0, Math.min(100, rawScore * coordinationDiscount)));
}
```

### Signal Tier Assignment
```typescript
// Source: Claude's discretion per CONTEXT.md
function getSignalTier(score: number): 'strong' | 'moderate' | 'weak' | 'inactive' {
  if (score === 0) return 'inactive';
  if (score >= 65) return 'strong';
  if (score >= 35) return 'moderate';
  return 'weak';
}
```

### Drizzle Upsert for token_signals
```typescript
// Source: project pattern from src/scoring/engine.ts persistScore()
db.insert(token_signals).values({
  token_mint: tokenMint,
  signal_score: signalScore,
  signal_tier: signalTier,
  smart_wallet_count: holders.length,
  buy_velocity_1h: buyVelocity1h,
  exit_pressure: exitPressure,
  pnl_weighted_holder_score: pnlHolderScore,
  coordination_discount: coordinationDiscount,
  coordinated_wallet_count: coordinatedCount,
  updated_at: Date.now(),
}).onConflictDoUpdate({
  target: token_signals.token_mint,
  set: {
    signal_score: signalScore,
    signal_tier: signalTier,
    smart_wallet_count: holders.length,
    buy_velocity_1h: buyVelocity1h,
    exit_pressure: exitPressure,
    pnl_weighted_holder_score: pnlHolderScore,
    coordination_discount: coordinationDiscount,
    coordinated_wallet_count: coordinatedCount,
    updated_at: Date.now(),
  },
}).run();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-wallet signal computation inline with monitoring | Post-cycle aggregate pass over all tokens | Phase 6 design decision | Single consistent snapshot per cycle; avoids partial-state scores |
| Manual SQL migration files | Drizzle-managed migrations via `drizzle-kit generate` | Phase 1 | Use `drizzle-kit generate` to produce migration SQL, not hand-write |

**Deprecated/outdated:**
- Calling `drizzle-kit push` in development: project uses migration files (not push). Generate with `drizzle-kit generate`, apply via `migrate()` in `db/index.ts` on startup.

---

## Schema Delta for Phase 6

The `token_signals` table exists in migration 0000 but is missing two columns decided in CONTEXT.md:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `signal_tier` | TEXT | NULL | 'strong' / 'moderate' / 'weak' / 'inactive' |
| `coordinated_wallet_count` | INTEGER | NULL | Count of coordinated holders for Phase 7 explainability |

**Migration required:** One new migration file (e.g., `0005_token_signal_columns.sql`) with two `ALTER TABLE` statements.

Existing columns already in schema (no changes needed):
- `signal_score REAL` — the 0-100 score
- `smart_wallet_count INTEGER` — count of current smart wallet holders
- `buy_velocity_1h REAL` — buy velocity metric
- `exit_pressure REAL` — separate sell pressure indicator (NOT in score)
- `pnl_weighted_holder_score REAL` — weighted holder quality
- `coordination_discount REAL` — multiplier applied (e.g., 0.6)
- `updated_at INTEGER` — milliseconds timestamp

---

## Integration Points

### MonitorLoop Hook (SGNL-02)
```typescript
// src/monitor/loop.ts — inside runCycle() after the per-wallet loop
// Wrap in try/catch so signal failure never crashes the loop
try {
  const { updated, suppressed } = computeAllTokenSignals();
  console.log(`[monitor] signals — ${updated} updated, ${suppressed} suppressed`);
} catch (err) {
  console.error('[monitor] signal engine error (non-fatal):', err instanceof Error ? err.message : err);
}
```

### CLI Command (signal list)
- New top-level command: `echo signal list [--limit N]`
- Displays top tokens by `signal_score DESC` with tier, score, wallet count, buy velocity
- Mirrors `wallet score --all` output pattern from `src/commands/wallet.ts`
- Registered in `src/cli.ts` with `program.addCommand(createSignalCommand())`

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest (ESM mode) |
| Config file | `jest.config.cjs` |
| Quick run command | `pnpm test -- --testPathPattern="signals"` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SGNL-01 | Score computation formula with correct weights | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |
| SGNL-01 | Score clamps to [0, 100] for extreme inputs | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |
| SGNL-01 | Exit pressure stored but does not affect score | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |
| SGNL-01 | Minimum wallet floor suppresses signal below threshold | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |
| SGNL-01 | Signal tier boundaries (strong/moderate/weak/inactive) | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |
| SGNL-03 | Coordination discount applied as continuous multiplier | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |
| SGNL-03 | All-coordinated token emits signal_score=0 | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |
| SGNL-03 | Partial coordination produces proportional discount | unit | `pnpm test -- --testPathPattern="scorer"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- --testPathPattern="signals"`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/signals/__tests__/scorer.test.ts` — covers SGNL-01, SGNL-03 (pure function tests, no DB)
- [ ] `src/signals/__tests__/engine.test.ts` — optional integration smoke test with mock DB

*(Framework is fully configured — `jest.config.cjs` already covers `src/**/__tests__/**/*.test.ts` pattern. No framework install needed.)*

---

## Open Questions

1. **Token eligibility filter for minimal sanity check**
   - What we know: context says "tokens with only 1 swap ever or no DEX pair are excluded; keep it simple"
   - What's unclear: whether this should be a minimum buy-count threshold (e.g., ≥2 total buy swaps from smart wallets) or just the smart wallet floor (≥2 holders)
   - Recommendation: The minimum wallet floor (≥2 confirmed-passing holders) already handles most noise cases. Add a secondary check: ≥1 buy swap in the last 24h from any smart wallet to exclude tokens no one has touched recently. Avoids complex DEX pair lookups.

2. **Buy velocity normalization ceiling**
   - What we know: raw count of buys in 1h from smart wallets
   - What's unclear: what constitutes a "high velocity" signal (depends on how many wallets are tracked)
   - Recommendation: 5 buys/hr from distinct smart wallets → velocity sub-score of 100. This is calibrated for a system tracking ~10-50 smart wallets. Document the calibration constant so Phase 7 can surface it.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `src/db/schema.ts` — confirmed `token_signals` columns, existing schema
- Direct inspection of `src/db/migrations/` — confirmed migration history, missing columns
- Direct inspection of `src/monitor/loop.ts` — confirmed cycle structure and integration point
- Direct inspection of `src/scoring/engine.ts` and `src/scoring/composer.ts` — confirmed patterns for pure computation + persistence
- Direct inspection of `src/detection/engine.ts` and `src/detection/bundler.ts` — confirmed bundler flag structure for coordination reuse
- Direct inspection of `src/db/index.ts` — confirmed drizzle + better-sqlite3 + migrate-on-startup pattern
- Direct inspection of `package.json` — confirmed all dependencies installed, no new packages needed

### Secondary (MEDIUM confidence)
- None needed — all findings sourced from codebase

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed installed in package.json
- Architecture: HIGH — all patterns derived from existing Phase 3, 4, 5 implementations in codebase
- Pitfalls: HIGH — derived from actual schema and timestamp conventions in codebase
- Schema delta: HIGH — confirmed by direct migration file inspection

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable — no external API dependencies for signal computation)
