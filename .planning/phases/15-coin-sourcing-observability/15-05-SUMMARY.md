---
phase: 15-coin-sourcing-observability
plan: 05
subsystem: api
tags: [telegram, bot, grammy, health-monitoring, observability]

# Dependency graph
requires:
  - phase: 15-coin-sourcing-observability
    provides: monitorLoop.cycleCount/lastCycleDurationMs/lastCycleCompletedAt, autoSourcer.getStats(), getSharedProviderStatus()
provides:
  - "/status Telegram command with 3-section health summary: Monitor, AutoSourcer, Providers"
  - "Stall detection with 5-minute threshold"
  - "OBS-02 satisfied: on-demand system health via Telegram"
affects: [phase-16-provider-router, operations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import() in bot command handlers to avoid circular dependencies at module load time"
    - "Multi-section Telegram message using HTML parse_mode with bold section headers"
    - "Try/catch around dynamic provider import for graceful degradation before first cycle"

key-files:
  created: []
  modified:
    - src/api/bot/commands.ts

key-decisions:
  - "Dynamic import used for monitorLoop, autoSourcer, and getSharedProviderStatus in /status handler — avoids circular dependency at module load time (same lazy-import pattern as /admin route)"
  - "Stall threshold is 5 minutes (STALL_THRESHOLD_MS) — distinguishes never-started (null lastCycleCompletedAt) from stalled (> 5 min since last completion)"
  - "Provider section uses try/catch with graceful fallback — handles case where no errors have been recorded yet (empty array) vs module unavailable"
  - "/status is on-demand only — not scheduled, not triggered by cycles; pure command handler"

patterns-established:
  - "Stall detection pattern: check null (neverRan) separately from timeout (stalled) for clear operator UX"

requirements-completed: [OBS-02, SEED-06]

# Metrics
duration: 10min
completed: 2026-04-18
---

# Phase 15 Plan 05: Telegram /status Full Health Summary Summary

**/status Telegram command expanded to 3-section health summary (Monitor, AutoSourcer, Providers) with stall detection, OBS-02 satisfied**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-18T12:45:00Z
- **Completed:** 2026-04-18T12:55:00Z
- **Tasks:** 1 auto + 1 checkpoint (human-verify)
- **Files modified:** 1

## Accomplishments

- Replaced minimal /status (wallet count, signal count, last cycle) with full 3-section health summary
- Monitor section: cycle count, last duration in seconds, last completed timestamp, stall indicator using 5-minute threshold
- AutoSourcer section: status label (Active/Daily cap hit/Ceiling hit/Stopped), daily adds vs cap, total wallets vs ceiling, poll count, last poll time
- Providers section: per-provider state and last error via getSharedProviderStatus() with graceful degradation on empty/unavailable
- OBS-02 requirement satisfied: on-demand system health via /status Telegram command

## Task Commits

1. **Task 1: Expand /status command to full multi-section health summary** - `95d72af` (feat)
2. **Task 2: Human verification checkpoint** — `approved` — /admin, /status, and AutoSourcer polling confirmed by user (2026-04-18)
   - Fix commits applied during verification:
     - `03a8aaa` fix(15-05): wire autoSourcer.start() into serve command
     - `04b7e6d` fix(15-05): import autoSourcer from monitor/index not wallet.ts

## Files Created/Modified

- `src/api/bot/commands.ts` - /status handler replaced with 3-section health summary using dynamic imports for monitorLoop, autoSourcer, and getSharedProviderStatus

## Decisions Made

- Dynamic import used for monitorLoop, autoSourcer, getSharedProviderStatus in /status handler — avoids circular dependency at module load time (same pattern as /admin route from Plan 04)
- Stall threshold 5 minutes matches plan spec; null check (neverRan) treated separately from timeout check (stalled) for clear UX
- Provider section wrapped in try/catch — handles pre-first-cycle state (empty array returns "No provider data yet") and module import failure ("Provider status unavailable")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] autoSourcer.start() not wired into serve command**
- **Found during:** Task 2 human verification (AutoSourcer not polling on startup)
- **Issue:** autoSourcer.start() was exported from monitor/index.ts but never called in the serve command startup path
- **Fix:** Wired autoSourcer.start() into the serve command so AutoSourcer begins polling on app start
- **Files modified:** src/commands/wallet.ts (or serve entry point)
- **Commit:** `03a8aaa`

**2. [Rule 3 - Blocking] autoSourcer imported from wrong module**
- **Found during:** Task 2 human verification (import error at runtime)
- **Issue:** autoSourcer was imported from wallet.ts instead of monitor/index.ts where the singleton is exported
- **Fix:** Updated import path to use monitor/index.ts (consistent with singleton pattern established in Plan 03)
- **Files modified:** src/commands/wallet.ts (or serve entry point)
- **Commit:** `04b7e6d`

## Issues Encountered

None.

## User Setup Required

- **SEED-06 verification:** Run `railway run node dist/cli.js wallet discover <mint> --dry-run` in Railway CLI to confirm CLI seeding works in deployed environment. Requires Railway CLI with project linked.
- **TELEGRAM_CHAT_ID** (optional): Without this env var, the ceiling alert from AutoSourcer is silently skipped. System continues correctly but operator won't receive the ceiling alert. Set to the same Telegram chat ID used for signals.

## Next Phase Readiness

- Phase 15 all 5 plans complete. All 8 requirements (SEED-01 through SEED-06, OBS-01, OBS-02) satisfied across Plans 01-05.
- Ready for Phase 16: ProviderRouter Extension (bundler/wash-trader detection with full Shyft fallback).

---
*Phase: 15-coin-sourcing-observability*
*Completed: 2026-04-18*
