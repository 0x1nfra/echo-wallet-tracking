---
phase: 16-providerrouter-extension
plan: "01"
subsystem: provider-layer
tags: [rpc-provider, helius, shyft, router, singleton, tdd]

# Dependency graph
requires:
  - phase: 16-00
    provides: makeProvider helper with getTransactionDetails, makeNativeTransferTx helper
  - phase: 13-03
    provides: HeliusCreditExhaustedError, handleCreditExhaustion wrapper, ProviderRouter
provides:
  - RpcProvider interface with 4 methods (3 existing + getTransactionDetails)
  - HeliusProvider.getTransactionDetails delegating to HeliusFetcher.getTransaction
  - ShyftProvider.getTransactionDetails via /sol/v1/transaction/parsed + normalize
  - SHYFT_NATIVE_TRANSFER_ACTION_TYPES ReadonlySet (SOL_TRANSFER, D-03 observed)
  - ProviderRouter.getTransactionDetails with throw-on-exhaustion semantics
  - sharedProviderRouter singleton exported from providers/index.ts
affects:
  - Plan 02: wires bundler.ts and wash-trader.ts onto sharedProviderRouter singleton
  - Any future caller that needs single-tx lookup via the provider layer

# Tech tracking
tech-stack:
  added: []
  patterns:
    - throw-on-exhaustion pattern for single-resource router methods (vs ?? [] for list methods)
    - AbortError from pRetry for non-retryable errors in onFailedAttempt callbacks
    - ReadonlySet for observed action-type whitelist (audit-trail + fast membership test)
    - Module-level singleton export for stateful router (createProviderRouter() called once)

key-files:
  created: []
  modified:
    - src/fetchers/providers/types.ts
    - src/fetchers/providers/helius-provider.ts
    - src/fetchers/providers/shyft-provider.ts
    - src/fetchers/providers/router.ts
    - src/fetchers/providers/index.ts
    - src/fetchers/providers/__tests__/helius-provider.test.ts
    - src/fetchers/providers/__tests__/shyft-provider.test.ts
    - src/fetchers/providers/__tests__/router.test.ts

key-decisions:
  - "AbortError used in pRetry onFailedAttempt for non-retryable errors (missing result, 401) — RetryContext shape changed in pRetry v7: error is context.error, not the context object itself"
  - "SHYFT_NATIVE_TRANSFER_ACTION_TYPES contains only SOL_TRANSFER — D-03 script was committed in Plan 00 but operator did not run it; SOL_TRANSFER is the canonical documented type and the only one in the existing codebase"
  - "tryCallGetTransactionDetails throws on exhaustion rather than returning null — callers (bundler.ts, wash-trader.ts) need explicit failure signal, not silent empty result"
  - "sharedProviderRouter exported as module-level const from providers/index.ts — instantiated once per process, holds stateful cooldown maps; Plan 02 consumes via dynamic import"
  - "Inline RpcProvider object literals in router.test.ts updated to include getTransactionDetails stub — required by TypeScript after interface extension"

patterns-established:
  - "Non-retryable pRetry errors: use AbortError(originalError) in onFailedAttempt, check context.error.message (not error.message — pRetry v7 wraps in RetryContext)"
  - "Router throw vs return-null: single-resource methods throw on exhaustion; list methods return ?? [] on exhaustion"

requirements-completed: [API-01, API-02, API-03]

# Metrics
duration: ~25min
completed: 2026-04-20
---

# Phase 16 Plan 01: ProviderRouter Extension — Core Provider Layer Summary

**getTransactionDetails added to RpcProvider/HeliusProvider/ShyftProvider/ProviderRouter with throw-on-exhaustion semantics and sharedProviderRouter singleton exported for detection engines**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-20T00:00:00Z
- **Completed:** 2026-04-20
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `RpcProvider` interface extended to 4 methods; all 3 implementing sites updated (HeliusProvider, ShyftProvider, heliusProviderWrapped object literal)
- `ShyftProvider.getTransactionDetails` calls `/sol/v1/transaction/parsed`, normalizes via existing pipeline; `extractNativeTransfers` now uses `SHYFT_NATIVE_TRANSFER_ACTION_TYPES` ReadonlySet
- `ProviderRouter.getTransactionDetails` throws descriptive error containing signature on exhaustion — distinct from existing `?? []` behavior; `sharedProviderRouter` singleton exported
- Full project `tsc --noEmit` passes; all 37 provider-layer tests green

## D-03 Observed Action Types

**Final set in `SHYFT_NATIVE_TRANSFER_ACTION_TYPES`:** `['SOL_TRANSFER']`

The D-03 live verification script was committed in Plan 00 but the operator did not run it before Plan 01 began (PENDING status in 16-00-SUMMARY.md). `SOL_TRANSFER` is the canonical documented Shyft type and the only type in the existing codebase — implemented exactly as specified in the plan's "if only SOL_TRANSFER was observed" branch.

## sharedProviderRouter Singleton Instantiation

`sharedProviderRouter` is instantiated exactly once as a module-level `const` in `src/fetchers/providers/index.ts`:

```typescript
export const sharedProviderRouter: ProviderRouter = createProviderRouter();
```

This is NOT inside a factory call per consumer. Plan 02 reminder: consume via `const { sharedProviderRouter } = await import('../fetchers/providers/index.js')` inside `getDefaultFetcher()` — never top-level to avoid circular dependency.

