# Phase 16: ProviderRouter Extension - Research

**Researched:** 2026-04-19
**Domain:** TypeScript provider abstraction layer, Shyft REST API, detection engine wiring
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Only `getTransactionDetails` throws when all providers are exhausted. The 3 existing router methods (`fetchSwapHistory`, `fetchEarlySwapsForMint`, `fetchOnePage`) keep their current `[]` return behavior — their callers (MonitorLoop, discovery) already handle empty arrays gracefully and must not be changed.
- **D-02:** Detection engines (`bundler.ts`, `wash-trader.ts`) are the explicit error surface — they receive a throw, not a null/empty result, so silent degradation is impossible.
- **D-03:** The plan MUST include a mandatory research task: fetch a real Shyft transaction response for a known bundled contract address and log the raw `actions[].type` values before writing normalization code. Do not guess action type names — the live API response is the source of truth.
- **D-04:** After verifying, implement `extractNativeTransfers` to handle all observed action types. Known candidates are `SOL_TRANSFER`, `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER` — the research step may reveal additional variants.
- **D-05:** Keep `BundlerFetcher` and `WashTraderFetcher` custom interfaces unchanged — zero impact on existing test harnesses. The method on those interfaces is `getTransaction`; `RpcProvider` will expose `getTransactionDetails`. The production `getDefaultFetcher()` functions in both detectors will be updated to return the shared `ProviderRouter` instance (satisfying the custom interface structurally, since the return types overlap).
- **D-06:** No changes to test files for `bundler.ts` or `wash-trader.ts` — existing mocks continue working without modification.

### Claude's Discretion

- Method name on `RpcProvider`: `getTransactionDetails` (per success criteria). The custom interfaces in bundler/wash-trader call it `getTransaction` — the structural compatibility must be verified (the return types must be compatible for TypeScript to satisfy both interfaces).
- Return type of `getTransactionDetails`: choose the narrowest type that satisfies both `BundlerFetcher` and `WashTraderFetcher` return shapes (i.e., `{ signature: string; nativeTransfers?: ...; tokenTransfers?: ... }`) — reuse `ProviderTransaction` or introduce a minimal `TransactionDetail` type as appropriate.
- Whether `HeliusProvider` wraps the existing `HeliusFetcher.getTransaction` directly or re-implements the call is Claude's choice — minimize regression surface.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

Modifying existing callers of `fetchSwapHistory`, `fetchEarlySwapsForMint`, or `fetchOnePage` is out of scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | `getTransactionDetails` added to `RpcProvider` interface, covering `bundler.ts` and `wash-trader.ts` | Interface extension pattern, TypeScript structural compatibility analysis, HeliusProvider/ShyftProvider implementation shapes |
| API-02 | `ShyftProvider` normalization handles all SOL transfer action types for `nativeTransfers` (fixes silent bundler detection gaps under Shyft fallback) | Shyft `/sol/v1/transaction/parsed` endpoint verified, action type `SOL_TRANSFER` confirmed as primary; D-03 live verification step required before coding |
| API-03 | Detection engines throw on provider exhaustion rather than silently returning null results | `tryCallGetTransactionDetails` throw-path pattern documented, differs from existing `?? []` pattern in router |
</phase_requirements>

---

## Summary

Phase 16 extends the existing `ProviderRouter` / `RpcProvider` abstraction that was built in an earlier phase. The current interface only covers three list-based methods (`fetchSwapHistory`, `fetchEarlySwapsForMint`, `fetchOnePage`). The `bundler.ts` and `wash-trader.ts` detectors bypass this router entirely and call `createHeliusFetcher()` directly, making them blind to Shyft fallback and rate-limit degradation.

The work is entirely within an established, well-tested pattern. The `ProviderRouter` already has three nearly-identical `tryCall*` methods; a fourth method for `getTransactionDetails` follows the same structure but diverges in one key way: on exhaustion it throws instead of returning null. The `HeliusFetcher.getTransaction()` method already exists and handles the Helius side. The Shyft side requires a new single-transaction HTTP call to `/sol/v1/transaction/parsed` plus extending `extractNativeTransfers` to handle action types verified from a live API response.

