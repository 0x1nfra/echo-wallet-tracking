# Phase 14: Signal Outcome Tracking - Research

**Researched:** 2026-04-05
**Domain:** SQLite schema migration (Drizzle), outcome resolution logic, grammY Telegram bot, EJS dashboard partials
**Confidence:** HIGH — all findings drawn from direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Rug Classification
- Criterion: bundler flag was high at signal time (threshold delegated to Claude based on existing bundler score output) AND price dropped >90% within 4h of signal
- Rug is an informational flag only — it does NOT penalize accuracy metrics
- Accuracy is computed on non-rug outcomes only; rugged tokens are excluded from accuracy denominators
- Modern rug patterns (rapid bundle-and-dump via tools like RapidLaunch) mean a steep price drop alone is not sufficient — bundler data already captured at signal time is the stronger signal
- Note: tokens can get CTO'd and revived after initial dump; rug label reflects the dump event, not a permanent verdict on the token

#### Telegram Alerts
- Alert fires twice per token per outcome cycle:
  1. **First alert** (when user-configured threshold is first crossed): full info — CA, ticker, market cap at signal time, number of tracked wallets that bought this token
  2. **Milestone alerts** (each time 50%/100%/300% milestone is crossed, if above configured threshold): lean — ticker, CA, wallet count, milestone reached
- Global vs per-token threshold: Claude's Discretion
- Duplicate suppression: alert fires once per threshold crossing and once per milestone crossing — never re-fires for the same event

#### Dashboard Accuracy View
- Layout and structure: Claude's Discretion (table + distribution is a reasonable baseline)
- "Hit" definition: user-configurable — a signal is a "hit" if it reaches the user-defined % return at a given time window
- Accuracy computed on non-rug outcomes only
- Sparse data handling: Claude's Discretion

#### % Milestone Storage
- Fixed milestones: 50%, 100%, 300% — configurable via env/config (not hardcoded)
- Storage format: both flags AND timestamps per milestone — `hit_50`, `hit_50_at`, `hit_100`, `hit_100_at`, `hit_300`, `hit_300_at` (null if not reached)
- Dashboard visibility of milestones: Claude's Discretion

### Claude's Discretion
- Bundler score threshold for rug classification (what counts as "high")
- Global vs per-token alert threshold design
- Dashboard accuracy section layout and sparse data handling
- Whether milestone hit rates appear in the dashboard accuracy view or are stored for future analysis

### Deferred Ideas (OUT OF SCOPE)
- **Wallet reputation scoring** — if tracked wallets frequently appear in rugged/bundled tokens, their signals should be weighted lower or flagged differently. Valuable future phase for improving signal quality upstream.
- **Buy-after-offload strategy** — tokens with a strong narrative or CTO potential could be candidates to scoop after bundler wallets dump. Requires Phase 14 data as foundation; belongs in a future analysis/strategy phase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OUTCOME-01 | Signal events tracked at 30m window (in addition to existing 1h/4h/24h — memecoins often peak before 1h) | Schema needs 3 new columns: `outcome_30m_price`, `outcome_30m_pct`, `outcome_30m_status`. `resolveOutcomes()` extended with a 1,800,000ms window. `is_fully_resolved` guard updated to require all 4 windows. |
| OUTCOME-02 | Peak price and time-to-peak (minutes) tracked per signal over 24h post-signal window | Schema needs `peak_price` (real), `peak_price_at` (integer ms timestamp). Requires intra-cycle price tracking: outcome resolver records max price seen per token across 30m/1h/4h/24h cycles. |
| OUTCOME-03 | Rugged tokens classified as `rug` status (not `failed`) — fixes survivorship bias in accuracy stats | `outcome_Xh_status` enum must expand to include `'rug'`. `classifyOutcome()` gains a rug detection path. `getAccuracyStats()` gains `WHERE outcome_Xh_status != 'rug'` filter (non-rug denominator). `signal_events` needs `is_rug` boolean flag. |
| OUTCOME-04 | Fixed % tier milestones (50%/100%/300%) stored per resolved outcome | 6 new columns: `hit_50`, `hit_50_at`, `hit_100`, `hit_100_at`, `hit_300`, `hit_300_at`. Written by outcome resolver when price crosses milestone. Milestone values driven by env/config. |
| OUTCOME-05 | Configurable % threshold Telegram alert when a tracked signal token hits the milestone | New `outcome_alerts.ts` in bot module. Needs dedup table (`outcome_alert_log`) tracking per-event-id what threshold/milestone alerts have fired. Fired from outcome resolver cycle via `cycleEmitter`. |
| OUTCOME-06 | Multi-timeframe accuracy display on dashboard (30m/1h/4h/24h per tier with return distribution) | `getAccuracyStats()` extended for 30m window and rug exclusion. `accuracy_stats.ejs` partial updated with 4-column timeframe layout. Route `/api/accuracy/partial` passes updated stats. |
</phase_requirements>

