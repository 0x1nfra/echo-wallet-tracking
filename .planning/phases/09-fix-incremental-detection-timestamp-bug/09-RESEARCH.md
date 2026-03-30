# Phase 9: Fix Incremental Detection Timestamp Bug - Research

**Researched:** 2026-03-28
**Domain:** Detection engine timestamp unit normalization + DETC-01/02/03/04 + RMVL-02 end-to-end path
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DETC-01 | System detects bundler wallets (same-block coordinated buys from wallets sharing a funding source) | `detectBundler()` is implemented in `src/detection/bundler.ts`. Tests exist in `src/detection/__tests__/bundler.test.ts`. The detector itself is correct — it runs whenever `runDetection()` is called. The gap is that `runDetectionIfNeeded()` never triggers it on subsequent monitoring cycles due to the timestamp bug. |
| DETC-02 | System detects dev wallets (wallet received tokens directly from the token deployer address) | `detectDevWallet()` is implemented in `src/detection/dev-wallet.ts`. Same issue as DETC-01 — detector is correct but gated behind the broken `runDetectionIfNeeded()`. |
| DETC-03 | System detects sniper bots (wallet consistently buys in first 2-3 blocks of token launches) | `detectSniper()` is implemented in `src/detection/sniper.ts`. Same gating issue. |
| DETC-04 | System detects wash traders (circular trades between related wallets) | `detectWashTrader()` is implemented in `src/detection/wash-trader.ts`. Same gating issue PLUS a secondary timestamp units bug in the wash-trader window comparison (windowMs vs. seconds timestamps — see Pitfall 2 below). |
| RMVL-02 | System automatically removes a wallet when bundle/scam detection reaches "confirmed" confidence level | `checkRemovalPolicies()` in `src/monitor/removal.ts` already checks `wallet.detection_status === 'confirmed_suspicious'` and calls `removeWallet()`. This code is complete and correct. The only reason RMVL-02 fails end-to-end is that detection never re-runs post-import, so `detection_status` never reaches `confirmed_suspicious` from new swaps. Fixing the timestamp bug closes the loop. |
</phase_requirements>

---

## Summary

Phase 9 closes five open v1 requirements (DETC-01 through DETC-04 and RMVL-02). Four of those requirements are already implemented in terms of their detector logic — the problem is a timestamp units mismatch that prevents `runDetectionIfNeeded()` from ever triggering on monitoring cycles after initial import.

The primary bug is in `src/detection/engine.ts` line 117. `swaps.timestamp` stores Unix seconds (Helius API native). `wallets.last_checked_at` stores `Date.now()` milliseconds. The query `gt(swaps.timestamp, lastChecked)` compares ~`1_711_000_000` seconds against ~`1_711_000_000_000` milliseconds. The swap timestamp is always numerically less than `lastChecked`, so `hasNewSwaps` always returns `null`, detection never re-runs, and RMVL-02 can never trigger from new swaps.

A secondary bug exists in `src/detection/wash-trader.ts` line 93/161: `windowMs` is computed in milliseconds but compared against `swap.timestamp` values which are in seconds. This makes the 7-day relationship window behave as a ~19-year window in production. The existing wash-trader tests pass because they use millisecond constants for both sides of the comparison, masking the bug.

A third timestamp units concern is in `src/scoring/engine.ts` line 158: `scoreWalletIfNeeded()` compares `gt(swaps.timestamp, existing.calculated_at)` where `calculated_at` is stored as `Date.now()` (milliseconds). This has the same structure as the primary bug but affects scoring, not detection.

