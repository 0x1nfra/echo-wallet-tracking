# Phase 2: Transaction Parsing - Research

**Researched:** 2026-03-11
**Domain:** Helius Enhanced Transaction API, DEX swap parsing, FIFO cost basis, history pagination
**Confidence:** MEDIUM-HIGH (Helius API verified; DEX source enum coverage for Pump.fun/Meteora is LOW — see Open Questions)

## Summary

Phase 2 converts Helius enhanced transaction API responses into normalized `Swap` rows in the `swaps` table for five DEXes: Pump.fun, Raydium, Jupiter, Orca, and Meteora. This phase also implements paginated history import (default 180 days, opt-in full history), a `parse_errors` table for failed parses, and FIFO cost basis tracking to produce `cost_basis_sol` and `realized_pnl_sol` on each swap row.

The Helius REST endpoint `GET /v0/addresses/{address}/transactions` is the primary data source. It supports `type=SWAP`, time-range filters (`gte-time`/`lte-time` as Unix timestamps), and backward cursor pagination via `before-signature`. Each page returns up to 100 enhanced transactions. The free tier provides 1M credits/month with a 2 req/s rate limit on Enhanced APIs — the planner must keep pagination conservative.

**Critical discovery:** Pump.fun launched PumpSwap (program `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`) in March 2025, replacing Raydium as the graduation destination for bonding-curve tokens. The original Pump.fun bonding curve program (`6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`) still handles new token launches. Both programs must be parsed under the `pump.fun` DEX label. Raydium itself has three active pool types (AMM v4, CPMM, CLMM) with distinct program IDs — all three must be recognized.

**An existing test file** (`tests/unit/parsers.test.ts`) already defines the expected interface: a `parseSwaps(txs, walletAddress)` function exported from `src/parsers/swap.ts`, and a `DEX_PROGRAM_IDS` constant exported from `src/types/transaction.ts`. Implementation must match this contract.

**Primary recommendation:** Build a `src/parsers/swap.ts` module with a typed `parseSwaps` function that uses the Helius `events.swap` structure plus program ID matching from `instructions` for DEX identification. Use a `Map<tokenMint, BuyLot[]>` for FIFO tracking. Keep the Helius fetcher rate-limited via `p-queue` at 2 req/s.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase boundary**
- Convert raw Helius enhanced transaction API responses into normalized `Swap` objects for Pump.fun, Raydium, Jupiter, Orca, and Meteora only
- Covers full history import with pagination, FIFO cost basis tracking, and realized PnL per closed position
- Detection, scoring, and monitoring are separate phases

**Parse error handling**
- When a transaction from a known DEX fails to parse, skip it silently and write to a `parse_errors` table (signature + error message + dex + timestamp only — no raw payload storage)
- High parse-failure rate on a wallet does NOT affect wallet processing — failures are invisible to the normal flow
- No console noise from parse errors during normal operation

**History import behavior**
- Default import window: **180 days** back from wallet-add time
- `--full-history` flag available at wallet-add time for wallets where complete cost basis matters — opt-in per wallet to control Helius credit spend
- Wallets with history import in progress are **visible in wallet list** with an "importing" status — not hidden until complete
- Resume/restart behavior on interruption: Claude's discretion (pick whichever is simpler to implement correctly)
- Background vs. foreground import behavior: Claude's discretion (design around monitoring loop architecture)

**FIFO cost basis**
- Position identity is **token mint address** — buy on Pump.fun and sell on Raydium for the same token = same position
- FIFO only — always match oldest buy lot first; no average cost fallback
- Orphaned sells (no buy found — outside window, or received from another wallet): **exclude from PnL and win rate entirely** — incomplete data is not counted as a win or a loss
- Multi-walling pattern (receive token, sell only) produces incomplete cost basis — those sells are silently excluded from metrics

**Unknown DEX / protocol handling**
- Transactions from protocols outside the 5 supported DEXes: **skip silently** — no logging, no storage
- Unknown protocol transactions don't count against parse error metrics
- Buying on Pump.fun and selling on Raydium (graduation path): same token, same position — DEX-agnostic tracking by mint address

### Claude's Discretion
- Background vs. foreground import implementation detail (design to fit monitoring loop)
- Interruption/resume strategy for history import (simplest correct implementation)
- Exact `parse_errors` table schema beyond the four required fields
- Compression/batching of Helius pagination calls to minimize credit usage

