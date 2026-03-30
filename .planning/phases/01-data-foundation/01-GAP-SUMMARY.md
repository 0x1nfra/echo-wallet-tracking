---
phase: 01-data-foundation
plan: GAP
subsystem: database
tags: [drizzle-orm, better-sqlite3, sqlite, sniper-detector]

# Dependency graph
requires:
  - phase: 03-bundle-scam-detection
    provides: sniper detector (DETC-03) with db.all() injectable interface
provides:
  - "getDefaultDb() adapter in sniper.ts that correctly executes drizzle sql template objects via db.$client.prepare().all()"
affects:
  - phase 04 (wallet scoring) — sniper detector now works correctly end-to-end

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "drizzle sql template objects must be materialised with toQuery({ escapeName, escapeParam }) not toSQL()"
    - "db.$client exposes the underlying better-sqlite3 Database instance; use .prepare(sql).all(...params) for synchronous SELECT"

key-files:
  created: []
  modified:
    - src/detection/sniper.ts

key-decisions:
  - "getDefaultDb() uses sqlObj.toQuery() (correct drizzle API) rather than the non-existent sqlObj.toSQL(); params come from toQuery not the call-site [] argument"
  - "SQLite escapeName wraps identifier in double-quotes; escapeParam always returns '?' for positional placeholders"

patterns-established:
  - "drizzle sql template tag -> toQuery() -> db.$client.prepare().all() is the correct pattern for raw SQL execution in this codebase"

requirements-completed:
  - DETC-03

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 01 GAP: Data Foundation Gap Closure Summary

**Fixed broken drizzle adapter in sniper detector: replaced non-existent toSQL() call with toQuery({ escapeName, escapeParam }) + db.$client.prepare().all(), eliminating SqliteError crash on wallet import**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-13T08:20:27Z
- **Completed:** 2026-03-13T08:25:00Z
- **Tasks:** 2 (1 code change + 1 verification)
- **Files modified:** 1

## Accomplishments

- Identified root cause: `sqlObj.toSQL()` does not exist on drizzle's `SQL` class; the ternary fallback produced `String(sqlObj)` = `"[object Object]"`, crashing better-sqlite3 with a syntax error
- Replaced the broken adapter with `sqlObj.toQuery({ escapeName, escapeParam })` which returns a correct `{ sql, params }` pair, then executed via `db.$client.prepare(built.sql).all(...built.params)`
- All 11 sniper detector tests pass; all 67 project tests pass with 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace hand-rolled toSQL() adapter with toQuery() plus db.$client.prepare().all()** - `6d09daa` (fix)
2. **Task 2: Verify full test suite remains green** - no code changes, verification-only

**Plan metadata:** committed with final docs commit

## Files Created/Modified

- `src/detection/sniper.ts` - Fixed `getDefaultDb()` function body: toSQL() -> toQuery() + $client.prepare().all()

## Decisions Made

- `toQuery({ escapeName: (n) => '"${n}"', escapeParam: () => '?' })` is the canonical drizzle API for SQLite — escapeName wraps identifiers in double-quotes, escapeParam always returns `?` for positional binding
- The `_params` second argument at the call site (`[]`) is intentionally ignored; all params come from `toQuery()` since the sql template tag embeds them

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — the fix was precisely as specified in the plan. Sniper tests pass with injected mock db (never reach production adapter), confirming the fix is isolated to the production path only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap closed: `pnpm score wallet add` no longer crashes with SqliteError after importing wallet history
- Phase 4 (wallet scoring) can proceed with sniper detection working end-to-end
- All 67 tests green, TypeScript compiles cleanly

---
*Phase: 01-data-foundation*
*Completed: 2026-03-13*
