# Phase 16: ProviderRouter Extension - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 7 modified files
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/fetchers/providers/types.ts` | interface/type | N/A | `src/fetchers/providers/types.ts` (self — extend) | self |
| `src/fetchers/providers/router.ts` | router/middleware | request-response | `src/fetchers/providers/router.ts` existing `tryCall*` methods | self-extend |
| `src/fetchers/providers/helius-provider.ts` | provider/service | request-response | `src/fetchers/providers/helius-provider.ts` existing delegators | self-extend |
| `src/fetchers/providers/shyft-provider.ts` | provider/service | request-response | `src/fetchers/providers/shyft-provider.ts` existing `fetchPage` + `normalize` | self-extend |
| `src/fetchers/providers/index.ts` | factory/config | N/A | `src/fetchers/providers/index.ts` `heliusProviderWrapped` object | self-extend |
| `src/detection/bundler.ts` | service/detector | request-response | `src/detection/wash-trader.ts` `getDefaultFetcher()` | exact |
| `src/detection/wash-trader.ts` | service/detector | request-response | `src/detection/bundler.ts` `getDefaultFetcher()` | exact |

---

## Pattern Assignments

### `src/fetchers/providers/types.ts` (interface, N/A)

**Change:** Add `getTransactionDetails` to `RpcProvider` interface.

**Current state** (`src/fetchers/providers/types.ts` lines 1–21):
```typescript
import type { HeliusTransaction } from '../../types/index.js';

export type ProviderTransaction = HeliusTransaction;

export interface RpcProvider {
  fetchSwapHistory(address: string, afterTimestamp: number): Promise<ProviderTransaction[]>;
  fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<ProviderTransaction[]>;
  fetchOnePage(address: string, limit: number): Promise<ProviderTransaction[]>;
}
```

**Add this method signature** (new line after `fetchOnePage`):
```typescript
getTransactionDetails(signature: string): Promise<ProviderTransaction>;
```

**Why `ProviderTransaction`:** `ProviderTransaction = HeliusTransaction`, which carries `signature`, `nativeTransfers?`, and `tokenTransfers?` — all fields required by both `BundlerFetcher.getTransaction` and `WashTraderFetcher.getTransaction`. No new type needed.

**Compile-time safety net:** Once this is added, TypeScript will error on `heliusProviderWrapped` in `index.ts` and on both provider classes until they are updated — this is the intended forcing function.

---

### `src/fetchers/providers/router.ts` (router, request-response)

**Analog:** `src/fetchers/providers/router.ts` — existing `tryCallSwapHistory` / `tryCallOnePage` pattern (lines 29–98)

**Core tryCall pattern to copy** (`router.ts` lines 29–45 — `tryCallSwapHistory` as template):
```typescript
private async tryCallSwapHistory(
  address: string,
  afterTimestamp: number
): Promise<HeliusTransaction[] | null> {
  for (let i = 0; i < this.providers.length; i++) {
    if (this.isOnCooldown(i)) continue;
    try {
      return await this.providers[i].fetchSwapHistory(address, afterTimestamp);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.markCooldown(i, 'fetchSwapHistory', reason);
    }
  }
  console.error('[provider] ALL providers exhausted — returning empty result');
  this.onAllExhausted();
  return null;
}
```

**New method diverges in two ways:**
1. Return type is `Promise<ProviderTransaction>` (not `| null`) — no null coalescing on public method
2. After exhaustion: throws instead of returning null

**New private + public method pair to add** (after `tryCallOnePage` at line 82):
```typescript
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

**Key difference from existing methods:** The public method uses direct `return` (not `?? []`). The throw propagates to callers. Do NOT add null coalescing here.

**markCooldown / isOnCooldown pattern** (`router.ts` lines 17–27 — already present, no change needed):
```typescript
private isOnCooldown(index: number): boolean {
  const until = this.cooldownUntil.get(index);
  return until !== undefined && Date.now() < until;
}

private markCooldown(index: number, methodName: string, reason: string): void {
  this.cooldownUntil.set(index, Date.now() + COOLDOWN_MS);
  this.lastError.set(index, reason);
  console.log(`[provider] provider[${index}] failed on ${methodName}: ${reason}`);
  console.log(`[provider] provider[${index}] on cooldown for ${COOLDOWN_MS / 1000}s`);
}
```

---

### `src/fetchers/providers/helius-provider.ts` (provider, request-response)

**Analog:** `src/fetchers/providers/helius-provider.ts` — existing delegator methods (lines 11–21)

