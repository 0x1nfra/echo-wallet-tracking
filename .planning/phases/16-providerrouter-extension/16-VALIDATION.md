---
phase: 16
slug: providerrouter-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 with ts-jest, `NODE_OPTIONS=--experimental-vm-modules` |
| **Config file** | `jest.config.cjs` |
| **Quick run command** | `npm test -- --testPathPattern="router\|shyft-provider\|bundler\|wash-trader" --passWithNoTests` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds (quick), ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="router|shyft-provider|bundler|wash-trader" --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 16-00-01 | 00 | 0 | API-02 | D-03 live verification — action types logged before code written | manual | `npx ts-node scripts/verify-shyft-action-types.ts` | ❌ W0 | ⬜ pending |
| 16-01-01 | 01 | 1 | API-01 | `getTransactionDetails` on `RpcProvider` interface | unit | `npm test -- --testPathPattern="router"` | ✅ (new describe block) | ⬜ pending |
| 16-01-02 | 01 | 1 | API-01 | HeliusProvider.getTransactionDetails delegates to HeliusFetcher | unit | `npm test -- --testPathPattern="helius-provider"` | ✅ (new describe block) | ⬜ pending |
| 16-01-03 | 01 | 1 | API-01 | ShyftProvider.getTransactionDetails calls /sol/v1/transaction/parsed | unit | `npm test -- --testPathPattern="shyft-provider"` | ✅ (new describe block) | ⬜ pending |
| 16-01-04 | 01 | 1 | API-02 | extractNativeTransfers handles all verified action types | unit | `npm test -- --testPathPattern="shyft-provider"` | ✅ (new test cases) | ⬜ pending |
| 16-01-05 | 01 | 1 | API-03 | Router throws when all providers exhausted (getTransactionDetails) | unit | `npm test -- --testPathPattern="router"` | ✅ (new describe block) | ⬜ pending |
| 16-02-01 | 02 | 2 | API-01 | bundler.ts getDefaultFetcher returns sharedProviderRouter | unit | `npm test -- --testPathPattern="bundler"` | ✅ (existing passing) | ⬜ pending |
| 16-02-02 | 02 | 2 | API-01 | wash-trader.ts getDefaultFetcher returns sharedProviderRouter | unit | `npm test -- --testPathPattern="wash-trader"` | ✅ (existing passing) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-shyft-action-types.ts` — D-03 live verification script: fetches a real Shyft tx for a known bundled CA, logs `actions[].type` values. Must run before shyft-provider.ts is modified.
- [ ] New `describe('getTransactionDetails')` block in `src/fetchers/providers/__tests__/router.test.ts`
- [ ] New `describe('getTransactionDetails')` block in `src/fetchers/providers/__tests__/shyft-provider.test.ts`

*Existing test infrastructure (Jest + ts-jest) covers all phase requirements — no new framework installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D-03 action type verification | API-02 | Live Shyft API call — can't mock the real response | Run `scripts/verify-shyft-action-types.ts` against a known bundled CA. Log output before implementing extractNativeTransfers extension. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
