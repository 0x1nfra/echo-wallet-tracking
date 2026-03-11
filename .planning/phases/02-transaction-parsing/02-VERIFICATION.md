---
phase: 02-transaction-parsing
verified: 2026-03-11T00:00:00Z
status: passed
score: 17/17 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "echo wallet add <address> end-to-end import flow"
    expected: "CLI prints 'Importing history...' then 'import complete.'; DB shows status='tracked' and history_complete=true; swaps table populated"
    why_human: "Requires live HELIUS_API_KEY and network access to a Solana mainnet wallet"
  - test: "echo wallet list shows importing status in yellow"
    expected: "A wallet in status='importing' is rendered in yellow chalk text"
    why_human: "Terminal color rendering cannot be verified programmatically without integration test harness"
  - test: "Rate limiting enforcement at 2 req/s"
    expected: "Under sustained load, p-queue caps Helius calls at 2 per second"
    why_human: "Requires live API calls to observe actual throttling behavior"
---

# Phase 02: Transaction Parsing Verification Report

**Phase Goal:** The system can convert raw Helius API responses into normalized Swap objects for any of the five supported DEXes
**Verified:** 2026-03-11
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | parse_errors table exists in DB schema and is migration-tracked | VERIFIED | `schema.ts` lines 59-68 define `parse_errors` table; `0001_parse_errors.sql` has CREATE TABLE; `_journal.json` registers idx=1 `0001_parse_errors` |
| 2 | wallets table accepts status='importing' without constraint violation | VERIFIED | `schema.ts` line 8: `enum: ['tracked', 'removed', 'importing']`; `wallet.ts` line 25 inserts `status: 'importing'` |
| 3 | DEX_PROGRAM_IDS exports flat string keys (RAYDIUM, JUPITER, PUMP_FUN, ORCA, METEORA) | VERIFIED | `transaction.ts` lines 44-50: `as const` object with all 5 keys; tests reference `DEX_PROGRAM_IDS.RAYDIUM` etc. |
| 4 | DEX_PROGRAM_IDS_MAP exports grouped arrays for multi-program DEXes | VERIFIED | `transaction.ts` lines 53-74: raydium=3 IDs, pump.fun=2 IDs, meteora=3 IDs, jupiter=1, orca=1 (9 total) |
| 5 | HeliusTransaction includes events.swap and instructions array | VERIFIED | `transaction.ts` lines 112-116: `events?: { swap?: HeliusSwapEvent \| HeliusSwapEvent[] }; instructions?: HeliusInstruction[]` |
| 6 | parseSwaps returns a Swap object for each recognized SOL↔token swap transaction | VERIFIED | `swap.ts` lines 39-129: full implementation; 13 parser tests all pass (29/29 suite) |
| 7 | parseSwaps skips unknown program IDs silently (no result, no error) | VERIFIED | `swap.ts` lines 50-51: `if (dex === null) continue`; test "should skip unknown programId" asserts `length === 0` |
| 8 | parseSwaps skips token-to-token swaps | VERIFIED | `swap.ts` lines 72: `if (!hasNativeInput && !hasNativeOutput) continue`; test "should skip token-to-token swaps" passes |
| 9 | parseSwaps correctly identifies all 5 supported DEXes via DEX_PROGRAM_IDS_MAP | VERIFIED | `swap.ts` lines 17-29: iterates `DEX_PROGRAM_IDS_MAP` entries; test "should identify all 5 supported DEXes" passes for raydium, jupiter, pump.fun, orca, meteora |
| 10 | applyFifo sets cost_basis_sol and realized_pnl_sol on sells with matching buy lots | VERIFIED | `swap.ts` lines 204-209; test "should calculate realized PnL for a matched sell" passes: pnl=0.5 for buy@1SOL/sell@1.5SOL |
| 11 | applyFifo sets both fields to null on orphaned sells | VERIFIED | `swap.ts` lines 173-176 (full orphan); lines 199-205 (partial orphan); orphan test passes |
| 12 | HeliusFetcher.fetchSwapHistory with p-queue rate limiting and p-retry | VERIFIED | `helius.ts` lines 31-79: paginated fetch; module-level `heliusQueue` (2 req/s); `pRetry` with 3 retries; 401 short-circuit |
| 13 | importWalletHistory orchestrates fetch → parse → FIFO → DB insert | VERIFIED | `history.ts` lines 15-65: full pipeline — `fetchSwapHistory` → `parseSwaps` → `applyFifo` → `db.transaction` insert → `status='tracked'` update |
| 14 | wallet add inserts status='importing' then transitions to 'tracked' on success | VERIFIED | `wallet.ts` lines 22-44: inserts with `status: 'importing'`; calls `importWalletHistory`; orchestrator sets `status: 'tracked'` on completion |
| 15 | wallet add --full-history removes 180-day cap | VERIFIED | `wallet.ts` line 32: passes `{ fullHistory: options.fullHistory }`; `history.ts` lines 20-22: `afterTimestamp = 0` when `fullHistory=true` |
| 16 | wallet list shows importing wallets in yellow | VERIFIED | `wallet.ts` lines 65, 82-84: `inArray(wallets.status, ['tracked', 'importing'])`; `chalk.yellow('importing')` conditional |
| 17 | resumeImportingWallets called at startup for crash recovery | VERIFIED | `cli.ts` line 31: `resumeImportingWallets().catch(() => {})` before `program.parse()` |

