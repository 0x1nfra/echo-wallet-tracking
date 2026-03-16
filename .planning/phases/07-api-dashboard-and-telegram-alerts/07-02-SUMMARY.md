---
phase: 07-api-dashboard-and-telegram-alerts
plan: "02"
subsystem: api
tags: [fastify, ejs, htmx, alpinejs, sse, dashboard, sqlite, drizzle]

# Dependency graph
requires:
  - phase: 07-api-dashboard-and-telegram-alerts
    provides: cycleEmitter singleton, fastify/ejs/grammy packages installed, alert_log + token_metadata schema
  - phase: 06-token-signal-engine
    provides: token_signals table with signal_score + signal_tier, computeAllTokenSignals()
provides:
  - Fastify HTTP server at port 3000 with SSE, static file, and EJS view plugins
  - GET /api/signals — JSON array of token signals with token metadata enrichment
  - GET /api/signals/:mint — single token signal JSON
  - GET /api/signals/partial — HTMX partial HTML of signal table rows
  - GET /api/wallets — JSON array of tracked wallets with metrics
  - GET /api/status — system health JSON (wallet_count, active_signal_count, last_cycle_at)
  - GET /events/cycle — SSE endpoint broadcasting cycleEmitter 'cycle' events to browsers
  - GET / — server-side rendered dashboard with signal feed + wallet list
  - HTMX SSE auto-updates signal rows on each MonitorLoop cycle
  - Alpine.js tier filter chips (All/Strong/Moderate/Weak) that survive HTMX swaps
  - Smart holder count cells link to /wallets/:topHolderAddress (second wallet detail entry point)
  - CLI starts Fastify alongside MonitorLoop automatically
affects:
  - 07-api-dashboard-and-telegram-alerts (plan 03 Telegram alerts, plan 04 wallet detail page)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - HTMX SSE integration pattern — Alpine x-data on outer wrapper never replaced by HTMX, only inner tbody swapped
    - Fastify async plugin registration pattern (await app.register(import('./routes/x.js')))
    - Dynamic import in route handler for db/schema to avoid circular dependency at module load
    - topHolderAddress enrichment via tracked-wallet join applied consistently in both initial SSE and HTMX partial

key-files:
  created:
    - src/api/server.ts
    - src/api/routes/signals.ts
    - src/api/routes/wallets.ts
    - src/api/routes/status.ts
    - src/api/views/layout.ejs
    - src/api/views/dashboard.ejs
    - src/api/views/partials/signal_rows.ejs
    - src/api/public/styles.css
  modified:
    - src/cli.ts

key-decisions:
  - "reply.sse is an interface object with .send(AsyncIterable) not a callable — plan's reply.sse(generator) syntax was incorrect; fixed to reply.sse.send(asyncGenerator)"
  - "Alpine x-data wrapper on outer div never replaced by HTMX — only tbody#signal-rows innerHTML is swapped, so tier filter state survives SSE updates"
  - "Dynamic import for db/schema in dashboard GET / route handler avoids circular dependency at server startup"
  - "topHolderAddress enrichment applied in both /api/signals/partial and GET / initial render for consistent wallet detail links"

patterns-established:
  - "Pattern: HTMX SSE partial swap — Alpine state wrapper is ancestor of HTMX swap target; keep x-data on outer element that is never in swap target"
  - "Pattern: @fastify/sse v0.4 API — reply.sse.send(AsyncIterable<SSEMessage>) for generator-based SSE streams"

requirements-completed: [DASH-01, DASH-02, DASH-04]

# Metrics
duration: 12min
completed: "2026-03-16"
---

# Phase 7 Plan 02: API Dashboard and Telegram Alerts Summary

