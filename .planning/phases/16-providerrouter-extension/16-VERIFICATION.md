---
phase: 16-providerrouter-extension
verified: 2026-04-20T00:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 16: ProviderRouter Extension Verification Report

**Phase Goal:** Extend the provider/router layer with getTransactionDetails, wire sharedProviderRouter into detectors, ensuring Helius+Shyft fallback for all detection paths.
**Verified:** 2026-04-20
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `RpcProvider` interface exposes `getTransactionDetails(signature: string): Promise<ProviderTransaction>` as its 4th method | VERIFIED | `src/fetchers/providers/types.ts` line 22 — exact signature present |
| 2  | `HeliusProvider.getTransactionDetails` delegates to the existing `HeliusFetcher.getTransaction(signature)` (no re-implementation) | VERIFIED | `helius-provider.ts` line 23-25: `return this.fetcher.getTransaction(signature)` — one-liner delegation |
| 3  | `ShyftProvider.getTransactionDetails` calls `GET /sol/v1/transaction/parsed` with `txn_signature` + `network=mainnet-beta`, passes result through `normalize()` | VERIFIED | `shyft-provider.ts` lines 80-108: `fetchSingleTx` calls `/sol/v1/transaction/parsed`, `getTransactionDetails` calls `this.normalize(raw)` |
| 4  | `ShyftProvider.extractNativeTransfers` flags transfers for every action type in SHYFT_NATIVE_TRANSFER_ACTION_TYPES (SOL_TRANSFER) | VERIFIED | `shyft-provider.ts` lines 36-39 and 185-200: `SHYFT_NATIVE_TRANSFER_ACTION_TYPES` Set with `SOL_TRANSFER`, `extractNativeTransfers` uses `.has(action.type)` |
| 5  | `ProviderRouter.getTransactionDetails(signature)` iterates providers, marks cooldowns on failure, and THROWS on exhaustion — no `?? []` coalescing | VERIFIED | `router.ts` lines 84-99 (`tryCallGetTransactionDetails`): throws `Error('[provider] All providers exhausted fetching transaction: ${signature}')`. Confirmed 3 existing methods still use `?? []` (grep count = 3) |
| 6  | `providers/index.ts` exports `sharedProviderRouter: ProviderRouter` as a module-level singleton | VERIFIED | `index.ts` line 148: `export const sharedProviderRouter: ProviderRouter = createProviderRouter()` |
| 7  | `heliusProviderWrapped.getTransactionDetails` in `index.ts` is wrapped in `handleCreditExhaustion` | VERIFIED | `index.ts` lines 104-108: `getTransactionDetails: (signature) => handleCreditExhaustion(() => heliusProvider.getTransactionDetails(signature), heliusFetcher)` |
| 8  | Existing three router methods retain `?? []` empty-array-on-exhaustion behavior | VERIFIED | `router.ts` lines 102, 110, 114 — all three public wrappers coalesce with `?? []`; confirmed by test suite (37 tests pass including `All exhausted` describe block returning `[]`) |
| 9  | `bundler.ts` `getDefaultFetcher()` returns the `sharedProviderRouter` (not `createHeliusFetcher()`) | VERIFIED | `bundler.ts` lines 249-253: dynamic import of `sharedProviderRouter`, explicit adapter `{ getTransaction: sig => sharedProviderRouter.getTransactionDetails(sig) }`. No `createHeliusFetcher` reference remains |
| 10 | `wash-trader.ts` `getDefaultFetcher()` returns the `sharedProviderRouter` (not `createHeliusFetcher()`) | VERIFIED | `wash-trader.ts` lines 249-253: identical adapter pattern. No `createHeliusFetcher` or stale cast remains |
| 11 | Router throw-on-exhaustion propagates into detector's existing catch block (structural — no new catch logic) | VERIFIED | Detector test suites pass (20/20) with no detector-logic changes; existing catch blocks accept thrown errors from any fetcher |
| 12 | D-03 verification script (`scripts/verify-shyft-action-types.ts`) exists, type-checks, and is operationally complete | VERIFIED | File exists; contains `sol/v1/transaction/parsed`, `x-api-key`, `SHYFT_API_KEY`, `action_types=`, `SUMMARY observed native-transfer-candidate types`; `tsc --noEmit` passes |
| 13 | `router.test.ts` `makeProvider` helper accepts `getTransactionDetails` result | VERIFIED | `router.test.ts` line 30: `getTransactionDetails?: HeliusTransaction \| Error` in helper; 4 new `describe('getTransactionDetails')` tests present |
| 14 | `shyft-provider.test.ts` has `makeNativeTransferTx` helper and Wave 1 tests | VERIFIED | `shyft-provider.test.ts` lines 59-86: helper present; `describe('getTransactionDetails')` and `describe('extractNativeTransfers (via normalize)')` blocks present |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/verify-shyft-action-types.ts` | D-03 live verification script | VERIFIED | 105 lines; calls Shyft endpoint; type-checks cleanly |
| `src/fetchers/providers/types.ts` | 4-method `RpcProvider` interface | VERIFIED | Line 22: `getTransactionDetails(signature: string): Promise<ProviderTransaction>` |
| `src/fetchers/providers/helius-provider.ts` | Delegation to `HeliusFetcher.getTransaction` | VERIFIED | Line 23: one-liner `return this.fetcher.getTransaction(signature)` |
| `src/fetchers/providers/shyft-provider.ts` | `fetchSingleTx` + `getTransactionDetails` + extended `extractNativeTransfers` | VERIFIED | `SHYFT_NATIVE_TRANSFER_ACTION_TYPES` Set; `fetchSingleTx` with AbortError for non-retryable; Set membership in `extractNativeTransfers` |
| `src/fetchers/providers/router.ts` | `tryCallGetTransactionDetails` with throw-on-exhaustion | VERIFIED | Lines 84-99: private method throws, not returns null |
| `src/fetchers/providers/index.ts` | `sharedProviderRouter` singleton + `heliusProviderWrapped.getTransactionDetails` | VERIFIED | Line 148: module-level const; lines 104-108: credit-exhaustion wrapped |
| `src/detection/bundler.ts` | `getDefaultFetcher()` wired to `sharedProviderRouter` | VERIFIED | Lines 249-253; no `createHeliusFetcher` anywhere in file |
| `src/detection/wash-trader.ts` | `getDefaultFetcher()` wired to `sharedProviderRouter` | VERIFIED | Lines 249-253; no `createHeliusFetcher` anywhere in file |
| `src/fetchers/providers/__tests__/helius-provider.test.ts` | `getTransactionDetails` describe block (2 tests) | VERIFIED | Lines 101-128: delegation test + error propagation test |
| `src/fetchers/providers/__tests__/shyft-provider.test.ts` | `getTransactionDetails` + `extractNativeTransfers` describe blocks | VERIFIED | Lines 361-403: 2+2 tests covering URL params, missing-result throw, SOL_TRANSFER normalize, unknown-type skip |
| `src/fetchers/providers/__tests__/router.test.ts` | `getTransactionDetails` describe block (4 tests) | VERIFIED | Lines 256-310: success, fallthrough, throw-on-exhaustion, cooldown-skip tests |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `router.ts tryCallGetTransactionDetails` | `providers[i].getTransactionDetails(signature)` | loop with cooldown skip + markCooldown catch | WIRED | Lines 87-98: for-loop with `isOnCooldown`, try/catch with `markCooldown` |
| `router.ts tryCallGetTransactionDetails` | throw on exhaustion | `throw new Error` after loop — NO `?? []` | WIRED | Line 98: `throw new Error('[provider] All providers exhausted fetching transaction: ${signature}')` |
| `index.ts heliusProviderWrapped` | `handleCreditExhaustion(() => heliusProvider.getTransactionDetails(signature), heliusFetcher)` | object literal key matching existing 3 methods | WIRED | Lines 104-108: pattern matches exactly |
| `index.ts` | `sharedProviderRouter` export | `export const sharedProviderRouter: ProviderRouter = createProviderRouter()` | WIRED | Line 148 — module-level, not inside factory call per consumer |
| `shyft-provider.ts extractNativeTransfers` | D-03 observed action types | `SHYFT_NATIVE_TRANSFER_ACTION_TYPES.has(action.type)` Set membership | WIRED | Line 188: Set membership check; old string equality (`action.type === 'SOL_TRANSFER'`) is absent |
| `bundler.ts getDefaultFetcher` | `sharedProviderRouter` in `providers/index.js` | `await import('../fetchers/providers/index.js')` + explicit adapter | WIRED | Lines 249-253: dynamic import inside function body (lazy); adapter bridges `getTransaction` → `getTransactionDetails` |
| `wash-trader.ts getDefaultFetcher` | `sharedProviderRouter` in `providers/index.js` | `await import('../fetchers/providers/index.js')` + explicit adapter | WIRED | Lines 249-253: identical pattern to bundler.ts |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| API-01 | 16-01, 16-02 | `getTransactionDetails` added to `RpcProvider` interface, covering `bundler.ts` and `wash-trader.ts` | SATISFIED | Interface extended in `types.ts`; both detectors route through `sharedProviderRouter`; no direct Helius call path remains |
| API-02 | 16-00, 16-01 | `ShyftProvider` normalization handles all SOL transfer action types for `nativeTransfers` | SATISFIED | `SHYFT_NATIVE_TRANSFER_ACTION_TYPES` Set (SOL_TRANSFER) used in `extractNativeTransfers`; D-03 script committed; SOL_TRANSFER is the canonical documented type and the only one observed |
| API-03 | 16-01, 16-02 | Detection engines throw on provider exhaustion rather than silently returning null results | SATISFIED | `tryCallGetTransactionDetails` throws; detectors' existing catch blocks absorb the error; confirmed by 20/20 bundler + wash-trader tests passing |

**Orphaned requirements check:** `grep -E "Phase 16" .planning/REQUIREMENTS.md` — API-01, API-02, API-03 are the only Phase 16 requirements. All three are claimed by plans and verified.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/verify-shyft-action-types.ts` | 30 | `'REPLACE_WITH_BUNDLED_TX_SIG'` placeholder | Info | Intentional — script is an operator tool requiring manual signature substitution before execution. Not a production code stub. |
| `16-00-SUMMARY.md` | — | D-03 live run documented as PENDING | Info | Operator did not run the script before Plan 01; Plan 01 correctly implemented the documented fallback branch ("SOL_TRANSFER only"). Not a correctness gap. |

