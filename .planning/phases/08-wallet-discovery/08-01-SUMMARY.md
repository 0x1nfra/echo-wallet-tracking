---
phase: 08-wallet-discovery
plan: 01
subsystem: database
tags: [drizzle-orm, sqlite, schema, migration, wallet-discovery, probation]

# Dependency graph
requires:
  - phase: 07-api-dashboard-and-telegram-alerts
    provides: migration 0006 (alert_log, token_metadata tables), journal when:1773510000001

provides:
  - probation_until nullable integer column on wallets table
  - discovery_runs table tracking per-CA wallet discovery invocations
  - discovery_candidates table as per-run audit log for evaluated addresses
  - Migration 0007 SQL DDL with statement-breakpoint-separated statements
  - Journal entry idx:7 with when:1773510000002

affects: [08-wallet-discovery plans 02-05, any code querying wallets table]

# Tech tracking
tech-stack:
  added: []
  patterns: [manual migration authoring (no drizzle-kit), statement-breakpoint separators for SQLite]

key-files:
  created:
    - src/db/migrations/0007_wallet_discovery.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json

key-decisions:
  - "probation_until added as nullable INTEGER (no default, no notNull) — keeps existing wallets.status queries intact; probation is an overlay, not a status replacement"
  - "discoveryRuns and discoveryCandidates use integer PK with autoIncrement, consistent with all other tables in schema.ts"
  - "source enum on discoveryCandidates: ['direct', 'graph'] — direct = holder of token CA, graph = discovered via co-investment graph"
  - "result enum on discoveryCandidates: ['added', 'rejected', 'already_tracked', 'dry_run'] — dry_run result allows audit logging without DB writes"
  - "Migration journal when:1773510000002 — one higher than 0006's 1773510000001, required for Drizzle migrate() to apply it (skips entries where when <= lastDbMigration.when)"

patterns-established:
  - "Pattern: New migration = new SQL file + journal entry; drizzle-kit NOT used (incomplete meta snapshots cause table regeneration)"

requirements-completed: [DISC-03]

# Metrics
duration: 2min
completed: 2026-03-16
---

# Phase 8 Plan 01: Wallet Discovery Schema Summary

**probation_until column on wallets, discovery_runs and discovery_candidates tables added via migration 0007 — all downstream discovery plans unblocked**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-16T05:06:27Z
- **Completed:** 2026-03-16T05:08:26Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended wallets table with nullable `probation_until` integer column (no status enum change, preserving 11 existing `eq(wallets.status, 'tracked')` queries)
- Created `discovery_runs` table for tracking each `wallet discover <CA>` CLI invocation with counts and dry_run flag
- Created `discovery_candidates` table as per-run audit log with source enum and result enum
- Wrote migration 0007 with three DDL statements separated by `--> statement-breakpoint` markers
- Registered journal entry idx:7, when:1773510000002 (one higher than 0006) to ensure Drizzle applies it

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend wallets schema with probation_until column** - `426bffa` (feat)
2. **Task 2: Write migration 0007 and register in journal** - `6a0feb4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/db/schema.ts` - Added probation_until to wallets; added discoveryRuns and discoveryCandidates table definitions
- `src/db/migrations/0007_wallet_discovery.sql` - Three statement-breakpoint-separated DDL statements (ALTER TABLE + 2x CREATE TABLE)
- `src/db/migrations/meta/_journal.json` - Appended idx:7 entry with when:1773510000002

## Decisions Made
- probation_until is nullable with no default — wallets not on probation simply have NULL; no schema-level default needed
- No status enum expansion — research memo explicitly locked this to avoid breaking the 11 existing `eq(wallets.status, 'tracked')` queries
- Manual migration authoring used (not drizzle-kit) — consistent with Phase 04/05/06/07 precedent where incomplete meta snapshots cause drizzle-kit to regenerate already-applied tables

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The pre-existing `src/discovery/__tests__/early-buyers.test.ts` compilation failure (missing `early-buyers.js` module) was present before this plan and is out of scope — it will be resolved when plan 02 creates that module.

## Next Phase Readiness
- All three schema truths satisfied: probation_until on wallets, discovery_candidates with correct columns, discovery_runs table
- Migration 0007 ready to apply on both fresh DBs and DBs with 0006 already applied
- Plans 02-05 can proceed — schema dependencies are now available

---
*Phase: 08-wallet-discovery*
*Completed: 2026-03-16*
