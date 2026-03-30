# Phase 12: Signal Accuracy Logging - Research

**Researched:** 2026-03-27
**Domain:** Event logging, scheduled outcome resolution, price feed integration, accuracy stats aggregation
**Confidence:** HIGH — all findings based on existing codebase inspection and confirmed ecosystem patterns

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Accuracy definition:** Signal is "correct" if price rises by tiered threshold within outcome window. Strong (≥65) requires higher % gain than Moderate (≥35). Suggested: Strong ≥ +50%, Moderate ≥ +25%. Track false positives too (log significant drops).
- **Baseline / control group:** Weak signals (<35) ARE logged but excluded from primary accuracy display. Control group sampling of random new token launches: Claude's discretion on feasibility.
- **Entry price definition:** Entry price = token price at moment the tier transition is logged (not wallet entry, not launch price). Outcome % = `(price_at_window - entry_price) / entry_price`.
- **Signal fire timestamp precision:** Log EVERY tier transition as a separate event (Weak→Strong→Weak→Strong = 4 rows). Outcome windows measured from each individual transition timestamp.
- **Outcome capture timing:** 1h, 4h, 24h windows per signal event. Automatic background job — no manual CLI step. Price data from external feed (Jupiter, Birdeye, or DexScreener) — NOT Helius, NOT derived from swaps.
- **Rug / dead token handling:** No liquidity at outcome check time = mark outcome as `failed` (not inconclusive). Outcomes locked at check time — no retroactive updates.
- **What gets logged:** `signal_score`, `tier`, `smart_wallet_count`, `buy_velocity`, `holder_score`, `holder_count`, `coordinated_wallet_count`, `entry_price`, `token_mint`, `timestamp` — captured at tier transition moment.
- **Hit rate calculation:** `(signals that met threshold) / (total signals with resolved outcomes)`. Pending outcomes excluded. Failed (rugs) count in denominator.
- **Minimum sample size:** Accuracy stats shown only after N=20 signals per tier. Below threshold: "Insufficient data (X/20)".
- **How accuracy is surfaced:** Dashboard new section (aggregate stats at top + recent signal events table with all three window columns). Telegram `/accuracy` command. No CLI command.

### Claude's Discretion

- **Price capture at signal time:** Determine whether to fetch immediately or reconstruct from nearest swap.
- **Retention policy:** Determine appropriate retention window (30 days, 90 days, or indefinite).
- **Control group feasibility:** Whether to sample random token launches as baseline comparison.
- **Telegram `/accuracy` timing/frequency:** Daily digest, weekly, or on-demand.
- **Exact accuracy thresholds:** Strong ≥ +50%, Moderate ≥ +25% are suggested — must be explicitly documented in plan.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-01 | System logs token outcomes after each signal fires (did the token pump or dump?) | New `signal_events` table captures snapshot at tier transition; new `signal_outcomes` table stores 1h/4h/24h price results. Background scheduler resolves outcomes. |
| QUAL-02 | System tracks signal accuracy rate over time (% of high-score signals that resulted in price increases) | Accuracy query aggregates resolved outcomes by tier; hit rate = met_threshold / total_resolved. Dashboard and Telegram surfaces expose this. |
| QUAL-03 | System supports manual score weight calibration based on historical signal outcomes | Logging the full sub-score snapshot (holder_score, buy_velocity, etc.) alongside outcome enables correlation analysis. Direct weight calibration UI is out of scope for Phase 12 — but the data foundation is built here. |
</phase_requirements>

---

## Summary

Phase 12 introduces two new tables, a background outcome scheduler, a price-fetch integration, accuracy query logic, and two UI surfaces (dashboard section + Telegram command). The system already has the key building blocks: DexScreener price fetcher exists (`src/fetchers/dexscreener.ts`), the signal engine already computes all required snapshot fields, the monitoring loop fires every 30 seconds and emits `cycleEmitter` events, the bot uses grammy and registers commands in `src/api/bot/commands.ts`, and the dashboard uses HTMX + EJS partials for live-updating UI sections.

The central design challenge is **tier transition detection**: the current `token_signals` table is an upsert-based "latest state" table with one row per token — it does not preserve prior tiers. The signal engine must be hooked to detect when the computed tier differs from the stored tier, and only then insert a new row into `signal_events`. This is a read-before-write pattern within the signal engine cycle. The second challenge is **outcome scheduling**: SQLite has no built-in scheduler, so outcome resolution must be driven by the monitoring loop itself — on each cycle, query `signal_events` rows with `outcome_1h_price IS NULL AND fired_at <= now - 1h` (and similarly for 4h and 24h) and fetch prices for those tokens.

