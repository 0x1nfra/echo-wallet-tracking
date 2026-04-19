---
phase: 16-providerrouter-extension
plan: "00"
subsystem: provider-layer / test-harness
tags: [wave-0, scaffolding, verification-script, test-helpers]
dependency_graph:
  requires: []
  provides:
    - scripts/verify-shyft-action-types.ts
    - router.test.ts makeProvider helper with getTransactionDetails
    - shyft-provider.test.ts makeNativeTransferTx helper
  affects:
    - Plan 01 (Wave 1): uses these helpers for getTransactionDetails feature tests
tech_stack:
  added: []
  patterns:
    - standalone tsx script with dotenv/config for API verification
    - TDD scaffolding: helper extension before feature implementation
key_files:
  created:
    - scripts/verify-shyft-action-types.ts
  modified:
    - src/fetchers/providers/__tests__/router.test.ts
    - src/fetchers/providers/__tests__/shyft-provider.test.ts
decisions:
  - "Script uses tsx (not ts-node) per project convention — npx tsx scripts/verify-shyft-action-types.ts"
  - "makeProvider return type is RpcProvider & { getTransactionDetails: ... } intersection — narrows back to RpcProvider in Plan 01 after types.ts update"
  - "makeNativeTransferTx accepts loose string actionType — D-03 live run decides the final allowed set"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-20"
  tasks_completed: 3
  files_changed: 3
---

# Phase 16 Plan 00: Wave 0 Scaffolding Summary

**One-liner:** D-03 live verification script + test helper extensions for getTransactionDetails wave-0 gate.

## What Was Built

### Task 1: D-03 Shyft Action Type Live Verification Script

`scripts/verify-shyft-action-types.ts` — a standalone operator-runnable script that:
- Reads `SHYFT_API_KEY` from environment (throws if missing)
- Loops over `KNOWN_BUNDLED_TX_SIGNATURES[]` array (operator fills in real signatures)
- Calls `GET https://api.shyft.to/sol/v1/transaction/parsed` with `txn_signature` + `x-api-key`
- Logs per-signature: `status`, `type`, `actions.length`, `action_types` (unique sorted), `sample action[0]`
- Prints aggregate summary line: `[verify-shyft] SUMMARY observed native-transfer-candidate types: ...`
- Exit code 0 if at least one signature fetched, 1 if all failed

Run command: `npx tsx scripts/verify-shyft-action-types.ts`

Type-checks cleanly: `npx tsc --noEmit scripts/verify-shyft-action-types.ts` exits 0.

Note: The project uses `tsx` (not `ts-node`) as its TypeScript runner — the script works with `npx tsx`. The `ts-node` reference in the plan text can be substituted with `npx tsx`.

### Task 2: router.test.ts makeProvider Helper Extension

`makeProvider` now accepts an optional `getTransactionDetails?: HeliusTransaction | Error` in its results parameter. The returned object includes a `getTransactionDetails` async fn that resolves or rejects based on the supplied value. Return type changed to `RpcProvider & { getTransactionDetails: (sig: string) => Promise<HeliusTransaction> }` intersection — this avoids TypeScript errors since `RpcProvider` doesn't yet have `getTransactionDetails` (Plan 01 adds it).

One new sanity test added (`makeProvider helper accepts optional getTransactionDetails (wave-0 scaffolding)`). All 11 tests pass.

### Task 3: shyft-provider.test.ts makeNativeTransferTx Helper

New `makeNativeTransferTx(sig, actionType, sender, receiver, amount, timestamp?)` helper added after `makeSwapTx`. Accepts any `string` for `actionType` (loose typing — D-03 output decides the final set). Returns a `ShyftRawTx` with a single `actions[]` entry carrying `{ sender, receiver, amount }` in `info`.

One new sanity test added (`makeNativeTransferTx helper builds correct raw tx shape (wave-0 scaffolding)`). All 14 tests pass.

## D-03 Observed Action Types

**Status: PENDING — operator must run the script before Plan 01 begins.**

The script has been committed. The operator must:

1. Identify one or more bundled-transaction signatures (from `signal_events` or bundler-flagged wallets in the DB)
2. Replace `REPLACE_WITH_BUNDLED_TX_SIG` placeholders in `KNOWN_BUNDLED_TX_SIGNATURES`
3. Run: `npx tsx scripts/verify-shyft-action-types.ts`
4. Paste the `action_types=[...]` output lines here before starting Plan 01

**Pointer for Plan 01:** Use this observed action-type list to implement `extractNativeTransfers` — do NOT assume additional types beyond what is printed above. Known candidates from documentation: `SOL_TRANSFER`, `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER`. Only implement the ones that appear in the live response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Set spread syntax incompatible with tsc default target**
- **Found during:** Task 1 verification (`npx tsc --noEmit scripts/verify-shyft-action-types.ts`)
- **Issue:** `[...new Set(...)]` spread fails with `TS2802` when tsc uses ES5 target (default when no tsconfig)
- **Fix:** Changed to `Array.from(new Set(...))` — equivalent behavior, compatible with all targets
- **Files modified:** `scripts/verify-shyft-action-types.ts`
- **Commit:** 83a36a5

**2. [Rule 2 - Convention] Project uses tsx not ts-node**
- **Found during:** Task 1 (package.json read)
- **Issue:** Plan text says `npx ts-node scripts/...` but project only has `tsx` as dev dep (no `ts-node` installed)
- **Fix:** Script comment documents `npx tsx scripts/verify-shyft-action-types.ts` as the run command; noted in SUMMARY
- **Files modified:** `scripts/verify-shyft-action-types.ts` (comment only)

## Verification Results

```
Task 1: npx tsc --noEmit scripts/verify-shyft-action-types.ts  → exit 0
Task 2: npm test -- --testPathPattern="router"  → 11/11 PASS
Task 3: npm test -- --testPathPattern="shyft-provider"  → 14/14 PASS
Wave 0: npm test -- --testPathPattern="router|shyft-provider"  → 25/25 PASS
```

No production source files under `src/fetchers/providers/` or `src/detection/` were modified.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| scripts/verify-shyft-action-types.ts exists | FOUND |
| router.test.ts exists | FOUND |
| shyft-provider.test.ts exists | FOUND |
| commit 83a36a5 (Task 1) | FOUND |
| commit 548019e (Task 2) | FOUND |
| commit b12508c (Task 3) | FOUND |
