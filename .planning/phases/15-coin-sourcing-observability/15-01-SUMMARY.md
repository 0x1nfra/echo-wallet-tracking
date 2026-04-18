---
phase: 15-coin-sourcing-observability
plan: 01
subsystem: database, infra
tags: [drizzle, sqlite, observability, provider-router, monitor-loop]

# Dependency graph
requires:
  - phase: 14-signal-outcome-tracking
    provides: schema migrations pattern and cycle emitter infrastructure
provides:
  - sourcing_log table for GMGN poll cycle audit records
  - wallets.source column for wallet attribution (gmgn | null)
  - MonitorLoop.cycleCount, lastCycleDurationMs, lastCycleCompletedAt public getters
  - ProviderRouter.getStatus() returning per-provider active/cooldown state
  - getSharedProviderStatus() and updateSharedProviderStatus() in providers/index.ts
affects:
  - 15-02 (AutoSourcer writes to sourcing_log, reads wallets.source)
  - 15-03 (/status Telegram command reads MonitorLoop getters + getSharedProviderStatus)
  - 15-04 (/admin dashboard reads getSharedProviderStatus and cycle metrics)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level shared state store pattern (getSharedProviderStatus/updateSharedProviderStatus) for cross-module observability without coupling
    - ProviderRouter exposes getStatus() for per-provider health introspection
    - MonitorLoop tracks cycle metrics as private fields with public getters

key-files:
  created:
    - src/db/migrations/0011_sourcing_schema.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json
    - src/monitor/loop.ts
    - src/fetchers/providers/router.ts
    - src/fetchers/providers/index.ts

key-decisions:
  - "sourcing_log uses one row per poll cycle (not per token) with aggregate counts — simpler audit trail"
  - "updateSharedProviderStatus() called unconditionally after every cycle — not just on onAllExhausted — ensures healthy provider status is always visible"
  - "Shared provider status stored as module-level variable in providers/index.ts to avoid passing router references through multiple layers"

patterns-established:
  - "Module-level singleton store pattern: module-level let + exported getter/setter for cross-module state sharing without circular imports"
  - "Observability getters on MonitorLoop: private _field updated at cycle end, public get field() accessor"

requirements-completed: [SEED-04, SEED-05, OBS-01, OBS-02]

# Metrics
duration: 15min
completed: 2026-04-18
---

# Phase 15 Plan 01: Sourcing Schema + Observability Foundation Summary

**SQLite sourcing_log table + wallets.source column via migration 0011, MonitorLoop cycle metrics getters, and ProviderRouter.getStatus() with shared status store**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-18T00:00:00Z
- **Completed:** 2026-04-18T00:15:00Z
- **Tasks:** 2
- **Files modified:** 5 (+ 1 created)

## Accomplishments
- Added `sourcing_log` table to schema.ts with aggregate poll cycle counters (tokens_fetched, tokens_seeded, tokens_skipped, tokens_filtered, wallets_added, status, error_message)
- Added `wallets.source` column (text, nullable) for wallet attribution tracking
- Created migration `0011_sourcing_schema.sql` and registered in `_journal.json` at idx 11
- MonitorLoop now exposes 3 public getters: `cycleCount`, `lastCycleDurationMs`, `lastCycleCompletedAt`
- ProviderRouter.getStatus() returns per-provider index/name/state/lastError array
- providers/index.ts exports `getSharedProviderStatus()` and `updateSharedProviderStatus()` — called after every cycle in MonitorLoop.runCycle()

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sourcing_log table and wallets.source column to schema + migration** - `c4e1db5` (feat)
2. **Task 2: Add MonitorLoop observability getters and ProviderRouter.getStatus()** - `13becc0` (feat)

**Plan metadata:** committed with this summary (docs)

## Files Created/Modified
- `src/db/schema.ts` - Added `source` column to wallets table and new `sourcing_log` table
- `src/db/migrations/0011_sourcing_schema.sql` - Migration SQL: ALTER TABLE wallets + CREATE TABLE sourcing_log
- `src/db/migrations/meta/_journal.json` - Registered migration at idx 11
- `src/monitor/loop.ts` - Added 3 private tracking fields, public getters, wired updateSharedProviderStatus()
- `src/fetchers/providers/router.ts` - Added lastError map, getStatus() public method
- `src/fetchers/providers/index.ts` - Added module-level status store with getSharedProviderStatus() and updateSharedProviderStatus()

## Decisions Made
- `sourcing_log` uses one row per poll cycle with aggregate counts (not per token) — simpler, cheaper, and sufficient for observability dashboard needs
- `updateSharedProviderStatus()` called unconditionally after every successful cycle (not only on `onAllExhausted`) — ensures `/admin` and `/status` always show current provider health during normal operation
- Shared provider status stored as module-level variable in `providers/index.ts` to avoid passing router references through layers or creating circular dependencies

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `src/sourcing/gmgn-fetcher.ts` (Property 'rank' does not exist on type '{}') — out of scope for this plan, exists from prior work. No errors in files modified by this plan.

## User Setup Required

None - no external service configuration required. Migration will be applied automatically by the existing migrate() runner in src/db/index.ts on next startup.

## Next Phase Readiness
- sourcing_log table and wallets.source ready for AutoSourcer (Plan 15-02) to write poll cycle records and tag seeded wallets
- MonitorLoop getters and getSharedProviderStatus() ready for /status Telegram command (Plan 15-03) and /admin dashboard (Plan 15-04)
- No blockers

---
*Phase: 15-coin-sourcing-observability*
*Completed: 2026-04-18*
