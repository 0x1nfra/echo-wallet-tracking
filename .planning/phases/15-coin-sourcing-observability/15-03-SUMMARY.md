---
phase: 15-coin-sourcing-observability
plan: "03"
subsystem: sourcing
tags: [auto-sourcer, discovery, wallet-attribution, monitor]

# Dependency graph
requires:
  - phase: 15-01
    provides: sourcing_log table, wallets.source column schema
  - phase: 15-02
    provides: AutoSourcer class with GmgnFetcher, daily/total caps, sourcing_log writes
provides:
  - runDiscovery() accepts source param — wallets.source set cleanly at insert time
  - AutoSourcer passes source:'gmgn' to runDiscovery for clean attribution
  - autoSourcer singleton exported from monitor/index.ts
  - wallet monitor start/stop commands start/stop autoSourcer alongside monitorLoop
  - SEED-06 manual CLI seeding verified unchanged
affects: [phase-16, monitoring-startup, wallet-attribution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DiscoveryOptions.source propagated through evaluateCandidate to wallet insert — single point of attribution"
    - "Singleton autoSourcer exported from monitor/index.ts mirrors monitorLoop pattern in commands/wallet.ts"

key-files:
  created: []
  modified:
    - src/discovery/index.ts
    - src/sourcing/auto-sourcer.ts
    - src/monitor/index.ts
    - src/commands/wallet.ts

key-decisions:
  - "walletSource passed as explicit parameter to evaluateCandidate rather than closing over it — keeps function signature self-documenting"
  - "autoSourcer singleton created in monitor/index.ts (not commands/wallet.ts) — mirrors monitorLoop export pattern, single source of truth for the instance"
  - "SIGINT handler also calls autoSourcer.stop() — ensures clean shutdown on Ctrl+C in addition to SIGTERM"

patterns-established:
  - "Optional source propagation: DiscoveryOptions.source -> walletSource local -> evaluateCandidate param -> conditional spread on insert"

requirements-completed: [SEED-03, SEED-04, SEED-05]

# Metrics
duration: 15min
completed: 2026-04-18
---

# Phase 15 Plan 03: AutoSourcer Startup Wiring + Discovery Source Attribution Summary

**runDiscovery() accepts source param for clean wallet attribution, AutoSourcer starts/stops with monitor loop, wallets.source='gmgn' set at insert time**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-18T12:10:00Z
- **Completed:** 2026-04-18T12:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extended `DiscoveryOptions` with `source?: string` and propagated it through `evaluateCandidate` to the wallet insert — wallets sourced via AutoSourcer now get `source='gmgn'` set cleanly at the time of insertion
- Replaced the TODO comment in `auto-sourcer.ts` with the actual `source: 'gmgn'` option on the `runDiscovery()` call
- Exported `AutoSourcer` class and `autoSourcer` singleton from `src/monitor/index.ts`, matching the `monitorLoop` export pattern
- Wired `autoSourcer.start()` and `autoSourcer.stop()` into the `wallet monitor start` action, SIGTERM handler, and SIGINT handler
- SEED-06 manual CA seeding via `railway run node dist/cli.js wallet discover <mint>` confirmed unchanged with verification comment

## Task Commits

Each task was committed atomically:

1. **Task 1: Add source param to runDiscovery() for wallet attribution** - `25dfe36` (feat)
2. **Task 2: Export autoSourcer from monitor/index.ts and wire into wallet monitor start/stop** - `60ece27` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/discovery/index.ts` - Added `source?` to `DiscoveryOptions`, `walletSource` param to `evaluateCandidate`, conditional spread on wallet insert
- `src/sourcing/auto-sourcer.ts` - Replaced TODO with `source: 'gmgn'` in `runDiscovery` call
- `src/monitor/index.ts` - Added `AutoSourcer` class re-export and `autoSourcer` singleton export
- `src/commands/wallet.ts` - Imported `autoSourcer`, wired start/stop into monitor start action and signal handlers, added SEED-06 comment

## Decisions Made

- `walletSource` passed as explicit parameter to `evaluateCandidate` rather than closing over it — keeps function signature self-documenting and avoids implicit capture
- `autoSourcer` singleton created in `monitor/index.ts` (not `commands/wallet.ts`) — mirrors the `monitorLoop` export pattern, single source of truth for the instance
- SIGINT handler also calls `autoSourcer.stop()` — ensures clean shutdown on Ctrl+C in addition to SIGTERM

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 complete: AutoSourcer is now fully wired into the startup sequence with clean source attribution
- Plans 01+02+03 together deliver the full GMGN auto-sourcing pipeline: schema → fetcher + engine → startup wiring
- Ready for Plan 04 (observability dashboard) and Plan 05 (Telegram /status command)

---
*Phase: 15-coin-sourcing-observability*
*Completed: 2026-04-18*

## Self-Check: PASSED

- FOUND: src/discovery/index.ts
- FOUND: src/sourcing/auto-sourcer.ts
- FOUND: src/monitor/index.ts
- FOUND: src/commands/wallet.ts
- FOUND commit: 25dfe36
- FOUND commit: 60ece27
