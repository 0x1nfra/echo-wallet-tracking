---
phase: 04-metrics-and-scoring
plan: 01
subsystem: database
tags: [drizzle-orm, sqlite, better-sqlite3, schema, migrations]

# Dependency graph
requires:
  - phase: 03-bundle-scam-detection
    provides: wallet_flags table and detection_status enum used as prerequisite schema baseline
provides:
  - score_history append-only table with wallet_address, score, scored_at and wallet_scored index
  - wallet_metrics extended with score_total, score_risk_adjusted, score_win_rate, score_consistency_recency, score_activity_health, trade_count, recent_trade_count columns
  - Migration 0003_lethal_the_twelve.sql applied to local database
affects:
  - 04-metrics-and-scoring (Plan 03 scoring engine writes to score_history and wallet_metrics sub-score columns)
  - 05-monitoring-loop (rolling-window queries against score_history for N consecutive cycles logic)
  - 07-dashboard (sub-score breakdown display from wallet_metrics)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - drizzle-kit generate + manual migration correction when meta snapshots are missing intermediate entries
    - All nullable new columns in wallet_metrics (null until first scoring run) for additive schema evolution

key-files:
  created:
    - src/db/migrations/0003_lethal_the_twelve.sql
    - src/db/migrations/meta/0003_snapshot.json
  modified:
    - src/db/schema.ts

key-decisions:
  - "Migration 0003 manually corrected: drizzle-kit regenerated parse_errors and wallet_flags tables (meta snapshots 0001/0002 missing) — stripped them to only include score_history CREATE TABLE and wallet_metrics ALTER TABLE statements"
  - "score_history index added manually (score_history_wallet_scored on wallet_address, scored_at DESC) — drizzle-kit SQLite did not generate it automatically, but it is critical for Phase 5 rolling-window queries"
  - "All seven new wallet_metrics columns are nullable — null until the first scoring run writes them, consistent with existing nullable metric columns"

patterns-established:
  - "score_history as append-only log: never UPDATE, only INSERT rows; rolling windows query by wallet_address + scored_at range"

requirements-completed: [SCOR-01, SCOR-02]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 4 Plan 01: Score History Table and wallet_metrics Sub-Score Schema

**Append-only score_history table (4 columns + composite index) and 7 new nullable columns on wallet_metrics for sub-score breakdown, generated as migration 0003 and applied to echo.db**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T10:26:52Z
- **Completed:** 2026-03-13T10:31:00Z
- **Tasks:** 2
- **Files modified:** 3 (schema.ts, 0003 migration SQL, meta snapshot)

## Accomplishments

- Added score_history append-only table with id, wallet_address, score, scored_at and a composite index on (wallet_address, scored_at DESC) for Phase 5 rolling-window queries
- Extended wallet_metrics with five sub-score columns (score_total, score_risk_adjusted, score_win_rate, score_consistency_recency, score_activity_health) and two trade-count columns (trade_count, recent_trade_count)
- Generated and applied migration 0003_lethal_the_twelve.sql to data/echo.db; TypeScript compiles cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend schema.ts — add score_history table and wallet_metrics sub-score columns** - `2b7ee14` (feat)
2. **Task 2: Generate and verify Drizzle migration for schema additions** - `4f9a35a` (feat)

## Files Created/Modified

- `src/db/schema.ts` - Added score_history table export and 7 new columns to wallet_metrics
- `src/db/migrations/0003_lethal_the_twelve.sql` - Migration SQL: CREATE TABLE score_history, CREATE INDEX score_history_wallet_scored, 7 ALTER TABLE wallet_metrics statements
- `src/db/migrations/meta/0003_snapshot.json` - Drizzle meta snapshot for 0003 migration
- `src/db/migrations/meta/_journal.json` - Updated journal with 0003 entry

## Decisions Made

- Migration 0003 manually corrected: drizzle-kit generate included CREATE TABLE for parse_errors and wallet_flags (already existing tables) because meta snapshots 0001/0002 were absent from the meta directory. The migration was stripped to only the new additions.
- score_history index added manually: drizzle-kit SQLite did not auto-generate the index from the schema definition. The index `score_history_wallet_scored` on `(wallet_address, scored_at DESC)` is critical for Phase 5 rolling-window lookups and was added directly to the SQL file.
- All seven new wallet_metrics columns are nullable with no `.notNull()` — consistent with the existing nullable metric columns and appropriate since they are null until the first scoring run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected drizzle-kit generated migration to exclude already-applied tables**
- **Found during:** Task 2 (Generate and verify Drizzle migration)
- **Issue:** drizzle-kit generate included CREATE TABLE parse_errors and CREATE TABLE wallet_flags in 0003 migration because intermediate meta snapshots (0001, 0002) were absent. Applying as-is would fail with "table already exists" errors.
- **Fix:** Replaced migration file content with only the new DDL: CREATE TABLE score_history, CREATE INDEX score_history_wallet_scored, and 7 ALTER TABLE wallet_metrics statements.
- **Files modified:** src/db/migrations/0003_lethal_the_twelve.sql
- **Verification:** `DATABASE_URL=data/echo.db npx drizzle-kit migrate` exited 0; score_history table and index confirmed in echo.db via better-sqlite3 queries
- **Committed in:** 4f9a35a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: incorrect migration content from missing meta snapshots)
**Impact on plan:** Essential correction — original generated file would have failed on apply. Index addition was specified in the plan as a manual step if drizzle-kit did not generate it. No scope creep.

## Issues Encountered

- drizzle meta snapshots 0001 and 0002 were absent from the meta directory (only 0000_snapshot.json existed). drizzle-kit computed the diff from snapshot 0000 and regenerated already-applied tables. Fixed by writing clean migration SQL directly.

## Next Phase Readiness

- score_history table and index ready for Phase 5 monitoring loop rolling-window queries
- wallet_metrics sub-score columns (all nullable) ready for Plan 03 scoring engine writes
- TypeScript schema types for score_history and extended wallet_metrics available for import in scoring engine

---
*Phase: 04-metrics-and-scoring*
*Completed: 2026-03-13*