The DexScreener fetcher already handles the price fetch with liquidity detection, returning `null` when no Solana pairs exist — this maps directly to the `failed` rug outcome. Rate limiting requires sequencing price fetches: the existing implementation uses 200ms delays between calls, which is sufficient for typical cycle loads (most cycles will have only a few pending outcome checks). The `holder_score` field from the context spec maps to `pnl_weighted_holder_score` in the signal engine output — the schema field name will need to align.

**Primary recommendation:** Use the monitoring loop's existing cycle hook as the outcome resolution driver. Add `signal_events` + `signal_outcomes` tables, hook the signal engine to detect tier transitions and insert event rows (with immediate price fetch for entry price), then resolve outcome windows passively each cycle via DexScreener.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 (already installed) | ORM for new tables and queries | Already the project ORM — all schema changes go here |
| drizzle-kit | ^0.31.9 (already installed) | Migration generation | Already configured in `drizzle.config.ts` |
| better-sqlite3 | ^12.6.2 (already installed) | SQLite driver | Already the project DB |
| axios | ^1.6.2 (already installed) | DexScreener API calls | Already used in `DexScreenerFetcher` |
| grammy | ^1.41.1 (already installed) | Telegram bot commands | Already the project bot framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new libraries required | — | — | All functionality is achievable with the existing stack |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Monitoring loop as scheduler | node-cron or separate process | Loop-driven is simpler — avoids another process, already battle-tested in the project. Separate cron would be needed only if outcome windows needed sub-30s precision, which they don't (1h/4h/24h windows). |
| DexScreener price feed | Jupiter Price API, Birdeye | DexScreener fetcher already exists and is working. Jupiter Price API is faster but requires a paid key. Birdeye has better historical data but adds API key management. DexScreener is the right choice — zero new infrastructure. |
| Polling outcomes per cycle | Separate scheduled worker | Polling per cycle keeps everything synchronous and avoids concurrency issues with SQLite WAL mode. Separate worker would require IPC to share the SQLite connection. |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
src/
├── signals/
│   ├── engine.ts           # MODIFY: add tier transition detection + event logging hook
│   ├── accuracy.ts         # NEW: accuracy query logic (hit rates, avg return, tier aggregates)
│   └── outcome-resolver.ts # NEW: resolves pending outcome windows via DexScreener
├── db/
│   ├── schema.ts           # MODIFY: add signal_events + signal_outcomes tables
│   └── migrations/
│       └── 0009_signal_accuracy.sql  # NEW: migration for two new tables
├── api/
│   ├── routes/
│   │   └── accuracy.ts     # NEW: /api/accuracy REST endpoint + /api/accuracy/partial HTMX
│   ├── views/
│   │   ├── dashboard.ejs   # MODIFY: add accuracy section at top
│   │   └── partials/
│   │       └── accuracy_stats.ejs   # NEW: accuracy stats partial (HTMX-refreshed)
│   └── bot/
│       └── commands.ts     # MODIFY: add /accuracy command
└── monitor/
    └── loop.ts             # MODIFY: call outcome resolver after signal engine
```

### Pattern 1: Tier Transition Detection (Read-Before-Write in Signal Engine)

**What:** Before upserting into `token_signals`, read the current tier from `token_signals`. If the computed tier differs from the stored tier (or no row exists and score > 0), insert a row into `signal_events`.

**When to use:** Inside `computeAllTokenSignals()` in `engine.ts`, per-token in the existing loop.

**Key insight:** The current engine loops `for (const tokenMint of allTokenMints)` and already reads existing active records to detect suppression. The tier transition check fits naturally in that same per-token block.

```typescript
// Conceptual pattern — inside the per-token loop in engine.ts
const existingSignal = db.select({ signal_tier: token_signals.signal_tier, signal_score: token_signals.signal_score })
  .from(token_signals)
  .where(eq(token_signals.token_mint, tokenMint))
  .get();

const prevTier = existingSignal?.signal_tier ?? null;
const newTier = result.signalTier;