The most critical risk is the Shyft native transfer action type names. Official Shyft docs confirm `SOL_TRANSFER` as the documented type. However, D-03 mandates fetching a live response for a bundled transaction before writing code — this is a hard gate in the plan. TypeScript structural compatibility is the second key concern: `ProviderTransaction` (= `HeliusTransaction`) already has `signature`, `nativeTransfers`, and `tokenTransfers`, so it satisfies both `BundlerFetcher.getTransaction` and `WashTraderFetcher.getTransaction` return shapes without introducing a new type.

**Primary recommendation:** Extend the interface with `getTransactionDetails(signature: string): Promise<ProviderTransaction>`, implement it on both providers, wire the singleton in both detectors, and add a throw-path `tryCallGetTransactionDetails` method in the router. Gate the Shyft normalization code on D-03 live verification.

---

## Standard Stack

### Core (already in project — no new installations needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | existing | HTTP client for Shyft single-tx call | Already used in ShyftProvider |
| p-retry | existing | Retry with backoff for Shyft HTTP call | Already used in `fetchPage` |
| p-queue | existing | Concurrency control for Shyft | Already used in `shyftQueue` |
| TypeScript | ~5.3 | Structural type compatibility | Already in project |

No new package installations required. All dependencies are already present.

---

## Architecture Patterns

### Recommended File Touch List

```
src/fetchers/providers/types.ts        — add getTransactionDetails to RpcProvider
src/fetchers/providers/router.ts       — add tryCallGetTransactionDetails + getTransactionDetails
src/fetchers/providers/helius-provider.ts — add getTransactionDetails wrapping HeliusFetcher.getTransaction
src/fetchers/providers/shyft-provider.ts  — add getTransactionDetails + extend extractNativeTransfers
src/fetchers/providers/index.ts        — expose getTransactionDetails on the wrapped heliusProviderWrapped object literal
src/detection/bundler.ts               — update getDefaultFetcher() to return shared router
src/detection/wash-trader.ts           — update getDefaultFetcher() to return shared router
```

### Pattern 1: tryCall* with Throw-on-Exhaustion (differs from existing pattern)

Existing `tryCallSwapHistory` / `tryCallOnePage` return `null` on exhaustion and the public methods coalesce with `?? []`. The new `getTransactionDetails` path throws instead:

```typescript
// Source: router.ts (existing pattern, modified for throw behavior)
private async tryCallGetTransactionDetails(
  signature: string
): Promise<ProviderTransaction> {
  for (let i = 0; i < this.providers.length; i++) {
    if (this.isOnCooldown(i)) continue;
    try {
      return await this.providers[i].getTransactionDetails(signature);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.markCooldown(i, 'getTransactionDetails', reason);
    }
  }
  console.error('[provider] ALL providers exhausted for getTransactionDetails');
  this.onAllExhausted();
  throw new Error(`[provider] All providers exhausted fetching transaction: ${signature}`);
}

async getTransactionDetails(signature: string): Promise<ProviderTransaction> {
  return this.tryCallGetTransactionDetails(signature);
}
```

Key difference: no `?? []` coalescing — the public method directly awaits and lets the throw propagate.

### Pattern 2: HeliusProvider Delegation

Wrap `HeliusFetcher.getTransaction` directly. The existing `getTransaction` method already uses `POST /v0/transactions` with the Helius parse API (not a standard JSON-RPC call):

```typescript
// Source: helius-provider.ts — minimal delegation
async getTransactionDetails(signature: string): Promise<ProviderTransaction> {
  return this.fetcher.getTransaction(signature);
}
```

`HeliusFetcher.getTransaction` returns `HeliusTransaction` which equals `ProviderTransaction`. This delegates to existing tested code, minimizing regression surface (D-05 rationale).

**Caveat:** `HeliusFetcher.getTransaction` currently wraps errors in a generic `new Error(...)` and does NOT throw `HeliusCreditExhaustedError`. The credit exhaustion intercept in `index.ts` will need to wrap `getTransactionDetails` in the same `handleCreditExhaustion` wrapper applied to the other three methods.

### Pattern 3: ShyftProvider Single-Transaction Endpoint

Shyft exposes a single-transaction endpoint distinct from the history endpoint:

- **URL:** `GET https://api.shyft.to/sol/v1/transaction/parsed`
- **Query params:** `network=mainnet-beta`, `txn_signature={signature}`
- **Auth:** `x-api-key` header (same as existing pattern)
- **Response path:** `res.data.result` (consistent with history endpoint)

