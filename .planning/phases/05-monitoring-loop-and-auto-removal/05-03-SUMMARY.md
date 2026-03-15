---
phase: 05-monitoring-loop-and-auto-removal
plan: 03
subsystem: cli
tags: [commander, monitoring-loop, cli-table3, removal-log, drizzle-orm]

# Dependency graph
requires:
  - phase: 05-02
    provides: MonitorLoop class with start/pause/stop/runCycle and checkRemovalPolicies
  - phase: 05-01
    provides: removal_log schema table with label, score_at_removal, detection_details, restored_at columns

provides:
  - wallet monitor start/pause/stop CLI commands delegating to shared MonitorLoop instance
  - wallet removals list command printing removal_log rows with full audit columns
  - wallet removals restore <address> command to re-activate removed wallets
  - MonitorLoop auto-starts in cli.ts after resumeImportingWallets() resolves

affects: [06-telegram-alerts, 07-dashboard, 08-smart-money-signals]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level shared MonitorLoop export (monitorLoop) from wallet.ts — imported by both CLI subcommands and cli.ts
    - Loop auto-start chained via .then() after resumeImportingWallets() promise

key-files:
  created: []
  modified:
    - src/commands/wallet.ts
    - src/cli.ts

key-decisions:
  - "monitorLoop exported from wallet.ts as module-level singleton — consumed by cli.ts for auto-start and by wallet monitor subcommands for manual control"
  - "MonitorLoop.start() chained in .then() after resumeImportingWallets().catch() — ensures interrupted imports drain before loop begins; program.parse() remains synchronous"

patterns-established:
  - "Shared instance pattern: module-level export from commands file consumed by cli.ts entry point for lifecycle management"

requirements-completed: [MNTR-01, RMVL-04]

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 5 Plan 03: CLI Wiring Summary

**CLI surface for Phase 5 complete: MonitorLoop auto-starts in cli.ts, wallet monitor/removals subcommands expose full loop control and removal audit/restore via Commander**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T17:24:30Z
- **Completed:** 2026-03-13T17:26:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `wallet monitor start/pause/stop` subcommands delegating to shared `monitorLoop` instance from wallet.ts
- Added `wallet removals list` displaying all removal_log rows with address, label, score, detection status, reason, and timestamp
- Added `wallet removals restore <address>` to re-activate removed wallets, resetting low_score_streak and marking restored_at
- Wired `monitorLoop.start()` in cli.ts chained after `resumeImportingWallets()` — loop auto-starts on every process invocation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add wallet monitor and wallet removals subcommands to wallet.ts** - `d383f37` (feat)
2. **Task 2: Wire MonitorLoop auto-start into cli.ts** - `62d62e8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/commands/wallet.ts` - Added MonitorLoop import, monitorLoop export, removal_log import; wallet monitor and wallet removals subcommand groups
- `src/cli.ts` - Added monitorLoop import; chained monitorLoop.start() in .then() after resumeImportingWallets()

## Decisions Made
- `monitorLoop` exported as module-level singleton from `wallet.ts` so both cli.ts auto-start and `wallet monitor` manual commands share the same instance
- `.then()` chain after `resumeImportingWallets().catch()` ensures interrupted imports complete before the loop fires; `program.parse()` remains synchronous so CLI commands are immediately available

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The plan's verify step suggested `node dist/cli.js wallet monitor --help` but TypeScript path aliases (`@/`) are not resolved in the compiled dist output without a separate alias resolution tool. Verification was performed correctly via `pnpm echo wallet monitor --help` (the project's intended CLI invocation using `tsx`). This is pre-existing project behaviour and not a deviation introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 5 is now complete: monitoring loop runs automatically, three removal policies enforced, CLI surface for control and audit is wired
- Phase 6 (Telegram alerts) can consume removal events and monitor cycle events as needed
- All 136 existing tests pass; no regressions

---
*Phase: 05-monitoring-loop-and-auto-removal*
*Completed: 2026-03-14*

## Self-Check: PASSED

- FOUND: src/commands/wallet.ts
- FOUND: src/cli.ts
- FOUND: commit d383f37 (feat(05-03): add wallet monitor and removals subcommands)
- FOUND: commit 62d62e8 (feat(05-03): wire MonitorLoop auto-start into cli.ts)