// Tier transition detected: any change from/to a non-inactive tier, OR first appearance
const isTransition = prevTier !== newTier && (newTier !== 'inactive' || prevTier !== null);

if (isTransition && newTier !== 'inactive') {
  // Fetch entry price immediately
  const entryPrice = await dexScreener.getTokenPrice(tokenMint);
  db.insert(signal_events).values({
    token_mint: tokenMint,
    signal_score: result.signalScore,
    tier: newTier,
    smart_wallet_count: result.smartWalletCount,
    buy_velocity: result.buyVelocity1h,
    holder_score: result.pnlWeightedHolderScore,
    holder_count: result.smartWalletCount,
    coordinated_wallet_count: result.coordinatedWalletCount,
    entry_price: entryPrice,
    fired_at: nowMs,
  }).run();
}
```

**Note:** `computeAllTokenSignals()` is currently synchronous (`function`, not `async function`). Adding a price fetch makes it async. The caller in `monitor/loop.ts` already awaits async functions — this change is contained.

### Pattern 2: Loop-Driven Outcome Resolution

**What:** After each monitoring cycle completes signals, call `resolveOutcomes()`. It queries `signal_events` rows where outcome windows are due but not yet resolved, fetches prices, writes results.

**When to use:** In `monitor/loop.ts`, after `computeAllTokenSignals()` call (same non-fatal try/catch block).

```typescript
// In monitor/loop.ts, after computeAllTokenSignals()
const resolved = await resolveOutcomes();
console.log(`[monitor] outcomes resolved: ${resolved}`);
```

**`resolveOutcomes()` logic (in `src/signals/outcome-resolver.ts`):**
1. Query `signal_events` rows where `outcome_1h_price IS NULL AND fired_at <= now - 3600000` → fetch price → update `outcome_1h_price`, compute `outcome_1h_pct`, set `outcome_1h_status` (hit/miss/failed)
2. Repeat for 4h and 24h
3. Mark `is_fully_resolved = true` once all three windows have outcomes

**Rate limit awareness:** In the worst case, a single cycle might need to resolve multiple outcome checks. DexScreener allows ~300 req/min (5/req·sec). The existing batch fetcher uses 200ms delays. For safety, the resolver should process at most 20 tokens per cycle (well within rate limits) and let remaining ones catch up on subsequent cycles.

### Pattern 3: Accuracy Query Aggregation

**What:** SQL aggregation over `signal_events` joined to resolved outcomes.

**Schema for query (conceptual):**

```sql
-- Hit rate by tier (Strong/Moderate only, N>=20)
SELECT
  tier,
  COUNT(*) AS total_resolved,
  SUM(CASE WHEN outcome_24h_status = 'hit' THEN 1 ELSE 0 END) AS hits,
  AVG(outcome_1h_pct) AS avg_return_1h,
  AVG(outcome_4h_pct) AS avg_return_4h,
  AVG(outcome_24h_pct) AS avg_return_24h
FROM signal_events
WHERE is_fully_resolved = 1
  AND tier IN ('strong', 'moderate')