**Primary recommendation:** In `runDetectionIfNeeded()`, divide `lastChecked` by 1000 before the drizzle `gt()` comparison to normalize it to seconds. Fix the wash-trader window to use seconds. Audit `scoreWalletIfNeeded()` for the parallel scoring bug. Add regression tests for all three fixes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | (project-installed) | DB queries, schema, comparisons | Already used throughout — `gt()`, `eq()`, `and()` operators |
| better-sqlite3 | (project-installed) | SQLite driver (synchronous) | Already in use — all DB calls are `.run()` / `.get()` / `.all()` |
| Jest + ts-jest ESM | ^29.7.0 | Test framework | Already configured in `jest.config.cjs` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Date.now()` | built-in | Current time in milliseconds | Writing `last_checked_at`, `calculated_at`, `updated_at` |
| `Math.floor(ms / 1000)` | built-in | Convert ms to seconds | Normalizing before comparing to `swaps.timestamp` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Divide `lastChecked` by 1000 at query time | Store `last_checked_at` in seconds | Changing the column unit would require a migration and touches more code; a localized fix at the comparison site is lower risk |
| Fixing wash-trader windowMs | Leaving it | The wash-trader bug means detection fires too permissively (19-year window) — it can produce false positives. Must fix. |

**Installation:** No new dependencies required.

---

## Architecture Patterns

### Files That Change

```
src/
├── detection/
│   ├── engine.ts           # PRIMARY FIX: runDetectionIfNeeded() line 117
│   └── wash-trader.ts      # SECONDARY FIX: windowMs → windowSec line 93
├── scoring/
│   └── engine.ts           # TERTIARY FIX: scoreWalletIfNeeded() line 158
src/detection/__tests__/
│   ├── engine.test.ts      # ADD: runDetectionIfNeeded regression tests
│   └── wash-trader.test.ts # FIX: update BASE_TIMESTAMP to seconds, verify window boundary
```

### Pattern 1: Primary Fix — Normalize ms to seconds at query time

**What:** Divide `lastChecked` by 1000 before passing to `gt()` so it matches `swaps.timestamp` units (seconds).

**When to use:** Any place where a millisecond wall-clock value is compared against `swaps.timestamp`.

**Current (broken):**
```typescript
// src/detection/engine.ts line 115-118
const lastChecked = wallet.last_checked_at ?? 0;
const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
  .where(and(eq(swaps.wallet_address, walletAddress), gt(swaps.timestamp, lastChecked)))
  .get();
```

**Fixed:**
```typescript
const lastChecked = wallet.last_checked_at ?? 0;
// last_checked_at is milliseconds (Date.now()); swaps.timestamp is seconds
const lastCheckedSec = Math.floor(lastChecked / 1000);
const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
  .where(and(eq(swaps.wallet_address, walletAddress), gt(swaps.timestamp, lastCheckedSec)))
  .get();
```

### Pattern 2: Wash-Trader Window Fix — Convert window to seconds

**What:** The `windowMs` constant is in milliseconds. Swap timestamps are in seconds. The comparison on line 161 must use the same units.

**Current (broken):**
```typescript
// src/detection/wash-trader.ts line 93
const windowMs = WASH_TRADER.RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
// ... line 161
sell.timestamp < buy.timestamp + windowMs  // BUG: 604_800_000 added to ~1_711_000_000 seconds
```

**Fixed:**
```typescript
const windowSec = WASH_TRADER.RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60;
// ...
sell.timestamp < buy.timestamp + windowSec
```

The wash-trader tests must also update `BASE_TIMESTAMP` from `1_700_000_000_000` (ms) to `1_700_000_000` (sec) and `WINDOW_MS` to `WINDOW_SEC`.

### Pattern 3: Scoring Engine Parallel Fix

**What:** `scoreWalletIfNeeded()` compares `gt(swaps.timestamp, existing.calculated_at)`. `calculated_at` is stored as `Date.now()` ms via `persistScore()` (`calculated_at: nowMs`). The fix is to convert `calculated_at` to seconds before the comparison.

**Current (broken):**
```typescript
// src/scoring/engine.ts line 155-160
const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
  .where(and(
    eq(swaps.wallet_address, walletAddress),
    gt(swaps.timestamp, existing.calculated_at),  // BUG: ms vs seconds
  ))
  .get();
```

**Fixed:**
```typescript
const calculatedAtSec = Math.floor((existing.calculated_at ?? 0) / 1000);
const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
  .where(and(
    eq(swaps.wallet_address, walletAddress),
    gt(swaps.timestamp, calculatedAtSec),
  ))
  .get();
