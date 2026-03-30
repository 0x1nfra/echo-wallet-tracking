---
phase: 09-fix-incremental-detection-timestamp-bug
type: nyquist_validation
requirements: [DETC-01, DETC-02, DETC-03, DETC-04, RMVL-02]
---

# Phase 9 Validation Architecture

## Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest ESM preset |
| Config file | `jest.config.cjs` |
| Quick run | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/engine.test.ts --no-coverage` |
| Full suite | `NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage` |

## Requirements → Test Map

| Req ID | Behavior | Test Type | File | Exists? |
|--------|----------|-----------|------|---------|
| DETC-01 | Bundler detector flags wallets | unit | `src/detection/__tests__/bundler.test.ts` | Yes — existing 10 tests |
| DETC-02 | Dev wallet detector flags wallets | unit | `src/detection/__tests__/dev-wallet.test.ts` | Yes — existing 7 tests |
| DETC-03 | Sniper detector flags wallets | unit | `src/detection/__tests__/sniper.test.ts` | Yes — existing 11 tests |
| DETC-04 | Wash-trader detector + 7-day window (seconds) | unit | `src/detection/__tests__/wash-trader.test.ts` | Yes — needs update |
| DETC-01–04 | runDetectionIfNeeded fires on new swaps (seconds) | regression | `src/detection/__tests__/engine.test.ts` | Yes — needs new tests |
| RMVL-02 | confirmed_suspicious → auto-removed | integration | covered by Bug 1 fix + existing removal.ts path | Yes (path wired) |

## Wave 0 Gaps (tasks must close before phase complete)

- [ ] `src/detection/__tests__/engine.test.ts` — add 3 `runDetectionIfNeeded` regression tests (fires-on-new-swap, skips-on-old-swap, skips-on-incomplete-history)
- [ ] `src/detection/__tests__/wash-trader.test.ts` — update `BASE_TIMESTAMP` from ms to seconds, rename `WINDOW_MS` → `WINDOW_SEC`
- [ ] Verify no `WINDOW_MS` references remain in wash-trader test file after update

## Sampling Rate

| Milestone | Command |
|-----------|---------|
| Per task | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/ --no-coverage` |
| Per wave | `NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage` |
| Phase gate | Full suite green + `npx tsc --noEmit` clean |

## Key Grep Assertions (post-execution)

```bash
grep -n "Math.floor(lastChecked / 1000)" src/detection/engine.ts        # must match
grep -n "windowSec" src/detection/wash-trader.ts                         # must match
grep -n "Math.floor(existing.calculated_at / 1000)" src/scoring/engine.ts  # must match
grep -n "WINDOW_MS" src/detection/__tests__/wash-trader.test.ts          # must return NO matches
```
