---
phase: 02-transaction-parsing
plan: 01
subsystem: database
tags: [drizzle, sqlite, better-sqlite3, solana, helius, dex]

# Dependency graph
requires:
  - phase: 01-data-foundation
    provides: "schema.ts with wallets/swaps/wallet_metrics tables and drizzle migrate() infrastructure"
provides:
  - "parse_errors table in schema.ts and 0001_parse_errors.sql migration"
  - "wallets.status enum extended with 'importing' value"
  - "DEX_PROGRAM_IDS flat const (5 keys) for test-compatible single-string lookups"
  - "DEX_PROGRAM_IDS_MAP grouped record (9 program IDs across 5 DEXes)"
  - "HeliusSwapEvent and HeliusInstruction interfaces"
  - "HeliusTransaction extended with events.swap and instructions fields"
  - "SwapRow interface for DB insertion"
affects:
  - "02-02 (swap parser — imports DEX_PROGRAM_IDS_MAP, HeliusTransaction events)"
  - "02-03 (import orchestrator — uses SwapRow, parse_errors, wallets 'importing' status)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQLite enum expansion is ORM-level only — no ALTER TABLE SQL migration required"
    - "DEX program IDs split into flat const (test compatibility) and grouped map (parser runtime)"

key-files:
  created:
    - src/db/migrations/0001_parse_errors.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json
    - src/types/transaction.ts
    - .gitignore

key-decisions:
  - "SQLite enum expansion for wallets.status requires only schema.ts change — no ALTER TABLE SQL (SQLite does not enforce CHECK constraints from drizzle enums at SQL level)"
  - "DEX program IDs exported in two shapes: DEX_PROGRAM_IDS (flat, test-compatible) and DEX_PROGRAM_IDS_MAP (grouped, parser runtime) — avoids breaking existing test references"
  - ".gitignore exemption added for src/db/migrations/**/*.json to allow drizzle meta journal tracking in git"

patterns-established:
  - "Pattern: New drizzle migrations registered manually in meta/_journal.json to avoid drizzle-kit generate overwriting existing 0000 migration"

requirements-completed: [PARS-01, PARS-02, PARS-03]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 02 Plan 01: Schema and Type Contracts Summary

**parse_errors table + wallets 'importing' status + dual DEX program ID registry (flat+grouped) + HeliusTransaction events structure for swap parser and import orchestrator dependencies**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T13:51:37Z
- **Completed:** 2026-03-11T13:53:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `parse_errors` table to schema.ts with migration SQL and drizzle meta journal registration — enables silent error tracking per locked decision
- Extended `wallets.status` enum to include `'importing'` for visible in-progress wallet history imports
- Exported `DEX_PROGRAM_IDS` flat const (5 keys) for test compatibility and `DEX_PROGRAM_IDS_MAP` (9 program IDs, 5 DEXes) for parser runtime use
- Added `HeliusSwapEvent`, `HeliusInstruction` interfaces and extended `HeliusTransaction` with `events.swap` and `instructions` fields
- Added `SwapRow` interface matching the `swaps` table schema for DB insertion in Plan 03

## Task Commits

Each task was committed atomically:

1. **Task 1: Add parse_errors table to schema and generate migration** - `a708e55` (feat)
2. **Task 2: Extend transaction types with DEX registry and HeliusTransaction events structure** - `a77df82` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/db/schema.ts` — Added `parse_errors` table definition; updated `wallets.status` enum to include `'importing'`
- `src/db/migrations/0001_parse_errors.sql` — SQL migration creating the `parse_errors` table
- `src/db/migrations/meta/_journal.json` — Registered `0001_parse_errors` migration entry (idx 1)
- `src/types/transaction.ts` — Added `DEX_PROGRAM_IDS`, `DEX_PROGRAM_IDS_MAP`, `HeliusSwapEvent`, `HeliusInstruction`, `SwapRow`; extended `HeliusTransaction` with events/instructions
- `.gitignore` — Added `!src/db/migrations/**/*.json` exception so drizzle meta JSON files are tracked

## Decisions Made
- SQLite enum expansion for `wallets.status` is schema.ts-only — no ALTER TABLE SQL migration needed since SQLite does not enforce CHECK constraints from drizzle enums at the SQL level.
- DEX program IDs split into two export shapes: `DEX_PROGRAM_IDS` (flat, for test compatibility using `.RAYDIUM` etc.) and `DEX_PROGRAM_IDS_MAP` (grouped arrays, for parser runtime detection across all 9 program IDs).
- Migration manually written and registered in `_journal.json` rather than running `drizzle-kit generate` to avoid overwriting the existing `0000` migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] .gitignore exemption for drizzle meta JSON**
- **Found during:** Task 1 (migration registration)
- **Issue:** The `*.json` gitignore rule caught `src/db/migrations/meta/_journal.json` with no existing exception, preventing the file from being staged
- **Fix:** Added `!src/db/migrations/**/*.json` exception to `.gitignore`
- **Files modified:** `.gitignore`
- **Verification:** `git add` succeeded after fix; journal file committed with task
- **Committed in:** `a708e55` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — missing gitignore exemption)
**Impact on plan:** Necessary for drizzle migration tracking to work in git. No scope creep.

## Issues Encountered
None beyond the gitignore exemption auto-fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `parse_errors` table and SQL migration are ready for Plan 02 (swap parser) to insert error rows
- `DEX_PROGRAM_IDS_MAP` provides all 9 program IDs Plan 02 swap parser needs for DEX detection
- `HeliusTransaction.events.swap` and `.instructions` fields are typed for Plan 02's parsing logic
- `SwapRow` interface and `'importing'` wallet status are ready for Plan 03's import orchestrator
- No blockers for Plans 02 and 03

---
*Phase: 02-transaction-parsing*
*Completed: 2026-03-11*

## Self-Check: PASSED

All files verified on disk. All commits verified in git history.
