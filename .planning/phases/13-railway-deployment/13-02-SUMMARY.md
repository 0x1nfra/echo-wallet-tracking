---
phase: 13-railway-deployment
plan: "02"
subsystem: infra
tags: [railway, sqlite, volume-mount, startup-validation, replica-guard, tdd]

# Dependency graph
requires:
  - phase: 13-railway-deployment/13-01
    provides: Health route and deployment runbook context
provides:
  - validateVolumeMount() in src/startup/volume-check.ts — polls for volume directory with retries, throws structured VolumeCheckError on timeout
  - Rewritten src/cli.ts serve command — volume check before DB import, replica warning, hard-fail policy, startup summary
affects:
  - 13-railway-deployment/13-03 (uses cli.ts serve command infrastructure)
  - Any future phase that modifies startup sequence

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Poll-retry pattern: check → wait 2s → repeat up to 15x → structured error with dir listing"
    - "Dynamic import for volume-check ensures it runs before static-import db side-effects"
    - "Dependency-injectable fs operations (existsSync, readdirSync, setTimeout) for testability without jest.mock"

key-files:
  created:
    - src/startup/volume-check.ts
    - tests/unit/startup/volume-check.test.ts
    - tests/unit/startup/replica-guard.test.ts
  modified:
    - src/cli.ts

key-decisions:
  - "Used dependency injection (VolumeCheckOptions) for fs/setTimeout instead of jest.mock — @jest/globals not installed, project avoids module mocking"
  - "validateVolumeMount takes an options object for testability; production callers pass nothing (defaults to real fs)"
  - "serve command uses dynamic import('./startup/volume-check.js') so volume check runs before static-import db side-effects (db/index.ts creates dir + opens db on import)"
  - "Replica warning is a console.warn, not a hard fail — Railway infrastructure blocks volumes + replicas, so this is an operator advisory"
  - "Telegram bot hard-fail only when TELEGRAM_BOT_TOKEN is configured — no token means bot is intentionally absent"

patterns-established:
  - "Startup validation pattern: poll-retry with injectable deps + structured error with actionable fix hint"
  - "CLI startup ordering: volume check (dynamic import) → replica warning → API server → bot → monitor → summary"

requirements-completed: [DEPLOY-02, DEPLOY-03]

# Metrics
duration: 5min
completed: 2026-04-01
---

# Phase 13 Plan 02: Startup Validation Summary

**SQLite volume mount poll-validator (30s retry) and rewritten serve startup sequence enforcing hard-fail policy with structured error messages**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-01T03:56:57Z
- **Completed:** 2026-04-01T04:02:12Z
- **Tasks:** 2 (4 TDD commits total)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Volume mount validator polls every 2s for up to 30s before throwing VolumeCheckError with expected path, parent directory listing, and actionable fix hint
- Serve command rewritten: dynamic volume-check import ensures DB directory is validated before any db module import (which creates dir + opens db as side-effect)
- RAILWAY_REPLICA_ID detected → WAL integrity warning emitted before DB init
- Hard-fail policy: API server exit(1) on startup failure; Telegram bot exit(1) only if TELEGRAM_BOT_TOKEN is set
- Startup summary logs cycle interval, API port, and Telegram status on successful start

## Task Commits

Each task was committed atomically:

1. **TDD RED — Volume check tests** - `f166b6a` (test)
2. **Task 1: Volume mount validator** - `3ba26f1` (feat) — includes updated tests using DI pattern
3. **TDD RED — Replica guard tests** - `3c6a491` (test)
4. **Task 2: Startup sequence rewrite with replica warning** - `96eb725` (feat) — includes replica-guard tests

_Note: TDD tasks have multiple commits (test RED → feat GREEN)_

## Files Created/Modified

- `src/startup/volume-check.ts` — VolumeCheckError class + validateVolumeMount() with poll-retry and injectable options
- `tests/unit/startup/volume-check.test.ts` — 4 tests using DI pattern (no jest.mock needed)
- `tests/unit/startup/replica-guard.test.ts` — 4 tests: WAL warning logic + integration shape test verifying cli.ts structure
- `src/cli.ts` — Serve command action body fully rewritten: volume check → replica warning → API (hard fail) → bot (conditional fail) → monitor → summary

## Decisions Made

- **Dependency injection over jest.mock:** `@jest/globals` is not installed in this project and the codebase avoids module mocking. Used VolumeCheckOptions injectable interface (existsSync, readdirSync, setTimeout) for full testability without mock infrastructure.
- **Dynamic import for volume-check:** `await import('./startup/volume-check.js')` inside the action body ensures the check runs synchronously before any static-imported module with db side-effects is executed.
- **Replica warning is advisory, not fatal:** Railway's infrastructure prevents volumes + replicas from coexisting, so the warning helps operators diagnose config issues without breaking the service entirely.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test implementation used jest.mock which requires @jest/globals (not installed)**
- **Found during:** Task 1 (Volume mount validator — TDD RED phase)
- **Issue:** Initial tests used `jest.useFakeTimers()` at top level and `jest.unstable_mockModule('fs', ...)` — both require `@jest/globals` import in ESM mode. Package not installed.
- **Fix:** Redesigned both the implementation (added VolumeCheckOptions for DI) and tests to use injected functions instead of module mocking. Matches the pattern used by helius-credit-exhaustion tests in this codebase.
- **Files modified:** src/startup/volume-check.ts (added opts parameter), tests/unit/startup/volume-check.test.ts (rewrote using DI)
- **Verification:** All 4 tests pass without @jest/globals
- **Committed in:** 3ba26f1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test approach)
**Impact on plan:** Auto-fix improved testability architecture. DI pattern is strictly better than mocking for this use case — no scope creep.

## Issues Encountered

- Initial test design assumed `@jest/globals` was available (it is the standard ESM jest import). The project uses jest 29.7.0 but only installs `jest` and `ts-jest`, not `@jest/globals`. Resolved by aligning with the project's established test pattern (no module mocking, extract logic for unit testing).

## User Setup Required

None - no external service configuration required. Volume mount configuration is a Railway deployment concern documented in the Phase 13 runbook (13-01-PLAN output).

## Next Phase Readiness

- Service startup is now production-safe: refuses to operate with ephemeral DB, warns on replica misconfiguration
- src/cli.ts serve command is the canonical startup entrypoint — Plan 03 (Helius credit exhaustion) integrates at the monitor loop level which is already started by this sequence
- All 262 existing tests still pass (no regressions)

---
*Phase: 13-railway-deployment*
*Completed: 2026-04-01*
