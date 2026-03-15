---
phase: 05-monitoring-loop-and-auto-removal
plan: 02
subsystem: monitoring
tags: [drizzle-orm, better-sqlite3, helius, monitoring, auto-removal, scheduling]

# Dependency graph
requires:
  - phase: 05-01
    provides: "migration 0004 with low_score_streak, last_trade_at, removal_log.label, removal_log.score_at_removal columns"
  - phase: 04-metrics-and-scoring
    provides: "scoreWalletIfNeeded from scoring engine"
  - phase: 03-bundle-scam-detection
    provides: "runDetectionIfNeeded from detection engine"
  - phase: 02-transaction-parsing
    provides: "fetchSwapHistory, parseSwaps, applyFifo"
provides:
  - "MonitorLoop class: start/pause/resume/stop/runCycle with 30s cycle"
  - "checkRemovalPolicies: three auto-removal policies (scam, streak, inactivity)"
  - "removeWallet helper: sets wallets.status='removed', writes removal_log"
  - "src/monitor/index.ts re-export entry point"
affects: [phase-06, phase-07-dashboard, cli-commands]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MonitorLoop timer pattern: scheduleNextCycle(0) for immediate start, CYCLE_INTERVAL_MS for subsequent cycles"
    - "Incremental fetch: last_checked_at converted ms->s as Helius afterTimestamp"
    - "Stagger 200ms between wallet fetches on each cycle to avoid burst"
    - "checkRemovalPolicies only called after successful pipeline — never on fetch error"
    - "Fetch error handling: log to stderr, increment failed counter, do not increment low_score_streak"

key-files:
  created:
    - src/monitor/removal.ts
    - src/monitor/loop.ts
    - src/monitor/index.ts
  modified: []

key-decisions:
  - "checkRemovalPolicies called only after successful pipeline run — enforces that fetch errors never increment low_score_streak"
  - "last_trade_at=NULL guard skips inactivity check — wallets with no swap data treated as 'not yet tracked', not inactive"
  - "MonitorLoop.start() uses scheduleNextCycle(0) so first cycle fires immediately (not after 30s delay)"
  - "Stagger 200ms between wallet fetches in each cycle (not just startup) to avoid burst on every cycle"

patterns-established:
  - "Timer management: timer=null in tick() before async work, timer set again in scheduleNextCycle after cycle completes"
  - "Removal policy order: scam check first (immediate), then streak (10 consecutive), then inactivity (30 days)"
  - "Re-read wallet row after streak increment to get authoritative updated low_score_streak value"

requirements-completed: [MNTR-01, MNTR-02, MNTR-03, RMVL-01, RMVL-02, RMVL-03, RMVL-04]

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 05 Plan 02: Monitoring Loop and Auto-Removal Summary

**MonitorLoop class orchestrating 30-second fetch-detect-score cycles with three removal policies (scam/streak/inactivity) writing to removal_log**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T17:20:19Z
- **Completed:** 2026-03-13T17:22:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- MonitorLoop class with start/pause/resume/stop/runCycle: 30s cycle, immediate first run, crash auto-restart after 5s
- Three removal policies: confirmed_suspicious (immediate), low_score_streak < 30 for 10 cycles, no trades for 30 days
- Incremental fetch per wallet using last_checked_at (ms) converted to Helius afterTimestamp (seconds)
- Single-wallet failures caught and logged without affecting other wallets or streak counters
- 136 tests all green after new files added

## Task Commits

Each task was committed atomically:

1. **Task 1: Create removal policy engine** - `6899ed3` (feat)
2. **Task 2: Create MonitorLoop class + index.ts** - `2b16dcb` (feat)

## Files Created/Modified
- `src/monitor/removal.ts` - checkRemovalPolicies (three policies), removeWallet helper, exported constants
- `src/monitor/loop.ts` - MonitorLoop class with full cycle orchestration
- `src/monitor/index.ts` - re-exports MonitorLoop

## Decisions Made
- checkRemovalPolicies called only after successful pipeline — enforces that fetch errors never increment low_score_streak (matches plan spec)
- last_trade_at=NULL guard skips inactivity check — wallets with no swap data treated as "not yet tracked", not inactive
- MonitorLoop.start() uses scheduleNextCycle(0) so first cycle fires immediately
- 200ms stagger between wallet fetches applied on every cycle (not just startup) to avoid burst

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- src/monitor module complete and TypeScript-clean
- MonitorLoop can be instantiated and wired into the CLI or server entry point in Phase 6
- Removal policies enforce all four RMVL requirements with correct null-guards

---
*Phase: 05-monitoring-loop-and-auto-removal*
*Completed: 2026-03-13*

## Self-Check: PASSED

- src/monitor/removal.ts: FOUND
- src/monitor/loop.ts: FOUND
- src/monitor/index.ts: FOUND
- 05-02-SUMMARY.md: FOUND
- Commit 6899ed3 (Task 1): FOUND
- Commit 2b16dcb (Task 2): FOUND