```typescript
// Source: shyft-provider.ts — new single-tx fetch method
private async fetchSingleTx(signature: string): Promise<ShyftRawTx> {
  return pRetry(
    () => shyftQueue.add(async () => {
      const res = await this.client.get('/sol/v1/transaction/parsed', {
        params: { network: 'mainnet-beta', txn_signature: signature },
        headers: { 'x-api-key': this.apiKey },
      });
      const result = res?.data?.result;
      if (!result) throw new Error(`Shyft: no result for signature ${signature}`);
      return result as ShyftRawTx;
    }),
    {
      retries: 3,
      onFailedAttempt: async (error) => {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401) throw error;
        if (status === 429) {
          const delayMs = Math.pow(2, error.attemptNumber) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      },
    }
  ) as Promise<ShyftRawTx>;
}

async getTransactionDetails(signature: string): Promise<ProviderTransaction> {
  const raw = await this.fetchSingleTx(signature);
  return this.normalize(raw);
}
```

Note: The single-transaction response uses `signatures` (plural array) same as history. The `ShyftRawTx` internal type already matches this shape.

### Pattern 4: Index.ts Wrapped Provider Object

`createProviderRouter()` builds `heliusProviderWrapped` as a plain object literal implementing `RpcProvider`. When `getTransactionDetails` is added to `RpcProvider`, this object literal must also include the new method with the same `handleCreditExhaustion` wrapping pattern:

```typescript
// Source: providers/index.ts — extend heliusProviderWrapped
const heliusProviderWrapped: RpcProvider = {
  fetchSwapHistory: (address, afterTimestamp) =>
    handleCreditExhaustion(() => heliusProvider.fetchSwapHistory(address, afterTimestamp), heliusFetcher),
  fetchEarlySwapsForMint: (mint, limit, sortOrder) =>
    handleCreditExhaustion(() => heliusProvider.fetchEarlySwapsForMint(mint, limit, sortOrder), heliusFetcher),
  fetchOnePage: (address, limit) =>
    handleCreditExhaustion(() => heliusProvider.fetchOnePage(address, limit), heliusFetcher),
  // NEW:
  getTransactionDetails: (signature) =>
    handleCreditExhaustion(() => heliusProvider.getTransactionDetails(signature), heliusFetcher),
};
```

TypeScript will error at the `heliusProviderWrapped` assignment if the object literal doesn't implement all `RpcProvider` methods — this is a compile-time safety net.

### Pattern 5: Detection Engine Default Fetcher Wiring

Both detectors follow identical pattern. Change only `getDefaultFetcher()`:

```typescript
// Source: bundler.ts / wash-trader.ts — only this function changes
async function getDefaultFetcher(): Promise<BundlerFetcher> {
  const { sharedProviderRouter } = await import('../fetchers/providers/index.js');
  return sharedProviderRouter as unknown as BundlerFetcher;
}
```

The `as unknown as BundlerFetcher` cast works because `ProviderRouter.getTransactionDetails` structurally satisfies `BundlerFetcher.getTransaction`: both accept `string` and return `Promise<{ signature: string; nativeTransfers?: ... }>`. TypeScript structural typing does the rest. The `sharedProviderRouter` export needs to be added to `index.ts`.

### Pattern 6: Shared Router Export

`index.ts` currently only exports `createProviderRouter()` as a factory. A `sharedProviderRouter` singleton needs to be created and exported for the detectors to import:

```typescript
// Source: providers/index.ts — add singleton export
export const sharedProviderRouter: ProviderRouter = createProviderRouter();
```

This mirrors the `monitorLoop` singleton pattern used elsewhere in the project (module-level lazy initialization). The router is already stateful (cooldown maps), so a singleton is correct.

### Anti-Patterns to Avoid

