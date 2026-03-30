# Phase 08: Wallet Discovery — Validation Architecture

**Source:** Extracted from 08-RESEARCH.md Validation Architecture section
**Phase:** 08-wallet-discovery
**Created:** 2026-03-16

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest 29.1.1 |
| Config file | `jest.config.cjs` |
| Quick run command | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery` |
| Full suite command | `NODE_OPTIONS=--experimental-vm-modules pnpm test` |

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| DISC-01 | `fetchEarlyBuyers(mint)` returns deduplicated buyer addresses | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery/early-buyers` | `src/discovery/__tests__/early-buyers.test.ts` |
| DISC-01 | Buyer extraction correctly reads `toUserAccount` from tokenTransfers | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery/early-buyers` | `src/discovery/__tests__/early-buyers.test.ts` |
| DISC-02 | Wallets below threshold are not inserted into wallets table | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery` | `src/discovery/__tests__/discovery.test.ts` |
| DISC-02 | Wallets above threshold are inserted with `probation_until` set | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery` | `src/discovery/__tests__/discovery.test.ts` |
| DISC-03 | Signal engine excludes probationary wallets from smart wallet query | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern signals/engine` | `src/signals/__tests__/engine.test.ts` (extend existing) |
| DISC-03 | Wallet with `probation_until > now` does not appear in signal computation | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern signals/engine` | `src/signals/__tests__/engine.test.ts` (extend existing) |
| DISC-03 | Wallet with `probation_until < now` (graduated) appears in signal computation | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern signals/engine` | `src/signals/__tests__/engine.test.ts` (extend existing) |
| DISC-04 | `fetchCoTraders(knownAddresses)` returns co-trader addresses | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery/graph-traverse` | `src/discovery/__tests__/graph-traverse.test.ts` |
| DISC-04 | Already-known addresses are excluded from co-trader results | unit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery/graph-traverse` | `src/discovery/__tests__/graph-traverse.test.ts` |

---

## Sampling Rate

| Gate | Command |
|------|---------|
| Per task commit | `NODE_OPTIONS=--experimental-vm-modules pnpm test -- --testPathPattern discovery` |
| Per wave merge | `NODE_OPTIONS=--experimental-vm-modules pnpm test` (all 167+ tests) |
| Phase gate | Full suite green before `/gsd:verify-work` |

---

## Wave 0 Gaps (test scaffolds that must exist before implementation)

| File | Covers | Status |
|------|--------|--------|
| `src/discovery/__tests__/early-buyers.test.ts` | DISC-01 buyer extraction with mock HeliusTransaction fixtures | Created in plan 08-02 |
| `src/discovery/__tests__/graph-traverse.test.ts` | DISC-04 co-trader extraction with mock swap data | Created in plan 08-03 (Task 2a) |
| `src/discovery/__tests__/discovery.test.ts` | DISC-02 threshold gate (mock importWalletHistory + scoreAllEligible) | Created in plan 08-03 (Task 2b) |
| `src/signals/__tests__/engine.test.ts` (extend) | DISC-03 — add 3 test cases for probation_until guard | Extended in plan 08-03 (Task 1) |
| `src/db/migrations/0007_wallet_discovery.sql` | Schema foundation for all DISC-* tests | Created in plan 08-01 |

---

## Plan-to-Test Coverage Matrix

| Plan | Tasks | Requirements Tested |
|------|-------|---------------------|
| 08-01 | Schema migration + migration tooling | Foundation for DISC-01, DISC-02, DISC-03, DISC-04 |
| 08-02 | HeliusFetcher.fetchEarlySwapsForMint + early-buyers TDD | DISC-01 |
| 08-03 | Signal engine probation guard + graph traversal + orchestrator | DISC-02, DISC-03, DISC-04 |
| 08-04 | CLI wallet discover + dashboard probation visibility | DISC-01 (CLI surface), DISC-02, DISC-03 (UI) |
