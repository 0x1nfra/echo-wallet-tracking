---
phase: 07-api-dashboard-and-telegram-alerts
verified: 2026-03-16T12:00:00Z
status: human_needed
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Open http://localhost:3000 in a browser after running 'pnpm echo serve'"
    expected: "Dashboard loads with signal feed table, tier filter chips (All/Strong/Moderate/Weak), and wallet list table — all rendered with dark theme"
    why_human: "Visual rendering and layout correctness cannot be verified programmatically"
  - test: "Click tier filter chips (Strong, Moderate, Weak, All) on the dashboard"
    expected: "Signal rows filter without page reload; Alpine x-data state persists across SSE updates"
    why_human: "JavaScript interactivity and Alpine.js state persistence require browser execution"
  - test: "Wait for a monitor cycle to complete (or trigger manually), then observe the signal feed"
    expected: "Signal rows update automatically without a page refresh via HTMX SSE"
    why_human: "SSE live-update behavior requires a running monitor and a browser connection"
  - test: "Click a wallet address link in the tracked wallets table on the dashboard"
    expected: "Wallet detail page loads at /wallets/:address showing score card with 4 sub-scores, detection flags section, recent trades table, and current holdings table"
    why_human: "Page navigation and content correctness require browser-level verification"
  - test: "With TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID set in .env, run 'pnpm echo serve' then send /start, /status, /top to the bot"
    expected: "/start responds with chat ID; /status responds with wallet count and last cycle time; /top responds with top 5 signals including score, tier, and top holder wallet address per entry"
    why_human: "Telegram bot functionality requires live Telegram API credentials and external service connectivity"
  - test: "With a signal score above ALERT_SIGNAL_THRESHOLD, verify a Telegram alert is received"
    expected: "Alert message includes token mint, score, tier, smart holder count, and top 2-3 wallet addresses; no repeat alert within 2 hours for same token"
    why_human: "Alert delivery and dedup behavior require live Telegram credentials and real signal data"
---

# Phase 7: API Dashboard and Telegram Alerts — Verification Report

**Phase Goal:** The user can monitor live signals and wallet activity via a web dashboard and receive time-sensitive alerts via Telegram
**Verified:** 2026-03-16T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | alert_log and token_metadata tables exist in SQLite schema and migration | VERIFIED | Both table definitions in schema.ts lines 127 and 134; migration 0006 SQL present with correct CREATE TABLE statements (14 lines) |
| 2  | cycleEmitter singleton exported from src/api/cycle-events.ts with setMaxListeners(50) | VERIFIED | File exports `cycleEmitter = new EventEmitter()` with `setMaxListeners(50)` on line 6 |
| 3  | MonitorLoop imports cycleEmitter and emits 'cycle' after computeAllTokenSignals() succeeds | VERIFIED | loop.ts line 10 imports cycleEmitter; line 184 emits inside try block immediately after computeAllTokenSignals() on line 182 — correct placement, not in catch path |
| 4  | All required npm packages installed (fastify, @fastify/sse, @fastify/static, @fastify/view, ejs, grammy) | VERIFIED | All 6 packages present in package.json dependencies; fastify and grammy confirmed resolvable from node_modules |
| 5  | GET /api/signals returns JSON array sorted by signal_score DESC | VERIFIED | signals.ts implements route with `orderBy(desc(token_signals.signal_score))` and sends enriched array |
| 6  | GET /api/wallets returns JSON array of tracked wallets with score and detection_status | VERIFIED | wallets.ts filters by `eq(wallets.status, 'tracked')` and joins wallet_metrics for score |
| 7  | GET /api/status returns health JSON with wallet_count, active_signal_count, last_cycle_at | VERIFIED | status.ts queries all three values using count() and max() from drizzle-orm |
| 8  | GET /events/cycle is a functioning SSE endpoint wired to cycleEmitter | VERIFIED | signals.ts line 63: `app.get('/events/cycle', { sse: true }, ...)` with async generator using `cycleEmitter.once('cycle', resolve)` |
| 9  | Dashboard HTML shell includes htmx-ext-sse and Alpine.js; SSE wiring present in dashboard.ejs | VERIFIED | layout.ejs: htmx-ext-sse@2.2.2 CDN script on line 9; dashboard.ejs line 10: `hx-ext="sse" sse-connect="/events/cycle"` |
| 10 | Signal rows partial links smart_wallet_count to /wallets/:topHolderAddress | VERIFIED | signal_rows.ejs line 17: `<a href="/wallets/<%= row.topHolderAddress %>">` |
| 11 | Wallet detail page exists at /wallets/:address with score card, detection flags, trades, holdings | VERIFIED | wallets.ts GET /wallets/:address route renders wallet.ejs (156 lines); EJS includes all four required sections |
| 12 | grammY bot starts non-blocking; /status, /top, /wallet, /signal commands registered; graceful no-op without token | VERIFIED | bot/index.ts: startBot() returns null with log if no TELEGRAM_BOT_TOKEN; registerCommands() called; bot.start() not awaited |
| 13 | Alert dispatcher (runAlertCycle) wired to cycleEmitter; 2h dedup via alert_log; +3 accumulation override; top 2-3 holders in messages | VERIFIED | alerts.ts: DEDUP_WINDOW_MS=2h, ACCUMULATION_DELTA=3; getTopHolders() returns up to 3 tracked wallet addresses; onConflictDoUpdate upserts alert_log after each sent alert |

