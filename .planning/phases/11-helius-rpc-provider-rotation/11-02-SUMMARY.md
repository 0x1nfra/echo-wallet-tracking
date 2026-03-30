---
phase: 11-helius-rpc-provider-rotation
plan: 02
subsystem: api
tags: [rpc-provider, failover, cooldown, helius, shyft, telegram]

# Dependency graph
requires:
  - phase: 11-helius-rpc-provider-rotation plan 01
    provides: RpcProvider interface, HeliusProvider wrapper, types.ts

provides:
  - ProviderRouter class with 60s per-provider cooldown and priority failover
  - createProviderRouter() factory with startup warning for missing SHYFT_API_KEY
  - Telegram exhaustion alert via lazy botInstance dynamic import
  - src/fetchers/providers/index.ts as single entry point replacing createHeliusFetcher()

affects:
  - 11-03 (ShyftProvider wiring — index.ts TODO comments ready for completion)
  - 11-04 (callsite migration — createProviderRouter() is the replacement export)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ProviderRouter encapsulates cooldown state in Map<number, number> keyed by provider index
    - tryCall* per-method (not generic union types) avoids TypeScript Parameters<union> complexity
    - Date.now reassignment (not jest.spyOn) for cooldown expiry tests — ESM-compatible
    - Dynamic import for botInstance at call time to avoid initialization order issues
    - Lazy ShyftProvider wiring guarded by TODO(11-03) comments in index.ts

key-files:
  created:
    - src/fetchers/providers/router.ts
    - src/fetchers/providers/__tests__/router.test.ts
    - src/fetchers/providers/index.ts
  modified: []

key-decisions:
  - "tryCall* uses three explicit per-method helpers (not generic Parameters<union>) — avoids TS union type error in Parameters<RpcProvider[keyof RpcProvider]>"
  - "Date.now reassignment (not jest.spyOn) used in cooldown expiry tests — jest global unavailable in ESM test modules without explicit import"
  - "ShyftProvider wiring deferred via TODO(11-03) comments — index.ts compiles clean without the file, no conditional static import needed"
  - "onAllExhausted is called before return null — callback failures propagate naturally (not swallowed)"

patterns-established:
  - "Plain Date.now reassignment in beforeEach/afterEach for time-sensitive unit tests (ESM-safe, no jest globals)"
  - "Per-method tryCall* helpers over generic tryCall<T> for strict TypeScript correctness"

requirements-completed:
  - MNTR-03

# Metrics
duration: 3min
completed: 2026-03-26
---

# Phase 11 Plan 02: ProviderRouter Failover Engine Summary

**ProviderRouter with 60s per-provider cooldown, priority failover, and createProviderRouter() factory that warns on missing SHYFT_API_KEY**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T18:51:44Z
- **Completed:** 2026-03-26T18:54:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ProviderRouter implements RpcProvider with per-provider 60s cooldown tracked in Map<number, number>
- All three methods (fetchSwapHistory, fetchEarlySwapsForMint, fetchOnePage) return [] on full exhaustion — never throw
- createProviderRouter() factory warns at startup if SHYFT_API_KEY absent; throws only if HELIUS_API_KEY missing
- Telegram exhaustion alert fires lazily via dynamic botInstance import to avoid init-order issues
- 10 TDD tests covering rotation, cooldown respected, cooldown expiry, all exhausted, and happy path
- 197 total tests pass (187 existing + 10 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: ProviderRouter with priority failover and cooldown (TDD)** - `4ddbad9` (feat)
2. **Task 2: createProviderRouter() factory with startup warning** - `5fabeb0` (feat)

_Note: TDD task includes both test file and implementation in single commit (tests written first, implementation follows in same session)_

## Files Created/Modified
- `src/fetchers/providers/router.ts` - ProviderRouter class with cooldown Map, per-method tryCall* helpers, and priority iteration
- `src/fetchers/providers/__tests__/router.test.ts` - 10 unit tests: rotation, cooldown respected/expiry, all-exhausted, happy path, fetchEarlySwapsForMint and fetchOnePage variants
- `src/fetchers/providers/index.ts` - createProviderRouter() factory; re-exports RpcProvider, ProviderTransaction, ProviderRouter; TODO(11-03) for ShyftProvider wiring

## Decisions Made
- Used three explicit per-method `tryCall*` helpers instead of a single generic `tryCall<T>` — `Parameters<RpcProvider[keyof RpcProvider]>` produces a TypeScript union error; explicit overloads are simpler and equally correct
- Used `Date.now` direct reassignment in test `afterEach` instead of `jest.spyOn` — jest global is not available without explicit import in ESM test modules; reassignment is simpler and fully equivalent
- ShyftProvider wiring deferred to Plan 03 via TODO comments — importing a not-yet-existing file in index.ts would cause a TypeScript error; the factory compiles clean and will add ShyftProvider in the next plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jest global not available for spyOn in ESM test files**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** Plan specified `jest.spyOn(Date, 'now')` for cooldown expiry tests, but `jest` is not a global in ESM test modules without explicit import — tests failed with `ReferenceError: jest is not defined`
- **Fix:** Replaced `jest.spyOn(Date, 'now')` with direct `Date.now = () => fixedValue` in test body, restored in `afterEach` via `originalDateNow` capture
- **Files modified:** src/fetchers/providers/__tests__/router.test.ts
- **Verification:** All 10 tests pass with corrected approach
- **Committed in:** 4ddbad9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan's suggested mock approach)
**Impact on plan:** Minor fix to test approach only. All behavior requirements met identically.

## Issues Encountered
- Generic `tryCall<T>` with `Parameters<RpcProvider[keyof RpcProvider]>` produces a TypeScript union type that cannot be distributed safely — resolved by using three explicit per-method helpers (no type casting needed)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ProviderRouter is ready for ShyftProvider injection in Plan 03
- index.ts has TODO(11-03) comments at the exact insertion points for ShyftProvider
- createProviderRouter() is ready for callsite migration in Plan 04 (replaces createHeliusFetcher())

---
*Phase: 11-helius-rpc-provider-rotation*
*Completed: 2026-03-26*
