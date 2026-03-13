---
phase: 05-monitoring-loop-and-auto-removal
plan: 01
subsystem: database
tags: [drizzle-orm, better-sqlite3, p-queue, p-retry, helius, migration, sqlite]

# Dependency graph
requires:
  - phase: 04-metrics-and-scoring
    provides: score_history table and scoring engine that monitoring loop will query
provides:
  - Migration 0004 adding low_score_streak and last_trade_at to wallets table
  - Migration 0004 adding label and score_at_removal to removal_log table
  - heliusQueue reconfigured with concurrency: 5 and 429-aware exponential backoff
affects:
  - 05-02 monitoring loop (consumes low_score_streak, last_trade_at for removal policies)
  - 05-03 auto-removal (writes label, score_at_removal to removal_log)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - statement-breakpoint markers required in drizzle-kit SQLite migrations for multi-statement files
    - p-queue concurrency mode (vs interval mode) for monitoring loop parallelism
    - pRetry onFailedAttempt with async 429 backoff: Math.pow(2, attemptNumber) * 1000

key-files:
  created:
    - src/db/migrations/0004_monitoring_columns.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json
    - src/fetchers/helius.ts

key-decisions:
  - "Migration 0004 uses --> statement-breakpoint markers (not SQL semicolons alone) — drizzle-kit better-sqlite3 prepares one statement at a time; multi-statement SQL file fails without breakpoints"
  - "heliusQueue switched from interval/intervalCap (free-tier 2 req/s) to concurrency: 5 — monitoring loop needs parallel wallet fetches, not interval throttling"
  - "pRetry retries increased from 3 to 5 with 429-specific exponential backoff (2s base, doubles per attempt) — rate limit exhaustion must not crash the monitoring loop"
  - "last_trade_at backfill uses MAX(timestamp * 1000) converting Helius seconds to milliseconds — prevents inactivity removal from incorrectly evicting wallets with historical trade data"

patterns-established:
  - "Multi-statement drizzle migrations need --> statement-breakpoint between each SQL statement"

requirements-completed: [MNTR-03]

# Metrics
duration: 31min
completed: 2026-03-13
---

# Phase 05 Plan 01: Schema Migration and Helius Queue Update Summary

**SQLite migration 0004 adding 4 monitoring columns (low_score_streak, last_trade_at, label, score_at_removal) plus heliusQueue upgrade to concurrency: 5 with 429 exponential backoff retry**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-13T16:46:59Z
- **Completed:** 2026-03-13T17:17:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Applied migration 0004 adding `low_score_streak` (int, default 0) and `last_trade_at` (int, nullable) to `wallets` table, with backfill from existing swaps data
- Applied migration 0004 adding `label` (text, nullable) and `score_at_removal` (real, nullable) to `removal_log` table
- Updated `heliusQueue` from `{ interval: 1000, intervalCap: 2 }` to `{ concurrency: 5 }` with 5-retry 429-aware exponential backoff

## Task Commits

Each task was committed atomically:

1. **Task 1: Add monitoring columns to schema and generate migration 0004** - `ca163ea` (feat)
2. **Task 2: Update heliusQueue to concurrency: 5 with 429 exponential backoff** - `ebb643b` (feat)

## Files Created/Modified

- `src/db/migrations/0004_monitoring_columns.sql` - DDL for 4 new columns + last_trade_at backfill from swaps
- `src/db/schema.ts` - Added low_score_streak, last_trade_at to wallets; label, score_at_removal to removal_log
- `src/db/migrations/meta/_journal.json` - Appended idx 4 entry for 0004_monitoring_columns
- `src/fetchers/helius.ts` - heliusQueue concurrency: 5; pRetry retries: 5 with 429 exponential backoff

## Decisions Made

- Multi-statement drizzle migrations require `-->  statement-breakpoint` markers between SQL statements. Without them, better-sqlite3 rejects the file with "The supplied SQL string contains more than one statement". This is consistent with existing migrations in the codebase.
- Switched heliusQueue from interval-based (2 req/s free-tier limit) to concurrency-based (5 parallel requests) — the monitoring loop fires on a schedule rather than continuously so interval throttling is not needed; concurrent dispatch is the right model.
- pRetry retries 5 with exponential backoff on 429 (2s, 4s, 8s, 16s, 32s) ensures transient rate limit errors during monitoring loop batch runs do not surface as crashes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added statement-breakpoint markers to migration SQL**
- **Found during:** Task 1 (migration application)
- **Issue:** drizzle-kit better-sqlite3 driver uses `db.prepare()` which rejects SQL strings with multiple statements. The plan's migration SQL had no breakpoints so `npx drizzle-kit migrate` failed with "The supplied SQL string contains more than one statement"
- **Fix:** Added `-->  statement-breakpoint` between each SQL statement in 0004_monitoring_columns.sql
- **Files modified:** src/db/migrations/0004_monitoring_columns.sql
- **Verification:** Migration applied successfully; all 4 columns confirmed in echo.db via pragma query
- **Committed in:** ca163ea (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required fix for migration to apply. Same pattern seen in other drizzle SQLite migrations. No scope creep.

## Issues Encountered

- drizzle-kit multi-statement migration failure resolved by adding statement-breakpoint markers (documented as deviation above)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- wallets.low_score_streak ready for monitoring loop to increment/reset each cycle
- wallets.last_trade_at populated from historical data — inactivity removal can use it immediately
- removal_log.label and removal_log.score_at_removal ready for auto-removal audit records
- heliusQueue supports concurrent wallet fetching needed by monitoring loop batch processing

---
*Phase: 05-monitoring-loop-and-auto-removal*
*Completed: 2026-03-13*

## Self-Check: PASSED

All files confirmed present. Task commits ca163ea and ebb643b verified in git log.
