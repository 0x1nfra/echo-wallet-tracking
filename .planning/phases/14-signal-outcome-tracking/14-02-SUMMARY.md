---
phase: 14-signal-outcome-tracking
plan: "02"
subsystem: signals
tags: [sqlite, drizzle, dexscreener, tdd, outcome-tracking, rug-detection, milestones]

# Dependency graph
requires:
  - phase: 14-01
    provides: "outcome_30m_price, peak_price, is_rug, hit_50/100/300 columns in signal_events schema"

provides:
  - "resolveOutcomes() extended with 30m window processing (before 1h/4h/24h)"
  - "updatePeakPrice() helper: running max across all four window resolutions"
  - "updateMilestones() helper: hit_50/100/300 flags from OUTCOME_MILESTONES env"
  - "Rug detection at 4h window: bundler ratio >= 0.3 AND drop >= 90% sets all four statuses to 'rug'"
  - "24h loop rug guard: is_rug=false WHERE clause prevents re-processing rugged tokens"
  - "is_fully_resolved now requires all FOUR window statuses non-null (30m+1h+4h+24h)"
  - "Full test coverage: 13 new assertions + updated 3 existing tests"

affects:
  - "14-03 (accuracy stats reads outcome statuses written here)"
  - "14-04 (outcome alerts reads is_rug, hit_50/100/300 written here)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED-GREEN: failing tests committed before implementation"
    - "Private helper functions for side-effect logic (updatePeakPrice, updateMilestones)"
    - "Module-load-time constant for OUTCOME_MILESTONES env var (not inside hot loop)"
    - "is_rug=false WHERE guard on 24h SELECT (not just idempotency — classification protection)"

key-files:
  created: []
  modified:
    - src/signals/outcome-resolver.ts
    - src/signals/__tests__/outcome-resolver.test.ts

key-decisions:
  - "MILESTONE_COLUMNS map keyed by threshold integer (50/100/300) for dynamic column selection without if/else chains"
  - "updatePeakPrice reads current peak_price first then conditionally writes — avoids unconditional UPDATE on every resolution"
  - "Rug detection uses continue statement to skip normal 4h write path — keeps rug and non-rug paths clearly separated"
  - "Existing MAX_PER_CYCLE cap test updated: 30m window adds 20 more resolutions for 2h-old tokens, so resolved=40 (not 20); timeout extended to 15s"
  - "is_fully_resolved batch update uses isNotNull() from drizzle-orm for outcome_30m_status (consistent with existing sql template literals for other windows)"

patterns-established:
  - "Window resolution pattern: fetch price -> classify -> write price/pct/status -> updatePeakPrice -> updateMilestones -> resolved++ -> 200ms delay"
  - "Rug guard pattern: WHERE eq(signal_events.is_rug, false) on 24h SELECT prevents overwriting rug statuses"

requirements-completed: [OUTCOME-01, OUTCOME-02, OUTCOME-03, OUTCOME-04]

# Metrics
duration: 5min
completed: 2026-04-09
---

# Phase 14 Plan 02: Outcome Resolver Extension Summary

**resolveOutcomes() extended with 30m window, peak price tracking as running max, rug detection at 4h (all four statuses overwritten), milestone hit flags, and is_fully_resolved requiring all four windows**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-09T09:53:26Z
- **Completed:** 2026-04-09T09:58:30Z
- **Tasks:** 1 (TDD: RED commit + GREEN commit)
- **Files modified:** 2

## Accomplishments

- Extended resolveOutcomes() with a 30m window processed before all other windows, backed by the schema columns from Plan 01
- Added updatePeakPrice() helper updating running maximum across 30m/1h/4h/24h resolution cycles
- Added updateMilestones() helper writing hit_50/hit_100/hit_300 flags from OUTCOME_MILESTONES env var at module load time
- Added rug detection at 4h window: when bundler ratio (coordinated/smart_wallet_count) >= 0.3 AND pct drop >= -0.90, sets is_rug=true and overwrites all four outcome_*_status columns to 'rug'
- Added is_rug=false WHERE guard on 24h SELECT — prevents re-fetching price for already-rugged tokens
- Updated is_fully_resolved batch update to require outcome_30m_status IS NOT NULL in addition to existing 1h/4h/24h guards
- All new behavior covered by 13 new test assertions plus 3 updated existing tests (275 total passing)

