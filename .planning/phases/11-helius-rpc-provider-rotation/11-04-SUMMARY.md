---
phase: 11-helius-rpc-provider-rotation
plan: "04"
subsystem: infra
tags: [rpc, helius, shyft, provider-rotation, monitoring, discovery, detection]

# Dependency graph
requires:
  - phase: 11-helius-rpc-provider-rotation plan 02
    provides: createProviderRouter() factory and ProviderRouter class
  - phase: 11-helius-rpc-provider-rotation plan 03
    provides: ShyftProvider with normalization wired into createProviderRouter

provides:
  - MonitorLoop using createProviderRouter (provider rotation live in monitoring cycle)
  - importWalletHistory using createProviderRouter (provider rotation live in history import)
  - fetchEarlyBuyers using createProviderRouter (discovery orchestrator migrated)
  - fetchCoTraders using createProviderRouter (graph traversal migrated)
  - dev-wallet getDefaultFetcher using createProviderRouter (detection migrated)
  - .env.example documenting optional SHYFT_API_KEY

affects:
  - All wallet monitoring, discovery, and dev-wallet detection — now use provider rotation end-to-end
  - bundler.ts and wash-trader.ts intentionally remain on createHeliusFetcher (getTransaction not on RpcProvider)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider rotation activated at all callsites except those requiring getTransaction (bundler/wash-trader)"
    - "DevWalletFetcher adapter omits optional getTransaction when backed by ProviderRouter"

key-files:
  created: []
  modified:
    - src/monitor/loop.ts
    - src/importers/history.ts
    - src/discovery/early-buyers.ts
    - src/discovery/graph-traverse.ts
    - src/detection/dev-wallet.ts
    - .env.example

key-decisions:
  - "dev-wallet getDefaultFetcher adapter omits getTransaction when backed by ProviderRouter — optional field on DevWalletFetcher, fallback branch guards with if(fetcher.getTransaction)"
  - "bundler.ts permanently stays on createHeliusFetcher — BundlerFetcher requires getTransaction() which is not on RpcProvider (locked decision honored)"

patterns-established:
  - "Provider rotation callsite pattern: import createProviderRouter; call createProviderRouter() in place of createHeliusFetcher()"
  - "getTransaction bypass pattern: detectors that need getTransaction (bundler, wash-trader) stay on HeliusFetcher directly"

requirements-completed: [MNTR-03]

# Metrics
duration: 6min
completed: 2026-03-27
---

# Phase 11 Plan 04: Callsite Migration Summary

**Provider rotation activated end-to-end — 5 callsites migrated from createHeliusFetcher to createProviderRouter; bundler.ts intentionally unchanged; 210 tests green**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-26T19:32:43Z
- **Completed:** 2026-03-26T19:38:57Z
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments
- Migrated MonitorLoop and importWalletHistory to createProviderRouter — monitoring cycle and wallet history import now use provider rotation with Shyft fallback
- Migrated fetchEarlyBuyers, fetchCoTraders, and dev-wallet getDefaultFetcher — discovery orchestrator and dev-wallet detection wired to provider rotation
- Updated .env.example to document SHYFT_API_KEY as optional fallback provider
- All 210 tests pass after migration; TypeScript compiles clean with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate loop.ts and history.ts callsites** - `33573ec` (feat)
2. **Task 2: Migrate discovery callsites and dev-wallet to createProviderRouter; update .env.example** - `342d8ff` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `src/monitor/loop.ts` - MonitorLoop.runCycle() now uses createProviderRouter()
- `src/importers/history.ts` - importWalletHistory() now uses createProviderRouter()
- `src/discovery/early-buyers.ts` - fetchEarlyBuyers() default fetcher now createProviderRouter()
- `src/discovery/graph-traverse.ts` - fetchCoTraders() default fetcher now createProviderRouter()
- `src/detection/dev-wallet.ts` - getDefaultFetcher() now uses createProviderRouter(); getTransaction omitted (not on RpcProvider)
- `.env.example` - Added SHYFT_API_KEY documentation as optional fallback provider

## Decisions Made
- **dev-wallet adapter omits getTransaction:** DevWalletFetcher.getTransaction is optional — the fallback branch in detectDevWallet guards with `if (fetcher.getTransaction && ...)`. Omitting it when backed by ProviderRouter is correct; no functionality lost since ProviderRouter does not implement getTransaction per the locked decision.
- **bundler.ts and wash-trader.ts unchanged:** Both require getTransaction() which is not on RpcProvider. They stay on createHeliusFetcher() permanently per locked decision from Plan 02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed getTransaction from dev-wallet ProviderRouter adapter**
- **Found during:** Task 2 (dev-wallet.ts migration)
- **Issue:** After replacing createHeliusFetcher with createProviderRouter, the adapter object called f.getTransaction(sig) which does not exist on ProviderRouter — TypeScript error TS2339
- **Fix:** Removed the getTransaction entry from the adapter return object. DevWalletFetcher defines getTransaction as optional; detectDevWallet already guards usage with `if (fetcher.getTransaction && ...)`. Safe to omit.
- **Files modified:** src/detection/dev-wallet.ts
- **Verification:** TypeScript compiles clean; 210 tests pass
- **Committed in:** 342d8ff (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug from type mismatch after migration)
**Impact on plan:** Fix necessary for TypeScript correctness. No scope creep — the removal is consistent with the locked decision that getTransaction is not on RpcProvider.

## Issues Encountered
- TypeScript error in dev-wallet.ts after migration: ProviderRouter has no getTransaction method. Resolved by omitting the optional getTransaction from the adapter (see deviations above).

## User Setup Required
None - no external service configuration required beyond SHYFT_API_KEY in .env (documented as optional).

## Next Phase Readiness
- Provider rotation is live end-to-end for all monitoring, import, discovery, and dev-wallet detection
- Phase 11 (helius-rpc-provider-rotation) is fully complete — all 4 plans delivered
- SHYFT_API_KEY can be added to .env at any time to enable Shyft fallback; system warns at startup if missing and runs Helius-only

---
*Phase: 11-helius-rpc-provider-rotation*
*Completed: 2026-03-27*