---

## Summary

Phase 14 is a **pure extension of existing infrastructure** — no new frameworks, no new external APIs, no new architectural patterns. The codebase is a TypeScript/Node.js app using Drizzle ORM + better-sqlite3, grammY for Telegram, Fastify + EJS for the dashboard. All four touchpoints for this phase (schema, outcome resolver, bot alerts, dashboard) already exist and follow established patterns.

The most significant change is the `signal_events` table schema migration: 13 new columns split across three concerns (30m window, peak tracking, rug flag, 6 milestone columns). Drizzle Kit generates SQL migrations from schema changes via `pnpm drizzle-kit generate`. The existing migration pattern (`src/db/migrations/`) and the test pattern (in-memory SQLite with `migrate()` applied) are already established in `outcome-resolver.test.ts` and `accuracy.test.ts`.

The rug detection logic must be implemented carefully: the existing `coordinated_wallet_count` field in `signal_events` captures how many bundler-flagged wallets were present at signal time, but there is no dedicated `bundler_score` column on `signal_events`. The rug criterion ("bundler flag was high") needs a threshold applied to `coordinated_wallet_count` relative to `smart_wallet_count`. A recommended threshold: `coordinated_wallet_count / smart_wallet_count >= 0.3` (i.e., 30% or more of signal holders were bundler-flagged). This aligns with the existing `COORDINATION_PENALTY` constant in scorer.ts which starts meaningful discounting at similar ratios.

**Primary recommendation:** Implement Phase 14 as a single migration + targeted extension of three existing modules (outcome-resolver.ts, accuracy.ts, bot/alerts.ts) and two EJS templates. No new dependencies required.

---

## Standard Stack

### Core (already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 | Schema definition + query builder | Already used throughout |
| drizzle-kit | ^0.31.9 | Migration file generation from schema diff | Already used for all 10 migrations |
| better-sqlite3 | ^12.6.2 | SQLite driver | Already used |
| grammy | ^1.41.1 | Telegram bot API | Already used in bot module |
| fastify + @fastify/view + ejs | ^5.8.2 / ^11.1.1 | Dashboard API + EJS templates | Already used |

### No New Dependencies
All Phase 14 functionality is implementable with the existing stack. No new npm packages are needed.

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure

Phase 14 touches these existing files plus adds one new file:

```
src/
├── db/
│   ├── schema.ts                    # ADD: 13 new columns to signal_events
│   └── migrations/
│       └── 0010_signal_outcome_v2.sql  # GENERATE: drizzle-kit generate
├── signals/
│   ├── outcome-resolver.ts          # EXTEND: 30m window, peak tracking, rug detect, milestones
│   ├── accuracy.ts                  # EXTEND: 30m stats, rug exclusion, 4-window interface
│   └── __tests__/
│       ├── outcome-resolver.test.ts # EXTEND: tests for new behavior
│       └── accuracy.test.ts         # EXTEND: tests for rug exclusion, 30m stats
├── api/
│   ├── bot/
│   │   ├── outcome-alerts.ts        # NEW: outcome threshold + milestone alert logic
│   │   └── index.ts                 # WIRE: outcome-alerts into cycleEmitter
│   └── views/
│       └── partials/
│           └── accuracy_stats.ejs   # EXTEND: 4-window table, rug excluded note
```

### Pattern 1: Drizzle Schema Extension + Migration Generation

**What:** Add columns to an existing sqliteTable definition, then run `drizzle-kit generate` to produce a new SQL migration file. The migration folder is at `src/db/migrations/`. Tests apply all migrations via `migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })` — new columns are available in tests automatically after migration file is generated.

**When to use:** Any time schema changes are needed. Always schema-first (edit schema.ts, then generate).

