---
phase: 12-signal-accuracy-logging
plan: 03
subsystem: signals
tags: [signal-engine, tier-transition, signal-events, async, monitor-loop, outcome-resolver]

# Dependency graph
requires:
  - phase: 12-01
    provides: signal_events table schema
  - phase: 12-02
    provides: resolveOutcomes() function
  - phase: 06-token-signal-engine
    provides: computeAllTokenSignals(), computeSignalScore(), signal tier logic
affects: [12-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Injectable DexScreenerFetcher in computeAllTokenSignals() for test isolation
    - Tier transition: existingTier read before upsert, signal_events inserted when newTier !== existingTier && newTier !== 'inactive'
    - First-appearance detection: existingTier=null, newTier=active → isTransition=true (signal_events inserted)

key-files:
  created: []
  modified:
    - src/signals/engine.ts
    - src/signals/__tests__/engine.test.ts
    - src/monitor/loop.ts

key-decisions:
  - "computeAllTokenSignals is now async — caller in loop.ts awaits it; backward-compatible db parameter injection preserved"
  - "Tier transition condition: existingTier !== newTier && newTier !== 'inactive' — transitions TO inactive do not create signal_events rows"
  - "DexScreenerFetcher injected as second parameter with default instance — avoids jest.mock, consistent with Phase 3/6/8 pattern"
  - "mockFetcher returns null for getTokenPrice — null entry_price is valid per Phase 12-01 design; excluded from accuracy calc denominator"
  - "resolveOutcomes() called after computeAllTokenSignals() in same try/catch block — cycleEmitter.emit stays at end after both resolve"

# Metrics
duration: 5min
completed: 2026-03-27
---

# Phase 12 Plan 03: Signal Engine Hook and Monitor Loop Update Summary

**async computeAllTokenSignals() with tier transition detection inserts signal_events rows on active tier change; loop.ts now awaits the engine and calls resolveOutcomes() after each cycle — the write path for the accuracy system is now functional**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-27T06:17:44Z
- **Completed:** 2026-03-27T06:22:19Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Changed `computeAllTokenSignals()` from synchronous to `async`, adding `dexFetcher: DexScreenerFetcher` as injectable second parameter
- Added `signal_events` import to engine's schema import and `DexScreenerFetcher` import from fetchers
- Inside the per-token loop: reads `existingTier` from `token_signals` before upsert; detects tier transitions (`existingTier !== newTier && newTier !== 'inactive'`); inserts `signal_events` row with full snapshot including `entry_price` from DexScreener at transition moment
- First-appearance signals (`existingTier=null`, `newTier=strong/moderate/weak`) trigger transition detection and insert `signal_events` rows
- Transitions TO `inactive` do not insert `signal_events` rows (inactive is not a signal fire event)
- Updated all 17 engine test call sites to `await computeAllTokenSignals(db, mockFetcher)` with async test functions
- `mockFetcher = { getTokenPrice: async (_mint: string) => null }` injected in tests — avoids real HTTP calls, null entry_price is valid
- Updated `loop.ts` to import `resolveOutcomes`, await `computeAllTokenSignals()`, and call `await resolveOutcomes()` with count logging in same try/catch block
- `cycleEmitter.emit('cycle', ...)` remains at end of try block — SSE events fire only after both signals and outcomes are processed

## Task Commits

Each task was committed atomically:

1. **Task 1: Make computeAllTokenSignals async with tier transition detection** - `dbdc2c9` (feat)
2. **Task 2: Update monitor loop to await engine and call outcome resolver** - `7aa0c3d` (feat)

## Files Created/Modified

- `src/signals/engine.ts` — async signature, DexScreenerFetcher import, signal_events insert on tier transition
- `src/signals/__tests__/engine.test.ts` — mockFetcher declaration, all 17 tests updated to async/await
- `src/monitor/loop.ts` — resolveOutcomes import, await computeAllTokenSignals(), await resolveOutcomes() call

## How Tier Transition Detection Works

```
existingTier = SELECT signal_tier FROM token_signals WHERE token_mint = ? (before upsert)
             = null if no row exists yet

newTier = result.signalTier  (from computeSignalScore())

isTransition = existingTier !== newTier
               && newTier !== 'inactive'
```

**Cases:**
- `null → strong/moderate/weak` → isTransition = true (first appearance, fire event)
- `weak → strong` → isTransition = true (escalation, fire event)
- `strong → inactive` → isTransition = false (suppression, no event logged)
- `strong → strong` → isTransition = false (no change, no duplicate event)

## How Mock Fetcher Was Injected in Engine Tests

```typescript
import { DexScreenerFetcher } from '../../fetchers/dexscreener.js';

const mockFetcher = { getTokenPrice: async (_mint: string) => null } as unknown as DexScreenerFetcher;

// All test calls:
const result = await computeAllTokenSignals(db, mockFetcher);
```

The mock returns `null` for all prices — this is the correct behavior since `signal_events.entry_price` is nullable. Events with `null` entry_price are stored and logged but excluded from accuracy calculation denominators (per Phase 12-01 design).

## Total Test Count Confirmed Green

- **Engine tests:** 17/17 pass
- **Full suite:** 237/237 pass (zero regressions)

## Decisions Made

- `computeAllTokenSignals` async change is backward-compatible: db parameter injection still works, new dexFetcher parameter has default value
- Tier transition condition excludes `inactive` to prevent noisy suppression events from flooding `signal_events`
- `resolveOutcomes()` placed inside the same try/catch as the signal engine — a resolver failure is non-fatal and caught without crashing the cycle

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `signal_events` rows are now being created on every tier transition — the accuracy system's write path is complete
- `resolveOutcomes()` runs after each cycle — outcome windows will be populated as time elapses
- Phase 12-04 (accuracy queries and dashboard integration) can now read from populated `signal_events` rows

---
*Phase: 12-signal-accuracy-logging*
*Completed: 2026-03-27*

## Self-Check: PASSED

- FOUND: src/signals/engine.ts
- FOUND: src/signals/__tests__/engine.test.ts
- FOUND: src/monitor/loop.ts
- FOUND: .planning/phases/12-signal-accuracy-logging/12-03-SUMMARY.md
- FOUND commit: dbdc2c9 (feat(12-03): make computeAllTokenSignals async with tier transition detection)
- FOUND commit: 7aa0c3d (feat(12-03): update monitor loop to await engine and call outcome resolver)
