---
phase: 02-transaction-parsing
plan: 03
subsystem: api
tags: [helius, p-queue, p-retry, drizzle, sqlite, import, rate-limiting]

# Dependency graph
requires:
  - phase: 02-01
    provides: parse_errors schema, wallets status='importing' enum
  - phase: 02-02
    provides: parseSwaps and applyFifo swap parser
provides:
  - HeliusFetcher.fetchSwapHistory with p-queue rate limiting and p-retry
  - importWalletHistory orchestrator (fetch → parse → FIFO → DB insert)
  - resumeImportingWallets for crash-recovery at startup
  - wallet add sets status='importing', imports history, transitions to 'tracked'
  - wallet list shows importing wallets in yellow via inArray filter
  - --full-history flag removes 180-day time cap
affects: [03-smart-money-detection, 04-metrics, 07-telegram-bot]

# Tech tracking
tech-stack:
  added: [p-queue@9.1.0, p-retry@7.1.1]
  patterns: [rate-limited paginated fetch, FIFO insert with UNIQUE-constraint dedup, silent parse-error logging, startup crash recovery for interrupted imports]

key-files:
  created:
    - src/importers/history.ts
  modified:
    - src/fetchers/helius.ts
    - src/commands/wallet.ts
    - src/cli.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Module-level heliusQueue (2 req/s) shared across all HeliusFetcher instances to enforce global rate limit"
  - "Helius base URL updated to api-mainnet.helius-rpc.com/v0 (correct Enhanced Transactions endpoint)"
  - "db.transaction() callback uses tx parameter for inserts; UNIQUE constraint failures caught inside loop to allow partial batch success"
  - "Parse errors from known DEXes logged silently to parse_errors; unknown DEX failures skipped without logging (per prior locked decision)"
  - "resumeImportingWallets fires at CLI startup before program.parse() — error silently swallowed so it never blocks CLI"

patterns-established:
  - "Rate-limited paginated fetch: heliusQueue wraps every HTTP call, pRetry retries up to 3x, 401 short-circuits retry"
  - "Import lifecycle: status='importing' on insert → import completes → status='tracked' + history_complete=true"
  - "Crash recovery: wallets stuck in 'importing' state are resumed on next startup; duplicate signatures skipped via UNIQUE constraint"

requirements-completed: [PARS-02]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 2 Plan 03: History Import Orchestrator Summary

**End-to-end history import on `echo wallet add`: p-queue/p-retry Helius fetcher, full fetch→parse→FIFO→insert orchestrator, crash-recovery via resumeImportingWallets, and importing status displayed in yellow in wallet list**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T14:07:04Z
- **Completed:** 2026-03-11T14:09:00Z
- **Tasks:** 2
- **Files modified:** 5 (+ package.json, pnpm-lock.yaml)

## Accomplishments
- HeliusFetcher upgraded with `fetchSwapHistory` method: paginated, rate-limited via p-queue (2 req/s), retried via p-retry (3 retries, 401 short-circuits)
- `importWalletHistory` orchestrator ties fetch → parseSwaps → applyFifo → batch DB insert, with silent parse-error logging for known DEXes
- `wallet add` now inserts with `status='importing'`, awaits full import, then prints "import complete"
- `wallet add --full-history` sets afterTimestamp=0, removing the 180-day window cap
- `wallet list` now shows both `tracked` and `importing` wallets; importing shown in yellow
- `resumeImportingWallets()` called at CLI startup for crash-recovery of interrupted imports

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade HeliusFetcher with p-queue rate limiting, p-retry, and fetchSwapHistory** - `1bcdaf0` (feat)
2. **Task 2: Implement importWalletHistory orchestrator and wallet command updates** - `b05f5c3` (feat)

## Files Created/Modified
- `src/fetchers/helius.ts` - Added fetchSwapHistory with p-queue + p-retry; updated base URL to api-mainnet.helius-rpc.com
- `src/importers/history.ts` - New orchestrator: importWalletHistory, resumeImportingWallets, silentlyLogParseError
- `src/commands/wallet.ts` - wallet add (async, --full-history, status='importing'), wallet list (inArray, yellow importing status)
- `src/cli.ts` - Added resumeImportingWallets startup call before program.parse()
- `package.json` + `pnpm-lock.yaml` - Added p-queue@9.1.0 and p-retry@7.1.1

## Decisions Made
- Used module-level `heliusQueue` (shared singleton) to enforce global 2 req/s across all fetcher instances
- Helius base URL corrected to `api-mainnet.helius-rpc.com/v0` per research (Enhanced Transactions endpoint)
- drizzle `db.transaction()` uses `tx` callback parameter for inserts inside transaction scope
- UNIQUE constraint failures on insert caught per-row inside transaction loop, allowing partial batch success
- resumeImportingWallets swallows errors (`.catch(() => {})`) so interrupted imports never block CLI startup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required beyond existing `HELIUS_API_KEY` in .env.

## Next Phase Readiness
- Full history import pipeline is complete and ready for Phase 3 (smart money detection / bundle detection)
- All swaps stored in SQLite `swaps` table with FIFO cost basis, ready for metric calculation in Phase 4
- `wallet_metrics` table schema already exists (Phase 1); ready for metric population

---
*Phase: 02-transaction-parsing*
*Completed: 2026-03-11*

## Self-Check: PASSED

All files confirmed present on disk. All task commits verified in git log.
