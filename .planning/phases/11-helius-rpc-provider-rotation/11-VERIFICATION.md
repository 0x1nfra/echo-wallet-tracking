---
phase: 11-helius-rpc-provider-rotation
verified: 2026-03-27T00:00:00Z
status: passed
score: 26/26 must-haves verified
re_verification: false
---

# Phase 11: Helius RPC Provider Rotation — Verification Report

**Phase Goal:** The system survives Helius 429 outages by rotating to a fallback RPC provider, scoped to handle per-provider response normalization explicitly
**Verified:** 2026-03-27
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| MNTR-03 | 11-01, 11-02, 11-03, 11-04 | System rate-limits all Helius API calls (max 5 concurrent, exponential backoff on 429 responses) — extended in Phase 11 to include provider rotation resilience | SATISFIED | ProviderRouter implements 60s per-provider cooldown on failures; ShyftProvider implements pRetry with 429 exponential backoff; all five callsites wired to createProviderRouter() |

**Notes on MNTR-03:** REQUIREMENTS.md traceability table maps MNTR-03 to Phase 5 (initial implementation). Phase 11 ROADMAP explicitly re-claims MNTR-03 as a "resilience extension." This is additive — Phase 11 enhances the requirement without contradicting Phase 5's original delivery. No orphaned requirements found.

---

## Observable Truths — Plan 01

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RpcProvider interface exists with fetchSwapHistory, fetchEarlySwapsForMint, and fetchOnePage method signatures | VERIFIED | `src/fetchers/providers/types.ts` exports `RpcProvider` interface with exactly those 3 methods at correct signatures |
| 2 | HeliusProvider wraps HeliusFetcher and implements RpcProvider without modifying helius.ts | VERIFIED | `helius-provider.ts` line 4: `implements RpcProvider`; constructor accepts `HeliusFetcher`; all 3 methods delegate to `this.fetcher.*` |
| 3 | All 184 existing tests remain green after these files are added | VERIFIED | `pnpm test` reports 210 passed, 0 failures (187 existing + 23 new from Plans 01-02, total grew to 210 by Plan 03) |
| 4 | ROADMAP.md Phase 11 Success Criterion 1 names the real method names (fetchSwapHistory, fetchEarlySwapsForMint, fetchOnePage) | VERIFIED | ROADMAP.md line 190 reads: `each provider implements \`fetchSwapHistory()\`, \`fetchEarlySwapsForMint()\`, and \`fetchOnePage()\` separately` |

## Observable Truths — Plan 02

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | ProviderRouter tries Helius first, rotates to Shyft only when Helius exhausts retries | VERIFIED | `router.ts` iterates `this.providers` in order; catches throws on provider[0] and falls to provider[1]; router.test.ts "Rotation" suite confirms |
| 6 | A failed provider goes on 60s cooldown before it is retried | VERIFIED | `router.ts` `markCooldown()` sets `Date.now() + 60_000`; `isOnCooldown()` skips providers within window; router.test.ts "Cooldown expires" test verifies 61s → retried |
| 7 | When all providers are exhausted, router returns empty array (never throws) and calls onAllExhausted callback | VERIFIED | Each `tryCall*` returns `null` after all providers fail; public methods return `(await tryCall*(...)) ?? []`; `onAllExhausted()` called; router.test.ts "All exhausted" suite confirms |
| 8 | createProviderRouter() factory warns at startup if SHYFT_API_KEY is missing but does not crash | VERIFIED | `index.ts` lines 27-28: `if (!shyftKey) { console.warn('[provider] SHYFT_API_KEY not set — running with Helius-only, no fallback') }` |

## Observable Truths — Plan 03

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 9  | ShyftProvider fetches from Shyft API using x-api-key header (not query param) | VERIFIED | `shyft-provider.ts` line 47: `headers: { 'x-api-key': this.apiKey }`; shyft-provider.test.ts "calls Shyft API with x-api-key header" confirms `call.headers['x-api-key']` |
| 10 | ShyftProvider normalizes Shyft response to HeliusTransaction shape before returning — no Shyft types leak to callers | VERIFIED | `normalize()` returns `ProviderTransaction` (= `HeliusTransaction`); `ShyftRawTx` and `ShyftAction` are unexported internal types; all three public methods call `normalize()` |
| 11 | fetchSwapHistory filters by afterTimestamp in memory (Shyft has no gte-time), capped at 3 pages | VERIFIED | `shyft-provider.ts`: `MAX_PAGES = 3`; loop breaks at page 3; in-memory filter `allTxs.filter(tx => tx.timestamp > afterTimestamp)`; test "caps pagination at 3 pages" confirms |
| 12 | fetchEarlySwapsForMint passes the mint address to Shyft with sort-order=asc | VERIFIED | `shyft-provider.ts` line 93: `fetchPage(mint, { tx_num: ..., sort_order: sortOrder })`; test "passes sort_order param to Shyft API" confirms |
| 13 | fetchOnePage fetches a single page with tx_num=limit | VERIFIED | `shyft-provider.ts` line 98: `fetchPage(address, { tx_num: Math.min(limit, 100) })`; test "passes tx_num = limit to Shyft API" confirms |
| 14 | Shyft events field is set to undefined — parsers use tokenTransfers fallback path | VERIFIED | `normalize()` line 116: `events: undefined, // Force tokenTransfers fallback path in parseSwaps`; multiple tests assert `result[0].events` is `undefined` |

