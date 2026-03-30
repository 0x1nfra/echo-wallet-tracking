---
phase: 12-signal-accuracy-logging
plan: 01
subsystem: database
tags: [sqlite, drizzle-orm, migration, signal-accuracy, better-sqlite3]

# Dependency graph
requires:
  - phase: 06-token-signal-engine
    provides: signal scoring (tier, signal_score, smart_wallet_count, buy_velocity, pnlWeightedHolderScore, coordinated_wallet_count)
  - phase: 08-wallet-discovery
    provides: migration pattern (manual SQL + journal registration via drizzle migrate())
provides:
  - signal_events table exported from schema.ts with 21 columns
  - Migration 0009_signal_accuracy.sql applied to live SQLite database
  - ORM-queryable append-only audit log for tier transition events
affects: [12-02, 12-03, 12-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Manual migration: write SQL file + register in _journal.json with when > lastWhen; drizzle migrate() applies automatically on next app start
    - Migration 0009 when:1773510000004 (lastWhen was 1773510000003 for 0008)

key-files:
  created:
    - src/db/migrations/0009_signal_accuracy.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json

key-decisions:
  - "Migration 0009 journal when:1773510000004 — strictly greater than 0008's 1773510000003 per drizzle migrate() folderMillis comparison requirement"
  - "signal_events is decoupled from token_signals — no foreign key; append-only log for accuracy calculation without impacting signal engine reads"
  - "holder_score maps to pnlWeightedHolderScore from signal engine — smart_wallet_count IS the holder count per research pitfall 4"
  - "entry_price is nullable — DexScreener may return null for brand-new tokens; excluded from accuracy calc, not marked failed"

patterns-established:
  - "Migration pattern: create SQL file, increment journal when by 1, drizzle migrate() handles application"

requirements-completed: [QUAL-01]

# Metrics
duration: 7min
completed: 2026-03-27
---

# Phase 12 Plan 01: Signal Events Table Summary

**SQLite `signal_events` table with 21 columns created via migration 0009 — append-only audit log capturing full tier transition snapshot and three outcome windows (1h/4h/24h) for signal accuracy tracking**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-27T04:51:12Z
- **Completed:** 2026-03-27T04:58:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `signal_events` table to `schema.ts` with 21 columns: 9 snapshot columns (token_mint, fired_at, tier, signal_score, smart_wallet_count, buy_velocity, holder_score, coordinated_wallet_count, entry_price) + 9 outcome columns (outcome_1h/4h/24h price/pct/status) + is_fully_resolved + created_at
- Created `0009_signal_accuracy.sql` migration and registered in `_journal.json` with `when:1773510000004`
- Migration applied cleanly via drizzle `migrate()` — all 210 existing tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add signal_events table to schema.ts** - `27be89c` (feat)
2. **Task 2: Write migration 0009 and register in journal** - `d26675a` (feat)

## Files Created/Modified

- `src/db/schema.ts` - Appended `signal_events` table definition (27 lines)
- `src/db/migrations/0009_signal_accuracy.sql` - CREATE TABLE DDL for signal_events
- `src/db/migrations/meta/_journal.json` - Added idx:9 entry for 0009_signal_accuracy

## Decisions Made

- **Migration when timestamp:** `1773510000004` — must be strictly greater than previous entry (`1773510000003`) for drizzle migrate() to apply it
- **No foreign key to token_signals:** signal_events is a decoupled append-only log; foreign key would create coupling that complicates the accuracy resolver
- **holder_score column name:** maps to `pnlWeightedHolderScore` from signal engine — there is no separate raw holder_count (smart_wallet_count IS the holder count)
- **entry_price nullable:** DexScreener may return null for brand-new tokens; those events are excluded from accuracy calculation rather than marked as failed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `signal_events` is exported from `src/db/schema.js` — all downstream Phase 12 plans (outcome resolver, signal engine hook, accuracy queries, dashboard) can import and use it immediately
- Migration 0009 is applied to the live database — no manual SQL execution needed

---
*Phase: 12-signal-accuracy-logging*
*Completed: 2026-03-27*
