# Phase 11: Helius RPC Provider Rotation - Research

**Researched:** 2026-03-26
**Domain:** Provider abstraction, failover routing, TypeScript interface design
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary**
Add a provider abstraction layer so all Helius API calls rotate to a fallback RPC provider when Helius fails persistently. Callers (MonitorLoop, discovery orchestrator) never see provider-level failures — they always get either data or a clean skip signal. Adding new provider UIs, metrics dashboards, or alert history are out of scope.

**Provider configuration**
- Support Helius + one alternative provider (Claude selects whichever has best Solana enhanced transaction support and closest API shape to Helius — QuickNode is the likely choice)
- Providers configured via config file (.env or JSON) — pick the approach consistent with existing config patterns
- Fallback provider is optional but the system warns at startup if none is configured; it still starts and runs with Helius-only behavior

**Rotation trigger**
- Rotate on **any persistent failure** after retries are exhausted: 429, 5xx, network timeouts, connection errors — not just rate limits
- Rotation is transparent to callers; they receive either data or a skip signal, never a provider error

**Test safety**
- The 184 currently passing tests must remain green after the refactor — test safety is a hard constraint on how invasive the HeliusFetcher change can be

### Claude's Discretion

- Rotation order (priority/failover vs round-robin) and per-call vs per-cycle granularity
- Whether failed providers have a cooldown period before retry
- When all providers are exhausted: skip just that wallet or the full cycle
- Whether to surface provider health in CLI, dashboard, or logs only
- Whether provider rotation events are persisted to DB or log-only
- Whether normalization lives inside the provider class or a separate adapter
- Whether the alternative provider must implement all three methods or can implement a subset
- Whether to reuse existing HeliusTransaction types or introduce provider-agnostic types
- Whether to wrap HeliusFetcher or refactor it into a provider class

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MNTR-03 | System rate-limits all Helius API calls (max 5 concurrent, exponential backoff on 429 responses) — this phase extends resilience by adding provider rotation when retries exhausted | Provider abstraction pattern wraps existing p-queue/p-retry; interface design enables transparent rotation; cooldown logic handles 429 windows relative to 30s cycle |
</phase_requirements>

---

## Summary

The codebase has a single `HeliusFetcher` class (`src/fetchers/helius.ts`) that is used in six callsites across the codebase: `MonitorLoop` (loop.ts), `importWalletHistory` (history.ts), and four detection/discovery modules (bundler, dev-wallet, wash-trader, graph-traverse, early-buyers). All detection/discovery modules already use **interface-based injection** — they define a minimal interface (e.g., `EarlySwapsFetcher`, `CoTraderFetcher`, `BundlerFetcher`) and accept the real fetcher only as a default. This is the dominant pattern and is exactly how provider abstraction should integrate: define a `RpcProvider` interface, wrap `HeliusFetcher` behind it, and swap implementations at the injection boundary.

The primary alternative provider is **Shyft** — not QuickNode. QuickNode does NOT offer an enhanced transaction API with pre-parsed swap events, tokenTransfers, or type-filtered wallet history. Shyft provides a parsed transaction history endpoint (`GET /sol/v1/transaction/history`) with actions-based response including token transfers and SOL transfers. The response shape differs from Helius (actions array vs flat tokenTransfers/nativeTransfers), so a normalization adapter is required. Alternatively, since Shyft's diff from Helius is non-trivial, the fallback provider can implement only `fetchSwapHistory` (the primary method used in MonitorLoop) and stub the others with a `ProviderCapabilityError`, giving the router a clean signal to skip or fall back further.

The rotation strategy should be **priority/failover** (not round-robin): always try Helius first, fall back to the configured alternative only when Helius exhausts retries. Per-call granularity is preferred over per-cycle because MonitorLoop already skips individual wallet failures — isolating failure at the call level preserves that existing isolation. A **cooldown of 60 seconds** on Helius after exhausted retries is justified: the 30s cycle interval means a single cycle will skip Helius, then re-try it next cycle when the 429 window is typically clear.