### Deferred Ideas (OUT OF SCOPE)
- Support for additional DEX protocols (Phoenix, Lifinity, OpenBook) — low priority, revisit if wallets show significant activity on these
- Automatic credit usage tracking / alerting when Helius free tier is near exhaustion — monitoring phase or future phase
- Multi-wallet position tracking (aggregate positions across wallets the user controls) — architectural complexity, out of scope for v1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PARS-01 | System normalizes Helius enhanced transactions into Swap objects for Pump.fun, Raydium, Jupiter, Orca, and Meteora | DEX program ID registry + `events.swap` extraction pattern verified from Helius docs; existing `parsers.test.ts` defines required interface |
| PARS-02 | System fetches and paginates full transaction history on first wallet import before calculating any metrics | Helius `GET /v0/addresses/{address}/transactions` with `before-signature` cursor and `gte-time` filter confirmed; `history_complete` flag in wallets schema confirmed in Phase 1 |
| PARS-03 | System uses FIFO cost basis to track positions and calculate realized PnL per closed trade | FIFO via `Map<tokenMint, BuyLot[]>` queue; realized PnL = `(sellPricePerToken - buyPricePerToken) * matchedTokenAmount`; `cost_basis_sol` and `realized_pnl_sol` columns exist in swaps schema from Phase 1 |
</phase_requirements>

---

## Standard Stack

### Core (already installed — Phase 1)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| better-sqlite3 | ^12.6.2 | Synchronous SQLite driver | All swap inserts happen synchronously; no async/await needed in DB layer |
| drizzle-orm | ^0.45.1 | ORM — query builder and insert | Type-safe insert for `swaps` and `parse_errors` tables |
| axios | ^1.6.2 | HTTP client for Helius API | Already in use in `src/fetchers/helius.ts` |

### New Dependencies Required
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-queue | ^8.0.1 | Concurrency-limited async queue | Rate-limit Helius API calls to 2 req/s (free tier cap); prevents 429 errors |
| p-retry | ^6.2.0 | Automatic retry with exponential backoff | Helius intermittently returns incomplete results; 429 responses need retry |

**Installation:**
```bash
pnpm add p-queue p-retry
```

Note: `p-queue` and `p-retry` are ESM-only packages. The project uses `"type": "module"` — no special handling needed; standard `import` works.

### Already Available (No Action)
| Library | Purpose |
|---------|---------|
| axios | Helius HTTP calls (existing `HeliusFetcher` class) |
| dotenv | `HELIUS_API_KEY` env var |
| bignumber.js | Available if lamport precision matters (lamports are integers; `number` is safe for SOL amounts up to ~9000 SOL) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue | bottleneck | p-queue is simpler, ESM-native, already in stack decisions |
| axios | node-fetch / undici | axios is already used in `src/fetchers/helius.ts` — stay consistent |
| JS Map for FIFO | SQLite query for buy lots | In-memory Map is simpler for history import batch; SQLite query needed for incremental updates in Phase 5 |

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── schema.ts          # Add parse_errors table (new in Phase 2)
│   ├── migrations/        # New migration for parse_errors
│   └── index.ts           # Unchanged
├── fetchers/
│   └── helius.ts          # Extend existing HeliusFetcher with paginated history method
├── parsers/
│   └── swap.ts            # NEW: parseSwaps(txs, walletAddress) — main DEX parser
├── types/
│   └── transaction.ts     # Extend with DEX_PROGRAM_IDS const and ParsedSwap type
└── commands/
    └── wallet.ts          # Extend wallet add to accept --full-history flag and trigger import
```

### Pattern 1: Helius Paginated History Fetch
**What:** Fetch all transactions for a wallet address within a time window using cursor-based backward pagination.
**When to use:** On wallet add (PARS-02). Stop when oldest transaction in batch is older than `afterTimestamp` OR response is empty.

```typescript
// Source: https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress
// Endpoint: GET https://api-mainnet.helius-rpc.com/v0/addresses/{address}/transactions

interface FetchHistoryOptions {
  address: string;
  afterTimestamp: number; // Unix seconds — oldest to include
  type?: 'SWAP';
  limit?: number;         // 1-100, default 100
}

