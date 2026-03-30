---
phase: 08-wallet-discovery
plan: 02
subsystem: api
tags: [helius, discovery, early-buyers, tdd]

# Dependency graph
requires:
  - phase: 02-transaction-parsing
    provides: HeliusFetcher class with queue/retry patterns
provides:
  - fetchEarlySwapsForMint method on HeliusFetcher for querying mint SWAP history oldest-first
  - fetchEarlyBuyers(mint, fetcher?) async function returning up to 50 unique early buyer wallets
affects: [08-wallet-discovery plan 03, 08-wallet-discovery plan 04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable fetcher dependency: optional fetcher param on fetchEarlyBuyers for ESM-safe testing without jest.mock"
    - "Named constants: EARLY_WINDOW_SECONDS=1800, MAX_EARLY_BUYERS=50 at module top"
    - "Minimal interface EarlySwapsFetcher isolates fetcher contract for testability"

key-files:
  created:
    - src/discovery/early-buyers.ts
    - src/discovery/__tests__/early-buyers.test.ts
  modified:
    - src/fetchers/helius.ts

key-decisions:
  - "fetchEarlyBuyers accepts optional fetcher parameter (not jest.mock) — project ESM pattern prohibits jest.mock for module-level mocking; injectable deps established in Phases 3 and 6"
  - "fetchEarlySwapsForMint uses heliusQueue+pRetry (same as fetchSwapHistory) — consistent rate-limit handling across all Helius fetch methods"
  - "EARLY_WINDOW_SECONDS=1800 and MAX_EARLY_BUYERS=50 as named constants — avoids magic numbers, aligns with research doc values"

patterns-established:
  - "Injectable EarlySwapsFetcher interface: fetchEarlyBuyers(mint, fetcher?) — subsequent discovery functions should follow same optional-dep pattern"
  - "Discovery module lives in src/discovery/ — new home for Phase 8 wallet discovery logic separate from src/fetchers/"

requirements-completed: [DISC-01]

# Metrics
duration: 12min
completed: 2026-03-16
---

# Phase 8 Plan 02: Early Buyers Summary

**TDD implementation of fetchEarlySwapsForMint on HeliusFetcher and fetchEarlyBuyers(mint) with 30-minute time window, SWAP-only filter, dedup, and 50-wallet cap — 6 tests, 173 total green**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-16T06:26:35Z
- **Completed:** 2026-03-16T06:38:00Z
- **Tasks:** 2 (RED + GREEN TDD phases)
- **Files modified:** 3

## Accomplishments

- Added `fetchEarlySwapsForMint(mint, limit, sortOrder)` to HeliusFetcher with heliusQueue+pRetry pattern
- Created `fetchEarlyBuyers(mint, fetcher?)` in src/discovery/ — filters 30-min window, SWAP-only, dedup, 50-cap
- 6 TDD test cases covering all specified behaviors; 173 total tests green (no regressions)

## Task Commits

Each task was committed atomically:

1. **RED — failing tests** - `5dd9c5f` (test)
2. **GREEN — implementation** - `9dcd16a` (feat)

**Plan metadata:** (docs: complete plan — see final commit)

_Note: TDD tasks have two commits (test → feat). No REFACTOR needed — named constants already extracted._

## Files Created/Modified

- `src/discovery/early-buyers.ts` - fetchEarlyBuyers(mint, fetcher?) with 30-min window, SWAP filter, dedup, 50-cap
- `src/discovery/__tests__/early-buyers.test.ts` - 6 TDD test cases for fetchEarlyBuyers
- `src/fetchers/helius.ts` - fetchEarlySwapsForMint method added to HeliusFetcher class

## Decisions Made

- **Injectable fetcher (not jest.mock):** The project prohibits jest.mock for ESM module mocking (established in Phases 3 and 6). fetchEarlyBuyers accepts an optional `fetcher?` parameter for test injection, matching the pattern used by computeAllTokenSignals and detection engines.
- **fetchEarlySwapsForMint uses pRetry+heliusQueue:** Consistent with fetchSwapHistory. 429 backoff and 401 no-retry guards apply identically.
- **Named constants at top of module:** EARLY_WINDOW_SECONDS=1800, MAX_EARLY_BUYERS=50 — makes tuning obvious, eliminates magic numbers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced jest.mock with injectable fetcher pattern**

- **Found during:** RED phase (test authoring)
- **Issue:** Plan specified `jest.fn()` and `jest.mock()` but project uses ESM modules (ts-jest ESM preset). The `@jest/globals` package is not installed and `jest.mock()` hoisting does not work with ESM imports. All other test files in the project use plain function injection.
- **Fix:** Switched to `fetchEarlyBuyers(mint, fetcher?)` with optional parameter. Tests construct a `buildMockFetcher()` plain object — same pattern as bundler.test.ts, wash-trader.test.ts, and signal engine tests.
- **Files modified:** src/discovery/__tests__/early-buyers.test.ts, src/discovery/early-buyers.ts
- **Verification:** All 6 tests pass; no `@jest/globals` dependency needed
- **Committed in:** 5dd9c5f (RED), 9dcd16a (GREEN)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan's mock strategy)
**Impact on plan:** Required approach matches established project pattern. All 6 behaviors tested as specified. No scope creep.

## Issues Encountered

None — once the mock strategy was corrected to match the project's ESM constraints, the implementation was straightforward.

## Next Phase Readiness

- `fetchEarlyBuyers` is ready for Plan 03 to call — returns `string[]` of up to 50 buyer wallet addresses
- HeliusFetcher.fetchEarlySwapsForMint is production-ready (pRetry+heliusQueue, no filtering, same patterns as existing methods)
- src/discovery/ directory established as home for Phase 8 discovery modules

---
*Phase: 08-wallet-discovery*
*Completed: 2026-03-16*

## Self-Check: PASSED

- FOUND: src/discovery/early-buyers.ts
- FOUND: src/discovery/__tests__/early-buyers.test.ts
- FOUND: .planning/phases/08-wallet-discovery/08-02-SUMMARY.md
- FOUND: commit 5dd9c5f (test RED)
- FOUND: commit 9dcd16a (feat GREEN)