## Task Commits

Each task was committed atomically (TDD pattern):

1. **TDD RED — failing tests** - `5947541` (test)
2. **TDD GREEN — implementation** - `81508db` (feat)

## Files Created/Modified

- `src/signals/outcome-resolver.ts` — Extended resolveOutcomes() with 30m window, updatePeakPrice, updateMilestones helpers, rug detection at 4h, 24h loop rug guard, is_fully_resolved 4-window requirement
- `src/signals/__tests__/outcome-resolver.test.ts` — 13 new test assertions across 6 new describe blocks; 3 existing tests updated to reflect 4-window behavior

## Decisions Made

- MILESTONE_COLUMNS map keyed by integer threshold (50/100/300) chosen over if/else chain for clean extensibility if OUTCOME_MILESTONES adds new thresholds
- updatePeakPrice reads current row first (one SELECT) then conditionally writes — avoids unconditional UPDATE on every resolution cycle
- Rug detection in 4h loop uses `continue` after rug write to cleanly skip normal 4h write path without nesting
- MAX_PER_CYCLE cap test updated from `resolved=20` to `resolved=40` (30m and 1h windows each process 20 of 25 due rows for a 2h-old token set); timeout extended to 15s to accommodate 40 * 200ms mock delays
- Three existing tests updated: "all four windows" instead of "all three", 30m status checked in failed outcomes test, test description updated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing MAX_PER_CYCLE cap test — resolved count and timeout**
- **Found during:** Task 1 GREEN phase (test run after implementation)
- **Issue:** Existing test expected `resolved=20` (1 window), but adding the 30m window means 2h-old tokens now resolve in 2 windows (30m + 1h) = 40 total. Test also timed out at 5s with 40 * 200ms = 8s of mock delays
- **Fix:** Updated expected resolved count from 20 to 40; added `15000` timeout to the test
- **Files modified:** src/signals/__tests__/outcome-resolver.test.ts
- **Verification:** All 275 tests pass
- **Committed in:** 81508db (Task 1 GREEN commit)

**2. [Rule 1 - Bug] Updated 3 existing tests to reflect 4-window is_fully_resolved requirement**
- **Found during:** Task 1 GREEN phase
- **Issue:** "sets is_fully_resolved=true when all three windows" test comment and assertions didn't check outcome_30m_status; "marks outcome as failed" test didn't check outcome_30m_status; both would still pass but with inaccurate assertions
- **Fix:** Added outcome_30m_status assertion to both tests; updated test descriptions to say "four windows" not "three"
- **Files modified:** src/signals/__tests__/outcome-resolver.test.ts
- **Verification:** All 275 tests pass
- **Committed in:** 81508db (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (Rule 1 — existing tests needed updating to reflect new 4-window behavior)
**Impact on plan:** Both auto-fixes necessary for test correctness. No scope creep.

## Issues Encountered

None — implementation matched the plan specification exactly.

## Next Phase Readiness

- resolveOutcomes() is complete and battle-tested: all four windows, peak tracking, rug detection, milestones
- Plan 03 (accuracy stats) can read outcome_*_status, is_rug, and hit_50/100/300 columns written by this plan
- Plan 04 (outcome alerts) can read is_rug and hit flags for Telegram notifications
- OUTCOME_MILESTONES env var defaults to '50,100,300' — no operator action required for standard configuration

## Self-Check: PASSED

- FOUND: src/signals/outcome-resolver.ts
- FOUND: src/signals/__tests__/outcome-resolver.test.ts
- FOUND: .planning/phases/14-signal-outcome-tracking/14-02-SUMMARY.md
- FOUND: commit 5947541 (test RED)
- FOUND: commit 81508db (feat GREEN)
- All 275 tests passing (pnpm test)
- TypeScript compiles without errors (npx tsc --noEmit)

---
*Phase: 14-signal-outcome-tracking*
*Completed: 2026-04-09*
