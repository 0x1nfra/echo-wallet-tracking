---
phase: 12-signal-accuracy-logging
plan: 02
subsystem: signals
tags: [tdd, outcome-resolver, accuracy, dexscreener, signal-accuracy, drizzle-orm]

# Dependency graph
requires:
  - phase: 12-signal-accuracy-logging
    plan: 01
    provides: signal_events table with 21 columns in schema.ts
  - path: src/fetchers/dexscreener.ts
    provides: DexScreenerFetcher for price fetching
provides:
  - src/signals/outcome-resolver.ts exporting resolveOutcomes and classifyOutcome
  - src/signals/accuracy.ts exporting getAccuracyStats, TierAccuracy, MIN_SAMPLE
  - TDD test suites for both modules (27 tests added)
affects: [12-03, 12-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable db+fetcher parameters for ESM-compatible testability (no jest.mock)"
    - "MockDexScreenerFetcher extends DexScreenerFetcher — constructor injection, no module mock"
    - "Explicit three-block window resolution (1h/4h/24h) — drizzle set() requires static keys"

key-files:
  created:
    - src/signals/outcome-resolver.ts
    - src/signals/accuracy.ts
    - src/signals/__tests__/outcome-resolver.test.ts
    - src/signals/__tests__/accuracy.test.ts
  modified: []

key-decisions:
  - "resolveOutcomes uses three explicit window blocks (1h, 4h, 24h) rather than a dynamic column loop — drizzle set() requires static object keys, not column references"
  - "Weak tier uses >= 0 as hit threshold (not > 0) — break-even (0%) is directional success per plan spec"
  - "MAX_PER_CYCLE=20 applied per window per cycle (up to 60 DexScreener calls total per cycle)"
  - "MIN_SAMPLE=20 exported as named constant so dashboard and Telegram can import it for consistent display"
  - "Test fix: MAX_PER_CYCLE test asserted outcome_1h_price IS NULL count (not is_fully_resolved=false) — 4h/24h windows not due so all 25 rows have is_fully_resolved=false"

patterns-established:
  - "MockDexScreenerFetcher extends real class, overrides getTokenPrice — no jest.mock, ESM-compatible"

requirements-completed: [QUAL-01, QUAL-02]

# Metrics
duration: 16min
completed: 2026-03-27
---

# Phase 12 Plan 02: Outcome Resolver and Accuracy Aggregation Summary

**Outcome resolver (classifyOutcome + resolveOutcomes) and accuracy aggregation (getAccuracyStats) implemented with TDD — Strong>=50%/Moderate>=25%/Weak=directional thresholds, MAX_PER_CYCLE=20 per window, MIN_SAMPLE=20 gate; 27 new tests, 237 total green**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-03-27T05:19:02Z
- **Completed:** 2026-03-27T05:35:24Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- **Task 1 (TDD — classifyOutcome + resolveOutcomes):**
  - RED: 289-line test file covering classifyOutcome (Strong/Moderate/Weak thresholds, null guards) and resolveOutcomes (1h window resolution, is_fully_resolved, rug/null price, MAX_PER_CYCLE cap, idempotency)
  - GREEN: `outcome-resolver.ts` with three explicit window blocks, 200ms DexScreener delay, 90-day retention cleanup, idempotency via IS NULL guard in WHERE
  - 17 tests pass

- **Task 2 (TDD — getAccuracyStats):**
  - RED: 254-line test file covering empty DB, unresolved-only, 20-row hit rate, MIN_SAMPLE gate, per-tier separation, failed denominator inclusion, null entry_price exclusion, avg_return_24h
  - GREEN: `accuracy.ts` with MIN_SAMPLE=20 exported constant, db injection for testability
  - 10 tests pass (including MIN_SAMPLE constant export test)

## Task Commits

Each task was committed atomically:

1. **RED: outcome-resolver tests** — `2f41a47`
2. **GREEN: outcome-resolver implementation + test fix** — `b261966`
3. **RED: accuracy tests** — `a4d9615`
4. **GREEN: accuracy implementation** — `4611892`

## Files Created

- `src/signals/outcome-resolver.ts` — `resolveOutcomes()` and `classifyOutcome()` exports
- `src/signals/accuracy.ts` — `getAccuracyStats()`, `TierAccuracy` interface, `MIN_SAMPLE` constant
- `src/signals/__tests__/outcome-resolver.test.ts` — 17 TDD tests (289 lines)
- `src/signals/__tests__/accuracy.test.ts` — 10 TDD tests (254 lines)

## Hit Rate Thresholds (as documented in outcome-resolver.ts)

| Tier | Threshold | Logic |
|------|-----------|-------|
| Strong | >= +50% | `pct >= 0.50` |
| Moderate | >= +25% | `pct >= 0.25` |
| Weak | Directional | `pct >= 0` (any non-negative = hit) |
| Any | null price | `status = 'failed'` |
| Any | null/zero entry | `status = 'failed'` |

## Decisions Made

- **Three explicit window blocks:** drizzle `set()` requires static object keys — dynamic column reference in a loop cannot be used for `update().set()`. Each of 1h, 4h, and 24h is its own explicit block.
- **MAX_PER_CYCLE=20 per window:** caps at 20 DexScreener calls per window per cycle (60 total per cycle), well within free-tier limits.
- **Weak tier >= 0:** break-even (0%) counts as hit per plan spec ("any positive = hit" — 0% gain is directional success).
- **MIN_SAMPLE exported:** allows downstream consumers (Plan 04 dashboard, Telegram command) to display the threshold without hardcoding.
- **Test fix (Rule 1):** MAX_PER_CYCLE test initially checked `is_fully_resolved=false` to find unresolved rows — incorrect, since all 25 rows have `is_fully_resolved=false` when 4h/24h windows aren't yet due. Fixed to check `outcome_1h_price IS NULL` count directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MAX_PER_CYCLE test assertion used wrong column**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test checked `is_fully_resolved=false` for "remaining unresolved rows" — but all 25 rows have is_fully_resolved=false when only the 1h window is due (4h/24h not resolved yet)
- **Fix:** Changed assertion to count `outcome_1h_price IS NULL` and `IS NOT NULL` directly
- **Files modified:** `src/signals/__tests__/outcome-resolver.test.ts`
- **Commit:** `b261966`

## Test Count

- **Before:** 210 tests (post Phase 12 plan 01)
- **Added:** 27 tests (17 outcome-resolver + 10 accuracy)
- **After:** 237 tests — all passing

## Self-Check: PASSED

- FOUND: src/signals/outcome-resolver.ts
- FOUND: src/signals/accuracy.ts
- FOUND: src/signals/__tests__/outcome-resolver.test.ts
- FOUND: src/signals/__tests__/accuracy.test.ts
- FOUND commit: 2f41a47 (RED: outcome-resolver tests)
- FOUND commit: b261966 (GREEN: outcome-resolver implementation)
- FOUND commit: a4d9615 (RED: accuracy tests)
- FOUND commit: 4611892 (GREEN: accuracy implementation)