**Primary recommendation:** Wrap `HeliusFetcher` in a `HeliusProvider` class implementing a `RpcProvider` interface; add a `ProviderRouter` that holds the ordered provider list, owns cooldown state, and is injected into all callsites as the new single dependency. Normalization of Shyft responses lives inside `ShyftProvider`, not the router. Provider rotation events go to `console.log` only — log-only is consistent with how the existing `loop.ts` handles per-wallet failures, and adding a DB table for provider events is not warranted at this scale.

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-retry | 7.1.1 | Per-provider retry with exponential backoff | Already used in HeliusFetcher; `AbortError` signals exhaustion cleanly |
| p-queue | 9.1.0 | Concurrency cap per provider | Already used; each provider gets its own queue instance |
| axios | ^1.6.2 | HTTP client for provider requests | Already used; consistent with HeliusFetcher pattern |
| dotenv | ^16.3.1 | Environment config for API keys | Already used; `.env` is the established config pattern |

### No new dependencies required

All libraries needed for this phase are already in `package.json`. The provider abstraction is a pure TypeScript design problem — no new runtime dependencies.

**Installation:**
```bash
# No new packages — all dependencies already installed
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── fetchers/
│   ├── helius.ts              # Unchanged or minimal — wrapped in HeliusProvider
│   ├── providers/
│   │   ├── types.ts           # RpcProvider interface + ProviderTransaction type
│   │   ├── helius-provider.ts # HeliusProvider wraps HeliusFetcher
│   │   ├── shyft-provider.ts  # ShyftProvider with internal normalization
│   │   └── router.ts          # ProviderRouter — cooldown state, failover logic
│   └── index.ts               # createProviderRouter() factory, replaces createHeliusFetcher()
```

### Pattern 1: Provider Interface

**What:** A minimal TypeScript interface that mirrors the three methods callers actually use.
**When to use:** Define this first — all other files derive from it.

```typescript
// src/fetchers/providers/types.ts
// Source: derived from existing HeliusFetcher method signatures in src/fetchers/helius.ts

export interface RpcProvider {
  fetchSwapHistory(address: string, afterTimestamp: number): Promise<ProviderTransaction[]>;
  fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<ProviderTransaction[]>;
  fetchOnePage(address: string, limit: number): Promise<ProviderTransaction[]>;
}

// ProviderTransaction reuses HeliusTransaction to minimize churn.
// Since Helius is the canonical source and Shyft normalization happens inside ShyftProvider,
// callers never see Shyft types.
export type ProviderTransaction = HeliusTransaction; // re-export for clarity
```

**Why reuse `HeliusTransaction` rather than a new type:** The six existing callsites (MonitorLoop, detection modules) all consume `HeliusTransaction` fields (`timestamp`, `feePayer`, `type`, `tokenTransfers`, `events.swap`). Introducing a new type would require updating all six callsites. Since `ShyftProvider` normalizes internally, the interface output can remain `HeliusTransaction` with minimal churn.

### Pattern 2: HeliusProvider Wrapper (minimal regression risk)

**What:** Wrap existing `HeliusFetcher` without modifying it. The wrapper is the provider; `HeliusFetcher` is an internal implementation detail.
**When to use:** When test safety is a hard constraint (184 tests currently pass against `HeliusFetcher` directly).

```typescript
// src/fetchers/providers/helius-provider.ts
// Source: existing HeliusFetcher interface in src/fetchers/helius.ts

export class HeliusProvider implements RpcProvider {
  private fetcher: HeliusFetcher;

  constructor(fetcher: HeliusFetcher) {
    this.fetcher = fetcher;
  }

  fetchSwapHistory(address: string, afterTimestamp: number) {
    return this.fetcher.fetchSwapHistory(address, afterTimestamp);
  }

  fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc') {
    return this.fetcher.fetchEarlySwapsForMint(mint, limit, sortOrder);
  }

  fetchOnePage(address: string, limit: number) {
    return this.fetcher.fetchOnePage(address, limit);
  }
}
```

**Key constraint:** `HeliusFetcher` itself is not modified. All 184 tests that import `HeliusFetcher` or `createHeliusFetcher` continue to work unchanged.

### Pattern 3: ProviderRouter — Failover + Cooldown

**What:** Stateful class that holds an ordered list of providers and a cooldown map. On each call, tries providers in order, skipping those in cooldown. If all exhausted, returns empty array (skip signal) and sends Telegram alert.
**When to use:** This is the single class injected into MonitorLoop and discovery instead of `createHeliusFetcher()`.

