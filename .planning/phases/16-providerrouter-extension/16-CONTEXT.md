# Phase 16: ProviderRouter Extension - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `RpcProvider` interface with `getTransactionDetails(signature)`, implement it on both `HeliusProvider` and `ShyftProvider`, and update `bundler.ts` + `wash-trader.ts` to route through `ProviderRouter` instead of calling `createHeliusFetcher()` directly. Fix `ShyftProvider` native transfer normalization to cover all SOL transfer action types. When all providers are exhausted for a `getTransactionDetails` call, throw an explicit error — no silent empty result.

Modifying existing callers of `fetchSwapHistory`, `fetchEarlySwapsForMint`, or `fetchOnePage` is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Exhaustion behavior
- **D-01:** Only `getTransactionDetails` throws when all providers are exhausted. The 3 existing router methods (`fetchSwapHistory`, `fetchEarlySwapsForMint`, `fetchOnePage`) keep their current `[]` return behavior — their callers (MonitorLoop, discovery) already handle empty arrays gracefully and must not be changed.
- **D-02:** Detection engines (`bundler.ts`, `wash-trader.ts`) are the explicit error surface — they receive a throw, not a null/empty result, so silent degradation is impossible.

### Shyft action type verification
- **D-03:** The plan MUST include a mandatory research task: fetch a real Shyft transaction response for a known bundled contract address and log the raw `actions[].type` values before writing normalization code. Do not guess action type names — the live API response is the source of truth.
- **D-04:** After verifying, implement `extractNativeTransfers` to handle all observed action types. Known candidates are `SOL_TRANSFER`, `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER` — the research step may reveal additional variants.

### Fetcher interface wiring
- **D-05:** Keep `BundlerFetcher` and `WashTraderFetcher` custom interfaces unchanged — zero impact on existing test harnesses. The method on those interfaces is `getTransaction`; `RpcProvider` will expose `getTransactionDetails`. The production `getDefaultFetcher()` functions in both detectors will be updated to return the shared `ProviderRouter` instance (satisfying the custom interface structurally, since the return types overlap).
- **D-06:** No changes to test files for `bundler.ts` or `wash-trader.ts` — existing mocks continue working without modification.

### Claude's Discretion
- Method name on `RpcProvider`: `getTransactionDetails` (per success criteria). The custom interfaces in bundler/wash-trader call it `getTransaction` — the structural compatibility must be verified (the return types must be compatible for TypeScript to satisfy both interfaces).
- Return type of `getTransactionDetails`: choose the narrowest type that satisfies both `BundlerFetcher` and `WashTraderFetcher` return shapes (i.e., `{ signature: string; nativeTransfers?: ...; tokenTransfers?: ... }`) — reuse `ProviderTransaction` or introduce a minimal `TransactionDetail` type as appropriate.
- Whether `HeliusProvider` wraps the existing `HeliusFetcher.getTransaction` directly or re-implements the call is Claude's choice — minimize regression surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Provider layer
- `src/fetchers/providers/types.ts` — `RpcProvider` interface (add `getTransactionDetails` here)
- `src/fetchers/providers/router.ts` — `ProviderRouter` class (add new method + throw-on-exhaustion path)
- `src/fetchers/providers/shyft-provider.ts` — `ShyftProvider` (add `getTransactionDetails`, fix native transfer normalization)
- `src/fetchers/providers/helius-provider.ts` — `HeliusProvider` (add `getTransactionDetails` wrapping existing Helius getTransaction)
- `src/fetchers/providers/index.ts` — shared provider singleton (expose router instance for detection engines)

### Detection engines
- `src/detection/bundler.ts` — `BundlerFetcher` interface + `getDefaultFetcher()` (update singleton to use router)
- `src/detection/wash-trader.ts` — `WashTraderFetcher` interface + `getDefaultFetcher()` (update singleton to use router)

### Existing Helius fetcher (reference for wrapping)
- `src/fetchers/helius.ts` — `createHeliusFetcher()` + `getTransaction` implementation

### Success criteria
- `.planning/ROADMAP.md` §Phase 16 — SC-1, SC-2, SC-3 are the acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProviderRouter.markCooldown()` + `tryCall*` pattern: use this same pattern for the new `tryCallGetTransactionDetails` method
- `ShyftProvider.fetchPage()` + `pRetry`/`PQueue` setup: reuse for the new single-tx endpoint call
- `HeliusFetcher.getTransaction()`: existing implementation to wrap inside `HeliusProvider.getTransactionDetails()`

### Established Patterns
- All `tryCall*` methods in `ProviderRouter` follow the same structure: loop over providers, skip cooldown, catch and mark cooldown, call `onAllExhausted()` on full exhaustion. The new method follows this pattern but throws instead of returning null.
- `ShyftProvider.normalize()` already maps `ProviderTransaction` shape. `extractNativeTransfers()` is the specific method to extend.
- Both `bundler.ts` and `wash-trader.ts` use `deps?.fetcher ?? (await getDefaultFetcher())` — only `getDefaultFetcher()` needs to change in production path.

### Integration Points
- `src/fetchers/providers/index.ts` exports the shared `ProviderRouter` — `getDefaultFetcher()` in both detectors should import and return this instance
- `RpcProvider` interface in `types.ts` is the single source of truth for what the router and both providers must implement

</code_context>

<specifics>
## Specific Ideas

- STATE.md research flag: "Before implementing ShyftProvider `getTransactionDetails`, get a real Shyft response for a known bundled transaction to verify native transfer action type names. Building against inferred field names risks silent bundler detection failures." — this is explicit prior-phase guidance that MUST be followed.
- The `ProviderTransaction` type alias (`= HeliusTransaction`) already includes `nativeTransfers` and `tokenTransfers`. If `getTransactionDetails` returns `ProviderTransaction`, both `BundlerFetcher` and `WashTraderFetcher` return types would be structurally compatible — verify this before introducing a new type.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-providerrouter-extension*
*Context gathered: 2026-04-19*
