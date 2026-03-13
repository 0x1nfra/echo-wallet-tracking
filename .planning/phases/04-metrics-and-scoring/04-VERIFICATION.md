---
phase: 04-metrics-and-scoring
verified: 2026-03-13T00:00:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
---

# Phase 4: Metrics and Scoring Verification Report

**Phase Goal:** Clean wallets receive a reliable 0-100 quality score based on risk-adjusted trading performance
**Verified:** 2026-03-13
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | score_history table exists in DB schema with wallet_address, score, scored_at columns | VERIFIED | `src/db/schema.ts` lines 112-119 export `score_history` with all three columns |
| 2 | wallet_metrics has the five sub-score columns and two trade-count columns | VERIFIED | `src/db/schema.ts` lines 45-51 show all 7 columns (score_total, score_risk_adjusted, score_win_rate, score_consistency_recency, score_activity_health, trade_count, recent_trade_count) |
| 3 | Migration 0003 runs cleanly and creates the correct DDL | VERIFIED | `src/db/migrations/0003_lethal_the_twelve.sql` contains CREATE TABLE score_history, CREATE INDEX score_history_wallet_scored, and 7 ALTER TABLE statements |
| 4 | Win rate is calculated on closed trades (token positions with at least one sell with non-null realized_pnl_sol) | VERIFIED | `src/metrics/win-rate.ts` groupIntoClosedTrades filters to sells with non-null realized_pnl_sol only |
| 5 | Sharpe ratio uses per-trade percentage returns (realized_pnl_sol / cost_basis_sol) and returns 0 for fewer than 2 trades | VERIFIED | `src/metrics/sharpe.ts` line 17: `if (validTrades.length < 2) return 0`; returns per-trade ratio |
| 6 | Max drawdown is expressed as percentage of peak cumulative PnL | VERIFIED | `src/metrics/drawdown.ts` line 26: `(peak - cumulative) / peak` |
| 7 | Recency score returns 0 for zero recent swaps in 180-day window, scaling to 100 at 50+ recent swaps | VERIFIED | `src/metrics/recency.ts` lines 18-20 match the exact formula spec |
| 8 | Score composer produces 0-100 total clamped to 5-95 with four sub-scores at specified weights | VERIFIED | `src/scoring/composer.ts` lines 22-25 declare weight constants (0.40, 0.20, 0.20, 0.20); line 62 clamps to [5, 95] |
| 9 | Bundler profile scores materially lower than consistent trader (difference >= 10 points) | VERIFIED | composer.test.ts separation test: bundler ~58, genuine trader ~68, diff=10; test asserts >= 10 |
| 10 | scoreWallet silently returns without writing data if eligibility gate fails | VERIFIED | `src/scoring/engine.ts` lines 108-120: guards for wallet not found, history_complete, detection_status, and activity floor (<20 swaps) all return silently |
| 11 | scoreWallet writes to wallet_metrics (upsert), updates wallets.score, and appends to score_history | VERIFIED | `src/scoring/engine.ts` persistScore() at lines 50-100: onConflictDoUpdate for wallet_metrics, db.update for wallets.score, db.insert for score_history |
| 12 | scoreAllEligible() scores every wallet passing the eligibility gate | VERIFIED | `src/scoring/engine.ts` lines 171-210: queries wallets where history_complete=true AND detection_status='confirmed_passing' |
| 13 | scoreWalletIfNeeded skips rescoring if no new swaps since calculated_at | VERIFIED | `src/scoring/engine.ts` lines 144-165: queries for swaps with timestamp > calculated_at, returns if none found |
| 14 | CLI command `echo wallet score <address>` triggers scoreWallet and prints score breakdown | VERIFIED | `src/commands/wallet.ts` lines 314-401: score sub-command calls scoreWallet dynamically and prints component table |
| 15 | CLI command `echo wallet score --all` calls scoreAllEligible and prints summary table | VERIFIED | `src/commands/wallet.ts` lines 318-356: `--all` branch calls scoreAllEligible and renders cli-table3 top-20 table |