GROUP BY tier
```

**Hit rate calculation note:** The denominator includes `failed` (rug) outcomes because `is_fully_resolved = 1` covers all locked outcomes.

### Pattern 4: Dashboard Accuracy Section (HTMX Pattern)

**What:** New `<section>` in `dashboard.ejs` placed before the Signal Feed section. Uses same HTMX SSE pattern already established: `hx-trigger="sse:cycle"` to refresh on each monitor cycle.

**New route:** `GET /api/accuracy/partial` → renders `partials/accuracy_stats.ejs`

**EJS structure:**
- Top block: aggregate stats table (tier | total signals | hit rate | avg 1h | avg 4h | avg 24h)
- Conditional "Insufficient data" guard per tier
- Bottom block: recent signal events table (token | score | tier | entry price | 1h | 4h | 24h | fired_at)

### Anti-Patterns to Avoid

- **Batch-fetching entry price from swap history:** Reconstructing entry price from the nearest swap is tempting but inaccurate — swaps are in SOL, prices fluctuate within a transaction block, and the `swaps` table only has SOL amounts (not USD). Fetch from DexScreener immediately at transition time.
- **Retroactive outcome updates:** Locked by design decision. Do not query or update `outcome_Xh_price` once set.
- **Storing raw liquidity USD in outcome:** Not needed — `null` price response from DexScreener already signals rug/no-liquidity. Use `null` price → `failed` status.
- **Single `signal_outcomes` table with foreign key:** Two separate tables (events + outcomes) add complexity without benefit here. Use a single `signal_events` table with all outcome columns inline. This avoids joins in the accuracy query and simplifies the resolver.
- **Async engine breaking existing tests:** `computeAllTokenSignals` becoming async requires updating `signals/__tests__/` test expectations. Must check test files and update accordingly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Price feed integration | Custom HTTP client for DexScreener | `DexScreenerFetcher` (already exists in `src/fetchers/dexscreener.ts`) | Already handles rate limits, null returns for dead tokens, Solana pair filtering by liquidity |
| Schema migrations | Hand-written SQL in `schema.ts` | `drizzle-kit generate` then manual apply | Keeps migration journal consistent — already established workflow in project |
| Background scheduling | `node-cron`, `setInterval` | Monitoring loop cycle hook | Loop already runs every 30s, already has non-fatal try/catch wrapping — outcome checks are cheap and idempotent |
| Telegram command registration | New bot infrastructure | Extend `registerCommands()` in `src/api/bot/commands.ts` | Pattern already established; `/status`, `/top`, `/wallet`, `/signal` all follow the same structure |
| HTMX partials plumbing | Full-page refresh | SSE + `hx-trigger="sse:cycle"` on new partial | Same pattern as `signal_rows` partial — proven in the existing dashboard |

**Key insight:** The entire phase can be delivered by extending existing files + adding 3-4 new files. No new dependencies, no new processes.

---

## Common Pitfalls

### Pitfall 1: `computeAllTokenSignals` synchronous contract broken
**What goes wrong:** Adding `await dexScreener.getTokenPrice(tokenMint)` inside the function body makes it async. The function signature changes from `function computeAllTokenSignals()` to `async function computeAllTokenSignals()`. The call site in `monitor/loop.ts` already has `computeAllTokenSignals()` wrapped in a try/catch but is called with `const { updated, suppressed } = computeAllTokenSignals()` — must become `await computeAllTokenSignals()`.
**Why it happens:** TypeScript allows calling an async function without await (returns Promise, not the value) — the destructure of `{ updated, suppressed }` would silently fail at runtime.
**How to avoid:** Update both the function signature AND the call site in `loop.ts` in the same task. Run `tsc --noEmit` to verify.
**Warning signs:** `updated` and `suppressed` log as `undefined` in monitor output.

### Pitfall 2: Tier transition false-fires on system restart
**What goes wrong:** On first cycle after restart, `signal_events` has no prior state. All tokens currently scoring >0 would appear as "new transitions" and generate new signal events — creating spurious accuracy log entries for tokens already mid-lifecycle.
**Why it happens:** The detection logic compares `prevTier` from `token_signals` to `newTier`. On restart the data is still there, so this should actually work correctly — BUT if the DB is wiped or seeded, all active tokens fire immediately.
**How to avoid:** The transition check `prevTier !== newTier` handles this correctly as long as `token_signals` persists across restarts (which it does — it's SQLite). The only real risk is a fresh DB.  Document this behavior.

### Pitfall 3: DexScreener rate limits during bulk outcome resolution
**What goes wrong:** If the system has been offline for hours and resumes, many outcome windows become due simultaneously. A single resolution pass could trigger dozens of DexScreener calls in sequence.
**Why it happens:** The resolver queries all due windows without batching limits.
**How to avoid:** Cap resolution at N=20 tokens per cycle. Due tokens not resolved in one cycle will be resolved in subsequent cycles within minutes.

### Pitfall 4: `holder_count` vs `smart_wallet_count` naming ambiguity
**What goes wrong:** The context spec lists `holder_count` as a separate field from `smart_wallet_count` in the snapshot. However, the signal engine result type only has `smartWalletCount` (the count of current holders). There is no separate raw `holder_count`.
**Why it happens:** The context spec was written from a product perspective; the engine exposes `smartWalletCount` which IS the holder count (count of wallets with `isCurrentHolder=true`).
**How to avoid:** In `signal_events` schema, use a single column `smart_wallet_count` for this value. Do not create a separate `holder_count` column — they refer to the same metric.

### Pitfall 5: Accuracy stats returning for `inactive` tier
**What goes wrong:** If `signal_events` logs all tier transitions including to `inactive`, and the accuracy query doesn't filter, the `inactive` tier would appear in accuracy stats with misleading numbers.
**Why it happens:** The context decision says "All tier transitions logged (including Weak)" — but doesn't explicitly say inactive transitions are logged.
**How to avoid:** Only insert into `signal_events` when `newTier` is `strong`, `moderate`, or `weak` (i.e., `signal_score > 0`). A transition TO `inactive` does not constitute a new signal event to measure. Transitions FROM inactive to active are captured by the new-tier side.

### Pitfall 6: SQLite concurrency during outcome resolution
**What goes wrong:** The monitor loop is async and iterates wallets sequentially. The outcome resolver runs at the end of each cycle synchronously (SQLite is synchronous). However, if two cycles overlap (edge case: cycle takes > 30s), the same outcome rows could be processed twice.
**Why it happens:** The `cycleRunning` guard exists in `MonitorLoop` but is not enforced in the current code review (no `cycleRunning` check before scheduling next tick).
**How to avoid:** In the resolver, use `UPDATE ... WHERE outcome_Xh_price IS NULL` so that a second concurrent write is a no-op (writes the same resolved value twice, which is fine since outcomes are locked).

---

## Code Examples

### Schema: Two new tables

```typescript
// In src/db/schema.ts — add alongside existing tables

