---
phase: 07-api-dashboard-and-telegram-alerts
plan: 03
subsystem: api
tags: [grammy, telegram, ejs, fastify, htmx, sse, wallet-detail, alerts]

# Dependency graph
requires:
  - phase: 07-02
    provides: Fastify REST + SSE server, HTMX/Alpine.js dashboard at localhost:3000
  - phase: 06-token-signal-engine
    provides: token_signals table, signal_score, signal_tier, smart_wallet_count columns
  - phase: 07-01
    provides: cycleEmitter singleton, alert_log schema, grammy dependency
provides:
  - Wallet detail page at /wallets/:address with score breakdown, detection flags, recent trades, current holdings
  - grammY Telegram bot with /status, /top, /wallet, /signal, /start commands
  - Alert dispatcher with 2-hour dedup window and +3 accumulation override
  - Alert messages include token mint, score, tier, smart holder count, and top 2-3 wallet addresses
  - cli.ts 'serve' command wires server + bot + monitor loop as unified process
affects: [phase-08-network-graph]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "per-call layout opt-in: pass { layout: 'layout' } to reply.view() for full-page renders only — prevents global layout from wrapping HTMX partial responses"
    - "SSE route registration must include { sse: true } option in Fastify route options for @fastify/sse v0.4 to attach reply.sse methods"
    - "timestamp unit guard: store-in-seconds columns (swaps.timestamp) must be multiplied by 1000 before constructing JavaScript Date objects"
    - "grammY bot.start() is always non-blocking — do not await; crash errors are caught via .catch()"
    - "alert dedup: check alert_log.last_alerted_at within 2-hour window; override with ACCUMULATION type if smart_wallet_count increased by 3+"

key-files:
  created:
    - src/api/bot/index.ts
    - src/api/bot/commands.ts
    - src/api/bot/alerts.ts
    - src/api/views/wallet.ejs
  modified:
    - src/api/routes/wallets.ts
    - src/api/routes/signals.ts
    - src/api/server.ts
    - src/cli.ts
    - .env.example
    - package.json

key-decisions:
  - "Global @fastify/view layout option removed — breaks HTMX partials by wrapping them in layout HTML; layout now passed per full-page route call only"
  - "SSE route requires { sse: true } in Fastify route options for @fastify/sse v0.4 — missing option silently prevented SSE handler from working"
  - "cli.ts refactored to explicit 'serve' subcommand instead of implicit auto-start; cleaner UX and avoids accidental server start on wallet/signal commands"
  - "wallet.ejs timestamp: swaps.timestamp stored as Unix seconds, not milliseconds — fixed by multiplying by 1000 in template"

patterns-established:
  - "Bot alert dispatcher calls getTopHolders() which filters swaps to tracked wallets only — alert messages always reference real tracked holders not random swap participants"
  - "alert_log upsert via onConflictDoUpdate after each sent alert — enables dedup queries using last_alerted_at and last_holder_count"

requirements-completed: [DASH-03, TGRM-01, TGRM-02, TGRM-03]

# Metrics
duration: ~90min (including human verification and post-checkpoint bug fix cycle)
completed: 2026-03-16
---

# Phase 7 Plan 03: Dashboard Delivery Layer and Telegram Bot Summary

**Wallet detail page at /wallets/:address with score card and trade history; grammY bot with /status, /top, /wallet, /signal commands and 2-hour deduped alert dispatcher — completing all Phase 7 requirements**

## Performance

- **Duration:** ~90 min (including human verification and post-checkpoint bug fix cycle)
- **Started:** 2026-03-16 (continuation from checkpoint)
- **Completed:** 2026-03-16
- **Tasks:** 3 (Tasks 1 and 2 committed in prior agent; Task 3 verified + bug fixes committed here)
- **Files modified:** 10

## Accomplishments

- Wallet detail page renders at /wallets/:address with full score breakdown (4 sub-scores with weights), detection flags with evidence JSON, recent 20 trades, and top 10 current holdings by estimated position size
- grammY Telegram bot with /start, /status, /top, /wallet, /signal command handlers — graceful no-op when TELEGRAM_BOT_TOKEN absent
- Alert dispatcher wired to cycleEmitter 'cycle' events: threshold check, 2-hour dedup via alert_log, +3 smart_wallet_count accumulation override, top 2-3 holder addresses in messages
- Three post-checkpoint bugs fixed: SSE route option, global layout/HTMX conflict, and timestamp unit mismatch
- cli.ts refactored to explicit 'serve' subcommand — cleaner developer UX

## Task Commits

Each task was committed atomically:

1. **Task 1: Wallet detail page and route** - `30a73b7` (feat)
2. **Task 2: grammY Telegram bot with commands and alert dispatcher** - `46e73fd` (feat)
3. **Task 3: Verify complete Phase 7 delivery layer + bug fixes** - `7e144d4` (fix)

## Files Created/Modified

