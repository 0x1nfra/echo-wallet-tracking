---
phase: 11-helius-rpc-provider-rotation
plan: 01
subsystem: api
tags: [rpc-provider, typescript-interface, dependency-injection, tdd, helius]

# Dependency graph
requires:
  - phase: 10-tech-debt-cleanup
    provides: clean TypeScript with DetectorId union and no dead exports
provides:
  - RpcProvider interface with fetchSwapHistory, fetchEarlySwapsForMint, fetchOnePage
  - ProviderTransaction type alias for HeliusTransaction
  - HeliusProvider class wrapping HeliusFetcher via constructor injection
  - Delegation tests confirming HeliusProvider passes all args and returns fetcher values
affects:
  - 11-02-PLAN.md (ProviderRouter imports RpcProvider from types.ts)
  - 11-03-PLAN.md (ShyftProvider implements RpcProvider from types.ts)
  - 11-04-PLAN.md (callsite migration uses HeliusProvider as primary)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Interface-first provider abstraction — types.ts defines contract, implementations follow
    - Constructor injection — HeliusProvider accepts HeliusFetcher (not a string key), enabling in-test substitution
    - ProviderTransaction as type alias — HeliusTransaction re-exported to avoid callsite churn when swapping providers

key-files:
  created:
    - src/fetchers/providers/types.ts
    - src/fetchers/providers/helius-provider.ts
    - src/fetchers/providers/__tests__/helius-provider.test.ts
  modified:
    - .planning/ROADMAP.md

key-decisions:
  - "ProviderTransaction aliased to HeliusTransaction (not a new type) — minimizes churn in existing callsites when providers change"
  - "getTransaction excluded from RpcProvider interface — only bundler/wash-trader detectors use it directly on HeliusFetcher"
  - "HeliusProvider constructor accepts HeliusFetcher instance (not apiKey string) — follows Phase 8 injectable deps pattern"
  - "fetchEarlySwapsForMint parameters are non-optional on RpcProvider (no defaults) — callers must be explicit about limit and sortOrder"

patterns-established:
  - "Injectable mock pattern: plain object with typed async functions (no jest.fn()) for ESM compatibility — matches Phases 3, 6, 8"
  - "Provider interface in types.ts with concrete implementations in separate files — avoids circular deps in Plans 02/03"

requirements-completed: [MNTR-03]

# Metrics
duration: 12min
completed: 2026-03-26
---

# Phase 11 Plan 01: RpcProvider Interface and HeliusProvider Summary

**RpcProvider interface + HeliusProvider wrapper with TDD delegation tests — provider abstraction foundation for Plans 02-04**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-26T18:42:02Z
- **Completed:** 2026-03-26T18:54:00Z
- **Tasks:** 3 (Task 0 + Task 1 + Task 2)
- **Files modified:** 4

## Accomplishments

- Updated ROADMAP.md Phase 11 Success Criterion 1 with real method names (fetchSwapHistory, fetchEarlySwapsForMint, fetchOnePage)
- Defined RpcProvider interface in types.ts — stable contract for Plans 02 (ProviderRouter) and 03 (ShyftProvider)
- Implemented HeliusProvider via TDD — 3 delegation tests green, all 187 tests passing (184 existing + 3 new)

## Task Commits

Each task was committed atomically:

1. **Task 0: Update ROADMAP.md Phase 11 Success Criterion 1** - `ec167b5` (chore)
2. **Task 1: Define RpcProvider interface and ProviderTransaction type** - `92e16df` (feat)
3. **Task 2 RED: Add failing tests for HeliusProvider** - `c02a96e` (test)
4. **Task 2 GREEN: Implement HeliusProvider** - `2e52456` (feat)

_Note: TDD task 2 has two commits (test RED then feat GREEN)_

## Files Created/Modified

- `src/fetchers/providers/types.ts` — RpcProvider interface (3 methods) + ProviderTransaction type alias for HeliusTransaction
- `src/fetchers/providers/helius-provider.ts` — HeliusProvider class implementing RpcProvider via constructor-injected HeliusFetcher
- `src/fetchers/providers/__tests__/helius-provider.test.ts` — 3 delegation tests confirming arg passing and return value forwarding
- `.planning/ROADMAP.md` — Phase 11 Success Criterion 1 updated with real method names

## Decisions Made

- ProviderTransaction aliased to HeliusTransaction rather than being a new type — avoids churn in callsites when providers rotate
- getTransaction excluded from RpcProvider — only bundler/wash-trader detectors need it, bypassing the router is correct
- HeliusProvider takes HeliusFetcher instance (not apiKey) — constructor injection enables testing without module mocking
- fetchEarlySwapsForMint parameters non-optional on interface — callers must be explicit, no hidden default behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled clean throughout; all tests green on first GREEN implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RpcProvider interface stable — Plans 02 and 03 can import from types.ts immediately
- HeliusProvider tested — Plan 02 ProviderRouter can use HeliusProvider as primary provider
- helius.ts untouched — all 184 existing tests unaffected; Plan 04 callsite migration has a clean baseline

---
*Phase: 11-helius-rpc-provider-rotation*
*Completed: 2026-03-26*