export const signal_events = sqliteTable('signal_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_mint: text('token_mint').notNull(),
  fired_at: integer('fired_at', { mode: 'number' }).notNull(),  // ms timestamp of tier transition
  tier: text('tier', { enum: ['strong', 'moderate', 'weak'] }).notNull(),
  signal_score: real('signal_score').notNull(),
  smart_wallet_count: integer('smart_wallet_count').notNull(),
  buy_velocity: real('buy_velocity').notNull(),
  holder_score: real('holder_score').notNull(),        // maps to pnl_weighted_holder_score
  coordinated_wallet_count: integer('coordinated_wallet_count').notNull(),
  entry_price: real('entry_price'),                   // null if DexScreener unavailable at fire time
  // Outcome columns — null until resolved
  outcome_1h_price: real('outcome_1h_price'),
  outcome_1h_pct: real('outcome_1h_pct'),
  outcome_1h_status: text('outcome_1h_status', { enum: ['hit', 'miss', 'failed'] }),
  outcome_4h_price: real('outcome_4h_price'),
  outcome_4h_pct: real('outcome_4h_pct'),
  outcome_4h_status: text('outcome_4h_status', { enum: ['hit', 'miss', 'failed'] }),
  outcome_24h_price: real('outcome_24h_price'),
  outcome_24h_pct: real('outcome_24h_pct'),
  outcome_24h_status: text('outcome_24h_status', { enum: ['hit', 'miss', 'failed'] }),
  is_fully_resolved: integer('is_fully_resolved', { mode: 'boolean' }).notNull().default(false),
  created_at: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});
```

**Notes on this schema:**
- No foreign key to `token_signals` — signal_events is an append-only audit log, decoupled from the live signals table
- `entry_price` nullable — if DexScreener returns null at fire time (new token, no pairs yet), price is recorded as null; this event can still log but accuracy calculation excludes events with null entry_price
- All outcome columns are inline (not a separate table) — simplifies the accuracy query to a single-table aggregate

### Outcome Status Classification Logic

```typescript
// In src/signals/outcome-resolver.ts
function classifyOutcome(
  entryPrice: number | null,
  outcomePrice: number | null,
  tier: 'strong' | 'moderate' | 'weak',
): { status: 'hit' | 'miss' | 'failed'; pct: number | null } {
  if (outcomePrice === null) return { status: 'failed', pct: null };
  if (entryPrice === null || entryPrice === 0) return { status: 'failed', pct: null };

  const pct = (outcomePrice - entryPrice) / entryPrice;

  // Thresholds (documented — Claude's discretion per CONTEXT.md)
  // Strong: hit if gain >= +50% within window
  // Moderate: hit if gain >= +25% within window
  // Weak: no hit/miss classification (used only for tier differentiation)
  const threshold = tier === 'strong' ? 0.50 : tier === 'moderate' ? 0.25 : null;

  if (threshold === null) return { status: pct >= 0 ? 'hit' : 'miss', pct };  // weak: directional only
  return { status: pct >= threshold ? 'hit' : 'miss', pct };
}
```

### Accuracy Query (Drizzle ORM)

```typescript
// In src/signals/accuracy.ts
import { db } from '../db/index.js';
import { signal_events } from '../db/schema.js';
import { eq, and, sql, count } from 'drizzle-orm';