async function fetchTransactionHistory(
  opts: FetchHistoryOptions
): Promise<HeliusTransaction[]> {
  const allTxs: HeliusTransaction[] = [];
  let beforeSignature: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string | number> = {
      'api-key': HELIUS_API_KEY,
      limit: opts.limit ?? 100,
      'type': 'SWAP',
      'gte-time': opts.afterTimestamp,
    };
    if (beforeSignature) params['before-signature'] = beforeSignature;

    const response = await queue.add(() =>
      axios.get(`/v0/addresses/${opts.address}/transactions`, { params })
    );

    const txs: HeliusTransaction[] = response.data;
    if (!txs || txs.length === 0) { hasMore = false; break; }

    allTxs.push(...txs);

    const oldest = txs[txs.length - 1];
    if (oldest.timestamp < opts.afterTimestamp || txs.length < 100) {
      hasMore = false;
    } else {
      beforeSignature = oldest.signature;
    }
  }

  return allTxs;
}
```

**Key insight:** Use `type=SWAP` query param to skip non-swap transactions server-side, reducing page count and credit usage.

### Pattern 2: Swap Parser — `parseSwaps`
**What:** Convert an array of `HeliusTransaction` objects into normalized `SwapRow` objects for the 5 supported DEXes. This function signature matches the existing test file `tests/unit/parsers.test.ts`.
**When to use:** After each page of transactions is fetched; results are persisted before fetching next page.

```typescript
// src/parsers/swap.ts
// Source: Helius API docs (events.swap structure) + tests/unit/parsers.test.ts
import type { HeliusTransaction } from '../types/index.js';
import { DEX_PROGRAM_IDS } from '../types/transaction.js';

export interface SwapRow {
  wallet_address: string;
  tx_signature: string;
  dex: string;          // 'pump.fun' | 'raydium' | 'jupiter' | 'orca' | 'meteora'
  token_mint: string;
  side: 'buy' | 'sell';
  token_amount: number; // in token units (adjusted for decimals)
  sol_amount: number;   // in SOL (not lamports)
  timestamp: number;    // Unix seconds
  slot: number;
  fee_sol: number | null;
  cost_basis_sol: null; // set later by FIFO pass
  realized_pnl_sol: null;
}

export function parseSwaps(
  txs: HeliusTransaction[],
  walletAddress: string
): SwapRow[] {
  const results: SwapRow[] = [];

  for (const tx of txs) {
    if (tx.type !== 'SWAP') continue;

    const dex = identifyDex(tx.instructions);
    if (!dex) continue; // skip unknown protocols silently

    const swapEvent = tx.events?.swap;
    if (!swapEvent) continue;

    const swapData = Array.isArray(swapEvent) ? swapEvent[0] : swapEvent;

    // BUY: SOL in → token out
    if (swapData.nativeInput && swapData.tokenOutputs?.length > 0) {
      const tokenOut = swapData.tokenOutputs.find(
        (t: any) => t.userAccount === walletAddress
      ) ?? swapData.tokenOutputs[0];
      const decimals = tokenOut.rawTokenAmount.decimals;
      const tokenAmount = Number(tokenOut.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);
      const solAmount = Number(swapData.nativeInput.amount) / 1e9;

      results.push({
        wallet_address: walletAddress,
        tx_signature: tx.signature,
        dex,
        token_mint: tokenOut.mint,
        side: 'buy',
        token_amount: tokenAmount,
        sol_amount: solAmount,
        timestamp: tx.timestamp,
        slot: tx.slot,
        fee_sol: tx.fee ? tx.fee / 1e9 : null,
        cost_basis_sol: null,
        realized_pnl_sol: null,
      });
    }
    // SELL: token in → SOL out
    else if (swapData.tokenInputs?.length > 0 && swapData.nativeOutput) {
      const tokenIn = swapData.tokenInputs.find(
        (t: any) => t.userAccount === walletAddress
      ) ?? swapData.tokenInputs[0];
      const decimals = tokenIn.rawTokenAmount.decimals;
      const tokenAmount = Number(tokenIn.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);
      const solAmount = Number(swapData.nativeOutput.amount) / 1e9;

      results.push({
        wallet_address: walletAddress,
        tx_signature: tx.signature,
        dex,
        token_mint: tokenIn.mint,
        side: 'sell',
        token_amount: tokenAmount,
        sol_amount: solAmount,
        timestamp: tx.timestamp,
        slot: tx.slot,
        fee_sol: tx.fee ? tx.fee / 1e9 : null,
        cost_basis_sol: null,
        realized_pnl_sol: null,
      });
    }
    // Token-to-token swap: skip (no SOL involved, out of scope)
  }

  return results;
}

function identifyDex(instructions: Array<{ programId: string }>): string | null {
  for (const ix of instructions) {
    for (const [dex, ids] of Object.entries(DEX_PROGRAM_IDS)) {
      if ((ids as string[]).includes(ix.programId)) return dex;
    }
  }
  return null;
}
```

### Pattern 3: DEX Program ID Registry
**What:** Canonical mapping of on-chain program IDs to DEX labels. Must match what `tests/unit/parsers.test.ts` imports as `DEX_PROGRAM_IDS`.
**Critical:** Multiple Raydium pool types and both Pump.fun programs must map to a single label.

```typescript
// src/types/transaction.ts — add to existing file
// Sources: Solscan, Raydium docs, Meteora docs, Bitquery (MEDIUM confidence for all IDs)
export const DEX_PROGRAM_IDS: Record<string, string[]> = {
  'pump.fun': [
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // Pump.fun bonding curve (original)
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',  // PumpSwap AMM (launched March 2025)
  ],
  'raydium': [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',  // AMM v4 (legacy constant product)
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',  // CPMM (CP-Swap)
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',  // CLMM (concentrated liquidity)
  ],
  'jupiter': [
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',  // Jupiter Aggregator v6
  ],
  'orca': [
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpool
  ],
  'meteora': [
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // DLMM (active)
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG',  // DAMM v2 (active)
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',  // DAMM v1 (legacy, maintained)
  ],
};