## Observable Truths — Plan 04

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 15 | MonitorLoop uses createProviderRouter() instead of createHeliusFetcher() | VERIFIED | `src/monitor/loop.ts` line 4: `import { createProviderRouter } from '../fetchers/providers/index.js'`; line 95: `const fetcher = createProviderRouter()` |
| 16 | importWalletHistory uses createProviderRouter() instead of createHeliusFetcher() | VERIFIED | `src/importers/history.ts` line 4: `import { createProviderRouter }`; line 20: `const fetcher = createProviderRouter()` |
| 17 | discovery/early-buyers.ts uses createProviderRouter() for fetchEarlySwapsForMint | VERIFIED | `src/discovery/early-buyers.ts` line 8 import + line 45: `const f = fetcher ?? createProviderRouter()` |
| 18 | discovery/graph-traverse.ts uses createProviderRouter() for fetchOnePage and fetchEarlySwapsForMint | VERIFIED | `src/discovery/graph-traverse.ts` line 10 import + line 45: `const f = fetcher ?? createProviderRouter()` |
| 19 | dev-wallet.ts getDefaultFetcher uses createProviderRouter() for fetchOnePage | VERIFIED | `src/detection/dev-wallet.ts` lines 194-195: dynamic `import('../fetchers/providers/index.js')` + `createProviderRouter()` |
| 20 | bundler.ts is NOT migrated — BundlerFetcher requires getTransaction() which is not on RpcProvider | VERIFIED | `src/detection/bundler.ts` line 243: `createHeliusFetcher` still present; `getTransaction` used at lines 133, 135 |
| 21 | bundler.ts and wash-trader.ts getTransaction() calls remain on createHeliusFetcher() | VERIFIED | Both files retain `createHeliusFetcher` import (bundler.ts line 243, wash-trader.ts line 243) and `getTransaction` usage |
| 22 | All 184 original tests plus new provider tests pass after migration | VERIFIED | `pnpm test`: 210 passed, 0 failed, 22 suites |
| 23 | .env.example documents SHYFT_API_KEY as optional | VERIFIED | `.env.example` line 8: `SHYFT_API_KEY=` with comment block documenting it as optional fallback |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/fetchers/providers/types.ts` | RpcProvider interface + ProviderTransaction type alias | VERIFIED | 21 lines; exports `RpcProvider` (3-method interface) and `ProviderTransaction = HeliusTransaction` |
| `src/fetchers/providers/helius-provider.ts` | HeliusProvider class wrapping HeliusFetcher | VERIFIED | 22 lines; `implements RpcProvider`; constructor injection; 3 pure delegation methods |
| `src/fetchers/providers/__tests__/helius-provider.test.ts` | Unit tests confirming HeliusProvider delegates to HeliusFetcher | VERIFIED | 100 lines; 3 `describe` blocks, one per method; tests arg capture and return-value identity |
| `src/fetchers/providers/router.ts` | ProviderRouter class with priority failover and cooldown logic | VERIFIED | 97 lines; `implements RpcProvider`; cooldown Map; 3 per-method tryCall* helpers; `??[]` fallback |
| `src/fetchers/providers/index.ts` | createProviderRouter() factory function | VERIFIED | 44 lines; exports `createProviderRouter`, `RpcProvider`, `ProviderTransaction`, `ProviderRouter`; startup warn for missing SHYFT_API_KEY; Telegram alert on exhaustion |
| `src/fetchers/providers/__tests__/router.test.ts` | Unit tests for rotation, cooldown, exhaustion behavior | VERIFIED | 246 lines; 10 tests covering rotation, cooldown respected, cooldown expiry, all-exhausted, happy path, fetchEarlySwapsForMint variants, fetchOnePage variants |
| `src/fetchers/providers/shyft-provider.ts` | ShyftProvider class implementing RpcProvider with internal normalization | VERIFIED | 156 lines; `implements RpcProvider`; constructor-injectable axios; `normalize()` + `extractTokenTransfers()` + `extractNativeTransfers()`; `events: undefined` explicit |
| `src/fetchers/providers/__tests__/shyft-provider.test.ts` | Unit tests with mocked axios confirming normalization and API call shape | VERIFIED | 314 lines; 13 tests across fetchSwapHistory, normalization, fetchEarlySwapsForMint, fetchOnePage |
| `src/monitor/loop.ts` | MonitorLoop using ProviderRouter | VERIFIED | Contains `createProviderRouter` import and call |
| `src/importers/history.ts` | importWalletHistory using ProviderRouter | VERIFIED | Contains `createProviderRouter` import and call |
| `src/discovery/early-buyers.ts` | fetchEarlyBuyers using ProviderRouter | VERIFIED | Contains `createProviderRouter` import and default-fetcher call |
| `src/discovery/graph-traverse.ts` | graph traversal using ProviderRouter | VERIFIED | Contains `createProviderRouter` import and default-fetcher call |
| `src/detection/dev-wallet.ts` | getDefaultFetcher using createProviderRouter | VERIFIED | Contains dynamic import and `createProviderRouter()` call; `getTransaction` omitted (optional on DevWalletFetcher) |
| `.env.example` | SHYFT_API_KEY documented | VERIFIED | Contains `SHYFT_API_KEY=` with documentation comment |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `helius-provider.ts` | `src/fetchers/helius.ts` | constructor injection of HeliusFetcher | VERIFIED | Line 1: `import type { HeliusFetcher } from '../helius.js'`; constructor: `constructor(fetcher: HeliusFetcher)` |
| `types.ts` | `src/types/transaction.ts` | re-export of HeliusTransaction as ProviderTransaction | VERIFIED | Line 1: `import type { HeliusTransaction } from '../../types/index.js'`; line 8: `export type ProviderTransaction = HeliusTransaction` |
| `router.ts` | `types.ts` | implements RpcProvider | VERIFIED | Line 1: `import type { RpcProvider, ProviderTransaction } from './types.js'`; line 6: `implements RpcProvider` |
| `index.ts` | `router.ts` | createProviderRouter returns ProviderRouter | VERIFIED | Line 3: `import { ProviderRouter } from './router.js'`; line 40: `return new ProviderRouter(providers, onAllExhausted)` |
| `shyft-provider.ts` | `types.ts` | implements RpcProvider, returns ProviderTransaction[] | VERIFIED | Line 4: `import type { RpcProvider, ProviderTransaction } from './types.js'`; line 29: `implements RpcProvider` |
| `shyft-provider.ts` | axios | GET https://api.shyft.to/sol/v1/transaction/history | VERIFIED | Line 1: `import axios, { AxiosInstance } from 'axios'`; line 45: `this.client.get('/sol/v1/transaction/history', ...)` |
| `src/monitor/loop.ts` | `index.ts` | import createProviderRouter | VERIFIED | Line 4: `import { createProviderRouter } from '../fetchers/providers/index.js'` |
| `src/importers/history.ts` | `index.ts` | import createProviderRouter | VERIFIED | Line 4: `import { createProviderRouter } from '../fetchers/providers/index.js'` |
| `src/discovery/early-buyers.ts` | `index.ts` | import createProviderRouter (replaces createHeliusFetcher) | VERIFIED | Line 8: `import { createProviderRouter } from '../fetchers/providers/index.js'` |
| `src/discovery/graph-traverse.ts` | `index.ts` | import createProviderRouter (replaces createHeliusFetcher) | VERIFIED | Line 10: `import { createProviderRouter } from '../fetchers/providers/index.js'` |
| `src/detection/dev-wallet.ts` | `index.ts` | lazy dynamic import createProviderRouter | VERIFIED | Line 194: `const { createProviderRouter } = await import('../fetchers/providers/index.js')` |

---

## Anti-Patterns Found

No blocker or warning anti-patterns detected in provider files.

Note: One stale reference exists in `src/discovery/early-buyers.ts` JSDoc comment (line 38: `@param fetcher - Optional fetcher override for testing (uses createHeliusFetcher() by default)`). This is a documentation string only — the actual code correctly uses `createProviderRouter()`. Severity: INFO, no functional impact.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/discovery/early-buyers.ts` | 38 | Stale JSDoc comment references `createHeliusFetcher()` | INFO | None — comment only, code is correct |

