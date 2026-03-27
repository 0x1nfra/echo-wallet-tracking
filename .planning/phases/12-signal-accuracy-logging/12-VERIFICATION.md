---
phase: 12-signal-accuracy-logging
verified: 2026-03-27T07:00:00Z
status: passed
score: 18/18 must-haves verified
re_verification: false
---

# Phase 12: Signal Accuracy Logging Verification Report

**Phase Goal:** Signal Accuracy Logging — log tier transition events with full snapshot data, resolve 1h/4h/24h price outcomes automatically, surface accuracy stats on dashboard and via Telegram /accuracy command
**Verified:** 2026-03-27T07:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | signal_events table exists in SQLite schema with all snapshot + outcome columns | VERIFIED | `src/db/schema.ts` line 167: 21-column definition with all snapshot, 3x outcome windows, is_fully_resolved, created_at |
| 2 | Migration 0009 exists and is registered in the drizzle journal | VERIFIED | `0009_signal_accuracy.sql` present; `_journal.json` has idx:9 entry, when:1773510000004 (> previous 1773510000003) |
| 3 | resolveOutcomes() classifies outcomes with per-tier thresholds and idempotency | VERIFIED | `outcome-resolver.ts`: Strong>=50%, Moderate>=25%, Weak directional; IS NULL guard in WHERE clause on all three windows |
| 4 | classifyOutcome() handles null prices and entry prices as 'failed' | VERIFIED | Lines 39-40: null outcomePrice → failed; null/zero entryPrice → failed |
| 5 | is_fully_resolved set true only when all three windows have non-null status | VERIFIED | Lines 211-219: batch UPDATE with three IS NOT NULL SQL conditions |
| 6 | getAccuracyStats() excludes null entry_price from denominator | VERIFIED | `accuracy.ts` line 52: isNotNull(signal_events.entry_price) in WHERE |
| 7 | hit_rate_24h is null when total_resolved < 20 (MIN_SAMPLE gate) | VERIFIED | `accuracy.ts` lines 59-61: conditional map returning null below MIN_SAMPLE |
| 8 | computeAllTokenSignals() is async and detects tier transitions | VERIFIED | `engine.ts` line 48: async export; lines 210-228: isTransition condition + signal_events insert |
| 9 | Transitions TO inactive do NOT insert signal_events rows | VERIFIED | `engine.ts` line 212: `newTier !== 'inactive'` explicit guard |
| 10 | First-appearance signals (prevTier=null) insert a signal_events row | VERIFIED | `engine.ts` line 146: `?? null` fallback for missing row; null !== active tier triggers isTransition=true |
| 11 | loop.ts awaits computeAllTokenSignals() and calls resolveOutcomes() after each cycle | VERIFIED | `loop.ts` lines 183-186: await on both calls inside same try/catch |
| 12 | GET /api/accuracy returns JSON accuracy stats | VERIFIED | `src/api/routes/accuracy.ts` line 9: app.get('/api/accuracy') calls getAccuracyStats() and reply.send() |
| 13 | GET /api/accuracy/partial returns HTMX-rendered EJS partial | VERIFIED | `src/api/routes/accuracy.ts` line 15: app.get('/api/accuracy/partial') calls reply.view('partials/accuracy_stats') with stats, recentEvents, MIN_SAMPLE |
| 14 | accuracy routes registered in server.ts | VERIFIED | `server.ts` line 27: await app.register(import('./routes/accuracy.js')) |
| 15 | Dashboard shows Signal Accuracy section above Signal Feed with HTMX SSE refresh | VERIFIED | `dashboard.ejs` lines 1-12: `<section><h2>Signal Accuracy</h2>` with hx-get="/api/accuracy/partial" hx-trigger="sse:cycle" before Signal Feed section |
| 16 | Dashboard shows 'Insufficient data (X/20)' when below sample threshold | VERIFIED | `accuracy_stats.ejs` line 27: conditional hitRateStr using 'Insufficient data (' + totalResolved + '/20)' |
| 17 | Telegram /accuracy command returns hit rates by tier with MIN_SAMPLE gate | VERIFIED | `commands.ts` line 120: bot.command('accuracy'); lines 131-132: Insufficient data format; imports getAccuracyStats and MIN_SAMPLE |
| 18 | All 237 tests pass with zero TypeScript errors | VERIFIED | `pnpm test`: 237/237 pass; `pnpm tsc --noEmit`: clean |

**Score:** 18/18 truths verified

---

## Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | signal_events table definition | VERIFIED | 21 columns, lines 167-191; exported |
| `src/db/migrations/0009_signal_accuracy.sql` | CREATE TABLE DDL | VERIFIED | All 21 columns present; correct NOT NULL constraints |
| `src/db/migrations/meta/_journal.json` | idx:9 journal entry | VERIFIED | when:1773510000004 strictly greater than previous 1773510000003 |
| `src/signals/outcome-resolver.ts` | resolveOutcomes() and classifyOutcome() | VERIFIED | Both exported; 223 lines; three explicit window blocks; idempotency guards; 90-day cleanup; 200ms delay |
| `src/signals/accuracy.ts` | getAccuracyStats(), TierAccuracy, MIN_SAMPLE | VERIFIED | All three exported; MIN_SAMPLE=20 constant |
| `src/signals/__tests__/outcome-resolver.test.ts` | TDD tests for classifyOutcome and resolveOutcomes | VERIFIED | 290 lines (min 80 required); 17 tests |
| `src/signals/__tests__/accuracy.test.ts` | TDD tests for getAccuracyStats with MIN_SAMPLE gate | VERIFIED | 254 lines (min 40 required); 10 tests |
| `src/signals/engine.ts` | async computeAllTokenSignals() with tier transition detection | VERIFIED | async signature; signal_events import; DexScreenerFetcher import; isTransition block |
| `src/monitor/loop.ts` | await computeAllTokenSignals() + await resolveOutcomes() | VERIFIED | Both imports present; both awaited in same try/catch |
| `src/api/routes/accuracy.ts` | GET /api/accuracy and GET /api/accuracy/partial | VERIFIED | Default Fastify plugin export; both routes implemented with real data calls |
| `src/api/views/partials/accuracy_stats.ejs` | Aggregate stats + recent events tables | VERIFIED | 94 lines; strong/moderate aggregate stats; all-tier recent events; signal_events columns rendered |
| `src/api/views/dashboard.ejs` | Accuracy section before Signal Feed | VERIFIED | Accuracy section lines 1-12; Signal Feed section starts at line 14 |
| `src/api/server.ts` | accuracy routes registered; SSR data passed | VERIFIED | route registration line 27; getAccuracyStats() + recentSignalEvents queries; all vars passed to view |
| `src/api/bot/commands.ts` | /accuracy Telegram command | VERIFIED | bot.command('accuracy') at line 120; MIN_SAMPLE import; strong/moderate primary display; weak secondary |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/schema.ts` | `src/db/migrations/0009_signal_accuracy.sql` | Same table definition | VERIFIED | Both define signal_events with identical 21-column layout |
| `src/signals/outcome-resolver.ts` | `src/fetchers/dexscreener.ts` | DexScreenerFetcher constructor injection | VERIFIED | Import line 14; fetcher parameter line 70; fetcher.getTokenPrice() called in all three window blocks |
| `src/signals/outcome-resolver.ts` | `src/db/schema.ts` | drizzle ORM update on signal_events | VERIFIED | signal_events imported line 13; used in delete, select, update, and is_fully_resolved batch update |
| `src/signals/accuracy.ts` | `src/db/schema.ts` | drizzle ORM select aggregate on signal_events | VERIFIED | signal_events imported line 11; is_fully_resolved + entry_price used in WHERE; tier used in GROUP BY |
| `src/signals/engine.ts` | `src/db/schema.ts` | signal_events insert on tier transition | VERIFIED | signal_events in schema import line 11; db.insert(signal_events).values() lines 217-227 |
| `src/signals/engine.ts` | `src/fetchers/dexscreener.ts` | DexScreenerFetcher.getTokenPrice() at transition moment | VERIFIED | Import line 13; dexFetcher.getTokenPrice(tokenMint) called at line 216 inside isTransition block |
| `src/monitor/loop.ts` | `src/signals/outcome-resolver.ts` | resolveOutcomes() call after computeAllTokenSignals() | VERIFIED | Import line 10; await resolveOutcomes() line 185 directly after computeAllTokenSignals() |
| `src/api/views/dashboard.ejs` | `/api/accuracy/partial` | hx-get on HTMX-refreshed div, hx-trigger=sse:cycle | VERIFIED | Lines 5-6: hx-get="/api/accuracy/partial" hx-trigger="sse:cycle" |
| `src/api/routes/accuracy.ts` | `src/signals/accuracy.ts` | getAccuracyStats() call | VERIFIED | Import line 2; getAccuracyStats() called in both routes |
| `src/api/bot/commands.ts` | `src/signals/accuracy.ts` | getAccuracyStats() import | VERIFIED | Import line 6; called line 121 inside command handler |

---

## Requirements Coverage

| Requirement | Description | Plans | Status | Evidence |
|-------------|-------------|-------|--------|----------|
| QUAL-01 | System logs token outcomes after each signal fires (did the token pump or dump?) | 12-01, 12-02, 12-03 | SATISFIED | signal_events table captures full snapshot on tier transition (Plan 01+03); resolveOutcomes() writes 1h/4h/24h price outcomes per cycle (Plan 02+03) |
| QUAL-02 | System tracks signal accuracy rate over time (% of high-score signals that resulted in price increases) | 12-02, 12-04 | SATISFIED | getAccuracyStats() aggregates hit rates per tier with MIN_SAMPLE gate (Plan 02); surfaced via /api/accuracy JSON, dashboard section, and /accuracy Telegram command (Plan 04) |
| QUAL-03 | System supports manual score weight calibration based on historical signal outcomes | 12-01, 12-03, 12-04 | SATISFIED | signal_events stores full snapshot (signal_score, smart_wallet_count, buy_velocity, holder_score, coordinated_wallet_count) + entry_price + 3 outcome windows (Plan 01+03); surfaced in recent events table on dashboard and via /accuracy (Plan 04); avg_return_1h/4h/24h available for calibration analysis |

No orphaned requirements found — all three QUAL IDs are claimed by plans and have supporting implementation evidence.

---

## Anti-Patterns Found

No blocking or warning anti-patterns found across any Phase 12 files. Scanned:
- `src/signals/outcome-resolver.ts`
- `src/signals/accuracy.ts`
- `src/api/routes/accuracy.ts`
- `src/signals/engine.ts`
- `src/monitor/loop.ts`
- `src/api/bot/commands.ts`

No TODO/FIXME/PLACEHOLDER comments, no empty return stubs, no unhandled promise patterns.

---

## Human Verification Required

The following items cannot be verified programmatically:

### 1. Dashboard Accuracy Section Visual Layout

**Test:** Start the server (`pnpm run serve`) and open `http://localhost:3000` in a browser.
**Expected:** A "Signal Accuracy" section header appears above the "Signal Feed" section. The section shows two tables: an aggregate stats table with Strong/Moderate rows showing "Insufficient data (0/20)" and a Recent Signal Events table showing "(no signal events yet)".
**Why human:** Visual rendering and layout correctness cannot be verified from source code alone.