export interface TierAccuracy {
  tier: string;
  total_resolved: number;
  hits_24h: number;
  hit_rate_24h: number | null;  // null if below N=20
  avg_return_1h: number | null;
  avg_return_4h: number | null;
  avg_return_24h: number | null;
}

export function getAccuracyStats(): TierAccuracy[] {
  const MIN_SAMPLE = 20;

  const rows = db.select({
    tier: signal_events.tier,
    total_resolved: count(),
    hits_24h: sql<number>`SUM(CASE WHEN ${signal_events.outcome_24h_status} = 'hit' THEN 1 ELSE 0 END)`,
    avg_return_1h: sql<number>`AVG(${signal_events.outcome_1h_pct})`,
    avg_return_4h: sql<number>`AVG(${signal_events.outcome_4h_pct})`,
    avg_return_24h: sql<number>`AVG(${signal_events.outcome_24h_pct})`,
  })
    .from(signal_events)
    .where(eq(signal_events.is_fully_resolved, true))
    .groupBy(signal_events.tier)
    .all();

  return rows.map(r => ({
    ...r,
    hit_rate_24h: r.total_resolved >= MIN_SAMPLE
      ? r.hits_24h / r.total_resolved
      : null,
  }));
}
```

### Telegram /accuracy Command

```typescript
// Addition to registerCommands() in src/api/bot/commands.ts
bot.command('accuracy', async (ctx) => {
  const stats = getAccuracyStats();

  if (stats.length === 0) {
    return ctx.reply('No resolved signal outcomes yet. Check back after 24h of monitoring.');
  }

  const MIN_SAMPLE = 20;
  const lines = ['strong', 'moderate', 'weak'].map(tier => {
    const s = stats.find(r => r.tier === tier);
    if (!s) return `<b>${tier}:</b> No data`;
    if (s.total_resolved < MIN_SAMPLE) {
      return `<b>${tier}:</b> Insufficient data (${s.total_resolved}/20)`;
    }
    const hr = (s.hit_rate_24h! * 100).toFixed(1);
    const avg24 = s.avg_return_24h != null ? (s.avg_return_24h * 100).toFixed(1) + '%' : '—';
    return `<b>${tier}:</b> ${hr}% hit rate | 24h avg: ${avg24} | n=${s.total_resolved}`;
  });

  await ctx.reply(
    `<b>Signal Accuracy</b>\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML' }
  );
});
```

---

## Claude's Discretion Recommendations

### 1. Accuracy Thresholds (MUST be documented in plan)

**Recommendation: Strong ≥ +50%, Moderate ≥ +25%, Weak = directional only (any positive return = hit)**

Rationale: The suggested targets from CONTEXT.md are appropriate and aggressive enough to validate real alpha. Weak signals are not primary accuracy surfaces but tracking directional correctness provides tier differentiation data.

**False positive tracking:** A signal counts as a false positive if the price drops significantly. Recommended threshold: Strong = loss ≥ -20%, Moderate = loss ≥ -15%. These should be stored as `outcome_Xh_status = 'miss'` (not a separate field) — the `outcome_Xh_pct` column already captures the magnitude.

### 2. Price Capture at Signal Time

**Recommendation: Fetch immediately from DexScreener at tier transition time.**

Rationale: Reconstruction from nearest swap is unreliable — `swaps.sol_amount / swaps.token_amount` gives a per-swap ratio in SOL, not USD, and could be stale by minutes. DexScreener `getTokenPrice()` returns current USD price in < 1s. The only downside is a failed fetch for brand-new tokens with no pools yet — handle by storing `null` and excluding those events from accuracy calculations.

### 3. Retention Policy

**Recommendation: 90 days rolling retention.**

Rationale: 30 days is too short to build statistically meaningful sample sizes for Strong signals (which may fire infrequently). Indefinite retention adds operational risk without commensurate value for a monitoring system. 90 days provides ~3 months of signal history — enough for trend analysis and calibration. Implement via a scheduled cleanup at the start of each cycle: `DELETE FROM signal_events WHERE fired_at < now - 90days AND is_fully_resolved = 1`.

### 4. Control Group Feasibility

**Recommendation: Skip control group for Phase 12. Defer to future phase.**

Rationale: Sampling "random new token launches on Solana" requires either a separate Helius stream subscription for new mint events or periodic DexScreener scanning — neither infrastructure exists. The complexity is disproportionate to Phase 12's scope. The Weak signal tier already provides a functional proxy for baseline performance. Flag this for a future phase if tier differentiation analysis proves insufficient.

### 5. Telegram /accuracy Timing

**Recommendation: On-demand only (no automatic digest).**

Rationale: The dashboard already provides live accuracy stats — automatic daily/weekly Telegram digests add noise without meaningful benefit for a system that updates every 30 seconds. On-demand `/accuracy` is consistent with all other bot commands in the project (`/status`, `/top`, `/wallet`, `/signal`). If the user wants scheduled digests, that can be a future enhancement.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Separate outcome table with FK | Inline outcome columns on signal_events row | Simplifies accuracy queries — no join needed; all data for a signal event in one row |
| Cron-based scheduler for outcome resolution | Monitor loop cycle hook | Avoids additional process; SQLite-friendly (no concurrent access) |
| Global hit threshold regardless of tier | Per-tier thresholds | Meaningful validation — Strong signals should clear a higher bar |

---

## Open Questions

1. **Should `weak` tier transitions generate `signal_events` rows?**
   - What we know: User decision says "All tier transitions logged (including Weak)" for tier differentiation analysis.
   - What's unclear: If a token oscillates Weak→Moderate→Weak multiple times in an hour, that generates many Weak rows with overlapping outcome windows. The accuracy query will include all of them.
   - Recommendation: Log Weak transitions. The accuracy display excludes them from primary stats (per CONTEXT.md). The denominator concern is acceptable — it makes the data richer for tier differentiation analysis.

2. **What happens to `signal_events` rows with null `entry_price`?**
   - What we know: DexScreener may return null for brand-new tokens with no pairs yet.
   - What's unclear: Should these be excluded from accuracy calculation entirely, or resolved as `failed`?
   - Recommendation: Exclude from accuracy calculation (not `failed`). A null entry price means "price unavailable at fire time" — this is a data quality issue, not a rug. These rows are logged for completeness but excluded from hit rate denominator. Add `entry_price IS NOT NULL` filter to accuracy query.

3. **Tier transition: should Inactive → Strong count as a transition?**
   - What we know: Context says "log EVERY tier transition." `inactive` is the state when `signal_score = 0`.
   - Recommendation: Yes — `inactive → strong` IS a transition (a new signal firing). `strong → inactive` should NOT generate a `signal_events` row (the token is no longer signaling). This aligns with the design: `signal_events` captures "signal fire" events, not all state changes.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `src/signals/engine.ts`, `src/signals/scorer.ts`, `src/db/schema.ts`, `src/monitor/loop.ts`, `src/fetchers/dexscreener.ts`, `src/api/bot/commands.ts`, `src/api/bot/alerts.ts`, `src/api/server.ts`, `src/api/routes/signals.ts`, `src/api/views/dashboard.ejs`, `src/api/views/partials/signal_rows.ejs`, `src/api/views/layout.ejs`
- `package.json` — confirmed installed library versions
- `.env.example` — confirmed config patterns
- `drizzle.config.ts` — confirmed migration output path and dialect

### Secondary (MEDIUM confidence)
- DexScreener rate limit (300 req/min) — sourced from existing comments in `src/fetchers/dexscreener.ts` (`// 300/min = 5/sec`) — verified by inline comment in project code

### Tertiary (LOW confidence)
- DexScreener API stability — LOW: the existing implementation works but has no retry logic for 429s beyond the comment `// TODO: Implement automatic retry with exponential backoff`. Treat DexScreener availability as best-effort.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in `package.json`, no new dependencies
- Architecture: HIGH — all patterns derived from existing codebase conventions
- Price feed: HIGH — `DexScreenerFetcher` already exists and works; rate limit capped at 200ms delay
- Pitfalls: HIGH — all derived from direct code inspection of the function signatures, schema, and call sites
- Accuracy query logic: HIGH — straightforward SQL aggregation over the proposed schema

**Research date:** 2026-03-27
**Valid until:** 2026-06-27 (stable stack — DexScreener API changes are the only real risk)