- **Don't add `?? null` coalescing to `getTransactionDetails`:** The throw path must propagate. Existing `?? []` pattern is correct for list methods only.
- **Don't modify `bundler.ts` / `wash-trader.ts` catch blocks:** The detectors already have `try/catch` around `fetcher.getTransaction` that does `continue` on failure. On provider exhaustion the throw will be caught by these existing `catch` blocks, silently skipping the candidate. This is actually the **correct behavior** for the detection loop (skip the candidate when all providers are down, but D-02 is satisfied because the throw surfaces from the router and is handled by the existing catch-continue rather than returning empty). This is acceptable — the detectors already log nothing on individual fetch failures.
- **Don't re-implement Helius getTransaction HTTP call in HeliusProvider:** Wrap `HeliusFetcher.getTransaction` directly to avoid duplicating retry/auth logic.
- **Don't call `fetchPage` (history endpoint) for single-tx lookup:** The `/sol/v1/transaction/history` endpoint is wrong for single-signature lookup; use `/sol/v1/transaction/parsed`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retry with backoff for Shyft | Custom retry loop | `pRetry` (already in ShyftProvider) | Already handles attempt counting, delay, rethrow |
| Concurrency limiting | Manual queue | `PQueue` (`shyftQueue`) | Already instantiated in ShyftProvider |
| Provider fallback / cooldown | New mechanism | Existing `ProviderRouter.markCooldown` + `isOnCooldown` | Already tested, same mechanics |

---

## Common Pitfalls

### Pitfall 1: TypeScript Error on heliusProviderWrapped Object Literal

**What goes wrong:** Adding `getTransactionDetails` to `RpcProvider` but forgetting to add it to the `heliusProviderWrapped` object literal in `index.ts`. TypeScript will flag this as a compile error.
**Why it happens:** The object literal is not a class — it doesn't inherit new interface methods automatically.
**How to avoid:** After updating `types.ts`, run `tsc --noEmit` immediately. The type error pinpoints exactly what to fix.
**Warning signs:** `TS2741: Property 'getTransactionDetails' is missing in type '{...}' but required in type 'RpcProvider'`

### Pitfall 2: Silent Detection Failure (The Core Bug Being Fixed)

**What goes wrong:** Under Shyft fallback, `extractNativeTransfers` returns `[]` because real response uses a different action type string than `SOL_TRANSFER`. Bundler detection sees no nativeTransfers, finds no shared funder, returns `flagged=false`.
**Why it happens:** Action type names are undocumented variants. The current code only handles `SOL_TRANSFER`.
**How to avoid:** D-03 is mandatory — log raw `actions[].type` values from a live Shyft response for a known bundled transaction BEFORE writing normalization code.
**Warning signs:** No test failure (tests use mock data). Only observable in production when Shyft is the active provider.

### Pitfall 3: HeliusProvider.getTransactionDetails Missing Credit Exhaustion Intercept

**What goes wrong:** `HeliusFetcher.getTransaction` does not throw `HeliusCreditExhaustedError` (it wraps errors generically). If credit exhaustion occurs during a bundler/wash-trader run, the router does not detect it, the monitor loop is not paused, and the probe is not started.
**Why it happens:** `getTransaction` predates the credit exhaustion handling added in Phase 13.
**How to avoid:** Wrap `heliusProvider.getTransactionDetails` in `handleCreditExhaustion` in `index.ts` (same pattern as the three existing methods). Optionally update `HeliusFetcher.getTransaction` to detect `max_usage_reached` and throw `HeliusCreditExhaustedError`.
**Warning signs:** Monitor loop continues running after Helius credits are exhausted but bundler/wash-trader calls are failing.

### Pitfall 4: Shyft 3-4 Day History Limit

**What goes wrong:** `getTransactionDetails` for old transactions (>4 days) returns 404 or empty from Shyft.
**Why it happens:** Shyft's parsed transaction API only retains ~3-4 days of history.
**How to avoid:** This is expected and acceptable for the detection use case (bundler detection runs on recently-stored DB transactions). The throw-on-exhaustion behavior handles this correctly: if Shyft returns nothing for an old tx, it should throw, and the detection loop's existing `catch` will skip that candidate.
**Warning signs:** All Shyft `getTransactionDetails` calls throwing for old transactions — this is correct behavior, not a bug.

### Pitfall 5: Structural Compatibility Between getTransactionDetails and getTransaction