```typescript
// src/fetchers/providers/router.ts
// Source: p-retry AbortError pattern from https://github.com/sindresorhus/p-retry

const COOLDOWN_MS = 60_000; // 60s — covers typical 429 window vs 30s cycle

export class ProviderRouter implements RpcProvider {
  private providers: RpcProvider[];
  private cooldownUntil: Map<number, number> = new Map();
  private onAllExhausted: () => void;

  constructor(providers: RpcProvider[], onAllExhausted: () => void) {
    this.providers = providers;
    this.onAllExhausted = onAllExhausted;
  }

  private isOnCooldown(index: number): boolean {
    const until = this.cooldownUntil.get(index);
    return until !== undefined && Date.now() < until;
  }

  private markCooldown(index: number): void {
    this.cooldownUntil.set(index, Date.now() + COOLDOWN_MS);
    console.log(`[provider] provider[${index}] on cooldown for ${COOLDOWN_MS / 1000}s`);
  }

  private async tryCall<T>(
    methodName: keyof RpcProvider,
    args: unknown[]
  ): Promise<T | null> {
    for (let i = 0; i < this.providers.length; i++) {
      if (this.isOnCooldown(i)) continue;

      try {
        // Each provider already has p-retry + p-queue internally
        const result = await (this.providers[i][methodName] as Function)(...args);
        return result as T;
      } catch (err) {
        console.log(`[provider] provider[${i}] failed on ${methodName}:`, err instanceof Error ? err.message : err);
        this.markCooldown(i);
        // Try next provider
      }
    }

    // All providers exhausted
    this.onAllExhausted();
    return null; // skip signal
  }

  async fetchSwapHistory(address: string, afterTimestamp: number): Promise<HeliusTransaction[]> {
    return (await this.tryCall<HeliusTransaction[]>('fetchSwapHistory', [address, afterTimestamp])) ?? [];
  }

  async fetchEarlySwapsForMint(mint: string, limit: number, sortOrder: 'asc' | 'desc'): Promise<HeliusTransaction[]> {
    return (await this.tryCall<HeliusTransaction[]>('fetchEarlySwapsForMint', [mint, limit, sortOrder])) ?? [];
  }

  async fetchOnePage(address: string, limit: number): Promise<HeliusTransaction[]> {
    return (await this.tryCall<HeliusTransaction[]>('fetchOnePage', [address, limit])) ?? [];
  }
}
```

**Skip granularity decision:** Return empty arrays (not throw) — callers already handle empty arrays as "no new swaps." MonitorLoop currently wraps each wallet in try/catch; empty array from `fetchSwapHistory` causes the wallet to be skipped silently (no swaps processed, `last_checked_at` still updated). This is the safest behavior that minimizes cycle disruption.

### Pattern 4: createProviderRouter Factory

**What:** Replaces `createHeliusFetcher()` as the single factory function called by callers.

```typescript
// src/fetchers/index.ts (or providers/index.ts)

export function createProviderRouter(): ProviderRouter {
  const heliusKey = process.env.HELIUS_API_KEY;
  if (!heliusKey) {
    throw new Error('HELIUS_API_KEY not found in environment variables');
  }

  const providers: RpcProvider[] = [
    new HeliusProvider(new HeliusFetcher(heliusKey)),
  ];

  const shyftKey = process.env.SHYFT_API_KEY;
  if (shyftKey) {
    providers.push(new ShyftProvider(shyftKey));
  } else {
    console.warn('[provider] SHYFT_API_KEY not set — running with Helius-only fallback');
  }

  const onAllExhausted = () => {
    console.error('[provider] ALL providers exhausted — skipping. Check API keys / rate limits.');
    sendProviderExhaustedAlert().catch(() => {});
  };

  return new ProviderRouter(providers, onAllExhausted);
}
```

### Pattern 5: Callsite Migration

**What:** Replace `createHeliusFetcher()` with `createProviderRouter()` at the 4 callsites that call it at runtime. Detection modules that use interface injection (bundler, wash-trader, dev-wallet) continue to work unchanged because their interfaces are a subset of `RpcProvider`.

**Callsites to update:**
1. `src/monitor/loop.ts` line 95: `createHeliusFetcher()` → `createProviderRouter()`
2. `src/importers/history.ts` line 20: `createHeliusFetcher()` → `createProviderRouter()`
3. `src/detection/bundler.ts` line 243: lazy import `createHeliusFetcher` → `createProviderRouter`
4. `src/detection/dev-wallet.ts` line 194: lazy import `createHeliusFetcher` → `createProviderRouter`

