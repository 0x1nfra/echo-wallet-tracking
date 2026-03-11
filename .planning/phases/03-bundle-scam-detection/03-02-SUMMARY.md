---
phase: 03-bundle-scam-detection
plan: 02
subsystem: detection
tags: [drizzle-orm, sqlite, helius, bundler, dev-wallet, tdd, jest, detection]

# Dependency graph
requires:
  - phase: 03-bundle-scam-detection
    plan: 01
    provides: DetectorResult/DetectorConfig types, BUNDLER/DEV_WALLET thresholds, wallet_flags schema

provides:
  - detectBundler function in src/detection/bundler.ts (DETC-01)
  - detectDevWallet function in src/detection/dev-wallet.ts (DETC-02)
  - bundler detector tests in src/detection/__tests__/bundler.test.ts (10 tests)
  - dev-wallet detector tests in src/detection/__tests__/dev-wallet.test.ts (7 tests)

affects: [03-03-detectors-sniper-wash, 03-04-detection-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency injection for testability: detectBundler/detectDevWallet accept optional { db, fetcher } parameter — production uses singletons, tests inject mocks"
    - "Application-layer grouping instead of SQL GROUP BY: bundler groups swaps by (slot, token_mint) in JS for consistent testability without real SQLite"
    - "Lazy singleton import via getDefaultDb()/getDefaultFetcher() async helpers — prevents import side effects from crashing test suite"
    - "Plain async functions as mocks (no jest.fn()) — required for ESM test environment where jest globals are not available"
    - "Early-exit detection: detectDevWallet returns on first deployer transfer signal (aggressive bias)"

key-files:
  created:
    - src/detection/bundler.ts
    - src/detection/dev-wallet.ts
    - src/detection/__tests__/bundler.test.ts
    - src/detection/__tests__/dev-wallet.test.ts
  modified:
    - jest.config.cjs

key-decisions:
  - "Bundler groups swaps in application code (not SQL GROUP BY) — enables mock db injection without needing drizzle query builder in test mocks"
  - "jest.config.cjs testMatch extended to include src/**/__tests__/**/*.test.ts — plan required tests at src/detection/__tests__/ which jest did not discover by default"
  - "Dev wallet thresholdMultiplier intentionally ignored — one deployer transfer is always sufficient (locked aggressive bias decision from Plan 01 research)"
  - "Helius mint-address fetch limitation documented as comment: /v0/addresses/{mint}/transactions may return empty for mint addresses; fallback to wallet swap tx implemented"
  - "Shared funder matching requires 2+ co-buyers funded by same sender — prevents false positives from transactions where funder appears coincidentally"

patterns-established:
  - "Detector contract: DetectorConfig in, DetectorResult out (flagged, confidence, evidenceSummary, evidenceDetail)"
  - "evidenceSummary: plain JSON object with key facts for CLI display; evidenceDetail: full evidence blob for Phase 7 dashboard"
  - "Threshold math: effective threshold = ceil(base * multiplier) — ensures integer thresholds even with non-integer multipliers"
  - "TDD cycle: RED commit → GREEN commit, both labeled with (test/feat) prefix and (03-02) scope"

requirements-completed: [DETC-01, DETC-02]

# Metrics
duration: 17min
completed: 2026-03-11
---

# Phase 3 Plan 02: Bundler and Dev Wallet Detectors Summary

**detectBundler (DETC-01) using shared SOL funder matching across coordination events, and detectDevWallet (DETC-02) with immediate confirmed_suspicious on first deployer transfer — both with full TDD test coverage via injected mocks**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-11T15:35:36Z
- **Completed:** 2026-03-11T15:52:28Z
- **Tasks:** 4 (2 TDD RED+GREEN cycles)
- **Files modified:** 5

## Accomplishments
- Implemented detectBundler: groups buy swaps by (slot, token_mint), finds coordination candidates with 3+ distinct wallets, fetches Helius tx to confirm shared non-system SOL funder, applies threshold multiplier to confidence levels
- Implemented detectDevWallet: fetches early token transactions, identifies deployer from creation tx feePayer, checks deployer→wallet tokenTransfers within LOOKFORWARD_TXS window, returns immediately on first signal
- 10 bundler tests covering: 0/1/2/3/5 events, threshold multiplier (2.0x), system account exclusion (Jupiter v6), MIN_WALLETS enforcement, evidenceSummary/evidenceDetail structure
- 7 dev wallet tests covering: creation tx transfer, lookforward window, DEX buy (no flag), no buys, multiplier irrelevance, early-exit behavior, evidenceSummary structure
- Extended jest.config.cjs to discover tests in src/**/__tests__ directories

## Task Commits

Each task was committed atomically:

1. **RED - Bundler tests** - `e8f988a` (test)
2. **GREEN - Bundler implementation** - `b7ceddb` (feat)
3. **RED - Dev wallet tests** - `13834df` (test)
4. **GREEN - Dev wallet implementation** - `84bab18` (feat)

_TDD tasks have separate RED and GREEN commits per cycle._

## Files Created/Modified
- `src/detection/bundler.ts` - detectBundler function with BundlerDeps injection interface
- `src/detection/dev-wallet.ts` - detectDevWallet function with DevWalletDeps injection interface
- `src/detection/__tests__/bundler.test.ts` - 10 bundler detector unit tests
- `src/detection/__tests__/dev-wallet.test.ts` - 7 dev wallet detector unit tests
- `jest.config.cjs` - Added src/**/__tests__/**/*.test.ts to testMatch pattern

## Decisions Made
- Bundler groups swaps in application code (JS Map over all buy swaps) rather than SQL GROUP BY — makes mock injection straightforward without needing to implement drizzle query builders in mocks
- jest.config.cjs testMatch updated (Rule 3 auto-fix): plan required tests at src/detection/__tests__/ but original pattern only covered tests/unit/
- Dev wallet thresholdMultiplier intentionally ignored (not a bug) — plan explicitly states "one signal is always sufficient, confirmed by research"
- Shared funder must fund 2+ co-buyers in the coordination event tx — prevents false positives from transactions where a sender appears but only sent to one participant
- Helius mint-address fetch limitation acknowledged with comment and fallback: if fetchTransactions(mint) returns empty, falls back to checking the wallet's own swap tx for the deployer transfer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended jest testMatch to discover src/__tests__ files**
- **Found during:** RED phase - bundler tests
- **Issue:** jest.config.cjs testMatch only covered `tests/unit/**/*.test.ts`. Plan required test files at `src/detection/__tests__/`, which jest did not discover, causing tests to silently not run.
- **Fix:** Added `'**/src/**/__tests__/**/*.test.ts'` to testMatch array in jest.config.cjs
- **Files modified:** jest.config.cjs
- **Verification:** Tests discovered and run via `pnpm test src/detection/__tests__/`
- **Committed in:** e8f988a (Task 1 RED commit)

**2. [Rule 1 - Bug] Replaced jest.fn() with plain async functions in test mocks**
- **Found during:** GREEN phase attempt - bundler tests failing with "jest is not defined"
- **Issue:** ESM test environment (ts-jest/preset/default-esm) does not inject jest as a global. Test mocks used `jest.fn().mockResolvedValue()` which threw ReferenceError.
- **Fix:** Replaced all mock factories to use plain `async (_opts: unknown) => data` functions instead of jest.fn() wrappers. No behavioral difference for these tests.
- **Files modified:** src/detection/__tests__/bundler.test.ts, src/detection/__tests__/dev-wallet.test.ts
- **Verification:** All 17 tests pass
- **Committed in:** b7ceddb (Task 2 GREEN commit — tests updated in same commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes were necessary for tests to run and pass. No scope creep — detection logic unchanged.

## Issues Encountered
- None beyond the auto-fixed deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- detectBundler and detectDevWallet are ready for consumption by the detection engine (Plan 04)
- Both functions accept DetectorConfig and return DetectorResult — engine can call them uniformly
- Both detectors lazy-load production singletons (db, helius fetcher) — no initialization needed
- Plans 03 (sniper + wash trader) can follow the same DI pattern established here

---
*Phase: 03-bundle-scam-detection*
*Completed: 2026-03-11*

## Self-Check: PASSED

- FOUND: src/detection/bundler.ts
- FOUND: src/detection/dev-wallet.ts
- FOUND: src/detection/__tests__/bundler.test.ts
- FOUND: src/detection/__tests__/dev-wallet.test.ts
- FOUND: .planning/phases/03-bundle-scam-detection/03-02-SUMMARY.md
- FOUND: commit e8f988a (bundler RED)
- FOUND: commit b7ceddb (bundler GREEN)
- FOUND: commit 13834df (dev-wallet RED)
- FOUND: commit 84bab18 (dev-wallet GREEN)
