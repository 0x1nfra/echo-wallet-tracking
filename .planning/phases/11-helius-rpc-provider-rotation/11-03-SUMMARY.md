---
phase: 11-helius-rpc-provider-rotation
plan: 03
subsystem: api
tags: [axios, p-queue, p-retry, shyft, rpc-provider, normalization]

# Dependency graph
requires:
  - phase: 11-helius-rpc-provider-rotation plan 01
    provides: RpcProvider interface, types.ts, ProviderTransaction type alias
  - phase: 11-helius-rpc-provider-rotation plan 02
    provides: ProviderRouter with failover, createProviderRouter() factory with TODO(11-03) stubs

provides:
  - ShyftProvider class implementing RpcProvider with full Shyft-to-HeliusTransaction normalization
  - Constructor-injectable axios instance for testability (no jest.mock needed)
  - shyft-provider.ts wired into createProviderRouter() — enabled when SHYFT_API_KEY set
  - 13 unit tests confirming API call shape, header placement, normalization, and filtering

affects: [provider-rotation, helius-rpc-provider-rotation, monitoring-loop]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Constructor-injected axios instance for provider testability (consistent with injectable dep pattern from Phases 3, 6, 8)
    - events=undefined on normalized output forces tokenTransfers fallback in parseSwaps
    - Defensive best-effort extraction from Shyft action.info (optional chaining, ?? fallbacks)
    - module-level PQueue singleton for Shyft free-tier rate limiting (concurrency: 2)

key-files:
  created:
    - src/fetchers/providers/shyft-provider.ts
    - src/fetchers/providers/__tests__/shyft-provider.test.ts
  modified:
    - src/fetchers/providers/index.ts

key-decisions:
  - "ShyftProvider accepts optional AxiosInstance in constructor for testing — avoids ESM jest.mock limitations, consistent with project injectable deps pattern"
  - "events explicitly set to undefined (not null, not omitted) — forces tokenTransfers fallback path in existing parseSwaps parsers"
  - "Shyft action.info field extraction is best-effort with defensive ?? fallbacks — MEDIUM confidence on Shyft's actual field names per research"
  - "shyftQueue concurrency: 2 for Shyft free tier — more conservative than heliusQueue (concurrency: 5)"
  - "ShyftProvider wired into createProviderRouter() in index.ts — TODO(11-03) comments resolved"

patterns-established:
  - "Provider constructor accepts optional AxiosInstance: new ShyftProvider(apiKey, axiosInstance?) enables testing without module-level mocking"
  - "Normalize-on-return: Shyft types never leak to callers — all methods return ProviderTransaction[] (= HeliusTransaction[])"

requirements-completed: [MNTR-03]

# Metrics
duration: 3min
completed: 2026-03-27
---

# Phase 11 Plan 03: ShyftProvider Summary

**ShyftProvider fallback RPC provider with Shyft-to-HeliusTransaction normalization, constructor-injectable axios for testing, wired into createProviderRouter()**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-26T18:57:07Z
- **Completed:** 2026-03-26T18:59:47Z
- **Tasks:** 1 (TDD: test commit + implementation commit)
- **Files modified:** 3

## Accomplishments
- ShyftProvider implements RpcProvider with all three methods (fetchSwapHistory, fetchEarlySwapsForMint, fetchOnePage)
- Full normalization from Shyft snake_case API response to HeliusTransaction shape — Shyft types never leak to callers
- events: undefined explicitly set to force tokenTransfers fallback path in parseSwaps parsers
- Shyft free-tier PQueue (concurrency: 2) + pRetry (retries: 3) with 429 exponential backoff
- Constructor-injectable axios instance — 13 tests pass without any jest.mock/unstable_mockModule
- ShyftProvider wired into createProviderRouter() in index.ts — TODO(11-03) comments resolved
- All 210 tests green (197 existing + 13 new ShyftProvider tests)

## Task Commits

Each task committed atomically (TDD pattern):

1. **Task 1 RED: Failing tests for ShyftProvider** - `39cee46` (test)
2. **Task 1 GREEN: ShyftProvider implementation + index.ts wiring** - `5e6768d` (feat)

**Plan metadata:** (docs commit — next)

_Note: TDD task split into RED (test) and GREEN (implementation) commits_

## Files Created/Modified
- `src/fetchers/providers/shyft-provider.ts` - ShyftProvider class: fetchSwapHistory (3-page pagination + in-memory filter), fetchEarlySwapsForMint, fetchOnePage, normalize(), extractTokenTransfers(), extractNativeTransfers()
- `src/fetchers/providers/__tests__/shyft-provider.test.ts` - 13 unit tests with constructor-injected fake AxiosInstance
- `src/fetchers/providers/index.ts` - Uncommented ShyftProvider import + wired into providers array when SHYFT_API_KEY set

## Decisions Made
- Constructor-injectable axios: `new ShyftProvider(apiKey, axiosInstance?)` avoids ESM jest.mock limitations while matching project injectable pattern from Phases 3, 6, and 8
- events set to `undefined` (not null, not omitted) — the existing parseSwaps code checks `tx.events?.swap` which evaluates the same for undefined/null, but explicitly setting undefined signals intent clearly
- Defensive extraction in extractTokenTransfers/extractNativeTransfers: `action.info` field names are MEDIUM-confidence per research, so all accesses use optional chaining and ?? fallbacks — unknown action shapes return empty arrays rather than crashing
- shyftQueue concurrency: 2 — more conservative than heliusQueue (concurrency: 5) given Shyft free tier limits

## Deviations from Plan

None — plan executed exactly as written. The test mock used a `getCallCount()` function instead of a getter property due to TypeScript intersection type limitations, but this is an implementation detail of the test helper, not a deviation from planned behavior.

## Issues Encountered

- Test mock `callCount` getter caused TypeScript error on intersection type — converted to `getCallCount()` method (one-line fix, no behavioral impact)

## Next Phase Readiness

- Phase 11 complete: ProviderRouter + HeliusProvider + ShyftProvider all implemented and tested
- ProviderRouter with Helius primary and Shyft fallback is ready for production use via createProviderRouter()
- To activate: set SHYFT_API_KEY environment variable; no code changes needed

---
*Phase: 11-helius-rpc-provider-rotation*
*Completed: 2026-03-27*