Discovery modules (`early-buyers.ts`, `graph-traverse.ts`) already use interface injection and accept any object matching `EarlySwapsFetcher` / `CoTraderFetcher`. `ProviderRouter` satisfies both interfaces because it implements `fetchEarlySwapsForMint` and `fetchOnePage`.

**`src/detection/wash-trader.ts`:** Uses `getTransaction(signature)` which is NOT on `RpcProvider` (it's a one-off method on `HeliusFetcher` for fetching by signature). This method is only used internally by the bundler and wash-trader detectors. It does NOT need to be on the provider interface. These detectors should continue to call `createHeliusFetcher()` directly (not the router) for `getTransaction`.

### Pattern 6: ShyftProvider Normalization

**What:** ShyftProvider calls Shyft's `GET /sol/v1/transaction/history` and normalizes the actions-based response into `HeliusTransaction` shape.

**Shyft's response differs from Helius:**
- Shyft uses `fee_payer` (snake_case) vs Helius `feePayer` (camelCase)
- Shyft uses an `actions` array vs Helius `tokenTransfers` and `events.swap`
- Shyft does not have a `type: 'SWAP'` field — type is determined from action type
- Shyft has `status` string vs Helius `success` boolean

**Normalization mapping (Shyft → HeliusTransaction):**
```typescript
// Inside ShyftProvider — never exposed to callers
function normalizeShyftTx(raw: ShyftTransaction): HeliusTransaction {
  return {
    signature: raw.signatures[0],
    slot: raw.slot ?? 0,
    timestamp: raw.timestamp,
    fee: raw.fee ?? 0,
    feePayer: raw.fee_payer,
    success: raw.status === 'Success',
    type: inferTypeFromActions(raw.actions), // 'SWAP' if any action is a swap
    source: 'SHYFT_NORMALIZED',
    tokenTransfers: extractTokenTransfers(raw.actions),
    nativeTransfers: extractNativeTransfers(raw.actions),
    events: undefined, // Shyft does not provide events.swap structure
  };
}
```

**Capability limitation:** Shyft does not provide `events.swap` (no `nativeInput`/`nativeOutput`/`innerSwaps`). The parsers in `src/parsers/swap.ts` that rely on `events.swap` will fall back to the `tokenTransfers` path. This is acceptable — the `parseSwaps` function already handles missing `events.swap`.

**Shyft API endpoint:** `GET https://api.shyft.to/sol/v1/transaction/history?account={address}&tx_num=100&network=mainnet-beta&enable_raw=false`

**Shyft authentication:** `x-api-key` header (not query param).

**Shyft's `sort-order` equivalent:** Use `before_tx_signature` for pagination (equivalent to Helius `before-signature`). No native `gte-time` — filter by timestamp in memory after fetch.

**Shyft `fetchEarlySwapsForMint`:** Shyft's history endpoint accepts any address (wallet or mint). Pass the mint address with `sort-by=block_time&sort-order=asc` to replicate Helius behavior.

### Anti-Patterns to Avoid

- **Modifying HeliusFetcher directly:** Refactoring HeliusFetcher's internals risks breaking the 184 passing tests. Wrap it instead.
- **Router-level p-retry:** Do not add another retry layer in the router. Each provider already handles its own retries. The router only acts after a provider's retries are exhausted (i.e., after p-retry throws).
- **Per-cycle rotation:** Rotating the entire provider at cycle boundaries means a single 429 locks Helius for a full cycle even if only one wallet triggered it. Per-call granularity with cooldown is more surgical.
- **Throwing from router when all providers exhausted:** Callers expect either data or empty arrays. Throwing would crash the wallet loop. Return empty arrays and let the Telegram alert handle operator notification.
- **Putting `getTransaction` on the RpcProvider interface:** Only bundler and wash-trader use it, via their own injected interface. It's a point-in-time signature lookup, not a streaming history method. Keep it out of the abstraction.
- **Round-robin rotation:** Equal-weight round-robin with two providers means Shyft receives 50% of all traffic even when Helius is healthy. Helius's enhanced parsing is more reliable for the `events.swap` field. Priority/failover is correct here.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-provider retry with backoff | Custom retry loop | p-retry 7.1.1 (already in project) | Already tested; `AbortError` signals exhaustion cleanly to the router |
| HTTP concurrency cap per provider | Custom semaphore | p-queue 9.1.0 (already in project) | Already in HeliusFetcher; each provider wraps its own queue |
| Cooldown timer | Custom clock-based state | Simple `Map<number, number>` with `Date.now()` | Cooldown is just a timestamp comparison; no library needed |
| Telegram alerts | Custom alert system | Existing `bot.api.sendMessage` via grammy | The bot infrastructure in `src/api/bot/` already handles this |

**Key insight:** This phase is almost entirely interface design + wiring. The hard parts (retry, concurrency, HTTP, alerts) are already solved by existing libraries.

---

## Common Pitfalls

### Pitfall 1: Breaking the 184 Passing Tests
**What goes wrong:** Modifying `HeliusFetcher` or `createHeliusFetcher` in place causes tests that mock or import these to fail.
**Why it happens:** Tests in `src/discovery/__tests__/` and `tests/unit/` directly import from `src/fetchers/helius.ts` or rely on the exported function signature.
**How to avoid:** Do NOT change `helius.ts`. Create new files in `src/fetchers/providers/`. Only change the callsites that call `createHeliusFetcher()`.
**Warning signs:** Any test file that imports `createHeliusFetcher` or `HeliusFetcher` will break if the export signature changes.

### Pitfall 2: Double-Retry (Router + Provider)
**What goes wrong:** The router adds its own p-retry wrapper around the provider call, causing up to 5×5 = 25 retries before rotating.
**Why it happens:** Developer copies retry pattern from HeliusFetcher without realizing providers already retry internally.
**How to avoid:** Router calls providers directly (no p-retry). Let the provider's exhausted-retries rejection propagate up to the router's catch block as the rotation signal.
**Warning signs:** 2+ minute delays before failover to Shyft.

### Pitfall 3: Shyft `gte-time` Gap
**What goes wrong:** `fetchSwapHistory` with `afterTimestamp > 0` works on Helius via `gte-time` query param, but Shyft has no equivalent. The ShyftProvider fetches full history and over-fetches.
**Why it happens:** Shyft's history API does not support server-side time filtering.
**How to avoid:** In `ShyftProvider.fetchSwapHistory`, fetch the most recent page(s) and filter by timestamp in memory after fetch. Cap at 3 pages (300 txs) to avoid excessive calls for wallets with high history.
**Warning signs:** Slow Shyft responses on wallets with long history.

### Pitfall 4: Shyft Empty `events.swap`
**What goes wrong:** Parsers that rely on `events.swap.nativeInput` fail on Shyft-normalized transactions because Shyft doesn't provide this field.
**Why it happens:** The swap parser in `src/parsers/swap.ts` has multiple parse paths — some use `events.swap`, others use `tokenTransfers`.
**How to avoid:** Verify that `parseSwaps` has a `tokenTransfers`-only fallback path before relying on Shyft data. Set `events: undefined` on normalized Shyft transactions to force the fallback path explicitly.
**Warning signs:** Parse errors on Shyft-normalized transactions for Jupiter/Raydium swaps.

### Pitfall 5: Cooldown Not Reset After Recovery
**What goes wrong:** After a 429, Helius goes on cooldown. It recovers, but the cooldown map still shows it as unavailable, causing permanent Shyft-only operation.
**Why it happens:** Cooldown is time-based — it expires naturally at `COOLDOWN_MS`. If the cooldown is set correctly (60s), this self-heals in one cycle.
**How to avoid:** Use a timestamp-comparison cooldown (not a boolean flag). `Date.now() >= cooldownUntil[i]` auto-clears.
**Warning signs:** Logs showing `provider[0] on cooldown` for more than 2 minutes after a single 429.

### Pitfall 6: `getTransaction` Not on Provider Interface
**What goes wrong:** Bundler and wash-trader detectors call `fetcher.getTransaction(signature)`. If their lazy import is changed to `createProviderRouter`, they get a `TypeError: fetcher.getTransaction is not a function`.
**Why it happens:** `getTransaction` is a `HeliusFetcher`-specific method not included in `RpcProvider`.
**How to avoid:** Leave bundler and wash-trader's lazy imports pointing at `createHeliusFetcher()`. Only migrate the 4 callsites that use `fetchSwapHistory`, `fetchEarlySwapsForMint`, or `fetchOnePage`.
**Warning signs:** Runtime error in `detectBundler` or `detectWashTrader` after migration.

---

## Code Examples

### p-retry AbortError — Provider Exhaustion Signal

```typescript
// Source: https://github.com/sindresorhus/p-retry (verified)
import pRetry, { AbortError } from 'p-retry';

// Inside a provider's method — throw AbortError to stop retrying on 401
const txs = await pRetry(
  () => heliusQueue.add(async () => { /* ... */ }),
  {
    retries: 5,
    onFailedAttempt: async (error) => {
      const status = (error as any).response?.status;
      if (status === 401) throw new AbortError('Auth failed — do not retry');
      // For 429/5xx, p-retry will retry with default exponential backoff
    },
  }
);
// When retries exhausted: p-retry throws the final error
// Router's catch block receives this and marks the provider on cooldown
```

### Shyft API Request Pattern

```typescript
// Source: https://docs.shyft.to/solana-apis/transactions (verified structure)
// Shyft uses x-api-key header, not query param like Helius

const res = await axios.get('https://api.shyft.to/sol/v1/transaction/history', {
  params: {
    account: address,
    tx_num: 100,
    network: 'mainnet-beta',
    enable_raw: false,
    before_tx_signature: cursor, // pagination
  },
  headers: {
    'x-api-key': this.apiKey,
  },
  timeout: 30000,
});
// res.data.result is the array of parsed transactions
```

### Telegram Alert for Provider Exhaustion

```typescript
// Source: existing pattern in src/api/bot/alerts.ts and src/api/bot/index.ts
// Use the existing botInstance rather than creating a new bot

import { botInstance } from '../api/bot/index.js';

export async function sendProviderExhaustedAlert(): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botInstance || !chatId) {
    console.warn('[provider] Telegram not configured — skipping alert');
    return;
  }
  await botInstance.api.sendMessage(
    chatId,
    '<b>PROVIDER ALERT</b>\nAll RPC providers exhausted. Wallet cycles are being skipped.\nCheck HELIUS_API_KEY and SHYFT_API_KEY.',
    { parse_mode: 'HTML' }
  );
}
```

### .env additions

```bash
# Fallback RPC provider (optional — system warns at startup if not set)
SHYFT_API_KEY=your_shyft_api_key_here
```

### Provider health in logs only

```typescript
// Router logs provider state changes — no DB, no CLI surface
// Consistent with how loop.ts logs per-wallet failures:
//   console.error(`[monitor] failed to process ${wallet.address}:`, ...)

console.log(`[provider] rotating from provider[0] (Helius) to provider[1] (Shyft) — cooldown 60s`);
console.error('[provider] ALL providers exhausted — returning empty result for this call');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single HeliusFetcher, no fallback | ProviderRouter with priority failover | Phase 11 | Survives Helius 429 outages |
| `createHeliusFetcher()` at callsites | `createProviderRouter()` factory | Phase 11 | Single injection point for all providers |
| Per-provider retry only | Per-provider retry + cross-provider cooldown | Phase 11 | Rotation happens after retries exhaust, not on first error |

**Provider selection rationale:**
- QuickNode was the initial hypothesis, but it does NOT offer enhanced transaction parsing with pre-parsed `tokenTransfers`, `events.swap`, or wallet-history type filtering. It only provides standard Solana JSON-RPC methods (`getParsedTransaction`, `getSignaturesForAddress`). Using QuickNode would require building a full transaction parser — out of scope.
- Shyft provides a parsed transaction history endpoint with action-level data including token transfers and SOL transfers. The response shape differs from Helius but is normalizable to `HeliusTransaction`. Shyft is the closest available alternative.
- Helius remains the primary provider. Shyft is used only on failover.

---

## Open Questions

1. **Shyft `fetchEarlySwapsForMint` sort-order support**
   - What we know: Shyft's history API accepts `sort-order` param (`asc`/`desc`) per their docs
   - What's unclear: Whether passing a mint address (not a wallet) works as expected for token swap history
   - Recommendation: Implement and test with a real mint address during Wave 0 before relying on it; if unreliable, stub `fetchEarlySwapsForMint` to return empty array with a log warning

2. **`parseSwaps` fallback path coverage**
   - What we know: `src/parsers/swap.ts` has multiple parse paths; Shyft lacks `events.swap`
   - What's unclear: Whether all DEX types (Raydium, Jupiter, Pump.fun, Orca, Meteora) have working `tokenTransfers`-only parse paths
   - Recommendation: Add a unit test for `parseSwaps` with a Shyft-normalized transaction (no `events`) to confirm fallback before ShyftProvider is live

3. **`botInstance` availability at provider creation time**
   - What we know: `startBot()` in `src/api/bot/index.ts` sets `botInstance`; `createProviderRouter()` runs at MonitorLoop startup
   - What's unclear: Whether `botInstance` is set before `createProviderRouter()` is first called
   - Recommendation: `sendProviderExhaustedAlert` should read `botInstance` lazily (at call time, not at factory time) — this is already how `alerts.ts` works

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest ESM preset |
| Config file | `jest.config.cjs` |
| Quick run command | `pnpm test -- --testPathPattern="fetchers"` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MNTR-03 | ProviderRouter rotates to Shyft when Helius exhausts retries | unit | `pnpm test -- --testPathPattern="provider-router"` | ❌ Wave 0 |
| MNTR-03 | ProviderRouter returns empty array when all providers exhausted | unit | `pnpm test -- --testPathPattern="provider-router"` | ❌ Wave 0 |
| MNTR-03 | ProviderRouter respects 60s cooldown (Helius not retried during cooldown) | unit | `pnpm test -- --testPathPattern="provider-router"` | ❌ Wave 0 |
| MNTR-03 | HeliusProvider delegates to HeliusFetcher without modification | unit | `pnpm test -- --testPathPattern="helius-provider"` | ❌ Wave 0 |
| MNTR-03 | ShyftProvider normalizes response to HeliusTransaction shape | unit | `pnpm test -- --testPathPattern="shyft-provider"` | ❌ Wave 0 |
| MNTR-03 | MonitorLoop receives empty array (not throw) when all providers exhausted | unit | `pnpm test -- --testPathPattern="loop"` | ✅ (existing, extend) |
| MNTR-03 | All 184 existing tests remain green after callsite migration | regression | `pnpm test` | ✅ |

### Sampling Rate
- **Per task commit:** `pnpm test -- --testPathPattern="provider-router|helius-provider|shyft-provider"`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green (184+ tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/fetchers/providers/__tests__/router.test.ts` — covers MNTR-03 router behavior (rotate, cooldown, exhaustion)
- [ ] `src/fetchers/providers/__tests__/helius-provider.test.ts` — covers HeliusProvider delegation
- [ ] `src/fetchers/providers/__tests__/shyft-provider.test.ts` — covers Shyft normalization (no real API call, mock axios)

---

## Sources

### Primary (HIGH confidence)
- Helius API docs (`https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress`) — confirmed `gte-time`, `sort-order`, `before-signature` parameters and full response shape including `events.swap`, `tokenTransfers`, `nativeTransfers`, `feePayer`, `type`
- p-retry GitHub (`https://github.com/sindresorhus/p-retry`) — confirmed `AbortError`, `onFailedAttempt` callback signature, `shouldRetry` option, exhaustion behavior
- Project source (`src/fetchers/helius.ts`) — confirmed `HeliusFetcher` methods, p-queue/p-retry usage, existing test interfaces
- Project source (`src/discovery/early-buyers.ts`, `graph-traverse.ts`) — confirmed interface-injection pattern used by callers

### Secondary (MEDIUM confidence)
- Shyft docs (`https://docs.shyft.to/solana-apis/transactions/parsed-transaction-structure`) — confirmed actions-based response structure, `fee_payer` field, `status` field; API endpoint verified
- Shyft blog (`https://blogs.shyft.to/how-to-get-decoded-solana-transactions-d73d57ef5b66`) — confirmed `x-api-key` header authentication pattern

### Tertiary (LOW confidence — flagged)
- QuickNode non-support of enhanced transactions: inferred from QuickNode API overview page which lists only JSON-RPC methods, no enhanced parsing endpoint. Not negatively confirmed by official statement — could check QuickNode Marketplace add-ons for a custom add-on that provides Helius-like parsing.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing dependencies verified in package.json
- Architecture: HIGH — directly derived from codebase analysis (6 callsites audited, interface patterns confirmed)
- Pitfalls: HIGH for test-safety and double-retry; MEDIUM for Shyft normalization gaps (needs empirical confirmation)
- Provider selection (Shyft over QuickNode): MEDIUM — QuickNode non-support inferred from docs review, not explicit negative statement

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (Helius/Shyft API shapes are stable; p-retry API is stable)