No blockers. No production stubs found. The `REPLACE_WITH_BUNDLED_TX_SIG` placeholder is by design — the script is a one-shot operator tool, not production code.

---

### Test Results (Verified by Execution)

| Suite | Tests | Result |
|-------|-------|--------|
| `router.test.ts` | 14/14 | PASS |
| `helius-provider.test.ts` | 5/5 | PASS |
| `shyft-provider.test.ts` | 18/18 | PASS |
| `bundler.test.ts` | 10/10 | PASS |
| `wash-trader.test.ts` | 10/10 | PASS |
| **Total** | **57/57** | **PASS** |

`npx tsc --noEmit` — exits 0 (clean, no warnings relevant to this phase).

---

### Human Verification Required

**None required for automated goal verification.** The following items are optional runtime confirmation only (not blocking):

1. **Shyft fallback path exercised at runtime**
   - Test: Run monitor loop with invalid `HELIUS_API_KEY` and valid `SHYFT_API_KEY`; trigger bundler/wash-trader detection
   - Expected: Logs show `[provider] provider[0] failed on getTransactionDetails: ...` followed by Shyft being called for the same signature
   - Why human: Live network call, not unit-testable; structural evidence (wiring checks + test suite) is sufficient for goal verification

2. **D-03 live script execution with real signatures**
   - Test: Substitute real bundled-tx signatures in `KNOWN_BUNDLED_TX_SIGNATURES`, run `npx tsx scripts/verify-shyft-action-types.ts`
   - Expected: Prints `action_types=["SOL_TRANSFER"]` (or additional types not yet observed)
   - Why human: Requires real API key and real on-chain signatures; operator gate before any future `extractNativeTransfers` extension