**Fastify REST + SSE server with live HTMX/Alpine.js dashboard displaying token signal feed (with tier filtering) and wallet list, auto-updating every 30s via cycleEmitter SSE broadcast**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-16T03:50:00Z
- **Completed:** 2026-03-16T04:02:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Fastify server on port 3000 starts alongside MonitorLoop when CLI runs — dashboard accessible immediately
- GET /api/signals, /api/wallets, /api/status all return valid JSON with live SQLite data
- GET /events/cycle SSE endpoint fires 'cycle' events from cycleEmitter to all connected browsers
- Dashboard renders server-side on first load and HTMX auto-refreshes signal rows on each monitor cycle
- Alpine tier filter chips (All/Strong/Moderate/Weak) survive HTMX partial swaps — outer x-data wrapper never replaced
- Smart holder count cells link to /wallets/:topHolderAddress enabling navigation to wallet detail view
- All 167 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Build Fastify server with REST + SSE routes** - `b33e723` (feat)
2. **Task 2: Build EJS dashboard views and wire server startup into CLI** - `92727ab` (feat)

## Files Created/Modified

- `src/api/server.ts` - Fastify factory with SSE, static, view plugins; GET / dashboard route with topHolderAddress enrichment
- `src/api/routes/signals.ts` - GET /api/signals, /api/signals/:mint, /api/signals/partial, GET /events/cycle SSE
- `src/api/routes/wallets.ts` - GET /api/wallets filtered to tracked wallets with wallet_metrics join
- `src/api/routes/status.ts` - GET /api/status with wallet_count, active_signal_count, last_cycle_at
- `src/api/views/layout.ejs` - HTML shell with HTMX 2.0.3, htmx-ext-sse 2.2.2, Alpine.js 3.14.8 CDN includes
- `src/api/views/dashboard.ejs` - Signal feed section with Alpine tier chips + HTMX SSE; wallet list table
- `src/api/views/partials/signal_rows.ejs` - Table rows partial with tier badges, score, topHolderAddress links
- `src/api/public/styles.css` - Dark theme, tier badge colors (.tier-strong/moderate/weak/inactive), row-highlight keyframe animation
- `src/cli.ts` - buildServer() called in async .then() after resumeImportingWallets(); port 3000

## Decisions Made

- reply.sse is an interface object (SSEReplyInterface) not a callable function. Plan showed `reply.sse(generator)` but the correct API is `reply.sse.send(AsyncIterable<SSEMessage>)`. Fixed to use `.send()` with an async generator — zero impact on behavior.
- Alpine x-data wrapper on outer div is never inside the HTMX swap target (only tbody#signal-rows innerHTML is swapped), so tier filter state (`activeTier`) survives SSE updates correctly. This matches the plan's stated design.
- Dynamic import for db/schema inside the GET / handler avoids circular dependency at module load time, consistent with the Phase 04 scoring engine pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed reply.sse API call — use .send(AsyncIterable) not reply.sse(generator)**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Plan showed `reply.sse(async function*() {...}())` but @fastify/sse v0.4 SSEReplyInterface has no call signature — it's an object with `.send()`, `.close()`, `.isConnected` etc.
- **Fix:** Changed to `reply.sse.send(asyncGenerator)` and used `reply.sse.isConnected` for loop guard
- **Files modified:** src/api/routes/signals.ts
- **Verification:** `pnpm exec tsc --noEmit` — no errors; server starts and GET /events/cycle returns SSE headers
- **Committed in:** b33e723 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan's API example)
**Impact on plan:** Essential fix — code would not compile without it. No scope creep.

## Issues Encountered

None — once the SSE API mismatch was corrected, both tasks executed smoothly.

## User Setup Required

None — server runs on localhost:3000 with the existing SQLite database. No external services needed for this plan.

## Next Phase Readiness

- Fastify server is running and all REST API routes are available
- cycleEmitter fan-out is working — browsers connected to /events/cycle receive live updates
- Dashboard is accessible at http://localhost:3000 with signal feed and wallet list
- /wallets/:address route (wallet detail page) does not yet exist — Plan 04 will implement it
- Telegram bot (Plan 03) has its required infrastructure (grammy installed, alert_log table, cycleEmitter)

## Self-Check: PASSED

All created files found. All task commits (b33e723, 92727ab) verified in git log.

---
*Phase: 07-api-dashboard-and-telegram-alerts*
*Completed: 2026-03-16*
