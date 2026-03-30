---
phase: 12-signal-accuracy-logging
plan: "04"
subsystem: api
tags: [fastify, htmx, ejs, grammy, accuracy, telegram]

requires:
  - phase: 12-02
    provides: getAccuracyStats() function and MIN_SAMPLE constant from src/signals/accuracy.ts
  - phase: 12-03
    provides: signal_events table with tier transition rows and resolved outcome columns

provides:
  - GET /api/accuracy REST endpoint returning JSON accuracy stats per tier
  - GET /api/accuracy/partial HTMX endpoint returning rendered accuracy_stats.ejs
  - Dashboard Signal Accuracy section with HTMX SSE auto-refresh above Signal Feed
  - Telegram /accuracy command with tier hit rates and MIN_SAMPLE gate

affects:
  - dashboard rendering
  - telegram bot commands
  - fastify route registration

tech-stack:
  added: []
  patterns:
    - Fastify plugin pattern for accuracy routes (same as signals.ts)
    - HTMX SSE auto-refresh: hx-trigger=sse:cycle reuses /events/cycle SSE stream
    - EJS partial with inline JS helpers for formatting (fmtPct, fmtStatus)
    - Dynamic import of accuracy module in server.ts dashboard route (consistent with project pattern)

key-files:
  created:
    - src/api/routes/accuracy.ts
    - src/api/views/partials/accuracy_stats.ejs
  modified:
    - src/api/server.ts
    - src/api/views/dashboard.ejs
    - src/api/bot/commands.ts

key-decisions:
  - "Weak tier excluded from primary aggregate stats table but shown in recent signal events table — consistent with plan spec"
  - "MIN_SAMPLE imported from accuracy.ts in both commands.ts and accuracy.ts route — single source of truth"
  - "Dashboard uses dynamic import for getAccuracyStats in GET / handler — consistent with project pattern for avoiding circular deps at module load time"
  - "/accuracy command is on-demand only — no automatic digest scheduling, consistent with all other bot commands"

patterns-established:
  - "HTMX SSE refresh: hx-ext=sse + sse-connect=/events/cycle on outer div, hx-trigger=sse:cycle on inner element"
  - "Accuracy partial SSR: server.ts passes accuracyStats + recentSignalEvents + MIN_SAMPLE for initial page load"

requirements-completed: [QUAL-02, QUAL-03]

duration: 2min
completed: 2026-03-27
---

# Phase 12 Plan 04: Signal Accuracy Display Summary

**HTMX-refreshing accuracy dashboard section and Telegram /accuracy command delivering per-tier hit rates with MIN_SAMPLE=20 gate**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T05:44:27Z
- **Completed:** 2026-03-27T05:46:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `src/api/routes/accuracy.ts` Fastify plugin with GET /api/accuracy (JSON) and GET /api/accuracy/partial (HTMX) endpoints
- Created `src/api/views/partials/accuracy_stats.ejs` with aggregate stats table (strong/moderate tiers) and recent signal events table (all tiers including weak)
- Added Signal Accuracy section to dashboard above Signal Feed with HTMX SSE auto-refresh on cycle events
- Added /accuracy Telegram command with strong/moderate primary display, weak secondary, and MIN_SAMPLE=20 gate
- 237 tests green — all passing unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create accuracy route and accuracy_stats partial** - `d8db16e` (feat)
2. **Task 2: Add accuracy section to dashboard and /accuracy Telegram command** - `ddd2888` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/api/routes/accuracy.ts` - Fastify plugin: GET /api/accuracy (JSON stats) and GET /api/accuracy/partial (HTMX rendered partial)
- `src/api/views/partials/accuracy_stats.ejs` - Aggregate stats table for strong/moderate tiers + recent signal events table for all tiers; shows "Insufficient data (X/20)" when below MIN_SAMPLE
- `src/api/server.ts` - Registered accuracy routes; dashboard GET / handler now queries and passes accuracyStats, recentSignalEvents, MIN_SAMPLE
- `src/api/views/dashboard.ejs` - Added Signal Accuracy section with HTMX SSE auto-refresh (hx-trigger=sse:cycle) above Signal Feed section
- `src/api/bot/commands.ts` - Added /accuracy command: hit rates by tier with MIN_SAMPLE gate; strong/moderate primary, weak shown only when sample threshold met

## Decisions Made

- Weak tier excluded from primary aggregate stats table but included in recent signal events table — consistent with plan spec (weak signals visible for history, not highlighted in stats)
- MIN_SAMPLE imported from accuracy.ts in both the route and commands.ts — single source of truth, no magic numbers
- Dynamic import used for getAccuracyStats in server.ts dashboard route — consistent with project pattern for avoiding circular deps at module load time
- /accuracy command is on-demand only — no automatic digest scheduling, consistent with all other bot commands (/status, /top, /wallet, /signal)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All created files confirmed present. Both task commits (d8db16e, ddd2888) confirmed in git log.

## Next Phase Readiness

Phase 12 is complete. All three requirement IDs are addressed:
- QUAL-01 (event logging in Plans 01+03): signal_events written on tier transitions, outcomes resolved per cycle
- QUAL-02 (accuracy rate visible to user in Plans 02+04): dashboard section + /accuracy Telegram command
- QUAL-03 (historical outcome data surface in Plans 01+03+04): full signal_events snapshot with entry price, tier, and 1h/4h/24h outcomes surfaced in recent events table and via Telegram

---
*Phase: 12-signal-accuracy-logging*
*Completed: 2026-03-27*