```

### Pattern 4: Dependency Injection for Engine Tests

The existing detectors (`bundler`, `sniper`, `wash-trader`, `dev-wallet`) all accept optional `deps` for test isolation. `runDetectionIfNeeded()` currently hits the real DB directly. For unit testing the timestamp fix, tests must either:
- Use a real in-memory SQLite instance (heavier), OR
- Mock `db.select().from().where().get()` at the module level.

The existing `engine.test.ts` tests `computeOverallStatus()` only (pure function, no DB). New tests for `runDetectionIfNeeded()` will need DB access — the path of least resistance is an in-memory SQLite test database using the same schema, or mocking at the drizzle level.

Recommended approach: create a minimal integration test that seeds an in-memory DB (or uses the project's existing SQLite test pattern) and asserts the gate fires/skips correctly with realistic second-unit timestamps.

### Anti-Patterns to Avoid

- **Storing `last_checked_at` in seconds:** Would fix the comparison but require a migration and break the existing `Date.now()` convention used everywhere else. Change at the comparison site, not the storage site.
- **Using `BigInt` or date libraries:** Unnecessary complexity. Simple `Math.floor(ms / 1000)` is sufficient.
- **Updating only `runDetectionIfNeeded` without fixing `scoreWalletIfNeeded`:** Leaves a parallel bug that causes scoring to also fire unnecessarily on every cycle (all swaps appear "new" because seconds < milliseconds is always true — actually scoring fires every time, not never, because swaps.timestamp < calculated_at in ms is always false... wait: `gt(swaps.timestamp, calculated_at)` where swaps.timestamp ~1_711_000_000 and calculated_at ~1_711_000_000_000 — same direction as detection bug — so scoring also never re-runs after the initial run. Both scoring and detection share the same bug pattern and both need fixing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time unit conversion | Custom timestamp normalization class | Inline `Math.floor(ms / 1000)` | One expression, no abstraction needed |
| Test DB setup | Custom SQLite helpers | ts-jest + better-sqlite3 in-memory + existing schema | Already how other tests work |
| Window comparison | Moment.js or date-fns | Arithmetic on Unix seconds | No timezone or DST concerns in Unix epoch arithmetic |

---

## Common Pitfalls

### Pitfall 1: The Primary Bug — `runDetectionIfNeeded()` always returns early

**What goes wrong:** After initial import sets `last_checked_at ≈ 1_711_000_000_000` ms, the query `gt(swaps.timestamp, lastChecked)` compares swap timestamps (~`1_711_000_000` seconds) against `1_711_000_000_000`. Since `1_711_000_000 < 1_711_000_000_000`, `hasNewSwaps` is always `null`. Detection never re-runs. RMVL-02 never fires from monitoring cycles.

**Why it happens:** Two different conventions: Helius API returns Unix seconds; `Date.now()` returns milliseconds. The schema stores both without annotating units.

**How to avoid:** Fix: `const lastCheckedSec = Math.floor(lastChecked / 1000)` before the drizzle query.

**Warning signs:** Detection status never updates from `pending` during monitoring cycles; wallet flags never appear post-import.

### Pitfall 2: The Wash-Trader Secondary Bug — 7-day window is actually 19+ years

**What goes wrong:** `windowMs = RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60 * 1000 = 604_800_000`. This gets added to `buy.timestamp` which is in seconds (~`1_711_000_000`). The effective upper bound becomes `1_711_000_000 + 604_800_000 = 2_315_800_000` seconds = year ~2043. Every sell by wallet_b within 17 years of the buy will match.

**Why it happens:** The variable is named `windowMs` and computed correctly in milliseconds — but the comparison is against second-unit timestamps.

**How to avoid:** Use `windowSec = WASH_TRADER.RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60` (no `* 1000`).

**Warning signs:** Wash-trader tests use `BASE_TIMESTAMP = 1_700_000_000_000` (ms) — they pass because both sides use the same wrong unit. In production with DB data (seconds), the window is unbounded.

### Pitfall 3: Wash-Trader Tests Use Wrong Timestamp Units

**What goes wrong:** `src/detection/__tests__/wash-trader.test.ts` line 86: `const BASE_TIMESTAMP = 1_700_000_000_000` — milliseconds. The mock swap rows have `timestamp: buy_ts` and `timestamp: sell_ts` where both are in ms. The `WINDOW_MS` comparison happens to work because both sides are consistently wrong (ms). After fixing the wash-trader to use seconds, these tests will fail because `buy_ts = 1_700_000_000_000` seconds is invalid (year ~55,000 AD).

**How to avoid:** When fixing wash-trader, also update test fixtures: `BASE_TIMESTAMP = 1_700_000_000` (seconds) and rename `WINDOW_MS` to `WINDOW_SEC`.

### Pitfall 4: Scoring Engine Has the Same Bug

**What goes wrong:** `scoreWalletIfNeeded()` at line 158 does `gt(swaps.timestamp, existing.calculated_at)` where `calculated_at` is `Date.now()` milliseconds. Same direction as the detection bug — swap timestamp in seconds is always numerically less than `calculated_at` in ms — so `scoreWalletIfNeeded()` also never re-runs after initial scoring.

**How to avoid:** Fix with `Math.floor((existing.calculated_at ?? 0) / 1000)` before the comparison.

### Pitfall 5: `last_trade_at` is Stored in Milliseconds in the Monitor Loop

**What goes wrong:** In `src/monitor/loop.ts` line 145, `last_trade_at` is set to `latestSwapTs * 1000` (converting seconds to ms). The `checkRemovalPolicies()` inactivity check at `removal.ts` line 94 computes `Date.now() - wallet.last_trade_at` — both are in ms, so this is correct. Do NOT normalize `last_trade_at` comparisons.

**Warning signs:** Attempting to "fix" `last_trade_at` comparisons would break the inactivity removal policy.

### Pitfall 6: `runDetection()` vs `runDetectionIfNeeded()` Responsibility

**What goes wrong:** `importWalletHistory()` calls `runDetection()` directly (bypasses the gate). The monitor loop calls `runDetectionIfNeeded()` (respects the gate). The fix to `runDetectionIfNeeded()` must NOT break the direct path in `importWalletHistory`.

**How to avoid:** Only touch `runDetectionIfNeeded()`. The `runDetection()` function does not have any timestamp comparison — it always runs all four detectors. This is correct behavior for initial import.

---

## Code Examples

### Full Corrected `runDetectionIfNeeded()`
```typescript
// src/detection/engine.ts — after fix
export async function runDetectionIfNeeded(walletAddress: string): Promise<void> {
  const wallet = db.select().from(wallets).where(eq(wallets.address, walletAddress)).get();
  if (!wallet?.history_complete) return;

  const lastChecked = wallet.last_checked_at ?? 0;
  // last_checked_at is stored as Date.now() milliseconds; swaps.timestamp is Unix seconds
  const lastCheckedSec = Math.floor(lastChecked / 1000);
  const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
    .where(and(eq(swaps.wallet_address, walletAddress), gt(swaps.timestamp, lastCheckedSec)))
    .get();
  if (!hasNewSwaps) return;

  await runDetection(walletAddress);
}
```

### End-to-End RMVL-02 Path (confirmed working)
```
MonitorLoop.runCycle()
  → runDetectionIfNeeded(address)       ← FIXED: now correctly detects new swaps
      → runDetection(address)
          → detectBundler / detectDevWallet / detectSniper / detectWashTrader
          → upserts wallet_flags rows
          → computeOverallStatus(activeFlags)   ← if 'confirmed_suspicious'
          → wallets.detection_status = 'confirmed_suspicious'
  → checkRemovalPolicies(address)       ← reads detection_status
      → wallet.detection_status === 'confirmed_suspicious'  → TRUE
      → removeWallet(address, ...)      ← sets status='removed', inserts removal_log
      → returns true
