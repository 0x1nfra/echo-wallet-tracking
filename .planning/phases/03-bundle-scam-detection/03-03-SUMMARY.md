---
phase: 03-bundle-scam-detection
plan: 03
subsystem: detection
tags: [detection, sniper, wash-trader, tdd, drizzle-orm, sqlite, helius]

# Dependency graph
requires:
  - phase: 03-bundle-scam-detection
    plan: 01
    provides: DetectorConfig, DetectorResult types; SNIPER, WASH_TRADER threshold constants; swaps schema
  - phase: 03-bundle-scam-detection
    plan: 02
    provides: detectBundler, detectDevWallet pattern (injectable deps, mock strategy)
provides:
  - detectSniper function (DETC-03) — pure DB query, zero Helius API calls
  - detectWashTrader function (DETC-04) — circular buy→transfer→sell pattern detection with Helius fetch cap
  - sniper.test.ts — 11 test cases covering all plan-specified scenarios
  - wash-trader.test.ts — 10 test cases covering all plan-specified scenarios
affects: [03-04-detection-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sniper detector uses drizzle sql`` tagged template with raw SQL for grouped aggregation; cast to unknown first to satisfy TypeScript on double-cast"
    - "Wash trader independence key = (token_mint, wallet_b) — deduplicates repeated patterns on same token/wallet pair"
    - "Sell index keyed as wallet_address::token_mint for O(1) lookup during circular pattern scan"
    - "fetch_limit_hit: true added to evidenceSummary (not evidenceDetail) for CLI visibility when cap reached"

key-files:
  created:
    - src/detection/sniper.ts
    - src/detection/wash-trader.ts
    - src/detection/__tests__/sniper.test.ts
    - src/detection/__tests__/wash-trader.test.ts
  modified: []

key-decisions:
  - "Sniper detector uses drizzle sql`` tagged template with db.all() — the SniperDb interface exposes `all(sql, params)` for easy mock injection in tests; production adapter calls toSQL() on the drizzle sql object"
  - "Wash trader independence check uses (token_mint, wallet_b) as composite key — same token with different wallet_b counts as a separate independent pattern; same token AND same wallet_b is deduplicated to 1"
  - "Wash trader does NOT require explicit SOL-back nativeTransfer for pattern confirmation — buy→transfer→sell chain alone counts as circumstantial evidence (plan explicitly permits this)"
  - "Sell index built upfront as Map<wallet::token → SellRow[]> to avoid quadratic scan across all swaps for each buy transaction"

patterns-established:
  - "All 4 detectors now follow the same injectable deps pattern: (config, deps?) where deps = { db, fetcher } — consistent testability contract"
  - "Confidence tiers determined by comparing against effective thresholds (base * multiplier) not raw base values — all multiplier logic in detector, not in test"
  - "Rate-based confirmed path checks both rate >= MIN_RATE_CONFIRMED AND total_tokens >= MIN_TOKENS_FOR_RATE_CONFIRMED — prevents low-sample-size false confirms"

requirements-completed: [DETC-03, DETC-04]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 3 Plan 03: Sniper and Wash Trader Detectors Summary

**Conservative sniper detector (pure DB query, launch slot approximation) and wash trader detector (circular buy→transfer→sell pattern with Helius cap) with full TDD coverage — 21 new tests, 38 total passing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T13:18:47Z
- **Completed:** 2026-03-12T13:22:47Z
- **Tasks:** 4 (RED sniper, RED wash-trader, GREEN sniper, GREEN wash-trader)
- **Files modified:** 4

## Accomplishments

- Implemented `detectSniper` (DETC-03): single SQL GROUP BY query estimates launch slot as MIN(slot) across all tracked wallets per token; skips tokens with <3 other wallets for reliable baseline; counts first-block entries (offset <= FIRST_BLOCK_WINDOW_SLOTS); confirms via count OR rate path
- Implemented `detectWashTrader` (DETC-04): for each target buy, fetches Helius tx tokenTransfers to find recipients; checks if any recipient (wallet B) sold same token within RELATIONSHIP_WINDOW_DAYS; deduplicates non-independent patterns by (token_mint, wallet_b) key; enforces MAX_HELIUS_FETCHES_PER_WALLET cap with fetch_limit_hit flag
- 11 sniper tests: 0 tokens, below threshold, suspected, review, confirmed by count, confirmed by rate (87%), baseline skip, threshold multiplier x2, rate path with multiplier x2, evidenceSummary, evidenceDetail
- 10 wash trader tests: 0 patterns, 1 below threshold, suspected, review, confirmed, threshold multiplier x2, non-independent dedup, fetch cap, evidenceSummary, evidenceDetail
- Zero TypeScript errors; all 38 detection tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: RED sniper detector** - `efdcd30` (test)
2. **Task 2: RED wash trader detector** - `c4d4c85` (test)
3. **Task 3: GREEN sniper detector** - `54b1444` (feat)
4. **Task 4: GREEN wash trader detector** - `653dc30` (feat)

**Plan metadata:** (docs commit — see below)

_Note: TDD tasks have two commits each (RED failing tests → GREEN implementation)_

## Files Created/Modified

- `src/detection/sniper.ts` — detectSniper: pure DB query, launch slot approximation, first-block counting, confidence tiers
- `src/detection/wash-trader.ts` — detectWashTrader: circular pattern detection, independence dedup, Helius fetch cap
- `src/detection/__tests__/sniper.test.ts` — 11 test cases, all sniper plan scenarios
- `src/detection/__tests__/wash-trader.test.ts` — 10 test cases, all wash trader plan scenarios

## Decisions Made

- Sniper uses drizzle `sql` tagged template with raw `db.all()` because GROUP BY with HAVING on computed column aliases is cleaner in raw SQL than drizzle-orm builder; `as unknown as SniperQueryRow[]` double cast required for TypeScript to accept the return type
- Wash trader independence check: (token_mint, wallet_b) composite key. Two buys of same token both transferred to same wallet B count as 1 pattern, not 2. Different wallet_b on same token counts as 2 separate patterns.
- Wash trader does not require explicit SOL return transfer — the buy→transfer→sell chain alone is sufficient per plan specification (plan explicitly noted this as acceptable circumstantial evidence)
- Sell index (Map<`${wallet}::${token}` → SellRow[]>) built once before the Helius fetch loop to avoid per-buy full scans

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- TypeScript rejected `as SniperQueryRow[]` direct cast from `Record<string, unknown>[]`; fixed with `as unknown as SniperQueryRow[]` double cast (Rule 1 inline fix, no separate commit needed — part of GREEN task)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 4 detectors (bundler, dev_wallet, sniper, wash_trader) are implemented and tested
- detectSniper and detectWashTrader export the same injectable-deps pattern as detectBundler/detectDevWallet
- Plan 04 (detection engine) can wire all 4 detectors together using consistent DetectorConfig → DetectorResult interface
- Zero TypeScript errors across detection module — type foundation is stable

---
*Phase: 03-bundle-scam-detection*
*Completed: 2026-03-12*

## Self-Check: PASSED

- FOUND: src/detection/sniper.ts
- FOUND: src/detection/wash-trader.ts
- FOUND: src/detection/__tests__/sniper.test.ts
- FOUND: src/detection/__tests__/wash-trader.test.ts
- FOUND: commit efdcd30 (Task 1 - RED sniper)
- FOUND: commit c4d4c85 (Task 2 - RED wash-trader)
- FOUND: commit 54b1444 (Task 3 - GREEN sniper)
- FOUND: commit 653dc30 (Task 4 - GREEN wash-trader)