## Test Counts

| File | Before | After | New Tests |
|------|--------|-------|-----------|
| helius-provider.test.ts | 3 | 5 | +2 (getTransactionDetails delegation, error propagation) |
| shyft-provider.test.ts | 14 | 18 | +4 (getTransactionDetails URL+params, missing result throw, SOL_TRANSFER normalize, unknown-type skip) |
| router.test.ts | 11 | 14 | +4 (success, fallthrough, throw-on-exhaustion, cooldown skip) — wave-0 scaffolding test removed |

**Total: 37 tests passing**

## Task Commits

1. **Task 1: Extend RpcProvider interface and HeliusProvider delegation** - `2e39890` (feat)
2. **Task 2: ShyftProvider.getTransactionDetails + extractNativeTransfers** - `e8d7955` (feat)
3. **Task 3: ProviderRouter.getTransactionDetails + sharedProviderRouter** - `8e03136` (feat)

## Files Created/Modified

- `src/fetchers/providers/types.ts` — Added `getTransactionDetails(signature)` as 4th method; updated JSDoc
- `src/fetchers/providers/helius-provider.ts` — Added `getTransactionDetails` delegating to `this.fetcher.getTransaction`
- `src/fetchers/providers/shyft-provider.ts` — Added `SHYFT_NATIVE_TRANSFER_ACTION_TYPES` Set, `fetchSingleTx`, `getTransactionDetails`; replaced `extractNativeTransfers` string equality with Set membership
- `src/fetchers/providers/router.ts` — Added `tryCallGetTransactionDetails` (throw on exhaustion) and public `getTransactionDetails`
- `src/fetchers/providers/index.ts` — Extended `heliusProviderWrapped` with `getTransactionDetails`; exported `sharedProviderRouter` singleton
- `src/fetchers/providers/__tests__/helius-provider.test.ts` — Added `getTransactionDetails` describe block (2 tests)
- `src/fetchers/providers/__tests__/shyft-provider.test.ts` — Added `getTransactionDetails` + `extractNativeTransfers` describe blocks (4 tests)
- `src/fetchers/providers/__tests__/router.test.ts` — Added `getTransactionDetails` describe block (4 tests); removed wave-0 scaffolding test; narrowed `makeProvider` return type; fixed inline mocks

## Decisions Made

- **AbortError for non-retryable pRetry errors:** pRetry v7 changed `onFailedAttempt` signature — the callback receives a `RetryContext` object (`{ error, attemptNumber, retriesLeft }`) not the raw error. Used `AbortError(context.error)` to abort retries for missing-result and 401 cases.
- **SOL_TRANSFER only in action type set:** D-03 script not run by operator; implemented only the canonical documented type per plan instruction ("if only SOL_TRANSFER was observed, leave only SOL_TRANSFER").
- **Inline mock update for TypeScript compliance:** 3 inline `RpcProvider` object literals in router.test.ts did not have `getTransactionDetails` after the interface extension. Added `getTransactionDetails: async () => makeTx('unused')` stubs — this is Rule 1 (TypeScript compile error).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pRetry v7 RetryContext shape — non-retryable abort needed AbortError**
- **Found during:** Task 2 (ShyftProvider.getTransactionDetails)
- **Issue:** `onFailedAttempt` in pRetry v7 receives `RetryContext` (not raw Error); throwing `error` directly from callback doesn't abort retries; missing-result error was being swallowed and retried with fallback mock response
- **Fix:** Import `AbortError` from `p-retry`; use `throw new AbortError(context.error)` for 401 and missing-result cases; access message via `context.error.message`
- **Files modified:** `src/fetchers/providers/shyft-provider.ts`
- **Verification:** `throws when result is missing` test passes in 5ms (no retry delays)
- **Committed in:** e8d7955 (Task 2 commit)

**2. [Rule 1 - Bug] Inline RpcProvider mocks missing getTransactionDetails after interface extension**
- **Found during:** Task 3 (router.test.ts)
- **Issue:** 3 inline object literals typed as `RpcProvider` in the "Happy path", "Cooldown respected", and "Cooldown expires" describe blocks lacked the new required method; TypeScript compile failure in test suite
- **Fix:** Added `getTransactionDetails: async () => makeTx('unused')` stub to each inline mock
- **Files modified:** `src/fetchers/providers/__tests__/router.test.ts`
- **Verification:** All 14 router tests pass; tsc exits 0
- **Committed in:** 8e03136 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2x Rule 1 - Bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- `src/signals/__tests__/engine.test.ts` fails with migration error (multi-statement SQL in better-sqlite3). This is a **pre-existing failure** unrelated to this plan — confirmed by verifying it fails on the commit prior to any Plan 01 changes. Logged to deferred-items per scope boundary rule.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Provider layer complete: `sharedProviderRouter.getTransactionDetails(sig)` returns normalized `ProviderTransaction` or throws with signature in message
- Plan 02 can wire bundler.ts and wash-trader.ts onto the singleton via dynamic import
- Import pattern for Plan 02: `const { sharedProviderRouter } = await import('../fetchers/providers/index.js')` inside detector function body — never top-level

---
*Phase: 16-providerrouter-extension*
*Completed: 2026-04-20*
