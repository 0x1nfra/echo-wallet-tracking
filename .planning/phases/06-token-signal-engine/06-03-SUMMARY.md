---
phase: 06-token-signal-engine
plan: "03"
subsystem: signals
tags: [typescript, drizzle-orm, sqlite, tdd, jest, cli, commander, cli-table3]

# Dependency graph
requires:
  - phase: 06-token-signal-engine
    plan: "01"
    provides: token_signals schema with signal_tier and coordinated_wallet_count columns
  - phase: 06-token-signal-engine
    plan: "02"
    provides: computeSignalScore() pure scorer, TokenSignalInputs/TokenSignalResult interfaces
  - phase: 05-monitoring-loop-and-auto-removal
    provides: MonitorLoop.runCycle() — post-cycle hook insertion point

provides:
  - computeAllTokenSignals() — DB-integrated signal engine with upsert logic
  - MonitorLoop post-cycle signal hook (try/catch, non-fatal)
  - echo signal list CLI command — table display of top tokens by signal score
  - signals/engine.ts module with injectable db parameter for testability

affects:
  - Phase 7 (Telegram notifications / dashboard — reads token_signals, consumes signal_tier and coordinated_wallet_count)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected db parameter pattern for engine testability — computeAllTokenSignals(db = defaultDb) avoids cross-boundary test imports"
    - "Batch pre-load wallet_metrics and wallet_flags before per-token loop (O(wallets) queries, not O(wallets * tokens))"
    - "Union of recent 24h tokens + existing active records ensures stale signal records get marked inactive"

key-files:
  created:
    - src/signals/engine.ts
    - src/commands/signal.ts
    - src/signals/__tests__/engine.test.ts
  modified:
    - src/monitor/loop.ts
    - src/cli.ts

key-decisions:
  - "computeAllTokenSignals accepts optional db parameter for in-memory SQLite testability — avoids jest.unstable_mockModule (TypeScript + ts-jest ESM limitations)"
  - "Inline createTestDb() in src/signals/__tests__/engine.test.ts — tsconfig rootDir='./src' prevents importing from tests/ directory"
  - "Wallet_metrics and wallet_flags loaded in batch before per-token loop — prevents O(tokens * wallets) queries"
  - "existingActiveSet loaded upfront (signal_score > 0) — enables suppression detection without per-token DB reads"

patterns-established:
  - "Injectable db parameter (db: typeof defaultDb = defaultDb) for engine testability following DI pattern"
  - "inline createTestDb() helper in src/__tests__ files when tests/unit/db/setup.ts is out of tsconfig rootDir"

requirements-completed: [SGNL-01, SGNL-02, SGNL-03]

# Metrics
duration: 6min
completed: 2026-03-15
---

# Phase 06 Plan 03: Token Signal Engine Integration Summary

**DB-querying signal engine with batch wallet/flag loading, MonitorLoop post-cycle hook, and `echo signal list` CLI command — closes SGNL-02 and completes end-to-end signal pipeline**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-15T16:00:10Z
- **Completed:** 2026-03-15T16:06:20Z
- **Tasks:** 2 of 2 (Task 1 had TDD RED + GREEN commits)
- **Files modified:** 5

## Accomplishments

- `computeAllTokenSignals()` implemented with batched DB reads, per-token net-position holder computation, scorer invocation, and upsert/suppress/skip logic
- MonitorLoop.runCycle() now calls `computeAllTokenSignals()` post-cycle in a try/catch — engine errors log but never crash the loop
- `echo signal list` CLI command displays active token signals in a formatted table with tier color-coding (green=strong, yellow=moderate, red=weak)
- 14 TDD tests written (RED before GREEN) covering all edge cases including zero counts, upsert, suppression, coordination discount, cleared flags, multi-token, and timestamp cutoffs
- All 167 tests pass (153 prior + 14 new)
- TypeScript compiles without errors (`pnpm exec tsc --noEmit`)

## Task Commits

Each task was committed atomically:

