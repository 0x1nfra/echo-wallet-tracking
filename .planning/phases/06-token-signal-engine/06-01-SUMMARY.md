---
phase: 06-token-signal-engine
plan: 01
subsystem: database
tags: [sqlite, drizzle-orm, migration, better-sqlite3, token-signals]

# Dependency graph
requires:
  - phase: 05-monitoring-loop-and-auto-removal
    provides: migration pattern (0004 statement-breakpoint markers, journal management)
provides:
  - token_signals table signal_tier TEXT column (nullable)
  - token_signals table coordinated_wallet_count INTEGER column (nullable)
  - migration 0005_token_signal_columns.sql with statement-breakpoint markers
affects:
  - 06-token-signal-engine Plan 03 (signal computation engine reads/writes these columns)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual migration file with statement-breakpoint marker pattern (drizzle better-sqlite3 multi-statement)"
    - "Journal when timestamp must exceed last applied migration created_at for Drizzle to apply migration"

key-files:
  created:
    - src/db/migrations/0005_token_signal_columns.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json

key-decisions:
  - "Journal when=1773510000000 chosen to exceed 0004 created_at=1773420419000 — Drizzle SQLiteDialect.migrate() applies only migrations where folderMillis > lastDbMigration.created_at"
  - "Migration written manually (not drizzle-kit) per Phase 04 precedent — drizzle-kit would regenerate already-applied tables"

patterns-established:
  - "When adding a new migration manually: set journal.when > previous journal.when to ensure Drizzle applies it"

requirements-completed: [SGNL-01, SGNL-03]

# Metrics
duration: 15min
completed: 2026-03-15
---

# Phase 06 Plan 01: Token Signal DB Schema Summary

**SQLite migration adding signal_tier TEXT and coordinated_wallet_count INTEGER columns to token_signals via drizzle-orm statement-breakpoint pattern**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-15T14:10:00Z
- **Completed:** 2026-03-15T14:25:00Z
- **Tasks:** 1 of 1
- **Files modified:** 3

## Accomplishments

- Created `src/db/migrations/0005_token_signal_columns.sql` with two ALTER TABLE statements separated by `--> statement-breakpoint` marker
- Updated `src/db/schema.ts` token_signals table definition to include `signal_tier text` and `coordinated_wallet_count integer` fields
- Discovered and resolved drizzle journal `when` timestamp ordering requirement — migration only applies when `when > lastDbMigration.created_at`
- All 153 tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 0005 and update schema.ts** - `e0d788f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/db/migrations/0005_token_signal_columns.sql` - ALTER TABLE token_signals adds signal_tier and coordinated_wallet_count with statement-breakpoint separator
- `src/db/schema.ts` - token_signals definition extended with signal_tier and coordinated_wallet_count fields after coordination_discount
- `src/db/migrations/meta/_journal.json` - Added idx=5 entry for 0005_token_signal_columns with when=1773510000000

## Decisions Made

- **Journal timestamp must exceed last migration**: Drizzle's `SQLiteDialect.migrate()` uses `folderMillis > lastDbMigration.created_at` to determine what to apply. The 0005 entry uses `when=1773510000000` (greater than 0004's `1773420419000`).
- **Manual migration (not drizzle-kit)**: Following Phase 04 precedent where drizzle-kit was found to regenerate already-applied tables when meta snapshots are incomplete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed journal when timestamp ordering for Drizzle migration application**
- **Found during:** Task 1 (verifying migration applied)
- **Issue:** Initial journal entry used `when: 1742032800000` which is less than 0004's `created_at: 1773420419000`. Drizzle only applies migrations where `folderMillis > lastDbMigration.created_at`, so 0005 was silently skipped.
- **Fix:** Updated journal `when` to `1773510000000` (greater than 0004's timestamp)
- **Files modified:** `src/db/migrations/meta/_journal.json`
- **Verification:** `pnpm tsx src/db/check-migration.ts` confirmed both columns present via PRAGMA table_info
- **Committed in:** e0d788f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in journal timestamp ordering)
**Impact on plan:** Required fix to ensure migration actually applied. No scope creep.

## Issues Encountered

- Drizzle's migration ordering check is non-obvious: it compares `folderMillis` (from journal `when`) against the `created_at` of the most recently applied migration in `__drizzle_migrations`. The journal entry timestamp must be chronologically later than all previous applied migrations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `signal_tier` and `coordinated_wallet_count` columns are live in SQLite
- `src/db/schema.ts` reflects both columns — Plan 03 signal computation engine can reference them directly
- Migration applies cleanly on a fresh DB (migrate() on startup pattern confirmed)
- No blockers for Plan 02 or Plan 03

---
*Phase: 06-token-signal-engine*
*Completed: 2026-03-15*