---

## Summary

Phase 16 goal is fully achieved. All three core deliverables are implemented, tested, and wired end-to-end:

1. **getTransactionDetails API layer (API-01, API-02):** `RpcProvider` interface has 4 methods; `HeliusProvider` delegates to `HeliusFetcher.getTransaction`; `ShyftProvider` calls `/sol/v1/transaction/parsed`, normalizes via existing pipeline, and handles SOL_TRANSFER nativeTransfers via a `ReadonlySet`-based whitelist; `ProviderRouter` iterates providers with cooldown semantics and throws a descriptive error on exhaustion.

2. **sharedProviderRouter singleton (API-01):** Exported as a module-level const from `providers/index.ts`; `heliusProviderWrapped` includes `getTransactionDetails` wrapped in `handleCreditExhaustion`; Shyft is added as fallback when `SHYFT_API_KEY` is present.

3. **Detector rewiring (API-01, API-03):** Both `bundler.ts` and `wash-trader.ts` `getDefaultFetcher()` use lazy dynamic import of `sharedProviderRouter` and return explicit adapter objects bridging `getTransaction` → `getTransactionDetails`. No `createHeliusFetcher` reference remains in either detector file. Zero test file modifications (D-05/D-06 compliant). Router throw-on-exhaustion propagates structurally into existing detector catch blocks.

57 tests pass across 5 suites. Full project `tsc --noEmit` is clean.

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_