### 2. HTMX SSE Auto-Refresh of Accuracy Section

**Test:** With the server running and monitoring active, trigger a monitoring cycle. Observe the dashboard without page reload.
**Expected:** The Accuracy section updates automatically when a cycle completes, just as the Signal Feed section does.
**Why human:** Real-time event propagation via SSE requires a live running environment.

### 3. Telegram /accuracy Command Response

**Test:** Send `/accuracy` to the bot.
**Expected:** Bot replies with "No resolved signal outcomes yet. Check back after 24h of monitoring." (empty DB case) or per-tier stats when data is available.
**Why human:** Requires a live Telegram bot connection.

### 4. Live Tier Transition and Outcome Resolution End-to-End

**Test:** Run the monitor for 1+ hours with real wallet data and verify that signal_events rows appear in the database and get their 1h outcome window resolved.
**Expected:** signal_events rows with non-null entry_price appear on tier transitions; outcome_1h_price/pct/status become non-null approximately 1 hour after fired_at.
**Why human:** Requires real-time monitoring with live DexScreener data.

---

## Summary

Phase 12 achieves its goal in full. All four plans executed without deviations and all artifacts are substantive and wired:

- **Plan 01 (DB foundation):** signal_events table with 21 columns is present in schema.ts and migration 0009 is correctly registered in the drizzle journal. The table DDL exactly matches the schema definition.

- **Plan 02 (Outcome resolver + accuracy):** outcome-resolver.ts and accuracy.ts are fully implemented with real database queries (not stubs). classifyOutcome applies correct per-tier thresholds (Strong 50%, Moderate 25%, Weak directional). resolveOutcomes processes three explicit window blocks with idempotency guards, rate-limit delays, and 90-day retention cleanup. getAccuracyStats returns null hit_rate_24h below MIN_SAMPLE=20. Both files have TDD test coverage well above minimum line requirements (290 and 254 lines respectively).

- **Plan 03 (Engine hook + loop wiring):** computeAllTokenSignals is async with the DexScreenerFetcher second parameter. Tier transition detection correctly gates on `existingTier !== newTier && newTier !== 'inactive'`. loop.ts awaits both computeAllTokenSignals() and resolveOutcomes() inside the same non-fatal try/catch, with cycleEmitter.emit at the end.

- **Plan 04 (UI surfaces):** accuracy routes are registered and serve real data. Dashboard includes the accuracy section above Signal Feed with HTMX SSE auto-refresh pattern matching the existing signal rows pattern. The "Insufficient data (X/20)" string is rendered by the EJS partial. The /accuracy Telegram command is registered and imports MIN_SAMPLE from the single source of truth in accuracy.ts.

All 237 tests pass. TypeScript compiles clean. All three requirement IDs (QUAL-01, QUAL-02, QUAL-03) are satisfied with full implementation evidence.

---

_Verified: 2026-03-27T07:00:00Z_
_Verifier: Claude (gsd-verifier)_