**Delegation pattern to copy** (lines 11–21):
```typescript
fetchSwapHistory(address: string, afterTimestamp: number): Promise<ProviderTransaction[]> {
  return this.fetcher.fetchSwapHistory(address, afterTimestamp);
}

fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<ProviderTransaction[]> {
  return this.fetcher.fetchEarlySwapsForMint(mint, limit, sortOrder);
}

fetchOnePage(address: string, limit: number): Promise<ProviderTransaction[]> {
  return this.fetcher.fetchOnePage(address, limit);
}
```

**New method to add** (same delegation style):
```typescript
getTransactionDetails(signature: string): Promise<ProviderTransaction> {
  return this.fetcher.getTransaction(signature);
}
```

**Note on `HeliusFetcher.getTransaction`** (`src/fetchers/helius.ts` lines 247–268): This method wraps all errors generically (`throw new Error(...)`) and does NOT throw `HeliusCreditExhaustedError`. The `handleCreditExhaustion` wrapper in `index.ts` is where credit detection must happen. Optionally, add `max_usage_reached` substring check to `helius.ts` lines 263–265 (same pattern as lines 78–79 and 141–142 in helius.ts) — but this is handled in `index.ts` wrapping.

---

### `src/fetchers/providers/shyft-provider.ts` (provider, request-response)

**Analog:** `src/fetchers/providers/shyft-provider.ts` — `fetchPage` (lines 42–63) and `normalize` / `extractNativeTransfers` (lines 102–155)

**fetchPage pattern to copy for new `fetchSingleTx`** (lines 42–63):
```typescript
private async fetchPage(account: string, params: Record<string, unknown>): Promise<ShyftRawTx[]> {
  return pRetry(
    () => shyftQueue.add(async () => {
      const res = await this.client.get('/sol/v1/transaction/history', {
        params: { account, network: 'mainnet-beta', enable_raw: false, ...params },
        headers: { 'x-api-key': this.apiKey },
      });
      return (res?.data?.result ?? []) as ShyftRawTx[];
    }),
    {
      retries: 3,
      onFailedAttempt: async (error) => {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401) throw error; // never retry auth failures
        if (status === 429) {
          const delayMs = Math.pow(2, error.attemptNumber) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      },
    }
  ) as Promise<ShyftRawTx[]>;
}
```