**Pattern:**
```typescript
// src/db/schema.ts — extend signal_events
export const signal_events = sqliteTable('signal_events', {
  // ... existing columns ...

  // OUTCOME-01: 30m window
  outcome_30m_price: real('outcome_30m_price'),
  outcome_30m_pct: real('outcome_30m_pct'),
  outcome_30m_status: text('outcome_30m_status', { enum: ['hit', 'miss', 'failed', 'rug'] }),

  // OUTCOME-02: peak tracking
  peak_price: real('peak_price'),
  peak_price_at: integer('peak_price_at', { mode: 'number' }),

  // OUTCOME-03: rug classification
  is_rug: integer('is_rug', { mode: 'boolean' }).notNull().default(false),
  // Note: outcome_Xh_status enum expansion to include 'rug' requires
  // regenerating all four status column definitions

  // OUTCOME-04: milestones (all configurable via env, stored as flags + timestamps)
  hit_50:    integer('hit_50',    { mode: 'boolean' }),
  hit_50_at: integer('hit_50_at', { mode: 'number' }),
  hit_100:    integer('hit_100',    { mode: 'boolean' }),
  hit_100_at: integer('hit_100_at', { mode: 'number' }),
  hit_300:    integer('hit_300',    { mode: 'boolean' }),
  hit_300_at: integer('hit_300_at', { mode: 'number' }),
});
```

**Generate migration:**
```bash
pnpm drizzle-kit generate
# Produces: src/db/migrations/0010_signal_outcome_v2.sql
```

**IMPORTANT:** SQLite does not support modifying enum constraints on existing columns via ALTER TABLE. The `outcome_Xh_status` columns are TEXT with enum enforced only at the Drizzle layer. Adding 'rug' to the enum in schema.ts is safe — existing rows are unaffected.

### Pattern 2: Outcome Resolver Extension

**What:** The existing `resolveOutcomes()` function processes windows sequentially (1h, 4h, 24h). Phase 14 prepends a 30m window and adds parallel concerns (peak tracking, rug detection, milestone writes).

**Key insight:** Peak tracking cannot be done in a single-shot price fetch — the peak must be updated incrementally across cycles. Strategy: each time any window is resolved, check if the current `outcomePrice` exceeds the stored `peak_price` and update if so. This means peak is the running maximum observed across all window resolution calls for a given event.