**Score:** 13/13 truths verified (automated)

### Required Artifacts

| Artifact | Status | Level 1: Exists | Level 2: Substantive | Level 3: Wired |
|----------|--------|-----------------|----------------------|----------------|
| `src/db/schema.ts` | VERIFIED | Yes | alert_log (line 127) + token_metadata (line 134) present | Imported in all route files and bot files |
| `src/db/migrations/0006_alert_log_token_metadata.sql` | VERIFIED | Yes | 14 lines, both CREATE TABLEs with statement-breakpoint | Applied to echo.db per SUMMARY |
| `src/api/cycle-events.ts` | VERIFIED | Yes | EventEmitter singleton with setMaxListeners(50) | Imported in loop.ts, signals.ts, bot/index.ts |
| `src/monitor/loop.ts` | VERIFIED | Yes | cycleEmitter.emit('cycle') on line 184 inside try block | Imports cycle-events.ts; emits after computeAllTokenSignals() |
| `src/api/server.ts` | VERIFIED | Yes | 66 lines; buildServer() registers SSEPlugin, StaticPlugin, ViewPlugin, all routes, dashboard GET / | Called in cli.ts 'serve' command |
| `src/api/routes/signals.ts` | VERIFIED | Yes | /api/signals, /api/signals/:mint, /api/signals/partial, /events/cycle (SSE) all implemented | Registered in server.ts; cycleEmitter imported |
| `src/api/routes/wallets.ts` | VERIFIED | Yes | /api/wallets + /wallets/:address both implemented with real DB queries | Registered in server.ts |
| `src/api/routes/status.ts` | VERIFIED | Yes | /api/status with count() and max() queries | Registered in server.ts |
| `src/api/views/layout.ejs` | VERIFIED | Yes | Contains htmx.org@2.0.3, htmx-ext-sse@2.2.2, alpinejs@3.14.8 CDN includes | Used by dashboard and wallet routes via per-call `{ layout: 'layout' }` option |
| `src/api/views/dashboard.ejs` | VERIFIED | Yes | Alpine x-data tier chips + HTMX SSE wiring; wallet list table with /wallets links | Rendered by GET / |
| `src/api/views/partials/signal_rows.ejs` | VERIFIED | Yes | Tier badges, score, topHolderAddress links to /wallets; x-show Alpine filter | Rendered by /api/signals/partial |
| `src/api/public/styles.css` | VERIFIED | Yes | row-highlight keyframe animation present; tier badge classes (.tier-strong/moderate/weak/inactive) | Linked from layout.ejs /public/styles.css |
| `src/api/bot/index.ts` | VERIFIED | Yes | startBot() exported; registerCommands() called; cycleEmitter wired to runAlertCycle; bot.start() non-blocking | Called from cli.ts 'serve' command |
| `src/api/bot/commands.ts` | VERIFIED | Yes | /status, /top, /wallet, /signal, /start handlers registered; /top includes topHolder per entry | registerCommands() imported and called in bot/index.ts |
| `src/api/bot/alerts.ts` | VERIFIED | Yes | runAlertCycle exports; 2h dedup; +3 accumulation; getTopHolders(); onConflictDoUpdate upsert | Imported in bot/index.ts; wired to cycleEmitter 'cycle' event |
| `src/api/views/wallet.ejs` | VERIFIED | Yes | 156 lines; score card, 4 sub-scores with weights and raw metrics, detection flags with evidence JSON parse, recent trades (×1000 timestamp fix), current holdings | Rendered by GET /wallets/:address |
| `src/cli.ts` | VERIFIED | Yes | 'serve' subcommand: buildServer() → server.listen(3000) → startBot() → monitorLoop.start() | Entry point for the entire system |