**New single-tx method** (copy the pRetry/shyftQueue structure, change endpoint and return type):
```typescript
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

**normalize method** (lines 102–118, unchanged — reuse directly via `this.normalize(raw)`):
```typescript
private normalize(raw: ShyftRawTx): ProviderTransaction {
  return {
    signature: raw.signatures?.[0] ?? '',
    slot: raw.slot ?? 0,
    timestamp: raw.timestamp,
    fee: raw.fee ?? 0,
    feePayer: raw.fee_payer ?? '',
    success: raw.status === 'Success',
    type: (raw.actions ?? []).some(a => a.type === 'SWAP' || a.type === 'TOKEN_SWAP')
      ? 'SWAP'
      : (raw.type ?? 'UNKNOWN'),
    source: 'SHYFT_NORMALIZED',
    tokenTransfers: this.extractTokenTransfers(raw.actions ?? []),
    nativeTransfers: this.extractNativeTransfers(raw.actions ?? []),
    events: undefined,
  };
}
```

**extractNativeTransfers — current state** (lines 140–155, MUST extend after D-03 verification):
```typescript
private extractNativeTransfers(actions: ShyftAction[]): HeliusNativeTransfer[] {
  const transfers: HeliusNativeTransfer[] = [];
  for (const action of actions) {
    if (action.type === 'SOL_TRANSFER') {  // <-- extend this condition after D-03
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

After D-03 live verification, extend the type guard. Pattern:
```typescript
if (action.type === 'SOL_TRANSFER' || action.type === 'TRANSFER' || action.type === 'SYSTEM_PROGRAM:TRANSFER') {
  // ... same body
}
```
The exact set of types is gated on D-03 — do not finalize until live response is logged.

---

### `src/fetchers/providers/index.ts` (factory/config, N/A)

**Analog:** `src/fetchers/providers/index.ts` — `heliusProviderWrapped` object literal (lines 88–104) and `handleCreditExhaustion` wrapper (lines 65–81)

**heliusProviderWrapped pattern to extend** (lines 88–104):
```typescript
const heliusProviderWrapped: RpcProvider = {
  fetchSwapHistory: (address, afterTimestamp) =>
    handleCreditExhaustion(
      () => heliusProvider.fetchSwapHistory(address, afterTimestamp),
      heliusFetcher
    ),
  fetchEarlySwapsForMint: (mint, limit, sortOrder) =>
    handleCreditExhaustion(
      () => heliusProvider.fetchEarlySwapsForMint(mint, limit, sortOrder),
      heliusFetcher
    ),
  fetchOnePage: (address, limit) =>
    handleCreditExhaustion(
      () => heliusProvider.fetchOnePage(address, limit),
      heliusFetcher
    ),
  // ADD:
  getTransactionDetails: (signature) =>
    handleCreditExhaustion(
      () => heliusProvider.getTransactionDetails(signature),
      heliusFetcher
    ),
};
```

**handleCreditExhaustion wrapper** (lines 65–81, already present — reuse same wrapper):
```typescript
async function handleCreditExhaustion<T>(
  fn: () => Promise<T>,
  heliusFetcher: HeliusFetcher
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HeliusCreditExhaustedError) {
      console.warn('[provider] Helius credit exhaustion detected — pausing monitor loop');
      const { monitorLoop } = await import('../../commands/wallet.js');
      monitorLoop.pause();
      startCreditExhaustionProbe(heliusFetcher);
    }
    throw err;
  }
}
```

**Add singleton export** (after `createProviderRouter()`, new line at bottom of module before re-exports):
```typescript
export const sharedProviderRouter: ProviderRouter = createProviderRouter();
```

This mirrors the module-level singleton pattern already used in the project (e.g., `monitorLoop`). The router is stateful (cooldown maps) so a singleton is correct — each import call gets the same instance.

---

### `src/detection/bundler.ts` (service/detector, request-response)

**Analog:** `src/detection/wash-trader.ts` lines 242–245 (identical pattern)

**Current `getDefaultFetcher`** (`bundler.ts` lines 242–245):
```typescript
async function getDefaultFetcher(): Promise<BundlerFetcher> {
  const { createHeliusFetcher } = await import('../fetchers/helius.js');
  return createHeliusFetcher();
}
```

**Replace with:**
```typescript
async function getDefaultFetcher(): Promise<BundlerFetcher> {
  const { sharedProviderRouter } = await import('../fetchers/providers/index.js');
  return sharedProviderRouter as unknown as BundlerFetcher;
}
```

**Why `as unknown as BundlerFetcher` is safe:** `ProviderRouter.getTransactionDetails(signature)` returns `Promise<ProviderTransaction>` which structurally satisfies `BundlerFetcher.getTransaction` return shape (`{ signature, nativeTransfers? }`). TypeScript structural typing accepts this cast. The method is exposed as `getTransactionDetails` on the router but the interface calls it `getTransaction` — the `as unknown` cast bridges the name mismatch.

**BundlerFetcher interface** (lines 36–45, unchanged per D-05):
```typescript
export interface BundlerFetcher {
  getTransaction: (signature: string) => Promise<{
    signature: string;
    nativeTransfers?: Array<{
      fromUserAccount: string;
      toUserAccount: string;
      amount: number;
    }>;
  }>;
}
```

**Do not modify.** The cast in `getDefaultFetcher` handles the name difference structurally.

---

### `src/detection/wash-trader.ts` (service/detector, request-response)

**Analog:** `src/detection/bundler.ts` lines 242–245 (identical pattern)

**Current `getDefaultFetcher`** (`wash-trader.ts` lines 242–245):
```typescript
async function getDefaultFetcher(): Promise<WashTraderFetcher> {
  const { createHeliusFetcher } = await import('../fetchers/helius.js');
  return createHeliusFetcher() as unknown as WashTraderFetcher;
}
```

**Replace with:**
```typescript
async function getDefaultFetcher(): Promise<WashTraderFetcher> {
  const { sharedProviderRouter } = await import('../fetchers/providers/index.js');
  return sharedProviderRouter as unknown as WashTraderFetcher;
}
```

**WashTraderFetcher interface** (lines 41–56, unchanged per D-05):
```typescript
export interface WashTraderFetcher {
  getTransaction: (signature: string) => Promise<{
    signature: string;
    tokenTransfers?: Array<{
      mint: string;
      fromUserAccount: string;
      toUserAccount: string;
      tokenAmount: number;
    }>;
    nativeTransfers?: Array<{
      fromUserAccount: string;
      toUserAccount: string;
      amount: number;
    }>;
  }>;
}
```

**Do not modify.** `ProviderTransaction` has all these fields.

---

## Shared Patterns

### tryCall* Method Structure
**Source:** `src/fetchers/providers/router.ts` lines 29–82
**Apply to:** New `tryCallGetTransactionDetails` in router
```typescript
// Template: loop → skip-cooldown → try → catch+markCooldown → exhaustion
for (let i = 0; i < this.providers.length; i++) {
  if (this.isOnCooldown(i)) continue;
  try {
    return await this.providers[i].METHOD(args);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    this.markCooldown(i, 'METHOD_NAME', reason);
  }
}
// Existing methods: this.onAllExhausted(); return null;
// New method:       this.onAllExhausted(); throw new Error(...);
```

### handleCreditExhaustion Wrapper
**Source:** `src/fetchers/providers/index.ts` lines 65–81
**Apply to:** `getTransactionDetails` entry in `heliusProviderWrapped` object literal
The wrapper is a generic `<T>` function — reuse exactly. Any new method on `heliusProviderWrapped` must be wrapped here or credit exhaustion from that method will not pause the monitor loop.

### pRetry + PQueue for Shyft HTTP
**Source:** `src/fetchers/providers/shyft-provider.ts` lines 42–63 (`fetchPage`)
**Apply to:** New `fetchSingleTx` private method in ShyftProvider
Copy the full `pRetry` wrapping: `shyftQueue.add(...)` inside the factory, `retries: 3`, `onFailedAttempt` checking `status === 401` (never retry) and `status === 429` (exponential backoff).

### Lazy Dynamic Import in getDefaultFetcher
**Source:** `src/detection/bundler.ts` lines 237–244 and `src/detection/wash-trader.ts` lines 237–244
**Apply to:** Both updated `getDefaultFetcher()` functions
Pattern: `const { sharedProviderRouter } = await import('../fetchers/providers/index.js')` inside the async function — never a top-level import, to avoid test side effects.

---

## Test Pattern Assignments

### `src/fetchers/providers/__tests__/router.test.ts` (extend existing, no new file)

**Analog:** `router.test.ts` lines 170–197 (existing `All exhausted` describe block)

**makeProvider helper must be extended** (lines 26–48) to include `getTransactionDetails`:
```typescript
function makeProvider(results: {
  fetchSwapHistory?: HeliusTransaction[] | Error;
  fetchEarlySwapsForMint?: HeliusTransaction[] | Error;
  fetchOnePage?: HeliusTransaction[] | Error;
  getTransactionDetails?: HeliusTransaction | Error;  // ADD
}): RpcProvider {
  return {
    // ... existing methods ...
    getTransactionDetails: async (_signature: string) => {
      const r = results.getTransactionDetails ?? makeTx('default-sig');
      if (r instanceof Error) throw r;
      return r;
    },
  };
}
```

**New `describe` block pattern** (copy structure from `All exhausted` block, lines 170–197):
```typescript
describe('getTransactionDetails', () => {
  it('returns provider[0] result on success', async () => { ... });
  it('falls through to provider[1] when provider[0] throws', async () => { ... });
  it('throws (not returns []) when all providers exhausted', async () => {
    const p0 = makeProvider({ getTransactionDetails: new Error('fail') });
    const p1 = makeProvider({ getTransactionDetails: new Error('fail') });
    const router = new ProviderRouter([p0, p1], onAllExhausted);
    await expect(router.getTransactionDetails('sig-x')).rejects.toThrow();
    expect(exhaustedCallCount).toBe(1);
  });
});
```

### `src/fetchers/providers/__tests__/shyft-provider.test.ts` (extend existing, no new file)

**Analog:** Existing test structure with injected `makeAxiosInstance` (lines 59–78)

**New describe block for `getTransactionDetails`** should test:
1. Single-tx endpoint URL is `/sol/v1/transaction/parsed` (not `/sol/v1/transaction/history`)
2. `txn_signature` query param is passed (not `account`)
3. Normalization output has correct shape
4. `extractNativeTransfers` handles each verified action type from D-03

---

## No Analog Found

None — all 7 files have clear analogs within the same codebase.

---

## Hard Gate: D-03 Live Verification

Before writing `extractNativeTransfers` extension code, a script must fetch a live Shyft response for a known bundled transaction and log `actions[].type` values. The plan must include this as Wave 0. Suggested path: `scripts/verify-shyft-action-types.ts` or an inline `curl` command.

Known candidates from CONTEXT.md: `SOL_TRANSFER`, `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER`. Only implement the ones observed in the live response.

---

## Metadata

**Analog search scope:** `src/fetchers/providers/`, `src/detection/`, `src/fetchers/helius.ts`
**Files scanned:** 7 source files + 2 test files
**Pattern extraction date:** 2026-04-19