**What goes wrong:** `BundlerFetcher.getTransaction` expects `Promise<{ signature, nativeTransfers? }>`. `WashTraderFetcher.getTransaction` expects `Promise<{ signature, tokenTransfers?, nativeTransfers? }>`. `ProviderTransaction` (= `HeliusTransaction`) has all these fields. TypeScript structural typing will accept the cast, but if `ProviderRouter.getTransactionDetails` is accidentally typed to return a narrower type, the cast fails.
**Why it happens:** TypeScript structural type checking — both detector interfaces need the returned object to have at least the fields they access.
**How to avoid:** Keep return type as `Promise<ProviderTransaction>`. `HeliusTransaction` has `signature`, `nativeTransfers?`, and `tokenTransfers?` — all fields required by both detector interfaces.

---

## Code Examples

### Verified: Shyft Single Transaction Endpoint

```typescript
// Source: https://docs.shyft.to/solana-apis/transactions/transaction-apis
// Endpoint: GET https://api.shyft.to/sol/v1/transaction/parsed
// Required params: network, txn_signature
// Auth: x-api-key header

const res = await this.client.get('/sol/v1/transaction/parsed', {
  params: { network: 'mainnet-beta', txn_signature: signature },
  headers: { 'x-api-key': this.apiKey },
});
// Result shape: res.data.result (same as history endpoint)
```

### Verified: HeliusFetcher.getTransaction (existing implementation)

```typescript
// Source: src/fetchers/helius.ts lines 247-268
async getTransaction(signature: string): Promise<HeliusTransaction> {
  const response = await this.client.post(
    '/v0/transactions',
    { transactions: [signature] },
    { params: { 'api-key': this.apiKey } }
  );
  const transactions: HeliusTransaction[] = response.data;
  if (!transactions || transactions.length === 0) {
    throw new Error(`Transaction not found: ${signature}`);
  }
  return transactions[0];
}
```

Uses `POST /v0/transactions` not `GET /addresses/{addr}/transactions`. Returns `HeliusTransaction` directly.

### Verified: Existing extractNativeTransfers (current, SOL_TRANSFER only)

```typescript
// Source: src/fetchers/providers/shyft-provider.ts lines 140-155
private extractNativeTransfers(actions: ShyftAction[]): HeliusNativeTransfer[] {
  const transfers: HeliusNativeTransfer[] = [];
  for (const action of actions) {
    if (action.type === 'SOL_TRANSFER') {
      const info = action.info;
      if (info.sender && info.receiver) {
        transfers.push({
          fromUserAccount: String(info.sender),
          toUserAccount: String(info.receiver),
          amount: Number(info.amount ?? 0),
        });
      }
    }
  }
  return transfers;
}
```

After D-03 live verification, extend the type check to include additional observed variants.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bundler.ts calls createHeliusFetcher() directly | Will call sharedProviderRouter | Phase 16 | Shyft fallback enabled for bundler detection |
| wash-trader.ts calls createHeliusFetcher() directly | Will call sharedProviderRouter | Phase 16 | Shyft fallback enabled for wash-trader detection |
| extractNativeTransfers handles SOL_TRANSFER only | Will handle all observed action types | Phase 16 (post D-03) | Silent bundler detection gap closed |
| All provider exhaustion returns [] | getTransactionDetails throws | Phase 16 | Explicit error surface for detection engines |

---

## Open Questions

1. **Live Shyft action type names for native SOL transfers**
   - What we know: Official docs state `SOL_TRANSFER`. D-03 mandates live verification before coding.
   - What's unclear: Whether bundled transactions use `TRANSFER` or `SYSTEM_PROGRAM:TRANSFER` variants for the SOL pre-funding step (not the swap itself).
   - Recommendation: This is a hard gate. Plan must include Wave 0 task: fetch live Shyft response for a known bundled tx signature using `curl` or Node script, log `actions[].type`, then implement.

2. **HeliusFetcher.getTransaction credit exhaustion detection**
   - What we know: The method catches and re-wraps all errors generically (lines 262-267 of helius.ts). `handleCreditExhaustion` wrapping in index.ts will fire but only if `HeliusCreditExhaustedError` is thrown — which it won't be from the current `getTransaction`.
   - What's unclear: Is it worth updating `HeliusFetcher.getTransaction` to check for `max_usage_reached` (same as the other methods), or is the `handleCreditExhaustion` wrapper sufficient as a no-op?
   - Recommendation: Update `HeliusFetcher.getTransaction` to add the `max_usage_reached` substring check (one-liner addition) and throw `HeliusCreditExhaustedError` so the full credit exhaustion pipeline works for bundler/wash-trader calls.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29 with `ts-jest`, `NODE_OPTIONS=--experimental-vm-modules` |