### Key Link Verification

| From | To | Via | Status | Detail |
|------|----|-----|--------|--------|
| `src/monitor/loop.ts` | `src/api/cycle-events.ts` | `import cycleEmitter; emit('cycle') after computeAllTokenSignals()` | WIRED | Line 10 imports; line 184 emits inside try block |
| `src/api/views/dashboard.ejs` | `/events/cycle` | `hx-ext="sse" sse-connect="/events/cycle"` | WIRED | Line 10: `sse-connect="/events/cycle"` present |
| `src/api/routes/signals.ts` | `src/api/cycle-events.ts` | `cycleEmitter.once('cycle')` in SSE async generator | WIRED | Line 5 imports; line 70 uses `cycleEmitter.once('cycle', resolve)` |
| `src/cli.ts` | `src/api/server.ts` | `buildServer()` called in 'serve' action | WIRED | Lines 8, 27: import and call both present |
| `src/api/views/partials/signal_rows.ejs` | `/wallets/:address` | `href="/wallets/<%= row.topHolderAddress %>"` wrapping smart_wallet_count | WIRED | Line 17: conditional `<a href>` link present |
| `src/api/bot/alerts.ts` | `src/db/schema.ts alert_log` | `onConflictDoUpdate` upsert after each sent alert | WIRED | Lines 83-90: db.insert(alert_log).onConflictDoUpdate() |
| `src/monitor/loop.ts` | `src/api/bot/alerts.ts` | `cycleEmitter 'cycle' event → runAlertCycle()` via bot/index.ts listener | WIRED | bot/index.ts lines 24-28: cycleEmitter.on('cycle', () => runAlertCycle(...)) |
| `src/cli.ts` | `src/api/bot/index.ts` | `startBot()` called in 'serve' action | WIRED | Lines 9, 33: import and call both present |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DASH-01 | 07-01, 07-02 | User can view a live token signal feed sorted by signal score | SATISFIED | GET /api/signals queries token_signals ORDER BY signal_score DESC; dashboard.ejs renders signal feed table |
| DASH-02 | 07-02 | User can view all tracked wallets with score, detection status, last active time | SATISFIED | dashboard.ejs wallets table shows score, detection_status, last_trade_at; GET /api/wallets returns all three fields |
| DASH-03 | 07-03 | User can drill into a wallet to see recent trades, score breakdown, and detection flags | SATISFIED | GET /wallets/:address renders wallet.ejs with all four sections (score card, sub-scores, detection flags, recent trades) |
| DASH-04 | 07-02 | Dashboard receives live score updates via SSE without manual page refresh | SATISFIED | cycleEmitter → /events/cycle SSE endpoint → HTMX hx-trigger="sse:cycle" → /api/signals/partial swap; Alpine x-data wrapper never swapped |
| TGRM-01 | 07-01, 07-03 | User receives a Telegram alert when a token signal score crosses a configured threshold | SATISFIED (needs human) | runAlertCycle() queries token_signals WHERE signal_score >= ALERT_SIGNAL_THRESHOLD; sends via bot.api.sendMessage; wired to cycleEmitter |
| TGRM-02 | 07-03 | System deduplicates alerts — no more than 1 alert per token per 2 hours | SATISFIED | DEDUP_WINDOW_MS = 2h; withinDedup check against alert_log.last_alerted_at; accumulation override for +3 holder delta |
| TGRM-03 | 07-01, 07-03 | User can query the bot with /status, /top, /wallet, /signal | SATISFIED (needs human) | All four commands registered in commands.ts with real DB queries; /top includes topHolder address per entry |