// Legacy single-ID constants for the test compatibility
export const DEX_PROGRAM_IDS_COMPAT = {
  RAYDIUM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  ORCA: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  METEORA: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
};
```

**Important note on test compatibility:** The existing `tests/unit/parsers.test.ts` uses `DEX_PROGRAM_IDS.RAYDIUM`, `DEX_PROGRAM_IDS.JUPITER`, etc. as single string values — not arrays. The planner must reconcile: either export both a flat constant (for test compatibility) and a grouped mapping (for parser use), or update the test to use the new structure. Updating the test is the cleaner approach since Phase 1 tests are passing and parsers.test.ts imports a `src/parsers/swap.ts` that does not yet exist.

### Pattern 4: FIFO Cost Basis Pass
**What:** After all swaps for a wallet are parsed and sorted by timestamp ASC, apply FIFO to compute `cost_basis_sol` and `realized_pnl_sol` for each sell.
**When to use:** As a second pass after parsing, before inserting into the database.

```typescript
// Source: FIFO algorithm pattern (general trading system pattern, no library needed)
interface BuyLot {
  tokenAmount: number;   // remaining unconsumed tokens
  pricePerToken: number; // sol_amount / token_amount at purchase
}

function applyFifo(swaps: SwapRow[]): SwapRow[] {
  const lots = new Map<string, BuyLot[]>(); // tokenMint → queue of buy lots
  const result: SwapRow[] = [];

  // Process in chronological order
  const sorted = [...swaps].sort((a, b) => a.timestamp - b.timestamp);

  for (const swap of sorted) {
    if (swap.side === 'buy') {
      const lot: BuyLot = {
        tokenAmount: swap.token_amount,
        pricePerToken: swap.token_amount > 0 ? swap.sol_amount / swap.token_amount : 0,
      };
      const queue = lots.get(swap.token_mint) ?? [];
      queue.push(lot);
      lots.set(swap.token_mint, queue);
      result.push({ ...swap, cost_basis_sol: swap.sol_amount, realized_pnl_sol: null });
    } else {
      // SELL: consume buy lots FIFO
      const queue = lots.get(swap.token_mint);
      if (!queue || queue.length === 0) {
        // Orphaned sell — no buy found. Exclude from metrics (cost_basis_sol stays null)
        result.push({ ...swap, cost_basis_sol: null, realized_pnl_sol: null });
        continue;
      }

      let remainingToSell = swap.token_amount;
      let totalCostBasis = 0;

      while (remainingToSell > 0 && queue.length > 0) {
        const lot = queue[0];
        const consumed = Math.min(remainingToSell, lot.tokenAmount);
        totalCostBasis += consumed * lot.pricePerToken;
        lot.tokenAmount -= consumed;
        remainingToSell -= consumed;
        if (lot.tokenAmount <= 0) queue.shift();
      }

      if (remainingToSell > 0) {
        // Partial orphan — only matched some lots
        // Exclude this sell from PnL (set both to null)
        result.push({ ...swap, cost_basis_sol: null, realized_pnl_sol: null });
      } else {
        const realizedPnl = swap.sol_amount - totalCostBasis;
        result.push({ ...swap, cost_basis_sol: totalCostBasis, realized_pnl_sol: realizedPnl });
      }
    }
  }

  return result;
}
```

**Orphaned sell handling:** When a sell has no matching buy lots (e.g., token received from airdrop, or history window too short), `cost_basis_sol` and `realized_pnl_sol` are both `null`. Phase 4 metrics must check for `IS NOT NULL` before including a trade in win rate or PnL totals.

### Pattern 5: parse_errors Table Schema
**What:** New table to record silent parse failures for known-DEX transactions.

```typescript
// src/db/schema.ts — add this table
export const parse_errors = sqliteTable('parse_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tx_signature: text('tx_signature').notNull(),
  dex: text('dex').notNull(),
  wallet_address: text('wallet_address').notNull(),
  error_message: text('error_message').notNull(),
  created_at: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});
