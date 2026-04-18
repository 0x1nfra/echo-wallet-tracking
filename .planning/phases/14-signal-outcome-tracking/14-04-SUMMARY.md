---
phase: 14-signal-outcome-tracking
plan: "04"
subsystem: api
tags: [telegram, grammy, dexscreener, alerts, signal-outcomes, dedup]

# Dependency graph
requires:
  - phase: 14-01
    provides: signal_events schema with outcome columns and outcome_alert_log table
  - phase: 14-02
    provides: outcome resolver writing hit_50/100/300 milestone flags and is_rug classification

provides:
  - DexScreenerFetcher.getTokenPriceAndMarketCap() returning price + marketCap from best Solana pair
  - signal_market_cap captured at signal creation time in engine.ts
  - runOutcomeAlertCycle() firing threshold + milestone Telegram alerts with dedup
  - outcome_alert_log dedup prevents re-fires after process restart or cycle repeat

affects: [phase-15, future-alert-extensions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "outcome-alerts.ts follows same Bot+chatId function signature as alerts.ts"
    - "outcome_alert_log INSERT OR IGNORE (onConflictDoNothing) dedup pattern before each alert"
    - "Second cycleEmitter listener registered after existing runAlertCycle listener"

key-files:
  created:
    - src/api/bot/outcome-alerts.ts
  modified:
    - src/fetchers/dexscreener.ts
    - src/signals/engine.ts
    - src/api/bot/index.ts
    - src/signals/__tests__/engine.test.ts

key-decisions:
  - "maxPct stored as decimal fraction (1.0 = 100%) — ALERT_THRESHOLD_PCT default 100 means +100% return"
  - "Ticker fallback uses first+last 4 chars of token_mint (ABC...XYZ) — signal_events has no ticker column"
  - "Engine test mock updated to include getTokenPriceAndMarketCap() returning price: null, marketCap: null — avoids HTTP in tests"
  - "Two separate cycleEmitter listeners for runAlertCycle and runOutcomeAlertCycle — independent error handling"

patterns-established:
  - "Outcome alert dedup: INSERT OR IGNORE via onConflictDoNothing() against outcome_alert_log unique index"
  - "formatUsd helper: $X.XXM / $X.XK / $X.XX tiers for market cap display"

requirements-completed: [OUTCOME-05]

# Metrics
duration: 15min
completed: 2026-04-09
---

# Phase 14 Plan 04: Outcome Alert Module Summary

**Telegram outcome alerts with threshold + milestone dedup firing, market cap capture at signal creation via DexScreener**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-09T11:13:10Z
- **Completed:** 2026-04-09T11:28:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `DexScreenerFetcher.getTokenPriceAndMarketCap()` added — reuses best Solana pair selection, returns `{price, marketCap}`
- `signal_market_cap` persisted to `signal_events` on every tier transition in engine.ts
- `runOutcomeAlertCycle()` queries unalerted signal outcomes, fires full threshold alert (+configured % return) and lean milestone alerts (+50%/+100%/+300%), with `outcome_alert_log` dedup preventing re-fires
- Both alert cycles wired to `cycleEmitter` in `bot/index.ts` with independent error handlers

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getTokenPriceAndMarketCap() and capture signal_market_cap** - `f7be3a5` (feat)
2. **Task 2: Create outcome-alerts.ts and wire into bot/index.ts** - `cfc10b4` (feat)

## Files Created/Modified
- `src/api/bot/outcome-alerts.ts` - New module: runOutcomeAlertCycle() with threshold + milestone alert logic
- `src/fetchers/dexscreener.ts` - Added getTokenPriceAndMarketCap() method
- `src/signals/engine.ts` - Updated tier transition to use getTokenPriceAndMarketCap(), persist signal_market_cap
- `src/api/bot/index.ts` - Import + register runOutcomeAlertCycle to cycleEmitter
- `src/signals/__tests__/engine.test.ts` - Updated mock fetcher to include getTokenPriceAndMarketCap()

## Decisions Made
- maxPct is stored as decimal fraction (1.0 = 100%) so threshold comparison is `maxPct * 100 >= ALERT_THRESHOLD_PCT`
- signal_events has no ticker column — using `{first4}...{last4}` of token_mint as display identifier
- Two independent cycleEmitter listeners rather than chaining — each handles its own errors cleanly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated engine.test.ts mock fetcher to include getTokenPriceAndMarketCap()**
- **Found during:** Task 2 (running pnpm test after Task 1)
- **Issue:** engine.test.ts mock only stubbed `getTokenPrice` — 8 tests failed with "dexFetcher.getTokenPriceAndMarketCap is not a function"
- **Fix:** Added `getTokenPriceAndMarketCap: async (_mint) => ({ price: null, marketCap: null })` to mock object in engine.test.ts
- **Files modified:** src/signals/__tests__/engine.test.ts
- **Verification:** All 283 tests passing after fix
- **Committed in:** `cfc10b4` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Required for test suite to pass. No scope creep.

## Issues Encountered
None beyond the mock fix above.

## User Setup Required
None - no external service configuration required. `ALERT_THRESHOLD_PCT` env var is optional (defaults to 100 = +100% return).

## Next Phase Readiness
- Phase 14 complete — all 4 plans executed
- OUTCOME-01 through OUTCOME-05 requirements fulfilled
- Phase 15 (Coin Sourcing + Observability) can begin: signal_events schema stable, outcome tracking live

---
*Phase: 14-signal-outcome-tracking*
*Completed: 2026-04-09*