1. **RED: Failing engine tests** - `8573d1c` (test)
2. **GREEN: engine.ts implementation** - `3fef350` (feat)
3. **Task 2: MonitorLoop hook + signal CLI + test fix** - `e1e63ca` (feat)

_Note: Task 1 followed TDD RED-GREEN pattern (2 commits)_

## Files Created/Modified

- `src/signals/engine.ts` - computeAllTokenSignals() with batch DB reads, net-position holder calc, scorer integration, onConflictDoUpdate upsert, suppress/skip logic
- `src/signals/__tests__/engine.test.ts` - 14 TDD integration tests using in-memory SQLite (inline createTestDb to avoid rootDir boundary)
- `src/monitor/loop.ts` - imports computeAllTokenSignals, calls it post-cycle in try/catch with log output
- `src/commands/signal.ts` - createSignalCommand() with `signal list` subcommand, cli-table3 output, chalk tier coloring
- `src/cli.ts` - added import + program.addCommand(createSignalCommand())

## Decisions Made

- **Injectable db parameter**: `computeAllTokenSignals(db: typeof defaultDb = defaultDb)` enables in-memory SQLite test injection without jest module mocking. ts-jest ESM + TypeScript limitations make `jest.unstable_mockModule` non-trivial; DI is cleaner and consistent.
- **Inline createTestDb() in test file**: `tsconfig.json` sets `rootDir: "./src"` and excludes `tests/` — importing from `tests/unit/db/setup.ts` causes TS6059. Inlined the 10-line helper directly in the test file.
- **Batch pre-load**: wallet_metrics scores and wallet_flags loaded once (batch `inArray` query) before the per-token loop. Avoids O(tokens * wallets) query count.
- **existingActiveSet loaded upfront**: `SELECT token_mint FROM token_signals WHERE signal_score > 0` once before the loop enables suppression detection without extra per-token queries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tsconfig rootDir cross-boundary import in test file**
- **Found during:** Task 1 (verifying TypeScript after GREEN commit)
- **Issue:** `pnpm exec tsc --noEmit` reported TS6059 — test file imported `createTestDb` from `tests/unit/db/setup.ts` which is outside `rootDir: "./src"`. Tests ran fine with jest (ts-jest ignores rootDir), but tsc compilation failed.
- **Fix:** Inlined `createTestDb()` (10 lines) directly in `src/signals/__tests__/engine.test.ts`. Also updated `sqlite` type from `ReturnType<...>` to explicit `Database.Database`.
- **Files modified:** `src/signals/__tests__/engine.test.ts`
- **Verification:** `pnpm exec tsc --noEmit` exits with no output (clean)
- **Committed in:** `e1e63ca` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test cross-boundary import)
**Impact on plan:** Fix was necessary for `pnpm exec tsc --noEmit` done criterion. No scope creep — test logic unchanged, only import strategy adjusted.

## Issues Encountered

- `jest.unstable_mockModule` for ESM module mocking not declared in TypeScript types for ts-jest setup — designing `computeAllTokenSignals` with an injectable `db` parameter avoids the need for module-level mocking entirely and is a cleaner pattern.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- End-to-end signal pipeline complete: schema (Plan 01) → scorer (Plan 02) → engine + CLI (Plan 03)
- Phase 7 (notifications/dashboard) can read `token_signals` with `signal_tier`, `coordinated_wallet_count`, `signal_score`, `buy_velocity_1h`, and `exit_pressure` columns populated after each monitor cycle
- `echo signal list` provides manual verification of signal quality before Phase 7 ships
- No blockers for Phase 7

## Self-Check: PASSED

- FOUND: src/signals/engine.ts
- FOUND: src/commands/signal.ts
- FOUND: src/signals/__tests__/engine.test.ts
- FOUND: commit 8573d1c (test RED)
- FOUND: commit 3fef350 (feat GREEN)
- FOUND: commit e1e63ca (feat Task 2)

---
*Phase: 06-token-signal-engine*
*Completed: 2026-03-15*