**Rug detection timing:** Rug classification should run at 4h window resolution time (when the rug criterion's price drop threshold becomes observable). The check: `if (coordinated_wallet_count / smart_wallet_count >= 0.3 AND outcome_4h_pct <= -0.90)` → set `is_rug = true`, set all outcome statuses to `'rug'`.

**is_fully_resolved update:** Must now require all FOUR window statuses to be non-null (30m + 1h + 4h + 24h).

### Pattern 3: Outcome Alert Logic (new module)

**What:** A new `outcome-alerts.ts` in `src/api/bot/` follows the same structure as `alerts.ts`. It runs on each `cycleEmitter 'cycle'` event, queries `signal_events` rows that have outcome prices resolved, checks threshold and milestone crossings against a dedup table, and fires grammY messages.

**Dedup table design:** A new `outcome_alert_log` table tracks per-signal-event what has already fired. Keyed on `signal_event_id + event_type` (where event_type is `'threshold'`, `'milestone_50'`, `'milestone_100'`, `'milestone_300'`).

```typescript
export const outcome_alert_log = sqliteTable('outcome_alert_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  signal_event_id: integer('signal_event_id').notNull(),
  event_type: text('event_type').notNull(), // 'threshold' | 'milestone_50' | 'milestone_100' | 'milestone_300'
  fired_at: integer('fired_at', { mode: 'number' }).notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});
// Unique constraint on (signal_event_id, event_type) — enforces one-fire-per-event
```

**Alert content:**

First alert (threshold crossing):
```
OUTCOME ALERT: {TICKER}
CA: {token_mint}
Market cap at signal: ${market_cap_at_signal}
Tracked wallets: {smart_wallet_count}
Current return: +{pct}% at {window}
```

Milestone alert (lean):
```
{TICKER} hit {milestone}x
CA: {token_mint} | {smart_wallet_count} wallets
```

**Market cap at signal time:** The `entry_price` is stored in `signal_events`. DexScreener's `DexScreenerPair.marketCap` is available at the time of signal fire. To include market cap in the first alert, `market_cap_at_signal` must be stored in `signal_events` at signal creation time (engine.ts). This is a schema addition: `signal_market_cap: real('signal_market_cap')` — optional, null if DexScreener didn't return it. The `DexScreenerFetcher.getTokenPrice()` currently only returns price; it must be extended or a new method added to also return market cap.

### Pattern 4: Accuracy Stats Extension

**What:** `getAccuracyStats()` in `accuracy.ts` currently returns a `TierAccuracy` interface with 1h/4h/24h stats. Phase 14 requires:
1. Add 30m averages and hit rates
2. Exclude rug outcomes from all denominators (`WHERE is_rug = false OR is_rug IS NULL`)

**Interface extension:**
```typescript
export interface TierAccuracy {
  tier: string;
  total_resolved: number;       // non-rug only
  hits_30m: number;
  hits_1h: number;
  hits_4h: number;
  hits_24h: number;
  hit_rate_30m: number | null;  // null if < MIN_SAMPLE
  hit_rate_1h: number | null;
  hit_rate_4h: number | null;
  hit_rate_24h: number | null;
  avg_return_30m: number | null;
  avg_return_1h: number | null;
  avg_return_4h: number | null;
  avg_return_24h: number | null;
}
```

**Sparse data handling recommendation:** Use `hit_rate_Xh = null` (already the pattern) when `total_resolved < MIN_SAMPLE`. Dashboard renders "Insufficient data (N/20)" for null values. This is the established pattern — keep it consistent across all 4 windows.

### Pattern 5: grammY Alert API

**What:** The existing bot uses `bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' })` — the same API call works for outcome alerts. No new grammy patterns needed.

**Where cycleEmitter fires:** `src/api/bot/index.ts` already wires `cycleEmitter.on('cycle', () => runAlertCycle(...))`. Add a second listener for outcome alerts in the same file:
```typescript
cycleEmitter.on('cycle', () => {
  runOutcomeAlertCycle(bot, chatId).catch(...);
});
```

### Anti-Patterns to Avoid

- **Don't retroactively re-classify rugs:** The `is_rug` flag should be set exactly once at the 4h resolution pass. Do NOT re-evaluate on subsequent cycles — idempotency guard `WHERE is_rug = false` in the rug detection query.
- **Don't re-resolve already-written windows:** The existing `isNull(signal_events.outcome_Xh_price)` idempotency guard must be applied to the new 30m window the same way.
- **Don't use a separate "peak tracker" cron:** Peak price update is a side effect of the existing outcome resolution cycle — no new scheduled task needed.
- **Don't hardcode milestone values:** Read from `process.env.OUTCOME_MILESTONES ?? '50,100,300'` and parse. Pass as config to the resolver and alert module.
- **Don't add market cap fetch to outcome resolver cycles:** Market cap at signal time must be captured at signal creation (in engine.ts), not during outcome resolution (prices at signal vs. resolution time are very different things).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL migrations | Manual ALTER TABLE scripts | `pnpm drizzle-kit generate` | Schema drift is already managed by drizzle-kit; hand-rolled SQL bypasses the migration journal |
| Alert dedup | In-memory Set or timestamp heuristic | `outcome_alert_log` DB table | Must survive process restart on Railway; memory-only dedup fires duplicates after redeploy |
| Telegram message sending | Raw HTTP to Telegram Bot API | `bot.api.sendMessage()` (grammy) | Already installed; handles retries, parse modes, error handling |
| Peak price tracking service | Separate polling loop | Piggyback on existing outcome resolver cycle | Adding a second loop wastes DexScreener quota and complicates loop.ts |

**Key insight:** This codebase has a strong pattern of "pure function + DB injection" for testability (outcome-resolver.ts, accuracy.ts). New logic should follow the same pattern — injectable `db` parameter, no global state.

---

## Common Pitfalls

### Pitfall 1: SQLite Enum Constraint False Safety

**What goes wrong:** The schema defines `outcome_Xh_status` with `.enum(['hit', 'miss', 'failed'])` — adding `'rug'` looks like it requires an ALTER TABLE. It does not. SQLite does not enforce CHECK constraints from Drizzle's enum in the underlying column — it's enforced only at the Drizzle query layer. Drizzle-kit will generate an ALTER TABLE ADD COLUMN for new columns, but schema changes to existing TEXT columns are ignored at the DB level.

**How to avoid:** Update the enum in schema.ts for all four status columns. No migration SQL needed for the enum change itself. The migration only covers new columns.

**Warning signs:** If drizzle-kit generates `ALTER TABLE signal_events ALTER COLUMN outcome_1h_status` — that is not supported in SQLite. Inspect the generated SQL before applying.

### Pitfall 2: is_fully_resolved Guard Breaks When 4 Windows Required

**What goes wrong:** The existing `is_fully_resolved` update checks 3 windows. After adding 30m, the guard must check 4 windows. If not updated, events resolve early (before 30m outcome is written) and the accuracy query counts them before all data is populated.

**How to avoid:** Update the `is_fully_resolved` batch update in `resolveOutcomes()` to include `AND outcome_30m_status IS NOT NULL`.

**Warning signs:** Test: insert a signal event fired 2 hours ago, run `resolveOutcomes()` — `is_fully_resolved` should be `false` until 30m is also written. Add this assertion to the test.

### Pitfall 3: Rug Detection at Wrong Window

**What goes wrong:** Rug detection requires a 90% price drop within 4h. Running the check at the 1h or 24h window is wrong — 1h may catch some but misses slow rug completions; 24h is too late and may show false "miss" before rug is classified.

**How to avoid:** Run rug classification exactly at 4h resolution time: when `outcome_4h_price` is about to be written. If the rug criterion is met, write `is_rug = true` and set outcome status to `'rug'` for all resolved windows of that event.

**Warning signs:** If a token's 1h price looks fine but 4h collapses — the 1h status would have already written 'miss'. The 4h resolution must OVERWRITE prior statuses to 'rug' when rug is detected at 4h time.

### Pitfall 4: Peak Price Staleness

**What goes wrong:** The peak price is only as good as the last time the outcome resolver ran for a given token. Tokens that peak between cycles (every 30 seconds) will have undersampled peaks. This is an inherent limitation of polling — not a bug to fix, but to document.

**How to avoid:** Accept this limitation. Document that `peak_price` reflects the observed peak from DexScreener samples taken at 30m/1h/4h/24h resolution points. It is not a true OHLC high.

### Pitfall 5: Outcome Alert Fires During Same Cycle That Resolves the Window

**What goes wrong:** If the outcome resolver writes a milestone hit and the alert cycle checks for unalerted milestones in the same cycle, the alert fires correctly. However, the cycle emitter fires once per monitor loop iteration (30s). If the outcome resolver and the alert cycle are both triggered by `cycleEmitter.on('cycle')`, there is a race: alert may check before outcome resolver writes.

**How to avoid:** In `bot/index.ts`, chain the outcome alert cycle to run AFTER `resolveOutcomes()` completes. Or: accept that milestone alerts fire on the NEXT cycle after the milestone is written. The one-cycle delay (~30 seconds) is acceptable for an outcome alert. Document this in the alert module.

### Pitfall 6: Market Cap Not Available in Outcome Resolver Context

**What goes wrong:** The first Telegram alert requires "market cap at signal time." The outcome resolver runs hours after the signal fires — by then market cap has changed. Market cap must be captured at signal creation time in `engine.ts`.

**How to avoid:** Add `signal_market_cap: real('signal_market_cap')` to `signal_events`. Extend `DexScreenerFetcher.getTokenPrice()` (or add a new method) to return both price and market cap. In `engine.ts`, capture market cap when fetching `entryPrice` at tier transition.

---

## Code Examples

### Extending resolveOutcomes() — 30m Window Addition

```typescript
// Source: direct codebase inspection of src/signals/outcome-resolver.ts
// Pattern: mirror existing 1h/4h/24h structure for the new 30m window

const due30m = db.select({
  id: signal_events.id,
  token_mint: signal_events.token_mint,
  entry_price: signal_events.entry_price,
  tier: signal_events.tier,
})
  .from(signal_events)
  .where(and(
    isNull(signal_events.outcome_30m_price),
    lte(signal_events.fired_at, nowMs - 1_800_000),
  ))
  .limit(MAX_PER_CYCLE)
  .all();
```

### Rug Detection at 4h Resolution

```typescript
// Recommended implementation — run inside the 4h resolution loop
// after classifyOutcome() returns, before writing to DB

const rugRatio = row.coordinated_wallet_count / Math.max(row.smart_wallet_count, 1);
const isRug = rugRatio >= 0.30 && pct !== null && pct <= -0.90;

if (isRug) {
  db.update(signal_events)
    .set({
      outcome_4h_price: outcomePrice,
      outcome_4h_pct: pct,
      outcome_4h_status: 'rug',
      is_rug: true,
    })
    .where(and(
      eq(signal_events.id, row.id),
      isNull(signal_events.outcome_4h_price), // idempotency guard
    ))
    .run();
} else {
  // normal path: write classifyOutcome result
}
```

### Milestone Write Pattern

```typescript
// Read milestones from env (parse once at module init, not per-row)
const MILESTONES = (process.env.OUTCOME_MILESTONES ?? '50,100,300')
  .split(',')
  .map(Number)
  .filter(n => n > 0); // [50, 100, 300]

// Inside the resolution loop, after writing outcome price/pct:
if (pct !== null && row.entry_price) {
  const returnPct = pct * 100; // convert to percentage
  const milestoneUpdates: Record<string, boolean | number | null> = {};

  for (const ms of MILESTONES) {
    const hitKey = `hit_${ms}` as keyof typeof signal_events.$inferSelect;
    const hitAtKey = `hit_${ms}_at` as keyof typeof signal_events.$inferSelect;

    if (returnPct >= ms && !(row as any)[hitKey]) {
      milestoneUpdates[hitKey] = true;
      milestoneUpdates[hitAtKey] = nowMs;
    }
  }

  if (Object.keys(milestoneUpdates).length > 0) {
    db.update(signal_events)
      .set(milestoneUpdates as any)
      .where(eq(signal_events.id, row.id))
      .run();
  }
}
```

**Note:** Milestone writes should happen inside each window's resolution loop (30m, 1h, 4h, 24h) — the first window to observe a milestone threshold crossing should write it. Subsequent windows will find `hit_50 = true` and skip.

### Outcome Alert Dedup Pattern

```typescript
// src/api/bot/outcome-alerts.ts — dedup check before send
export async function runOutcomeAlertCycle(bot: Bot, chatId: string | number): Promise<void> {
  const threshold = Number(process.env.ALERT_OUTCOME_THRESHOLD ?? 100); // % return, default 2x

  // Query signal_events that have any resolved pct >= threshold
  // and have NOT yet received a threshold alert
  const candidates = db.select({
    id: signal_events.id,
    token_mint: signal_events.token_mint,
    smart_wallet_count: signal_events.smart_wallet_count,
    signal_market_cap: signal_events.signal_market_cap,
    outcome_30m_pct: signal_events.outcome_30m_pct,
    outcome_1h_pct: signal_events.outcome_1h_pct,
    outcome_4h_pct: signal_events.outcome_4h_pct,
    outcome_24h_pct: signal_events.outcome_24h_pct,
    is_rug: signal_events.is_rug,
    hit_50: signal_events.hit_50,
    hit_100: signal_events.hit_100,
    hit_300: signal_events.hit_300,
  })
    .from(signal_events)
    .where(eq(signal_events.is_rug, false))
    .all();

  for (const event of candidates) {
    const existingAlerts = db.select()
      .from(outcome_alert_log)
      .where(eq(outcome_alert_log.signal_event_id, event.id))
      .all();
    const firedTypes = new Set(existingAlerts.map(a => a.event_type));

    // First: threshold crossing
    const maxPct = Math.max(
      event.outcome_30m_pct ?? -Infinity,
      event.outcome_1h_pct ?? -Infinity,
      event.outcome_4h_pct ?? -Infinity,
      event.outcome_24h_pct ?? -Infinity,
    ) * 100;

    if (maxPct >= threshold && !firedTypes.has('threshold')) {
      await sendThresholdAlert(bot, chatId, event, maxPct);
      db.insert(outcome_alert_log).values({
        signal_event_id: event.id,
        event_type: 'threshold',
      }).run();
    }

    // Milestone alerts
    const milestoneMap = [
      { key: 'milestone_50', hit: event.hit_50 },
      { key: 'milestone_100', hit: event.hit_100 },
      { key: 'milestone_300', hit: event.hit_300 },
    ];
    for (const { key, hit } of milestoneMap) {
      if (hit && !firedTypes.has(key)) {
        await sendMilestoneAlert(bot, chatId, event, key);
        db.insert(outcome_alert_log).values({
          signal_event_id: event.id,
          event_type: key,
        }).run();
      }
    }
  }
}
```

### grammY HTML Message Format

```typescript
// Source: direct inspection of src/api/bot/alerts.ts
// All existing bot messages use HTML parse mode — maintain consistency

// First (threshold) alert — full info:
const thresholdMsg = (
  `<b>OUTCOME ALERT</b>\n` +
  `<b>${symbol ?? ca.slice(0, 10)}...</b>\n` +
  `CA: <code>${ca}</code>\n` +
  `MCap at signal: ${mcap ? '$' + formatMcap(mcap) : '—'}\n` +
  `Tracked wallets: ${smartWalletCount}\n` +
  `Return: <b>+${pct.toFixed(0)}%</b>`
);

// Milestone alert — lean:
const milestoneMsg = (
  `<b>${symbol}</b> hit ${milestone}x\n` +
  `<code>${ca}</code> | ${smartWalletCount} wallets`
);

await bot.api.sendMessage(chatId, msg, { parse_mode: 'HTML' });
```

---

## Bundler Score Threshold Recommendation

The rug classification criterion delegates threshold selection to Claude. Based on codebase inspection:

- `coordinated_wallet_count` is stored in `signal_events` at signal fire time
- `smart_wallet_count` is also stored — this is the total active smart holder count
- The scorer applies `COORDINATION_PENALTY = 0.7` at coordination ratios approaching 1.0; meaningful discounting starts around 30-40% coordination ratio

**Recommendation:** Use `coordinated_wallet_count / smart_wallet_count >= 0.3` as "bundler flag was high." This means 30% or more of the signal's smart wallet holders were flagged as coordinated/bundler. Rationale:
- At ratio < 0.3: bundler presence is incidental (1-2 wallets in a group of 5+)
- At ratio >= 0.3: bundler wallets constitute a significant portion of the signal's basis
- This matches the natural inflection point in the coordination discount formula in scorer.ts

The threshold should be configurable: `OUTCOME_RUG_BUNDLER_RATIO = 0.30` in `.env.example`.

---

## Dashboard Accuracy View Recommendation

For Claude's Discretion items on dashboard layout:

**Recommended layout for `accuracy_stats.ejs`:**

1. **Stats table** — existing tier rows, extended with 30m column, rug-excluded note in footer
2. **Milestone hit rate sidebar** — small inline section showing overall `hit_50 / total_resolved`, `hit_100 / total_resolved`, `hit_300 / total_resolved` across all tiers (not per-tier breakdown yet — insufficient data early on)
3. **Sparse data rule** — `< MIN_SAMPLE (20)` shows "Insufficient data (N/20)" for hit rates; milestone rates show raw counts if N < 20 rather than percentages

**Existing table columns:** Tier | Signals | Hit Rate 24h | Avg 1h | Avg 4h | Avg 24h

**Extended table columns:** Tier | Signals (non-rug) | Hit Rate 30m | Hit Rate 1h | Hit Rate 4h | Hit Rate 24h | Avg 30m | Avg 1h | Avg 4h | Avg 24h

This is wide — consider using two rows per tier or a responsive table. The mobile view is not a current concern (Railway-deployed, accessed from desktop).

---

## Alert Threshold Design Recommendation

**Global vs per-token:** Use a single global `ALERT_OUTCOME_THRESHOLD` env variable (e.g., default `100` = 2x return). Rationale: this mirrors the existing `ALERT_SIGNAL_THRESHOLD` pattern already in `.env.example`. Per-token configuration adds complexity (storage, UI) that isn't in scope.

**New env vars to add:**
```
ALERT_OUTCOME_THRESHOLD=100     # % return threshold for first outcome alert (default: 100 = 2x)
OUTCOME_MILESTONES=50,100,300   # configurable milestones (default: 50%/100%/300%)
OUTCOME_RUG_BUNDLER_RATIO=0.30  # bundler ratio threshold for rug classification
```

---

## State of the Art

| Old Approach | Current Approach | Applicable Here |
|--------------|------------------|-----------------|
| `status: 'failed'` for dead tokens | `status: 'rug'` for bundler+drop tokens | New enum value in existing status columns |
| 3-window outcome tracking (1h/4h/24h) | 4-window outcome tracking (30m/1h/4h/24h) | Extend existing resolver pattern |
| Accuracy excluding `null entry_price` only | Accuracy excluding `null entry_price` AND `is_rug = true` | Update WHERE filter in `getAccuracyStats()` |
| Signal alerts only (token_signals table) | Both signal alerts + outcome alerts (signal_events table) | New alert module in bot |

---

## Open Questions

1. **Market cap at signal time — DexScreener batch concern**
   - What we know: `DexScreenerPair.marketCap` is in the type definition (`src/types/transaction.ts:174`). `getTokenPrice()` currently discards it.
   - What's unclear: Does DexScreener always return `marketCap` for memecoins, or is it frequently null/0?
   - Recommendation: Store `signal_market_cap` as nullable real. If null, the alert shows `—` for market cap. Extend `getTokenPrice()` to return `{ price, marketCap }` or add `getTokenPriceAndMarketCap()` method. Mark as nullable/optional — don't block alert on market cap availability.

2. **Rug status for existing `outcome_1h_status` when rug detected at 4h**
   - What we know: A token may have `outcome_1h_status = 'miss'` already written before the rug is detected at 4h resolution.
   - What's unclear: Should we retroactively overwrite `outcome_1h_status` to `'rug'`? Or leave historical windows as-is and only set `is_rug = true`?
   - Recommendation: Set `is_rug = true` as the canonical flag; leave prior window statuses as-is. The accuracy query filters on `is_rug = false` — this excludes the entire row regardless of per-window status. This avoids retroactive overwrites that complicate idempotency.

3. **30m window and `is_fully_resolved` timing**
   - What we know: With 30m prepended, `is_fully_resolved` now requires 4 windows. The 24h outcome is the last to resolve — timing is unchanged.
   - What's unclear: Should 30m/1h/4h windows be checked independently for milestone/alert triggers before full resolution?
   - Recommendation: Yes. Milestone writes and alert triggers should fire as soon as any window shows the threshold crossed — don't wait for `is_fully_resolved`. The accuracy query uses `is_fully_resolved = true`; the alert/milestone logic operates on partially-resolved rows.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest (ESM mode) |
| Config file | `jest.config.cjs` at project root |
| Quick run command | `pnpm test -- --testPathPattern="outcome-resolver\|accuracy"` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUTCOME-01 | 30m window resolves after 30m, idempotent, writes correct pct/status | unit | `pnpm test -- --testPathPattern="outcome-resolver"` | ✅ extend existing |
| OUTCOME-02 | peak_price updated when price exceeds previous peak | unit | `pnpm test -- --testPathPattern="outcome-resolver"` | ✅ extend existing |
| OUTCOME-03 | is_rug=true set when ratio>=0.30 AND 4h drop>=-90%; rug rows excluded from accuracy | unit | `pnpm test -- --testPathPattern="outcome-resolver\|accuracy"` | ✅ extend existing |
| OUTCOME-04 | hit_50/hit_100/hit_300 flags and timestamps written correctly | unit | `pnpm test -- --testPathPattern="outcome-resolver"` | ✅ extend existing |
| OUTCOME-05 | outcome alert fires once per threshold crossing; dedup prevents re-fire | unit | `pnpm test -- --testPathPattern="outcome-alerts"` | ❌ Wave 0 |
| OUTCOME-06 | getAccuracyStats() returns 30m stats; rug rows excluded; 4-window interface | unit | `pnpm test -- --testPathPattern="accuracy"` | ✅ extend existing |

### Sampling Rate
- **Per task commit:** `pnpm test -- --testPathPattern="outcome-resolver\|accuracy\|outcome-alerts"`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/api/bot/__tests__/outcome-alerts.test.ts` — covers OUTCOME-05 (dedup, threshold fire, milestone fire)

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/signals/outcome-resolver.ts` — existing window loop pattern
- Direct codebase inspection: `src/db/schema.ts` — signal_events current columns
- Direct codebase inspection: `src/signals/accuracy.ts` — TierAccuracy interface
- Direct codebase inspection: `src/api/bot/alerts.ts` — grammY message pattern + dedup pattern
- Direct codebase inspection: `src/types/transaction.ts:173-174` — DexScreenerPair.marketCap field confirmed
- Direct codebase inspection: `src/signals/__tests__/outcome-resolver.test.ts` — in-memory SQLite test pattern
- Direct codebase inspection: `jest.config.cjs` — test configuration

### Secondary (MEDIUM confidence)
- grammY documentation — `bot.api.sendMessage()` with `parse_mode: 'HTML'` is stable API (version ^1.41.1 confirmed in package.json)
- Drizzle ORM documentation — `drizzle-kit generate` for SQLite migration workflow (version ^0.45.1 confirmed)

### Tertiary (LOW confidence — no verification needed, domain knowledge)
- SQLite TEXT column enum behavior — enforcement is application-layer only (Drizzle), not DB-level constraint. This is SQLite's documented behavior.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing libraries verified in package.json
- Architecture patterns: HIGH — directly derived from existing module patterns in the codebase
- Schema changes: HIGH — schema.ts and migration pattern fully inspected
- Rug threshold (0.30): MEDIUM — derived from codebase constants (COORDINATION_PENALTY), reasonable but user should validate
- Pitfalls: HIGH — derived from direct code inspection of idempotency guards and SQLite constraints

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable framework; only goes stale if drizzle-orm or grammy APIs change significantly)