```

Note: `wallet_address` is a fifth field beyond the four required (signature, error, dex, timestamp) — included per Claude's Discretion since it's critical for debugging.

### Pattern 6: History Import Lifecycle (wallet add flow)
**What:** When `echo wallet add <address>` is called, trigger history import synchronously (foreground), updating wallet status in the DB as import progresses. Simpler to implement correctly than background; fits the monitoring loop design.

```
1. wallet add inserts wallet row with status='importing', history_complete=false
2. fetchTransactionHistory() → paginated loop → parse → FIFO → batch insert swaps
3. On completion: UPDATE wallets SET status='tracked', history_complete=true
4. On any unhandled error: leave status='importing' — restart on next run
```

**Interruption/resume strategy:** If import is interrupted (process killed, error), the wallet row stays `status='importing'`, `history_complete=false`. On the next `echo wallet add` for the same address, the duplicate address check prevents re-add. A separate `echo wallet import-resume` command or a startup check can restart. Simplest: detect `status='importing'` wallets at startup and re-run their import. The planner should choose the startup-check approach.

### Anti-Patterns to Avoid
- **Storing raw transaction payloads in parse_errors:** Locked decision — signature + error message + dex + timestamp only
- **Logging parse errors to console:** Locked decision — completely silent to the normal flow
- **Average cost fallback when FIFO lots run out:** Locked decision — orphaned sells must be excluded, not approximated
- **Treating PumpSwap (graduated) as Raydium:** PumpSwap has its own program ID. Helius may still return `source: 'RAYDIUM'` for some Jupiter-routed PumpSwap trades — always check `instructions[].programId` directly, not only the top-level `source` field
- **Relying solely on `tx.source` for DEX identification:** The top-level `source` field may be `UNKNOWN` or `JUPITER` (for aggregated routes). Always check `instructions[].programId` against `DEX_PROGRAM_IDS` as the authoritative DEX signal
- **Token-to-token swaps counted as buys/sells:** Only SOL↔token swaps are in scope. Token-to-token (e.g., USDC→BONK) must be skipped

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API rate limiting | Custom sleep/delay loops | `p-queue` with concurrency=1, interval=500ms | p-queue handles backpressure, cancellation, and priority; sleep loops break on errors |
| Exponential backoff retry | Custom retry loop with try/catch | `p-retry` | p-retry handles jitter, max attempts, error classification out of the box |
| Decimal arithmetic for token amounts | Custom precision math | Standard `Number` division (or `bignumber.js` if available) | Token amounts from Helius are integer strings; `Number(str) / Math.pow(10, decimals)` is safe for display/storage; JS `number` precision is sufficient for SOL amounts under ~9000 SOL |
| FIFO data structure | Custom doubly-linked list | `Array.shift()` on a plain JS array (acts as queue) | Array.shift() is O(n) but position queues are small; adequate for the number of lots per token |
| Swap deduplication | Custom hash set | `tx_signature UNIQUE` constraint on `swaps` table | DB constraint enforces idempotency at insert time; catch constraint violation to skip duplicate |

**Key insight:** The hardest part of this phase is correctly identifying buy vs. sell for each DEX via Helius `events.swap` — every other problem has a simple library or DB-level solution.

---

## Common Pitfalls

### Pitfall 1: PumpSwap vs Pump.fun Bonding Curve — Two Different Programs
**What goes wrong:** Parser only handles the original Pump.fun bonding curve program (`6EF8rr...`). Trades on PumpSwap (`pAMMBay...`, launched March 2025) are silently skipped as "unknown protocol."
**Why it happens:** Most documentation and tutorials reference only the original Pump.fun program. PumpSwap is a separate AMM program launched March 2025.
**How to avoid:** Include both program IDs in the `pump.fun` entry of `DEX_PROGRAM_IDS`. Validate with a real wallet that has post-March-2025 graduated token trades.
**Warning signs:** Wallets with Pump.fun history showing far fewer swaps than expected in dashboards like Photon.

### Pitfall 2: Helius `source` Field Does Not Reliably Identify DEX
**What goes wrong:** Code uses `tx.source === 'RAYDIUM'` to identify Raydium trades. Jupiter-aggregated trades that route through Raydium return `source: 'JUPITER'`. Pump.fun trades may return `source: 'UNKNOWN'`.
**Why it happens:** The top-level `source` reflects the outermost program, not the inner DEX pool.
**How to avoid:** Always use `instructions[].programId` matching against `DEX_PROGRAM_IDS` as the primary DEX identifier. The `source` field is informational only.
**Warning signs:** Parser correctly identifies Jupiter direct swaps but misses Raydium pools accessed via Jupiter routing.

### Pitfall 3: `events.swap` May Be an Object or Array
**What goes wrong:** Code does `tx.events.swap.nativeInput` but for some transactions `events.swap` is an array of swap events (multi-hop routes).
**Why it happens:** Jupiter multi-hop swaps produce multiple inner swap events. The existing test mocks show `swap: [{ ... }]` (array).
**How to avoid:** Always normalize: `const swapData = Array.isArray(tx.events.swap) ? tx.events.swap[0] : tx.events.swap`. For this phase, only process the first/outermost swap event.
**Warning signs:** `TypeError: Cannot read property 'nativeInput' of undefined` on Jupiter transactions.

### Pitfall 4: Token-to-Token Swaps Misidentified as Buys
**What goes wrong:** A swap has `tokenInputs` (USDC) and `tokenOutputs` (BONK) but no `nativeInput`/`nativeOutput`. Parser incorrectly treats this as a sell or buy.
**Why it happens:** Jupiter routes many swaps via intermediate tokens. The top-level event may show token→token even when the user started with SOL (the wSOL unwrap/wrap happens in inner swaps).
**How to avoid:** Only parse swaps that have `nativeInput` XOR `nativeOutput` at the outer event level. If neither is present, check `innerSwaps` for a SOL↔token conversion — or skip the transaction entirely (this is the safer default for Phase 2).
**Warning signs:** `tokenAddress` is USDC or USDT instead of a memecoin mint.

### Pitfall 5: lamport → SOL Conversion Errors
**What goes wrong:** `sol_amount` stored as lamports (integer, e.g., 1000000000) instead of SOL (1.0).
**Why it happens:** Helius `nativeInput.amount` and `nativeOutput.amount` are returned as strings in lamports.
**How to avoid:** Always divide by `1e9`: `Number(swapData.nativeInput.amount) / 1e9`. The `fee` field in the top-level transaction is also in lamports.
**Warning signs:** PnL values look like 1,000,000,000x larger than expected.

### Pitfall 6: FIFO Floating-Point Drift on Partial Lots
**What goes wrong:** Repeated subtraction of floating-point token amounts causes lots to never reach exactly zero, leaving ghost lots in the queue.
**Why it happens:** `0.1 + 0.2 !== 0.3` in IEEE 754. Accumulated over many trades, lot quantities drift.
**How to avoid:** Use a small epsilon when checking if a lot is exhausted: `if (lot.tokenAmount < 1e-9) queue.shift()`. Alternatively, work in the token's smallest unit (raw integer amount) and only convert to display decimals at read time. The DB `swaps` table stores `token_amount` as `REAL` — precision loss is acceptable for PnL display but not for lot tracking.
**Warning signs:** FIFO position never fully closes despite equal buy and sell quantities.

### Pitfall 7: History Import Status Visible but "importing" Wallets Break `wallet list`
**What goes wrong:** `echo wallet list` filters `WHERE status = 'tracked'` and misses wallets in `status = 'importing'`.
**Why it happens:** The current `wallet list` command uses `.where(eq(wallets.status, 'tracked'))`.
**How to avoid:** Phase 2 must update the `wallet list` command to show wallets with `status IN ('tracked', 'importing')`. The "importing" status must be rendered distinctly (e.g., chalk.yellow).
**Warning signs:** User adds a wallet, sees no output from `wallet list` until import completes.

### Pitfall 8: Raydium Has Three Pool Types — All Must Be Detected
**What goes wrong:** Parser only includes AMM v4 program ID (`675kPX9...`). Trades on CPMM or CLMM pools return no match and are silently skipped.
**Why it happens:** AMM v4 is the legacy "classic" Raydium pool. CPMM is the newer constant-product and CLMM is the concentrated liquidity variant — all three are active.
**How to avoid:** Include all three Raydium program IDs in `DEX_PROGRAM_IDS['raydium']`.
**Warning signs:** Raydium trades on newer pools show 0 swap count.

---

## Code Examples

### Helius API Query Parameters — Paginated SWAP history
```typescript
// Source: https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress
const BASE = 'https://api-mainnet.helius-rpc.com';