**Score:** 15/15 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | score_history table + 7 wallet_metrics columns | VERIFIED | score_history at line 112, all 7 columns at lines 45-51 |
| `src/db/migrations/0003_lethal_the_twelve.sql` | CREATE TABLE score_history + 7 ALTER TABLE + index | VERIFIED | All DDL present; index score_history_wallet_scored on (wallet_address, scored_at DESC) |
| `src/metrics/win-rate.ts` | groupIntoClosedTrades, calculateWinRate | VERIFIED | Both functions exported, 52 lines substantive |
| `src/metrics/sharpe.ts` | calculateSharpeRatio, normalizeSharpeLike | VERIFIED | Both exported, confidence dampener present |
| `src/metrics/drawdown.ts` | calculateMaxDrawdown (percentage of peak) | VERIFIED | Peak-relative formula confirmed |
| `src/metrics/recency.ts` | calculateRecencyScore with 180-day cutoff | VERIFIED | WINDOW_MS = 180 * 24 * 60 * 60 * 1000 |
| `src/metrics/pnl.ts` | calculateRealizedPnl summing sell-side pnl | VERIFIED | Correct sell filter and null guard |
| `src/metrics/index.ts` | Re-exports all five calculators | VERIFIED | Exports all 6 functions + ClosedTrade type |
| `src/scoring/composer.ts` | composeScore, WalletScoreResult, ComputedMetrics | VERIFIED | All interfaces and function exported; weights as named constants |
| `src/scoring/index.ts` | Re-exports composeScore and types | VERIFIED | 2-line barrel re-export confirmed |
| `src/scoring/engine.ts` | scoreWallet, scoreWalletIfNeeded, scoreAllEligible | VERIFIED | All three functions exported; DB wiring fully implemented |
| `src/commands/wallet.ts` | wallet score sub-command (replaces stub) | VERIFIED | Lines 313-401; no "Coming soon" text anywhere |
| `src/metrics/__tests__/calculators.test.ts` | Test suite for all five calculators | VERIFIED | 365 lines, 39 tests covering all calculator functions |
| `src/scoring/__tests__/composer.test.ts` | Test suite for score composition | VERIFIED | 200 lines, 18 tests including bundler-vs-trader separation |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/db/schema.ts` | `src/db/migrations/0003_lethal_the_twelve.sql` | drizzle-kit generate | VERIFIED | Migration contains `score_history` CREATE TABLE matching schema definition |
| `src/scoring/engine.ts` | `score_history` table | drizzle insert | VERIFIED | Line 97: `db.insert(score_history).values(...)` in persistScore |
| `src/metrics/sharpe.ts` | `src/scoring/composer.ts` | normalizeSharpeLike import | VERIFIED | composer.ts line 1: `import { normalizeSharpeLike } from '../metrics/sharpe.js'` |
| `src/metrics/index.ts` | `src/scoring/engine.ts` | re-exports consumed by engine | VERIFIED | engine.ts lines 5-11 import from `'../metrics/index.js'` |
| `src/scoring/engine.ts` | `src/db/schema.ts` | drizzle insert/update | VERIFIED | engine.ts line 3 imports `wallets, swaps, wallet_metrics, score_history`; all three tables written in persistScore |
| `src/scoring/engine.ts` | `src/scoring/composer.ts` | composeScore import | VERIFIED | engine.ts line 12: `import { composeScore } from './composer.js'` |
| `src/commands/wallet.ts` | `src/scoring/engine.ts` | dynamic import in CLI action | VERIFIED | wallet.ts lines 319, 358: dynamic `import('../scoring/engine.js')` for both scoreAllEligible and scoreWallet |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| SCOR-01 | 04-01, 04-02 | System calculates wallet metrics: win rate, realized PnL, risk-adjusted return (Sharpe), max drawdown, recency score | SATISFIED | All five calculators implemented and tested in src/metrics/; 39 tests green |
| SCOR-02 | 04-01, 04-02, 04-03 | System produces a 0-100 wallet score weighted: risk-adjusted return (40%), win rate (20%), consistency and recency (20%), activity health (20%) | SATISFIED | composeScore in composer.ts uses named weight constants 0.40/0.20/0.20/0.20; total clamped to 5-95; 18 composer tests green |
| SCOR-03 | 04-03 | System only scores wallets with complete transaction history and confirmed-passing detection status | SATISFIED | engine.ts eligibility gate: history_complete !== true → return; detection_status !== 'confirmed_passing' → return; plus activity floor (< 20 swaps) and dormancy guard (< 1 recent trade → null score) |

No orphaned requirements — all three SCOR IDs are claimed in plan frontmatter and verified in the codebase.

---

## Anti-Patterns Found

None. Scanned key files for TODO/FIXME/PLACEHOLDER/stub patterns and found zero occurrences. The "Coming soon" stub confirmed removed from cli.ts (cli.ts now contains only 21 lines with no score command; `wallet score` is in commands/wallet.ts).

---

## Test Suite Status

All 136 tests pass across 13 test suites (confirmed by `npm test`). Breakdown:
- 79 tests from Phases 1-3 (regression: all green)
- 39 new calculator tests (src/metrics/__tests__/calculators.test.ts)
- 18 new composer tests (src/scoring/__tests__/composer.test.ts)

---

## Human Verification Required

### 1. CLI Output Rendering

**Test:** Run `npx tsx src/cli.ts wallet score --all` against a database with at least one confirmed_passing wallet with 20+ swaps.
**Expected:** Prints "Scoring complete: N scored, N skipped" followed by a formatted cli-table3 table showing address, score (color-coded), detection status, and trade count.
**Why human:** Color rendering and table formatting cannot be verified programmatically.

### 2. CLI Score Breakdown Display

**Test:** Run `npx tsx src/cli.ts wallet score <known-eligible-address>` on a wallet that passes all eligibility checks.
**Expected:** Prints a score breakdown table with Risk-Adjusted Return (40%), Win Rate (20%), Consistency/Recency (20%), Activity Health (20%), and a color-coded total.
**Why human:** Visual output and color-coding require a running terminal to inspect.

### 3. Score Correctness on Real Trade Data

**Test:** Score a wallet with known trade history; verify the sub-scores are plausible given the trading pattern.
**Expected:** A high-frequency wallet with consistent returns scores materially above 50; a dormant wallet (no trades in 180 days) gets score set to null.
**Why human:** Requires real data in data/echo.db to evaluate; formula correctness on real data cannot be tested from source alone.

---

## Gaps Summary

No gaps. All 15 must-have truths verified. All key links wired. No anti-patterns detected. All three requirement IDs (SCOR-01, SCOR-02, SCOR-03) satisfied with direct code evidence. The phase goal — clean wallets receive a reliable 0-100 quality score based on risk-adjusted trading performance — is fully achieved.

---

_Verified: 2026-03-13_
_Verifier: Claude (gsd-verifier)_