**Score:** 17/17 truths verified

---

## Required Artifacts

### Plan 02-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | parse_errors table + updated wallets status enum | VERIFIED | Lines 59-68 define parse_errors; line 8 has enum with 'importing' |
| `src/db/migrations/0001_parse_errors.sql` | Migration for parse_errors table | VERIFIED | CREATE TABLE IF NOT EXISTS parse_errors with all 5 columns |
| `src/types/transaction.ts` | DEX_PROGRAM_IDS + DEX_PROGRAM_IDS_MAP + HeliusTransaction events + SwapRow | VERIFIED | All 6 exports present: DEX_PROGRAM_IDS, DEX_PROGRAM_IDS_MAP, HeliusSwapEvent, HeliusInstruction, extended HeliusTransaction, SwapRow |

### Plan 02-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/parsers/swap.ts` | parseSwaps and applyFifo functions | VERIFIED | 218 lines; both functions exported; all edge cases handled |
| `tests/unit/parsers.test.ts` | Test suite for parseSwaps and applyFifo | VERIFIED | 13 tests across 2 describe blocks; all 13 pass |

### Plan 02-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/fetchers/helius.ts` | fetchSwapHistory with p-queue and p-retry | VERIFIED | Lines 31-79; PQueue at 2 req/s; pRetry 3 retries; 401 short-circuit; createHeliusFetcher exported |
| `src/importers/history.ts` | importWalletHistory and resumeImportingWallets | VERIFIED | 113 lines; both functions exported; silentlyLogParseError present |
| `src/commands/wallet.ts` | wallet add with --full-history, wallet list with importing | VERIFIED | --full-history flag wired; inArray filter; chalk.yellow for importing status |

---

## Key Link Verification

### Plan 02-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/parsers/swap.ts` | `src/types/transaction.ts` | import DEX_PROGRAM_IDS_MAP | WIRED | `swap.ts` line 6: `import { DEX_PROGRAM_IDS_MAP, ... }` |
| `src/db/index.ts` | `src/db/migrations/0001_parse_errors.sql` | drizzle migrate() | WIRED | Journal entry idx=1 registered; migrate() runs all entries on init |

### Plan 02-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/parsers/swap.ts` | `src/types/transaction.ts` | import DEX_PROGRAM_IDS_MAP | WIRED | `swap.ts` line 6 |
| `src/parsers/swap.ts` | `src/types/transaction.ts` | import SwapRow type | WIRED | `swap.ts` line 9: `type SwapRow` |