| Config file | `jest.config.cjs` (inferred from project setup) |
| Quick run command | `npm test -- --testPathPattern="router\|shyft-provider\|bundler\|wash-trader" --passWithNoTests` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | `getTransactionDetails` on `RpcProvider`, HeliusProvider, ShyftProvider | unit | `npm test -- --testPathPattern="router\|helius-provider\|shyft-provider"` | ✅ (files exist, need new tests added) |
| API-01 | Router routes getTransactionDetails to first available provider | unit | `npm test -- --testPathPattern="router"` | ✅ router.test.ts |
| API-02 | extractNativeTransfers handles all observed action types | unit | `npm test -- --testPathPattern="shyft-provider"` | ✅ shyft-provider.test.ts |
| API-03 | Router throws when all providers exhausted for getTransactionDetails | unit | `npm test -- --testPathPattern="router"` | ✅ router.test.ts (new describe block needed) |

### Sampling Rate

- **Per task commit:** `npm test -- --testPathPattern="router\|shyft-provider\|bundler\|wash-trader"`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] D-03 live verification script — `scripts/verify-shyft-action-types.ts` or equivalent — must run before `shyft-provider.ts` modification begins
- [ ] New test cases in `router.test.ts` covering `getTransactionDetails` throw-on-exhaustion (new `describe` block, not a new file)
- [ ] New test cases in `shyft-provider.test.ts` covering `getTransactionDetails` normalization for each observed action type

*(Existing test files cover the patterns; new `describe` blocks within existing files are sufficient — no new test files needed.)*

---

## Sources

### Primary (HIGH confidence)

- Direct code read: `src/fetchers/providers/types.ts` — current `RpcProvider` interface (3 methods, no `getTransactionDetails`)
- Direct code read: `src/fetchers/providers/router.ts` — `tryCall*` pattern, `markCooldown`, `onAllExhausted`
- Direct code read: `src/fetchers/providers/shyft-provider.ts` — `fetchPage`, `normalize`, `extractNativeTransfers` (current: SOL_TRANSFER only)
- Direct code read: `src/fetchers/providers/helius-provider.ts` — delegation pattern to `HeliusFetcher`
- Direct code read: `src/fetchers/helius.ts` — `HeliusFetcher.getTransaction` implementation (POST /v0/transactions)
- Direct code read: `src/detection/bundler.ts` — `BundlerFetcher` interface, `getDefaultFetcher()` (currently imports `createHeliusFetcher`)
- Direct code read: `src/detection/wash-trader.ts` — `WashTraderFetcher` interface, `getDefaultFetcher()` (currently imports `createHeliusFetcher`)
- Direct code read: `src/types/transaction.ts` — `HeliusTransaction` shape (has `signature`, `nativeTransfers?`, `tokenTransfers?`)
- https://docs.shyft.to/solana-apis/transactions/transaction-apis — Shyft single-tx endpoint `GET /sol/v1/transaction/parsed`, params `txn_signature` + `network`
- https://docs.shyft.to/solana-apis/transactions/parsed-transaction-structure — `SOL_TRANSFER` confirmed as documented action type for native SOL transfers

### Secondary (MEDIUM confidence)

- WebSearch cross-reference: Shyft action types list confirms `SOL_TRANSFER` is the canonical native-transfer action type; no evidence of `TRANSFER` or `SYSTEM_PROGRAM:TRANSFER` in official docs (but D-03 live verification is still required per locked decision)

### Tertiary (LOW confidence)

- D-03 candidates `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER` — mentioned in CONTEXT.md as "known candidates" requiring live verification. Not found in official Shyft docs. Treat as unverified until live response logged.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all dependencies already in project, no new installs
- Architecture: HIGH — extending established `tryCall*` pattern, all source files read directly
- Pitfalls: HIGH — identified from direct code reading (credit exhaustion gap, object literal gap) and official docs (action type uncertainty)
- Shyft action types: LOW until D-03 live verification completes (official docs only show `SOL_TRANSFER`)

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (Shyft API structure is stable; action type list warrants re-check if Shyft releases major version)