- `src/api/bot/index.ts` - grammY bot init, command registration, cycleEmitter alert wiring, non-blocking bot.start()
- `src/api/bot/commands.ts` - /status, /top, /wallet, /signal, /start command handlers with inline DB queries
- `src/api/bot/alerts.ts` - runAlertCycle: threshold filter, dedup check, accumulation override, getTopHolders(), onConflictDoUpdate alert_log upsert
- `src/api/views/wallet.ejs` - Score card, sub-score table with raw metrics, detection flags with evidence JSON, recent trades, current holdings
- `src/api/routes/wallets.ts` - Added GET /wallets/:address HTML route; fixed { layout: 'layout' } per-call opt-in
- `src/api/routes/signals.ts` - Fixed SSE route: added { sse: true } to route options
- `src/api/server.ts` - Removed global layout from @fastify/view registration; dashboard route passes layout explicitly
- `src/cli.ts` - Refactored from implicit auto-start to explicit 'serve' subcommand
- `.env.example` - Added TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALERT_SIGNAL_THRESHOLD
- `package.json` - Updated dev script to use 'tsx src/cli.ts serve'

## Decisions Made

- Global `@fastify/view` layout option removed — when set globally, every `reply.view()` call (including HTMX partial renders at /api/signals/partial) gets wrapped in the full HTML layout, breaking partial updates. Layout is now passed per-call only for full-page routes.
- SSE route registration requires explicit `{ sse: true }` in Fastify route options for @fastify/sse v0.4 — missing this silently prevented reply.sse from being attached to the reply object.
- cli.ts converted to explicit 'serve' subcommand — the previous implicit auto-start approach ran the server on every CLI invocation including wallet/signal subcommands.

## Deviations from Plan

### Auto-fixed Issues (found during human verification, committed in Task 3)

**1. [Rule 1 - Bug] SSE route missing { sse: true } option**
- **Found during:** Task 3 (human verification — SSE events not firing in browser)
- **Issue:** `app.get('/events/cycle', async ...)` was missing `{ sse: true }` route option; @fastify/sse v0.4 requires this to attach `reply.sse` methods to the reply object
- **Fix:** Changed to `app.get('/events/cycle', { sse: true }, async ...)`
- **Files modified:** src/api/routes/signals.ts
- **Verification:** Live updates working in browser after fix; 167 tests still passing
- **Committed in:** 7e144d4 (Task 3 fix commit)

**2. [Rule 1 - Bug] Global @fastify/view layout option broke HTMX partials**
- **Found during:** Task 3 (human verification — HTMX partial responses contained full HTML layout)
- **Issue:** `layout: 'layout'` in plugin registration wrapped ALL reply.view() responses (including /api/signals/partial) in the full HTML layout, breaking HTMX innerHTML swap
- **Fix:** Removed `layout: 'layout'` from plugin options; added `{ layout: 'layout' }` as third argument to full-page view calls (dashboard and wallet detail routes only)
- **Files modified:** src/api/server.ts, src/api/routes/wallets.ts
- **Verification:** HTMX tier filter and live update work correctly; full pages render with layout
- **Committed in:** 7e144d4 (Task 3 fix commit)

**3. [Rule 1 - Bug] wallet.ejs timestamp in seconds not milliseconds**
- **Found during:** Task 3 (human verification — trade timestamps displayed as 1970-01-01)
- **Issue:** `swaps.timestamp` stores Unix seconds; `new Date(t.timestamp)` treats it as milliseconds — resulting in pre-epoch dates
- **Fix:** Changed to `new Date(t.timestamp * 1000).toLocaleString()`
- **Files modified:** src/api/views/wallet.ejs
- **Verification:** Trade timestamps show correct dates in wallet detail page
- **Committed in:** 7e144d4 (Task 3 fix commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - Bug)
**Impact on plan:** All three fixes were required for correct browser behaviour. No scope changes or new features added.

## Issues Encountered

- @fastify/sse v0.4 route option requirement (`{ sse: true }`) was not documented in the plan — discovered only during verification. Fixed immediately per deviation Rule 1.

## User Setup Required

**Telegram bot requires manual configuration before alerts work.** Add to `.env`:

```
TELEGRAM_BOT_TOKEN=<from @BotFather on Telegram>
TELEGRAM_CHAT_ID=<send /start to your bot, note the chat ID logged to console>
ALERT_SIGNAL_THRESHOLD=50
```

Bot commands (/status, /top, /wallet, /signal) work without `TELEGRAM_CHAT_ID`. Alerts require both token and chat ID.

## Next Phase Readiness

- All Phase 7 requirements complete: DASH-01, DASH-02, DASH-03, TGRM-01, TGRM-02, TGRM-03 delivered
- Phase 8 (Network Graph) can begin — all prerequisite subsystems in place: wallet tracking, signal scoring, detection engine, dashboard, bot
- Monitor loop, REST API, SSE, dashboard, and Telegram bot all start together via `pnpm dev` or `pnpm echo serve`

---
*Phase: 07-api-dashboard-and-telegram-alerts*
*Completed: 2026-03-16*