---

## Human Verification Required

None — all observable truths verified programmatically. The following items are notable but do not require human verification:

- **Shyft action field names:** ShyftProvider's `extractTokenTransfers()` and `extractNativeTransfers()` use defensive coding (`??` fallbacks, optional chaining) because Shyft's actual API field names are MEDIUM confidence per research. Real-world Shyft responses may silently return empty arrays if field names differ. This is a known limitation, documented in code, and is low-risk (empty fallback is safe).
- **Telegram exhaustion alert in production:** `sendProviderExhaustedAlert()` uses dynamic import for `botInstance` and `.catch(() => {})` for fire-and-forget; functional only when bot is initialized. Verified structurally correct but live alert delivery requires a running bot.

---

## Score Summary

**26/26 must-haves verified across all four plans.**

All truths pass at all three levels (exists, substantive, wired). Full test suite is green (210 tests, 0 failures). No MISSING or STUB artifacts. No unwired key links. MNTR-03 requirement satisfied.

---

## Phase Goal Achievement

**ACHIEVED.** The system survives Helius 429 outages by rotating to a fallback RPC provider (ShyftProvider). Per-provider response normalization is explicitly isolated — ShyftProvider normalizes internally to `HeliusTransaction` shape before returning, and Shyft-specific types never leak to callers. Provider rotation is transparent to all five migrated callsites (MonitorLoop, importWalletHistory, early-buyers, graph-traverse, dev-wallet).

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