const params = new URLSearchParams({
  'api-key': process.env.HELIUS_API_KEY!,
  'type': 'SWAP',
  'limit': '100',
  'gte-time': String(afterTimestamp), // Unix seconds
});
if (beforeSignature) params.set('before-signature', beforeSignature);

const response = await axios.get(
  `${BASE}/v0/addresses/${address}/transactions?${params}`
);
// response.data: HeliusTransaction[]
// Paginate: if last tx.timestamp > afterTimestamp && batch.length === 100,
//           set beforeSignature = last.signature and repeat
```

### p-queue Rate Limiter for Helius (2 req/s free tier)
```typescript
// Source: https://github.com/sindresorhus/p-queue
import PQueue from 'p-queue';

// Free tier: 2 req/s Enhanced API
const queue = new PQueue({ interval: 1000, intervalCap: 2 });

// Wrap every Helius call:
const data = await queue.add(() => fetchPage(address, cursor));
```

### p-retry for Helius 429 / transient errors
```typescript
// Source: https://github.com/sindresorhus/p-retry
import pRetry from 'p-retry';

const data = await pRetry(
  () => queue.add(() => axios.get(url, { params })),
  {
    retries: 3,
    onFailedAttempt: (error) => {
      if (error.response?.status === 401) throw error; // don't retry auth errors
    },
  }
);
```

### FIFO Buy Lot — JavaScript Array as Queue
```typescript
// Standard array used as FIFO queue
// push() = enqueue, shift() = dequeue oldest
const lots: BuyLot[] = [];
lots.push({ tokenAmount: 1000, pricePerToken: 0.001 }); // buy
const oldest = lots.shift(); // sell consumes this first
```

### Batch Swap Insert with Drizzle ORM
```typescript
// Source: https://orm.drizzle.team/docs/insert
// Insert all swaps for a page in a single transaction for atomicity
db.transaction(() => {
  for (const swap of parsedSwaps) {
    try {
      db.insert(swaps).values(swap).run();
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        // Duplicate signature — already stored; skip
        continue;
      }
      throw err;
    }
  }
});
```

### Parse Error Logging (silent to console)
```typescript
// Write to parse_errors table — no console output
function logParseError(sig: string, dex: string, wallet: string, err: Error) {
  try {
    db.insert(parse_errors).values({
      tx_signature: sig,
      dex,
      wallet_address: wallet,
      error_message: err.message.slice(0, 500), // truncate
    }).run();
  } catch {
    // Even error logging can fail — truly silent
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pump.fun tokens graduate to Raydium | Pump.fun tokens graduate to PumpSwap (pAMM) | March 2025 | Must include PumpSwap program ID under 'pump.fun' label; Raydium still active for pre-March 2025 graduated tokens |
| Single Raydium AMM v4 | Three Raydium pool types (AMM v4, CPMM, CLMM) | CPMM ~2023, CLMM ~2023 | All three program IDs required |
| Helius v0 addresses endpoint with manual timestamp filter | Same endpoint now supports `gte-time`/`lte-time` query params | 2024 | Server-side time filter reduces pages fetched; use `gte-time` instead of client-side filter |
| Helius `getTransactionsForAddress` RPC (100 credits/call) | Helius REST `/v0/addresses/{address}/transactions` (lower cost) | Ongoing | Use the REST endpoint for history import; the new RPC is paid-plan-only with 100 credits/call |

**Deprecated/outdated:**
- Helius `before-signature` timestamp-based stop: Still valid but `gte-time` is more efficient — use both for safety.
- Fetching ALL transaction types then filtering client-side: Use `type=SWAP` server-side to reduce page count.

---

## Open Questions

1. **Helius source enum for Pump.fun and Meteora**
   - What we know: The Helius `TransactionSource` enum (as of the fetched docs) lists RAYDIUM, JUPITER, ORCA but does NOT list PUMP_FUN or METEORA explicitly. The SDK source code was rate-limited and couldn't be confirmed.
   - What's unclear: Whether `tx.source` will ever equal `'PUMP_FUN'` or `'METEORA'` for those transactions, or if it returns `'UNKNOWN'`.
   - Recommendation: Do not rely on `tx.source` for DEX identification. Always use program ID matching from `instructions`. This is safe regardless of what source values Helius uses.
   - Confidence: LOW — needs validation with real transaction data during implementation

2. **events.swap structure variation across DEXes**
   - What we know: The Helius docs show `nativeInput`/`tokenOutputs` for a token buy. The pattern varies for Jupiter multi-hop (inner swaps), Meteora (DLMM bins), and CLMM (tick-based).
   - What's unclear: Whether all five DEXes produce a consistent `events.swap` outer structure with `nativeInput`/`nativeOutput`, or whether some (especially Meteora DLMM) return only `innerSwaps` with no outer SOL flow.
   - Recommendation: The planner must flag this as a task that requires hands-on validation during implementation. Start with the simple pattern; add DEX-specific fallback parsing if `events.swap` is missing or empty.
   - Confidence: LOW — this is the "phase blocker" identified in the additional context

3. **Raydium Launchpad (formerly "Pump.fun graduation to Raydium")**
   - What we know: Since March 2025, most tokens graduate to PumpSwap, not Raydium. However, pre-March 2025 wallets with deep history may have Raydium positions from old graduation trades.
   - What's unclear: Whether Raydium Launchpad has its own program ID distinct from AMM v4.
   - Recommendation: The three known Raydium program IDs (AMM v4, CPMM, CLMM) cover the current scope. Monitor for `'raydium'` source field as a secondary signal.

4. **Token amount precision — `REAL` vs. integer storage**
   - What we know: The `swaps` schema stores `token_amount` as `REAL` (64-bit float). Memecoins often have 9 decimal places (standard SPL) or 6 decimals. For very large token amounts (e.g., 1 billion BONK), float precision may lose sub-unit accuracy.
   - What's unclear: Whether PnL calculations require sub-lamport precision on the token side.
   - Recommendation: Store token amounts as adjusted float (not raw integer). For FIFO lot tracking in memory, use the same float. For PnL display purposes (which is the end goal), float precision is acceptable. If precision issues emerge, store token amounts as raw integer strings in a separate column — but this is premature optimization.

5. **`--full-history` flag implementation**
   - What we know: Locked decision — `--full-history` is available at wallet-add time and removes the 180-day window.
   - What's unclear: The exact Commander.js option placement — it was not added to the Phase 1 wallet command implementation.
   - Recommendation: Phase 2 must add `--full-history` as an option to `echo wallet add`. When set, `afterTimestamp` is `0` (no lower bound). The planner should scope this as a specific task.

---

## Sources

### Primary (HIGH confidence)
- [Helius Enhanced Transactions API Reference](https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress) — endpoint URL format, query params (type, gte-time, before-signature, limit), SwapEvent structure
- [Helius Enhanced Transaction Response (llms.txt)](https://www.helius.dev/docs/api-reference/enhanced-transactions/llms.txt) — complete TransactionSource enum (99 values), SwapEvent schema with innerSwaps/programInfo
- [Helius Billing Plans](https://www.helius.dev/docs/billing/plans) — free tier: 1M credits/month, 2 req/s Enhanced API rate limit
- Existing project files: `tests/unit/parsers.test.ts`, `src/types/transaction.ts`, `src/db/schema.ts`, `src/fetchers/helius.ts` — define existing contract and patterns

### Secondary (MEDIUM confidence)
- [Raydium Program IDs (search-verified)](https://docs.raydium.io/raydium/protocol/developers/addresses) — AMM v4 `675kPX9...`, CPMM `CPMMoo8...`, CLMM `CAMMCzo5...`
- [Meteora DLMM Program (Solscan)](https://solscan.io/account/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo) — `LBUZKhRx...` confirmed active
- [Meteora Developer Guide](https://docs.meteora.ag/developer-guide/home) — DLMM, DAMM v2, DAMM v1, DBC program IDs
- [Jupiter Aggregator v6 (Solscan)](https://solscan.io/account/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4) — `JUP6Lkb...` confirmed
- [Orca Whirlpool GitHub](https://github.com/orca-so/whirlpools) — `whirLbMi...` confirmed
- [FIFO algorithm pattern](https://www.machow.ski/posts/2021-07-24-positions-profit-and-loss/) — queue-based lot tracking with partial fills
- [Helius blog — getTransactionsForAddress](https://www.helius.dev/blog/introducing-gettransactionsforaddress) — pagination token format, 100-record limit, time filtering

### Tertiary (LOW confidence — requires validation during implementation)
- [PumpSwap program ID](https://solscan.io/account/pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA) — `pAMMBay6...` confirmed on Solscan; March 2025 launch verified via Bitquery docs
- [Pump.fun bonding curve program](https://solscan.io/account/6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P) — multiple community sources agree on this ID
- Helius `TransactionSource` enum values for PUMP_FUN and METEORA — NOT confirmed in official docs; rely on program ID matching instead

---

## Metadata

**Confidence breakdown:**
- Standard stack (p-queue, p-retry): HIGH — official npm packages, ESM-native, project stack decision
- Helius API structure (endpoint, params, SwapEvent): HIGH — verified from official docs
- Architecture patterns: HIGH — derived from existing codebase + official docs
- DEX program IDs (Raydium, Jupiter, Orca): MEDIUM — cross-verified via Solscan + official docs; not tested against live data
- DEX program IDs (Pump.fun bonding curve, PumpSwap, Meteora): MEDIUM — confirmed on Solscan; launch dates/context from community sources
- Helius source enum coverage for Pump.fun/Meteora: LOW — docs list 99 sources but these two are absent; behavior unknown without live testing
- events.swap structure per DEX: LOW — docs show ORCA example; behavior for Meteora DLMM and PumpSwap unverified
- FIFO algorithm: HIGH — standard algorithm, no library needed

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (Pump.fun and Meteora evolve frequently; re-verify program IDs before implementation if > 2 weeks pass)