**Orphaned requirements:** None. All 7 requirement IDs (DASH-01 through DASH-04, TGRM-01 through TGRM-03) are claimed across the three plans and verified in the codebase.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | No anti-patterns detected across all 17 API artifacts |

Scanned for: TODO/FIXME/PLACEHOLDER comments, `return null` / `return {}` empty implementations, console.log-only handlers. None found in any file under `src/api/`.

### Human Verification Required

Six items require human verification because they depend on browser execution, live SSE streams, or Telegram API credentials:

#### 1. Dashboard Visual Rendering

**Test:** Run `pnpm echo serve`, then open http://localhost:3000 in a browser.
**Expected:** Dark-themed dashboard loads with signal feed table (columns: Token, Score, Tier, Smart Holders, Updated), tier filter chips (All/Strong/Moderate/Weak), and tracked wallets table (Address, Label, Score, Status, Detection, Last Active).
**Why human:** Visual layout, CSS rendering, and page load cannot be verified programmatically.

#### 2. Alpine.js Tier Filter Interactivity

**Test:** Click each tier chip (Strong, Moderate, Weak, All) in sequence.
**Expected:** Signal rows filter instantly without a page reload; the active chip highlights; state persists after the next SSE update cycle.
**Why human:** JavaScript Alpine.js reactive state requires a live browser environment to test.

#### 3. HTMX SSE Live Update

**Test:** Leave http://localhost:3000 open in the browser; wait for a monitor cycle to complete (approximately 30 seconds if using real data).
**Expected:** Signal rows in the table update automatically without any page interaction.
**Why human:** SSE event delivery and HTMX DOM swap behavior require a running process and an active browser connection.

#### 4. Wallet Detail Page Navigation and Content

**Test:** Click a wallet address link in the dashboard wallet table.
**Expected:** Navigates to /wallets/:address; page displays score card (large overall score), sub-score breakdown table with 4 rows and weights, detection flags section ("All detectors: clean" or flag rows), recent trades table, and current holdings table.
**Why human:** Navigation, EJS rendering, and content correctness require browser-level validation.

#### 5. Telegram Bot Commands

**Test:** With `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` configured in `.env`, run `pnpm echo serve`, send `/start`, `/status`, `/top`, `/wallet <address>`, `/signal <mint>` to the bot.
**Expected:** `/start` returns chat ID; `/status` returns wallet count and last cycle time; `/top` returns top 5 with score, tier, and top holder address per entry; `/wallet` and `/signal` return correct per-entity data.
**Why human:** Telegram bot responses require live Telegram API credentials and external service connectivity.

#### 6. Telegram Alert Delivery and Dedup

**Test:** With a signal score meeting or exceeding `ALERT_SIGNAL_THRESHOLD`, confirm an alert is received; wait and confirm no duplicate within 2 hours; if smart_wallet_count increases by 3+, confirm an ACCUMULATION alert fires.
**Expected:** Alert message contains token mint, score, tier, smart holder count, and top 2-3 wallet address previews.
**Why human:** Alert firing requires live signal data, real Telegram credentials, and time-window testing.

### Gaps Summary

No automated gaps were found. All 13 observable truths are verified, all 17 artifacts pass all three levels (exists, substantive, wired), all 8 key links are confirmed WIRED, all 7 requirements are satisfied by implementation evidence, and TypeScript compiles with zero errors with all 167 tests passing.

The six human verification items are standard UI/UX and external-service behaviors that cannot be confirmed programmatically. They do not represent implementation gaps — they represent the final validation layer for the delivery channel.

---

_Verified: 2026-03-16T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
