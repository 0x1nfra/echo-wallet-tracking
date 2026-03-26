---
phase: 08-wallet-discovery
plan: 03
subsystem: discovery
tags: [drizzle-orm, better-sqlite3, probation-guard, graph-traversal, discovery-orchestrator]

requires:
  - phase: 08-wallet-discovery plan 01
    provides: probation_until column on wallets table (migration 0007), discoveryCandidates and discoveryRuns schema
  - phase: 08-wallet-discovery plan 02
    provides: fetchEarlyBuyers and fetchEarlySwapsForMint (early-buyers.ts, helius.ts)
  - phase: 04-metrics-and-scoring
    provides: scoreAllEligible() scoring function
  - phase: 06-token-signal-engine
    provides: computeAllTokenSignals() and engine.ts query pattern

provides:
  - probation_until guard in computeAllTokenSignals — wallets on active probation excluded from smart wallet query
  - fetchCoTraders(knownAddresses, fetcher?) — depth-1 graph traversal via HeliusFetcher.fetchOnePage + fetchEarlySwapsForMint
  - runDiscovery(mint, options?) — full orchestrator: early buyers + graph candidates, score-before-insert, probation_until on accept

affects:
  - Any phase consuming computeAllTokenSignals (Phase 6 signal engine)
  - CLI commands calling runDiscovery

tech-stack:
  added: []
  patterns:
    - CoTraderFetcher injectable interface follows Phase 8 ESM dep-injection pattern (same as EarlySwapsFetcher)
    - DiscoveryDeps injectable interface enables in-memory SQLite testing of full orchestrator flow
    - Score-before-insert: insert as importing → importWalletHistory → scoreAllEligible → re-read score → accept/reject

key-files:
  created:
    - src/discovery/graph-traverse.ts
    - src/discovery/index.ts
    - src/discovery/__tests__/graph-traverse.test.ts
    - src/discovery/__tests__/discovery.test.ts
  modified:
    - src/signals/engine.ts
    - src/signals/__tests__/engine.test.ts

key-decisions:
  - "Probation guard uses OR(isNull(probation_until), lt(probation_until, nowMs)) — null is non-probationary, not on-probation"
  - "fetchCoTraders uses injectable CoTraderFetcher dep (not jest.mock) — consistent with Phase 8 ESM pattern"
  - "DiscoveryDeps injectable interface allows scoreAllEligibleFn, importHistoryFn, dbOverride overrides in tests — avoids mocking global singletons"
  - "dry_run: wallet row NOT inserted at all (not even as importing) — cleaner than inserting-then-deleting in dry mode"
  - "evaluateCandidate logs dry_run result to discoveryCandidates regardless — audit trail preserved even in dry-run"

requirements-completed: [DISC-02, DISC-03, DISC-04]

duration: 5min
completed: 2026-03-16
---

# Phase 08 Plan 03: Wallet Discovery Core — Probation Guard + Graph Traversal + Discovery Orchestrator Summary

**Probation guard added to signal engine (TDD), depth-1 co-trader graph traversal, and runDiscovery() orchestrator with score-before-insert flow and 7-day probation window on accepted wallets**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-16T15:31:28Z
- **Completed:** 2026-03-16T15:36:12Z
- **Tasks:** 3 (Task 1 TDD + Task 2a + Task 2b)
- **Files modified:** 6

## Accomplishments
- Signal engine excludes wallets on active probation from smart wallet query (3 new probation TDD tests pass)
- fetchCoTraders exported from src/discovery/graph-traverse.ts — depth-1 traversal, 30-address cap, exclusion of known addresses
- runDiscovery orchestrates full flow: direct (early buyers) + graph (co-traders), score-before-insert, probation_until on accept
- Full test suite: 184 tests passing (up from 173 — 11 new tests added)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing probation tests** - `c3f72c5` (test)
2. **Task 1 GREEN: Probation guard in engine** - `b96a058` (feat)
3. **Task 2a: Graph traversal** - `bdb5a89` (feat)
4. **Task 2b: Discovery orchestrator** - `bc98958` (feat)

_Note: TDD Task 1 has two commits (RED test → GREEN implementation)_

## Files Created/Modified
- `src/signals/engine.ts` — Added isNull/lt/or imports + probation_until WHERE guard in smart wallet query
- `src/signals/__tests__/engine.test.ts` — 3 new probation tests (P1 RED→GREEN, P2, P3)
- `src/discovery/graph-traverse.ts` — fetchCoTraders() with CoTraderFetcher interface
- `src/discovery/__tests__/graph-traverse.test.ts` — 4 tests: dedup, exclusion, cap, empty
- `src/discovery/index.ts` — runDiscovery() orchestrator with DiscoveryOptions/DiscoveryResult/DiscoveryDeps
- `src/discovery/__tests__/discovery.test.ts` — 4 tests: above threshold, below threshold, already tracked, dry run

## Decisions Made
- Probation guard uses `OR(isNull(probation_until), lt(probation_until, nowMs))` — null means non-probationary (included), not on-probation (excluded)
- Injectable CoTraderFetcher/DiscoveryDeps interfaces used consistently — no jest.mock, matching Phase 8 ESM pattern
- dry_run mode skips wallet row insertion entirely (not insert-then-delete) — simpler and cleaner
- discoveryCandidates audit log written for all outcomes including dry_run

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strengthened RED test for probation guard (P1) to make it correctly fail**
- **Found during:** Task 1 RED phase
- **Issue:** Original P1 test had 1 probation wallet + 1 token. Without guard, wallet still queried → only 1 holder → score=0 → test passed for the wrong reason (not a true RED test)
- **Fix:** Added a second non-probation wallet so that without the guard both wallets = 2 holders → signal computed (updated=1). With guard: probation wallet excluded → 1 holder → score=0 (updated=0). Test now correctly fails before the guard is added.
- **Files modified:** src/signals/__tests__/engine.test.ts
- **Verification:** Test failed before guard (RED), passed after guard (GREEN)
- **Committed in:** c3f72c5 (Task 1 RED commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in test design)
**Impact on plan:** Required to make TDD work correctly. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DISC-02, DISC-03, DISC-04 requirements complete
- Phase 08 core intelligence (scoring gate, probation exclusion, graph traversal) all implemented
- runDiscovery() ready for CLI wiring (Phase 08 Plan 04)
- 184 tests passing — safe to proceed

---
*Phase: 08-wallet-discovery*
*Completed: 2026-03-16*