### Plan 02-03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/commands/wallet.ts` | `src/importers/history.ts` | importWalletHistory(address, { fullHistory }) | WIRED | `wallet.ts` line 7 import; line 32 call with options |
| `src/importers/history.ts` | `src/fetchers/helius.ts` | fetcher.fetchSwapHistory(address, afterTimestamp) | WIRED | `history.ts` line 4 import; line 25 call |
| `src/importers/history.ts` | `src/parsers/swap.ts` | parseSwaps(txs, address) then applyFifo(swaps) | WIRED | `history.ts` line 5 import; lines 31 and 44 calls |
| `src/importers/history.ts` | `src/db/schema.ts` | db.insert(swaps) and db.insert(parse_errors) | WIRED | `history.ts` line 3 import; lines 50 and 89 inserts |
| `src/cli.ts` | `src/importers/history.ts` | resumeImportingWallets at startup | WIRED | `cli.ts` line 5 import; line 31 call |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PARS-01 | 02-01, 02-02 | System normalizes Helius enhanced transactions into Swap objects for Pump.fun, Raydium, Jupiter, Orca, and Meteora | SATISFIED | parseSwaps identifies all 5 DEXes via DEX_PROGRAM_IDS_MAP; 13 parser tests pass including "should identify all 5 supported DEXes" |
| PARS-02 | 02-01, 02-03 | System fetches and paginates full transaction history on first wallet import before calculating any metrics | SATISFIED | fetchSwapHistory paginates until empty page or time cutoff; importWalletHistory called on wallet add; status='importing' blocks metric reads |
| PARS-03 | 02-01, 02-02 | System uses FIFO cost basis to track positions and calculate realized PnL per closed trade | SATISFIED | applyFifo sorts by timestamp ASC, maintains lot map per token_mint, computes cost_basis_sol and realized_pnl_sol on matched sells; 5 FIFO tests pass |

No orphaned requirements — all 3 requirement IDs claimed by plans and verified in code.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/fetchers/helius.ts` | 89, 138, 141 | `console.log` in `getTransactions` (legacy method) | Info | Legacy method — not called by new pipeline; only affects old getTransactions path |
| `src/fetchers/helius.ts` | 144, 178 | `// TODO: Implement automatic retry...` in legacy methods | Info | Legacy methods only — new fetchSwapHistory already has p-retry; these TODOs are in deprecated code paths |
| `src/cli.ts` | 23-26 | `score` command stub ("Coming soon...") | Info | Phase 2 scope does not include score command; placeholder expected at this stage |

No blocker anti-patterns found. All identified issues are in legacy or out-of-scope code paths.

---

## Human Verification Required

### 1. End-to-End Wallet Import

**Test:** Set `HELIUS_API_KEY` in `.env`, run `pnpm score wallet add <real-solana-address>` with a wallet known to have swap history
**Expected:** CLI prints "Wallet X added. Importing history..." then "Wallet X import complete."; `sqlite3 data/echo.db "SELECT status, history_complete FROM wallets WHERE address='X'"` returns `tracked|1`; `SELECT count(*) FROM swaps WHERE wallet_address='X'` returns > 0 if wallet has swaps
**Why human:** Requires live Helius API key and real network call to a Solana mainnet wallet

### 2. Importing Status Yellow Display

**Test:** Manually insert a wallet with status='importing' directly into the DB, then run `echo wallet list`
**Expected:** The wallet row appears with the word "importing" rendered in yellow terminal text
**Why human:** chalk color output is stripped in test environments; requires visual inspection in a real terminal

### 3. Rate Limiting Behavior

**Test:** Add a wallet with a large swap history and monitor HTTP call timing
**Expected:** No more than 2 Helius API requests per second regardless of history volume
**Why human:** Requires live API calls and timing measurement to observe actual throttling

### 4. Parse Error Silent Logging

**Test:** Manufacture a known-DEX transaction with malformed swap event data, trigger importWalletHistory
**Expected:** Error is written to parse_errors table with no console output; import continues processing remaining transactions
**Why human:** Requires controlled injection of malformed data into the live import pipeline

---

## Gaps Summary

No gaps found. All 17 observable truths are verified. All required artifacts exist, are substantive, and are wired. All 3 requirement IDs (PARS-01, PARS-02, PARS-03) are satisfied with code evidence.

The 3 human verification items are informational — they test live API behavior and visual rendering that cannot be verified programmatically. The automated test suite (29 tests, 6 suites, all passing) provides full coverage of the parsing logic, FIFO algorithm, and command wiring.

---

_Verified: 2026-03-11_
_Verifier: Claude (gsd-verifier)_
