---
phase: 15-coin-sourcing-observability
plan: "02"
subsystem: sourcing
tags: [gmgn, auto-sourcer, coin-sourcing, discovery, sqlite, drizzle]

# Dependency graph
requires:
  - phase: 15-coin-sourcing-observability plan 01
    provides: sourcing_log table, wallets.source column, migration 0011
  - phase: 14-signal-outcome-tracking
    provides: signal_events schema, outcome resolution pipeline
provides:
  - GmgnFetcher class with fetch() returning GmgnToken[] — fail-soft on all HTTP errors
  - applyPreFilters() with 5 pre-filter rules (honeypot, holders, liquidity, age, bluechip)
  - AutoSourcer class with start/stop/getStats() mirroring MonitorLoop pattern
  - Daily cap with UTC midnight reset, total ceiling with one-time Telegram alert
  - sourcing_log write on every poll cycle
affects:
  - 15-03: wires AutoSourcer into startup, extends runDiscovery with source param

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-soft fetch: all error paths (network, timeout, HTTP error, JSON parse) return empty array"
    - "Cloudflare bypass via browser-like headers + optional GMGN_CF_CLEARANCE cookie"
    - "Cap pattern: daily cap with UTC date string comparison, total ceiling with ceilingAlertFired dedup boolean"
    - "Direct-buyers-only discovery: fetchCoTradersFn = () => Promise.resolve([]) disables graph traversal"

key-files:
  created:
    - src/sourcing/gmgn-fetcher.ts
    - src/sourcing/auto-sourcer.ts
  modified:
    - src/db/schema.ts (sourcing_log table added — prerequisite from Plan 01)
    - src/db/migrations/0011_sourcing_schema.sql (migration for wallets.source + sourcing_log)

key-decisions:
  - "Source tagging (wallets.source='gmgn') deferred to Plan 03 — requires extending DiscoveryOptions to cleanly pass source through runDiscovery() rather than approximating with a post-discovery UPDATE"
  - "ceilingAlertFired boolean resets when total drops below ceiling — allows re-alert if ceiling is hit again after wallets are removed"
  - "applyPreFilters treats null bluechip_owner_percentage as failing the filter (skip-to-be-safe) to avoid adding unverified tokens"

patterns-established:
  - "AutoSourcer mirrors MonitorLoop: start/stop pattern, scheduleNext/tick separation, explicit stopped flag"
  - "sourcing_log wrapped in try/catch — logging failure never crashes the poll cycle"

requirements-completed: [SEED-01, SEED-02, SEED-03, SEED-04, SEED-05]

# Metrics
duration: 20min
completed: 2026-04-18
---

# Phase 15 Plan 02: GMGN Fetcher and AutoSourcer Core Engine Summary

**GmgnFetcher with Cloudflare-bypassing browser headers and 5-rule pre-filter, plus AutoSourcer polling every 5 minutes with daily/total caps, direct-buyers-only discovery, and sourcing_log writes**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-18T11:40:00Z
- **Completed:** 2026-04-18T12:00:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- GmgnFetcher fetches `https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/1h` with browser-like headers, returns typed `GmgnToken[]`, and fails-soft on network errors, HTTP 403/429, and JSON parse failures
- applyPreFilters rejects tokens on 5 criteria: is_honeypot==1, holder_count<100, liquidity<10k, age outside 1h-72h, bluechip_owner_percentage<1
- AutoSourcer polls GMGN every 5 minutes, enforces daily cap (default 20, env-configurable) with UTC midnight reset and total ceiling (default 200) with one-time Telegram alert and auto-resume
- Each qualifying token runs through `runDiscovery()` with `fetchCoTradersFn = async () => []` disabling graph traversal (direct-buyers-only mode per SEED-03)
- Every poll cycle (including cap_hit/ceiling_hit skips) writes one row to `sourcing_log`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GmgnFetcher with browser headers and pre-filter logic** - `cecc8eb` (feat)
2. **Task 2: Create AutoSourcer class with cap logic and direct-buyers-only discovery** - `052f402` (feat)

## Files Created/Modified

- `src/sourcing/gmgn-fetcher.ts` - GmgnFetcher class: fetch() with Cloudflare headers + applyPreFilters()
- `src/sourcing/auto-sourcer.ts` - AutoSourcer class: start/stop/getStats(), poll loop, cap/ceiling logic, sourcing_log writes
- `src/db/schema.ts` - sourcing_log table added (prerequisite from Plan 01, committed as part of Task 1)
- `src/db/migrations/0011_sourcing_schema.sql` - Migration adding wallets.source column and sourcing_log table

## Decisions Made

- Source tagging (`wallets.source='gmgn'`) is deferred to Plan 03. The plan template included an unsound TypeScript DB update using type casts to work around Drizzle's type system. Plan 03 extends `DiscoveryOptions` to accept a `source` field, enabling clean propagation through `runDiscovery()` to the wallet insert. A TODO comment marks the location.
- `ceilingAlertFired` resets to `false` when total wallet count drops back below the ceiling. This allows a future re-alert if more wallets are added and the ceiling is hit again, rather than permanently silencing the alert after the first trigger.
- Null `bluechip_owner_percentage` fails the pre-filter (conservative approach) since a token with unknown bluechip ownership should not be auto-seeded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error in GMGN response shape access**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `(data as Record<string, unknown>)?.data?.rank` — TypeScript error TS2339: Property 'rank' does not exist on type '{}'
- **Fix:** Split into two steps: extract `dataObj` as `Record<string, unknown> | undefined`, then access `.rank` on it
- **Files modified:** src/sourcing/gmgn-fetcher.ts
- **Verification:** `pnpm tsc --noEmit` passes clean
- **Committed in:** cecc8eb (Task 1 commit)

**2. [Rule 2 - Missing Critical] Removed unsound DB source-tagging update from AutoSourcer template**
- **Found during:** Task 2 — plan template included `db.update(wallets).set({ source: 'gmgn' } as Record<string, unknown>).where(and(eq(wallets.status, 'tracked'), eq(wallets.source as unknown as string, null as unknown as string))).run()` — this uses multiple unsound casts to bypass Drizzle's type system and would update ALL wallets without a source, not just recently added ones
- **Issue:** The approach is both unsound TypeScript and logically incorrect (would tag pre-existing wallets)
- **Fix:** Replaced with TODO comment pointing to Plan 03 where `runDiscovery()` is extended to accept `source` in `DiscoveryOptions` for clean propagation
- **Files modified:** src/sourcing/auto-sourcer.ts
- **Verification:** TypeScript clean, no unsafe casts

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes essential for correctness. Source tagging is correctly deferred to Plan 03 as the plan notes intended.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

Optional environment variable for Cloudflare bypass:
- `GMGN_CF_CLEARANCE` — if GMGN returns 403, set this to a valid cf_clearance cookie value to bypass Cloudflare
- `AUTO_SOURCE_DAILY_CAP` — daily wallet addition cap (default: 20)
- `AUTO_SOURCE_TOTAL_CAP` — total tracked wallet ceiling (default: 200)

No external service configuration required beyond the above optional vars.

## Next Phase Readiness

- GmgnFetcher and AutoSourcer are ready for wiring into startup (Plan 03)
- Plan 03 Task 1: extend `runDiscovery()` to accept `source` in `DiscoveryOptions` for clean gmgn tagging
- Plan 03 Task 2: wire `autoSourcer.start()` into `src/api/bot/index.ts` or equivalent startup entry point

---
*Phase: 15-coin-sourcing-observability*
*Completed: 2026-04-18*
