---
phase: 06-token-signal-engine
plan: "02"
subsystem: signals
tags: [typescript, pure-function, tdd, jest, signal-scoring]

requires:
  - phase: 04-metrics-and-scoring
    provides: wallet_metrics.score_total (0-95 per-wallet quality score consumed as pnlWeightedHolderScore input)

provides:
  - computeSignalScore(): pure function — takes pre-loaded holder data, returns TokenSignalResult with score, tier, sub-scores, exit pressure, coordination metadata
  - getSignalTier(): maps 0-100 score to strong/moderate/weak/inactive tier label
  - TokenSignalInputs and TokenSignalResult TypeScript interfaces (exported for engine.ts in Plan 03)
  - src/signals/ module with index.ts re-export

affects:
  - 06-03 (engine.ts imports computeSignalScore and TokenSignalInputs/TokenSignalResult)

tech-stack:
  added: []
  patterns:
    - "Pure computation + separate persistence (mirror scoring/composer.ts) — scorer.ts has zero DB imports"
    - "TDD RED-GREEN-REFACTOR: test file committed first, implementation second, index.ts refactor third"

key-files:
  created:
    - src/signals/scorer.ts
    - src/signals/__tests__/scorer.test.ts
    - src/signals/index.ts
  modified: []

key-decisions:
  - "Score formula weights locked: PnL-weighted holder quality 40%, buy velocity 35%, smart wallet count 25%"
  - "Tier thresholds: strong >= 65, moderate >= 35, weak < 35, inactive = 0"
  - "All-coordinated suppression: if every current holder is coordinated, signalScore=0 early-exit (before discount applied)"
  - "Coordination discount is final multiplier only — does NOT affect intermediate sub-score calculations (Pitfall 5 avoided)"
  - "Exit pressure computed (sells / (buys + sells)) and returned but does NOT affect signalScore"
  - "MIN_SMART_WALLETS=2: fewer current holders → inactive, score=0"
  - "Normalization constants: BUY_VELOCITY_SCALE=20 (5 buys/hr → 100), WALLET_COUNT_SCALE=10 (10 holders → 100)"

patterns-established:
  - "All-coordinated early-exit before discount calculation ensures coordinationDiscount is still returned for transparency"
  - "buildInactiveResult() helper prevents DRY violation across two early-exit code paths"

requirements-completed: [SGNL-01, SGNL-03]

duration: 3min
completed: 2026-03-15
---

# Phase 6 Plan 02: Token Signal Scorer Summary

**Pure signal computation function with 40/35/25 weighted formula, coordination discount multiplier, and all 14 TDD test cases green**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-15T14:07:23Z
- **Completed:** 2026-03-15T14:10:10Z
- **Tasks:** 3 (RED test, GREEN implementation, REFACTOR index)
- **Files modified:** 3

## Accomplishments
- 14 failing TDD tests written first (RED commit `a48983a`) covering all SGNL-01 and SGNL-03 behaviors
- computeSignalScore() implemented with formula weights, coordination discount, all-coordinated suppression, and min-floor check (GREEN commit `7918365`)
- src/signals/index.ts added for clean module interface following scoring/index.ts pattern (REFACTOR commit `22f1764`)
- Full 153-test suite remains green with zero regressions

## Task Commits

Each task was committed atomically:

1. **RED: Failing scorer tests** - `a48983a` (test)
2. **GREEN: scorer.ts implementation** - `7918365` (feat)
3. **REFACTOR: signals/index.ts** - `22f1764` (refactor)

_Note: TDD tasks have three commits (test → feat → refactor)_

## Files Created/Modified
- `src/signals/scorer.ts` - Pure signal computation: computeSignalScore(), getSignalTier(), TokenSignalInputs, TokenSignalResult exports
- `src/signals/__tests__/scorer.test.ts` - 14 TDD tests covering formula weights, tier boundaries, coordination discount, exit pressure, floor suppression
- `src/signals/index.ts` - Re-exports all public symbols from scorer.ts

## Decisions Made
- Score formula weights (40/35/25) locked as named constants in scorer.ts with JSDoc
- Normalization ceilings: BUY_VELOCITY_SCALE=20 (5 buys/hr = score 100), WALLET_COUNT_SCALE=10 (10 holders = score 100) — calibrated for 10-50 tracked wallets
- All-coordinated suppression uses early-exit before the discount calculation; coordinationDiscount is still returned at 0.3 for Phase 7 explainability
- Coordination discount applied as final step only (not during sub-score computation) per Pitfall 5 in RESEARCH.md
- buildInactiveResult() helper extracts shared zero-score logic across two early-exit paths

## Deviations from Plan

None — plan executed exactly as written. All 14 specified test cases implemented and passing.

## Issues Encountered
- `pnpm test -- --testPathPattern="scorer"` returned "no tests found" (pnpm absorbs the `--testPathPattern` arg differently from the plan's expected invocation). Workaround: run full `pnpm test` — the scorer test file is matched by jest's `**/src/**/__tests__/**/*.test.ts` glob. This is a pnpm CLI artifact; all tests ran correctly.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 03 (engine.ts) can import from `src/signals/scorer.js` or `src/signals/index.js`
- computeSignalScore() expects pre-loaded TokenSignalInputs — engine.ts must query DB and populate smartWalletHolders, buysLast1h, sellsLast1h, totalSmartBuysLast24h before calling scorer
- No architectural blockers

---
*Phase: 06-token-signal-engine*
*Completed: 2026-03-15*