```

This path is already correct in `src/monitor/removal.ts` lines 51-59. No changes needed there.

### Regression Test Pattern for `runDetectionIfNeeded`
```typescript
// src/detection/__tests__/engine.test.ts — new test section
// Uses a real in-memory DB seeded with controlled data

describe('runDetectionIfNeeded — timestamp unit regression (DETC-01 gap)', () => {
  it('fires detection when swap.timestamp (seconds) is newer than last_checked_at (ms)', async () => {
    // Arrange: wallet with last_checked_at set 1 hour ago in ms
    const nowMs = Date.now();
    const oneHourAgoMs = nowMs - 3_600_000;
    // Swap timestamp in seconds, 30 min ago — NEWER than last_checked_at
    const swapTimestampSec = Math.floor((nowMs - 1_800_000) / 1000);
    // seed wallet with last_checked_at = oneHourAgoMs, history_complete=true
    // seed one swap with timestamp = swapTimestampSec
    // spy on runDetection

    // Act: await runDetectionIfNeeded(walletAddress)

    // Assert: runDetection was called (detection fired)
  });

  it('skips detection when no swaps newer than last_checked_at', async () => {
    // Arrange: wallet with last_checked_at = now in ms
    // All swaps have timestamps OLDER than now/1000

    // Act: await runDetectionIfNeeded(walletAddress)

    // Assert: runDetection was NOT called
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Detection fires only at import | Detection re-fires on every cycle with new swaps | Phase 9 fix | Post-import scammers are caught and auto-removed |
| Wash-trader window effectively unbounded | Wash-trader window correctly bounded to 7 days in seconds | Phase 9 fix | Reduces false positives from stale circular patterns |
| scoreWalletIfNeeded never re-runs | scoreWalletIfNeeded correctly re-runs when new swaps exist | Phase 9 fix | Score stays current across monitoring cycles |

---

## Open Questions

1. **Should `engine.test.ts` tests for `runDetectionIfNeeded` use a real SQLite in-memory DB or mock drizzle?**
   - What we know: The existing `engine.test.ts` tests only `computeOverallStatus()` (pure function). Other detector tests mock the DB via injected deps.
   - What's unclear: `runDetectionIfNeeded()` uses the module-level `db` singleton directly — it does not accept injectable deps. Mocking drizzle's query chain is verbose.
   - Recommendation: For the regression test, use a real in-memory SQLite DB seeded with test data via the same schema. Alternatively, extract the "has new swaps" check into a testable helper function that accepts `lastCheckedMs` and `walletAddress` and returns a boolean — then test that helper in isolation.

2. **Does fixing `scoreWalletIfNeeded` change Phase 9 scope?**
   - What we know: The scoring engine bug is structurally identical to the detection bug. It is discovered during Phase 9 research.
   - What's unclear: Whether the scoring fix is in-scope for Phase 9 or deferred.
   - Recommendation: Fix it in Phase 9 — it is a one-line change in the same codebase area and the fix is trivially low-risk. Leave it unfixed and scoring never updates post-import.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 + ts-jest ESM preset |
| Config file | `jest.config.cjs` |
| Quick run command | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/engine.test.ts --no-coverage` |
| Full suite command | `NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DETC-01 | Bundler detector flags wallets correctly | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/bundler.test.ts -x` | Yes |
| DETC-02 | Dev wallet detector flags wallets correctly | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/dev-wallet.test.ts -x` | Yes |
| DETC-03 | Sniper detector flags wallets correctly | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/sniper.test.ts -x` | Yes |
| DETC-04 | Wash-trader detector flags wallets correctly + window is 7 days (seconds) | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/wash-trader.test.ts -x` | Yes (needs update) |
| DETC-01-04 | `runDetectionIfNeeded` fires when new swaps exist (seconds comparison) | regression/unit | `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/engine.test.ts -x` | Yes (needs new tests) |
| RMVL-02 | `checkRemovalPolicies` removes wallet when status is confirmed_suspicious | unit | `NODE_OPTIONS=--experimental-vm-modules npx jest tests/unit/monitor/ -x` | Yes (existing loop tests don't cover removal) |

### Sampling Rate
- **Per task commit:** `NODE_OPTIONS=--experimental-vm-modules npx jest src/detection/__tests__/ --no-coverage`
- **Per wave merge:** `NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/detection/__tests__/engine.test.ts` — add `runDetectionIfNeeded` timestamp regression tests (REQ: DETC-01 through DETC-04)
- [ ] `tests/unit/monitor/removal.test.ts` — add test for RMVL-02: `checkRemovalPolicies` returns true when `detection_status = 'confirmed_suspicious'` (REQ: RMVL-02)
- [ ] `src/detection/__tests__/wash-trader.test.ts` — update `BASE_TIMESTAMP` from ms to seconds, rename `WINDOW_MS` to `WINDOW_SEC` (REQ: DETC-04)

---

## Sources

### Primary (HIGH confidence)
- Direct read of `src/detection/engine.ts` — confirmed `runDetectionIfNeeded()` bug at line 117
- Direct read of `src/db/schema.ts` — confirmed `swaps.timestamp` is `integer` (no annotation), `wallets.last_checked_at` is `integer` (no annotation)
- Direct read of `src/monitor/loop.ts` — confirmed `last_checked_at` is written as `Date.now()` (ms) at line 153; confirmed `afterTimestamp = Math.floor(wallet.last_checked_at / 1000)` at line 113 (loop already normalizes correctly for Helius fetch — only detection comparison is broken)
- Direct read of `src/detection/wash-trader.ts` — confirmed `windowMs` bug at lines 93 and 161
- Direct read of `src/detection/__tests__/wash-trader.test.ts` — confirmed tests use `BASE_TIMESTAMP = 1_700_000_000_000` (ms), masking the production bug
- Direct read of `src/scoring/engine.ts` — confirmed parallel `scoreWalletIfNeeded()` bug at line 158
- Direct read of `src/importers/history.ts` — confirmed `last_checked_at: Date.now()` at line 63, `runDetection()` called directly (not via `runDetectionIfNeeded`) at line 68
- Direct read of `src/monitor/removal.ts` — confirmed RMVL-02 path is complete: lines 51-59 handle `confirmed_suspicious` → `removeWallet()`

### Secondary (MEDIUM confidence)
- `jest.config.cjs` — confirmed test framework, testMatch patterns, and ESM preset
- `.planning/config.json` — confirmed `nyquist_validation` key is absent (treat as enabled)

### Tertiary (LOW confidence)
- None — all findings based on direct source code read.

---

## Metadata

**Confidence breakdown:**
- Primary bug (engine.ts): HIGH — confirmed by reading exact lines
- Secondary bug (wash-trader.ts): HIGH — confirmed by reading exact lines and test fixtures
- Tertiary bug (scoring/engine.ts): HIGH — confirmed by reading exact lines
- RMVL-02 end-to-end path: HIGH — confirmed removal.ts is complete, no code missing
- Test gaps: HIGH — confirmed by reading all existing test files

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable codebase, no external API dependency changes)
