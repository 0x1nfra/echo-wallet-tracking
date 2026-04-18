---
phase: 14-signal-outcome-tracking
plan: "03"
subsystem: signals
tags: [accuracy, drizzle-orm, sqlite, ejs, tdd]

# Dependency graph
requires:
  - phase: 14-02
    provides: outcome_30m columns, is_rug column, and peak_price_at in signal_events written by resolveOutcomes()

provides:
  - TierAccuracy interface with hits_30m, hit_rate_30m, avg_return_30m and rug exclusion from total_resolved
  - getAccuracyStats() with 4-window support (30m/1h/4h/24h) and rug exclusion WHERE filter
  - accuracy_stats.ejs 4-column table: 30m Hit% | 1h Return | 4h Return | 24h Hit%
  - Time-to-peak in minutes derived from (peak_price_at - fired_at) / 60000 in dashboard partial

affects: [15-coin-sourcing, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "or(eq(col, false), isNull(col)) pattern for nullable boolean exclusion in drizzle-orm WHERE clauses"
    - "Derive time-to-peak inline in EJS from recentEvents array passed by route"
    - "MIN_SAMPLE null guard applied to multiple hit rate columns simultaneously"

key-files:
  created: []
  modified:
    - src/signals/accuracy.ts
    - src/signals/__tests__/accuracy.test.ts
    - src/api/views/partials/accuracy_stats.ejs

key-decisions:
  - "Rug exclusion uses or(is_rug=false, is_rug IS NULL) to handle both explicit false and rows predating the is_rug column"
  - "hits_1h and hits_4h are intentionally omitted — only 30m and 24h show hit rates; 1h/4h show avg returns only, consistent with existing pattern"
  - "Time-to-peak derived inline from recentEvents in EJS — no stored column, no route change needed"
  - "Sparse data shows Insufficient data (N/20) for both 30m and 24h columns, consistent with pre-existing pattern"

patterns-established:
  - "TDD RED/GREEN for accuracy aggregation queries: write failing tests against in-memory SQLite before implementing"

requirements-completed: [OUTCOME-03, OUTCOME-06]

# Metrics
duration: 12min
completed: 2026-04-09
---

# Phase 14 Plan 03: Accuracy Stats 4-Window Extension Summary

**4-window rug-excluded accuracy stats (30m/1h/4h/24h) in TierAccuracy interface and dashboard partial with time-to-peak derived from peak_price_at**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-09T10:01:42Z
- **Completed:** 2026-04-09T10:14:16Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended TierAccuracy interface with hits_30m, hit_rate_30m, avg_return_30m fields; total_resolved now excludes rug tokens
- Updated getAccuracyStats() to apply rug exclusion WHERE filter and aggregate 30m window alongside existing 1h/4h/24h windows
- Updated accuracy_stats.ejs to 4-column table (30m Hit% | 1h Return | 4h Return | 24h Hit%) with time-to-peak section and rug exclusion note
- 8 new tests added (rug exclusion x3, 30m window x5); all 283 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend TierAccuracy and getAccuracyStats() for 4-window rug-excluded stats** - `ca07f10` (feat)
2. **Task 2: Update accuracy_stats.ejs to 4-window table layout with time-to-peak** - `c78994f` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 1 used TDD (RED failing tests first, then GREEN implementation)._

## Files Created/Modified
- `src/signals/accuracy.ts` - Extended TierAccuracy interface and getAccuracyStats() with 4-window support and rug exclusion
- `src/signals/__tests__/accuracy.test.ts` - 8 new tests for rug exclusion and 30m window behavior
- `src/api/views/partials/accuracy_stats.ejs` - 4-column table with time-to-peak section and rug exclusion note

## Decisions Made
- Rug exclusion uses `or(eq(is_rug, false), isNull(is_rug))` to handle rows predating the is_rug column (which default to NULL, not false)
- hits_1h and hits_4h intentionally omitted — only 30m and 24h define hits; 1h/4h expose avg returns which are more useful for those windows
- Time-to-peak derived inline in EJS from recentEvents rather than adding a route-level aggregation, keeping the route unchanged
- Sparse data consistently shows "Insufficient data (N/20)" for both 30m and 24h hit rate columns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `pnpm test -- --testPathPattern="accuracy"` did not match the file; used `NODE_OPTIONS=--experimental-vm-modules npx jest src/signals/__tests__/accuracy.test.ts` directly for per-test runs. Full suite ran via `pnpm test` for final verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Accuracy stats surface complete — reads outcome statuses written by Plan 02, displays 4-window data without survivorship bias
- Phase 14 Plan 04 (final plan) is now unblocked
- Dashboard partial ready for live verification once signals accumulate resolved events

---
*Phase: 14-signal-outcome-tracking*
*Completed: 2026-04-09*
