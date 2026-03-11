# Deferred Items — Phase 01 Data Foundation

## Out-of-Scope Issues Discovered During Execution

### 1. `tests/unit/parsers.test.ts` — Pre-existing failing test

- **Discovered during:** Plan 02 Task 2 (full suite run)
- **Committed in:** adf3f66 (before Phase 01 work began)
- **Issue:** References `../../src/parsers/swap` (module does not exist) and `DEX_PROGRAM_IDS` from `../../src/types/transaction` (export does not exist)
- **Impact:** `pnpm test` exits 1 due to this pre-existing test failure. The 5 test suites owned by Phase 01 all pass (16/16 tests).
- **Resolution:** This should be addressed when `src/parsers/swap` is implemented (Phase 2 or later). Either delete the stub test or implement the referenced modules.
- **Owner:** Phase 2 (DEX parsing)
