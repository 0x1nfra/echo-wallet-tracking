---
phase: 01-data-foundation
plan: 02
subsystem: cli-commands
tags: [commander, cli-table3, chalk, sqlite, drizzle-orm, jest, unit-tests]

# Dependency graph
requires:
  - 01-01 (src/db/index.ts singleton, src/db/schema.ts wallets table, tests/unit/db/setup.ts createTestDb)
provides:
  - src/commands/wallet.ts — createWalletCommand() with add/remove/list subcommands
  - src/cli.ts — updated with wallet command registered via addCommand()
  - .env.example — documents DATABASE_URL and INACTIVITY_DAYS
  - tests/unit/commands/wallet-add.test.ts — 3 tests for add command db operations
  - tests/unit/commands/wallet-remove.test.ts — 2 tests for remove command db operations
  - tests/unit/commands/wallet-list.test.ts — 4 tests for list command db ops and formatting
affects:
  - All downstream phases that invoke wallet add/remove/list to populate the wallets table

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Commander.js subcommand tree pattern (createWalletCommand factory function)
    - cli-table3 for tabular CLI output with style options
    - chalk for colored status and gray placeholder text
    - Direct db operation tests (no CLI process invocation) via createTestDb()

key-files:
  created:
    - src/commands/wallet.ts
    - tests/unit/commands/wallet-add.test.ts
    - tests/unit/commands/wallet-remove.test.ts
    - tests/unit/commands/wallet-list.test.ts
    - .planning/phases/01-data-foundation/deferred-items.md
  modified:
    - src/cli.ts
    - .env.example

key-decisions:
  - "Tests operate directly against db operations, not CLI process — avoids process.exit() in test context"
  - "truncateAddress helper duplicated in test file — avoids importing from src to keep test isolation clean"
  - "Pre-existing parsers.test.ts failure (from adf3f66) logged as deferred — out of scope for Plan 02"

requirements-completed: [DATA-03, DATA-04, DATA-05]

# Metrics
duration: 30min
completed: 2026-03-11
---

# Phase 1 Plan 02: Wallet Commands (add, remove, list) Summary

**Commander.js wallet subcommand tree with add/remove/list, cli-table3 output, chalk colors, and 9 passing unit tests covering all three commands**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-03-11
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Implemented `echo wallet add <address> [--label]` with UNIQUE constraint error handling (exit 1)
- Implemented `echo wallet remove <address>` with 0-changes error handling (exit 1)
- Implemented `echo wallet list` with cli-table3 table, address truncation (8...4), chalk status colors, and empty state message
- Registered wallet command in `src/cli.ts` via `program.addCommand(createWalletCommand())`
- 9 unit tests across 3 test files — all pass
- Smoke tests confirm end-to-end CLI behavior works correctly

## Task Commits

1. **Task 1: Implement wallet commands + CLI wiring** — `6189b41` (feat)
2. **Task 2: Write unit tests for wallet commands** — `1339566` (feat)

## Files Created/Modified

- `src/commands/wallet.ts` — createWalletCommand() factory, add/remove/list subcommands, truncateAddress helper
- `src/cli.ts` — Added import and `program.addCommand(createWalletCommand())` before `program.parse()`
- `.env.example` — Appended DATABASE_URL and INACTIVITY_DAYS entries
- `tests/unit/commands/wallet-add.test.ts` — Insert, label, duplicate UNIQUE error (3 tests)
- `tests/unit/commands/wallet-remove.test.ts` — Delete existing, 0 changes for unknown (2 tests)
- `tests/unit/commands/wallet-list.test.ts` — Empty state, truncation, null label, desc order (4 tests)

## Manual Smoke Test Results

All smoke tests passed:

| Test | Command | Expected | Result |
|------|---------|----------|--------|
| Empty list | `pnpm score wallet list` | Empty state message | PASS |
| Add with label | `pnpm score wallet add <addr> --label SOL` | "Wallet ... added (SOL)." | PASS |
| Duplicate add | `pnpm score wallet add <addr>` (second time) | "Wallet ... is already tracked." + exit 1 | PASS |
| List with entry | `pnpm score wallet list` | Table with ADDRESS/LABEL/STATUS/ADDED, truncated addr | PASS |
| Remove | `pnpm score wallet remove <addr>` | "Wallet ... removed." | PASS |
| List after remove | `pnpm score wallet list` | Empty state message | PASS |

## Test Results

```
Test Suites: 3 passed (command tests), 5 passed total
Tests:       9 passed (command tests), 16 passed total
```

Note: `tests/unit/parsers.test.ts` fails due to a pre-existing stub (committed in `adf3f66`, before Phase 01) referencing unimplemented `src/parsers/swap`. Logged in `deferred-items.md`. All Phase 01 owned tests pass.

## Decisions Made

- **Tests against db, not CLI process:** Invoking the CLI process in tests would trigger `process.exit()` calls which terminate the Jest runner. Instead, tests directly call drizzle db operations and test the same logic the command handlers use.
- **truncateAddress duplicated in test:** The function is 1 line — duplicating it in the test file avoids creating a test dependency on the src import chain and keeps the test self-contained.

## Deviations from Plan

None — plan executed exactly as written. Pre-existing `parsers.test.ts` failure was out of scope and logged to deferred-items.md rather than fixed.

---

## Self-Check

Checking file existence and commit hashes...

- FOUND: src/commands/wallet.ts
- FOUND: src/cli.ts
- FOUND: .env.example
- FOUND: tests/unit/commands/wallet-add.test.ts
- FOUND: tests/unit/commands/wallet-remove.test.ts
- FOUND: tests/unit/commands/wallet-list.test.ts
- FOUND: commit 6189b41 (Task 1)
- FOUND: commit 1339566 (Task 2)

## Self-Check: PASSED
