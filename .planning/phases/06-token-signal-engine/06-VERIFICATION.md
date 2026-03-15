---
phase: 06-token-signal-engine
verified: 2026-03-16T00:00:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 6: Token Signal Engine Verification Report

**Phase Goal:** The system produces a per-token buy/sell signal score after each monitoring cycle that reflects genuine smart money activity
**Verified:** 2026-03-16
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | token_signals table has signal_tier TEXT column | VERIFIED | `src/db/schema.ts` line 65: `signal_tier: text('signal_tier')` |
| 2 | token_signals table has coordinated_wallet_count INTEGER column | VERIFIED | `src/db/schema.ts` line 66: `coordinated_wallet_count: integer('coordinated_wallet_count')` |
| 3 | drizzle schema.ts reflects both new columns | VERIFIED | Both fields present after `coordination_discount` in token_signals table definition |
| 4 | migration applies cleanly on a fresh db (migrate() on startup) | VERIFIED | `0005_token_signal_columns.sql` exists; journal entry idx=5 with `when=1773510000000` (exceeds 0004's 1773420419000); engine.test.ts creates in-memory DB via migrate() and all 14 tests pass |
| 5 | computeSignalScore returns 0 when fewer than 2 smart wallet holders | VERIFIED | scorer.ts lines 151-159 implement MIN_SMART_WALLETS=2 floor; Tests 1+2 confirm score=0, tier='inactive' |
| 6 | Score formula weights 40%/35%/25% | VERIFIED | scorer.ts lines 18-24: WEIGHT_PNL_HOLDER_QUALITY=0.40, WEIGHT_BUY_VELOCITY=0.35, WEIGHT_SMART_WALLET_COUNT=0.25; Test 3 confirms rawScore=72 for 2 holders at walletScore=80, buysLast1h=5 |
| 7 | exit_pressure computed and returned but does NOT affect signal_score | VERIFIED | scorer.ts lines 142-143 compute exitPressure independently; line 191 final score formula has no exitPressure term; Tests 6+7 confirm |
| 8 | Signal tiers: strong>=65, moderate>=35, weak<35, inactive=0 | VERIFIED | getSignalTier() lines 216-219 implement exact boundaries; Test 11 confirms all boundary values |
| 9 | All-coordinated token produces signal_score=0 | VERIFIED | scorer.ts lines 162-171 early-exit if allCoordinated; Test 8 confirms score=0, coordinationDiscount=0.3 |
| 10 | Partial coordination produces proportional discount multiplier=1-(0.7*coordRatio) | VERIFIED | scorer.ts line 148: `coordinationDiscount = 1.0 - coordinationRatio * COORDINATION_PENALTY`; Test 9 confirms ratio=0.5 → discount=0.65 |
| 11 | Score clamps to [0, 100] | VERIFIED | scorer.ts line 191: `Math.round(Math.max(0, Math.min(100, rawScore * coordinationDiscount)))`; Tests 4+5 confirm |
| 12 | computeAllTokenSignals() runs after each monitoring cycle | VERIFIED | loop.ts lines 180-188: post-cycle try/catch block calls computeAllTokenSignals() after cycle-complete log |
| 13 | Ineligible tokens get signal_score=0, signal_tier='inactive' | VERIFIED | engine.ts lines 227-254 upsert with signal_score=0, signal_tier='inactive' when score drops; engine Tests 4+5 confirm skip vs suppress logic |
| 14 | Tokens with no prior record and zero eligible holders are NOT inserted | VERIFIED | engine.ts line 256 comment and else branch (no insert); engine Test 4 confirms row remains undefined |
| 15 | Existing token_signals records are upserted — never deleted | VERIFIED | engine.ts uses onConflictDoUpdate exclusively; no DELETE statements anywhere in engine.ts; engine Test 11 confirms upsert idempotency |
| 16 | echo signal list displays top tokens by signal_score with tier, score, wallet count, and buy velocity | VERIFIED | signal.ts implements full table with 7 columns (Token, Score, Tier, Wallets, Buy Vel 1h, Exit Pressure, Updated); cli.ts line 17 registers `program.addCommand(createSignalCommand())` |

**Score:** 16/16 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/migrations/0005_token_signal_columns.sql` | ALTER TABLE for signal_tier + coordinated_wallet_count with statement-breakpoint | VERIFIED | 3 lines, both ALTER TABLE statements, `--> statement-breakpoint` separator present |
| `src/db/schema.ts` | Updated token_signals with signal_tier + coordinated_wallet_count | VERIFIED | Lines 65-66 add both fields; schema fully substantive at 126 lines |
| `src/signals/scorer.ts` | Pure computeSignalScore() + getSignalTier() exports | VERIFIED | 247 lines; exports computeSignalScore, getSignalTier, TokenSignalInputs, TokenSignalResult; zero database imports |
| `src/signals/__tests__/scorer.test.ts` | 14 TDD tests covering all SGNL-01/SGNL-03 behaviours | VERIFIED | 253 lines; all 14 specified test cases present and passing |
| `src/signals/engine.ts` | computeAllTokenSignals() with DB queries + upsert | VERIFIED | 261 lines; exports computeAllTokenSignals and SignalCycleSummary; full implementation with batched queries |
| `src/signals/__tests__/engine.test.ts` | 14 integration tests using in-memory SQLite | VERIFIED | 387 lines; 14 tests via createTestDb(); all passing |
| `src/monitor/loop.ts` | Post-cycle signal hook in runCycle() | VERIFIED | Lines 179-188 — try/catch block calling computeAllTokenSignals() after cycle-complete |
| `src/commands/signal.ts` | createSignalCommand() with signal list subcommand | VERIFIED | 61 lines; exports createSignalCommand; full table rendering with cli-table3 + chalk |
| `src/cli.ts` | signal command registered | VERIFIED | Line 6 imports createSignalCommand; line 17 calls program.addCommand(createSignalCommand()) |
| `src/signals/index.ts` | Re-exports public symbols for clean module interface | VERIFIED | Re-exports computeSignalScore, getSignalTier, TokenSignalInputs, TokenSignalResult |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/signals/__tests__/scorer.test.ts` | `src/signals/scorer.ts` | `import { computeSignalScore } from '../scorer.js'` | WIRED | Line 1 imports and all 14 tests exercise computeSignalScore |
| `src/signals/engine.ts` | `src/signals/scorer.ts` | `import { computeSignalScore } from './scorer.js'` | WIRED | Line 12 import; line 189 call: `computeSignalScore({...})` |
| `src/signals/engine.ts` | `src/db/schema.ts token_signals` | `onConflictDoUpdate on token_mint` | WIRED | Lines 201-225 (active upsert) and 229-254 (suppress upsert) both use `onConflictDoUpdate({ target: token_signals.token_mint, set: {...} })` |
| `src/monitor/loop.ts` | `src/signals/engine.ts` | `import { computeAllTokenSignals } from '../signals/engine.js'` | WIRED | Line 9 import; line 181 call inside try/catch |
| `src/cli.ts` | `src/commands/signal.ts` | `program.addCommand(createSignalCommand())` | WIRED | Line 6 import; line 17 registers command |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SGNL-01 | 06-01, 06-02 | Per-token signal score (0-100) based on smart wallet count, buy velocity 1h, exit pressure, PnL-weighted holder score | SATISFIED | scorer.ts implements the exact formula; all sub-scores computed and returned; 14 unit tests cover all behaviours |
| SGNL-02 | 06-03 | Signal updates after each monitoring cycle | SATISFIED | loop.ts calls computeAllTokenSignals() post-cycle in try/catch; engine.ts queries DB and upserts all eligible tokens; MonitorLoop test suite (167 tests) green |
| SGNL-03 | 06-01, 06-02, 06-03 | Signal discount for coordinated holders (shared funding source) | SATISFIED | coordination_discount persisted in token_signals schema; engine.ts loads bundler flags batch and passes to scorer; scorer applies `1 - (coordRatio * 0.7)` multiplier; all-coordinated suppression confirmed by Tests 8+9 |

All three requirements declared across all plans are SATISFIED. No orphaned requirements found — REQUIREMENTS.md traceability table marks all three SGNL-xx as Phase 6 Complete.

---

## Anti-Patterns Found

No anti-patterns detected across modified files:

- No TODO/FIXME/PLACEHOLDER comments in any phase 6 file
- No empty return stubs (`return null`, `return {}`, `return []`) in implementation files
- No console.log-only handler bodies
- scorer.ts has zero database imports (confirmed pure function)
- engine.ts wires DB reads → scorer call → upsert — no static return values

---

## Human Verification Required

The following behaviours cannot be verified programmatically:

### 1. MonitorLoop Signal Log Line

**Test:** Start the monitor loop with at least two tracked confirmed-passing wallets. Wait one 30-second cycle.
**Expected:** Console output contains `[monitor] signals — N updated, M suppressed` after the cycle-complete line.
**Why human:** Requires a running process against a real DB with wallet data and Helius API access.

### 2. echo signal list Table Output

**Test:** After running the monitor with active wallets, run `pnpm tsx src/cli.ts signal list`.
**Expected:** A formatted CLI table appears with columns Token, Score, Tier, Wallets, Buy Vel (1h), Exit Pressure, Updated. Tier column shows green for strong, yellow for moderate.
**Why human:** Requires real DB data; table rendering and chalk color output cannot be tested headlessly.

### 3. Coordinated Token Score Reduction

**Test:** Insert a bundler flag (cleared=false) for one of two holders of a token. Compare signal_score before and after the flag is applied.
**Expected:** Score with partial coordination is lower than score without coordination. Score with all holders flagged is 0 (inactive).
**Why human:** Requires real wallet flag data in the live DB; while the unit tests cover this, end-to-end confirmation with live data provides higher confidence.

---

## Gaps Summary

None. All automated checks pass. The phase goal is fully achieved:

- The DB schema has both new columns (`signal_tier`, `coordinated_wallet_count`) with migration applied correctly.
- The pure scorer implements the locked 40/35/25 formula with coordination discount, all-coordinated suppression, tier boundaries, and score clamping — all 14 TDD test cases pass.
- The engine queries confirmed-passing wallets, builds TokenSignalInputs per token, calls the scorer, and persists results via upsert (never delete).
- MonitorLoop.runCycle() calls the engine post-cycle in a non-fatal try/catch.
- `echo signal list` CLI command is registered and renders a formatted table.
- All 167 tests pass with zero regressions. TypeScript compiles clean.

The system produces a per-token buy/sell signal score after each monitoring cycle that reflects genuine smart money activity. Phase goal achieved.

---

_Verified: 2026-03-16_
_Verifier: Claude (gsd-verifier)_
