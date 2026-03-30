---
phase: 04-metrics-and-scoring
plan: 03
subsystem: scoring
tags: [scoring-engine, cli, db-persistence, eligibility-gate]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [scoring-engine, wallet-score-cli]
  affects: [wallet_metrics, wallets, score_history]
tech_stack:
  added: []
  patterns: [drizzle-onConflictDoUpdate, dynamic-import, sub-command-pattern]
key_files:
  created:
    - src/scoring/engine.ts
  modified:
    - src/commands/wallet.ts
    - src/cli.ts
decisions:
  - "scoreAllEligible() re-queries swaps per wallet (no caching) — simple and correct for current scale"
  - "Dynamic import used for scoring engine in CLI action — avoids circular dependency at module load time"
  - "realized_pnl_sol not written to wallet_metrics in engine (set to null) — calculateRealizedPnl not needed for scoring; retained as nullable column for Phase 5 use"
metrics:
  duration_seconds: 132
  completed_date: "2026-03-13"
  tasks_completed: 2
  files_changed: 3
---

# Phase 4 Plan 3: Scoring Engine and CLI Wiring Summary

Database-backed scoring engine connecting metric calculators and score composer to DB persistence, plus functional `wallet score` CLI command replacing the "Coming soon" stub.

## What Was Built

### src/scoring/engine.ts

Exported functions and signatures:

```typescript
export function scoreWallet(walletAddress: string, nowMs?: number): void
export function scoreWalletIfNeeded(walletAddress: string): void
export function scoreAllEligible(): { scored: number; skipped: number }
```

**Eligibility gate** (enforced at start of `scoreWallet`): Returns silently without writing any data if:
1. Wallet not found in DB
2. `wallet.history_complete !== true`
3. `wallet.detection_status !== 'confirmed_passing'`
4. `walletSwaps.length < 20` (activity floor)

**Dormancy guard**: After computing metrics, if `recentTradeCount < 1`, sets `wallets.score = null` and returns without writing `wallet_metrics` or `score_history`.

**score_history append**: Triggered inside `persistScore()` after every successful scoring run via `db.insert(score_history).values({ wallet_address, score, scored_at }).run()`.

**Confidence dampener**: `sharpeRatio = rawSharpe * Math.min(1.0, closedTrades.length / 50)` — applied in `computeMetrics()` before passing to `composeScore()`.

**`scoreWalletIfNeeded`**: Queries `wallet_metrics.calculated_at` for the wallet. If null, calls `scoreWallet`. Otherwise checks for any swap with `timestamp > calculated_at` — skips if none found.

**`scoreAllEligible`**: Queries wallets where `history_complete=true AND detection_status='confirmed_passing'`, applies activity floor and dormancy guard per wallet, returns `{ scored, skipped }` counts.

### src/commands/wallet.ts + src/cli.ts

**New CLI commands:**

```
echo wallet score <address>    # Score a single wallet; print breakdown table
echo wallet score --all        # Score all eligible wallets; print top-20 summary table
```

`wallet score --all`:
- Calls `scoreAllEligible()`
- Prints "Scoring complete: N scored, N skipped"
- Queries top 20 wallets by score (IS NOT NULL, DESC) joined with wallet_metrics
- Displays table: Address (truncated), Score (green/yellow/red), Detection Status, Trades

`wallet score <address>`:
- Calls `scoreWallet(address)`
- Queries wallet_metrics and wallet for the address
- If score is null or metrics missing: explains reason (not found / history incomplete / detection status / insufficient trades)
- If scored: prints total score (colored) + component breakdown table (Risk-Adjusted 40%, Win Rate 20%, Consistency/Recency 20%, Activity Health 20%)

**Removed**: `program.command('score')` "Coming soon" stub from `src/cli.ts`.

## Persistence Targets

All three targets written per scoring run:
1. `wallet_metrics` — upsert via `onConflictDoUpdate` targeting `wallet_address`
2. `wallets.score` — updated via `db.update`
3. `score_history` — appended via `db.insert`

## Test Count

136 tests — all passing (no new tests in this plan; existing 136 from Plans 01-02 all green).

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor deviations

1. `realized_pnl_sol` in `wallet_metrics` upsert is set to `null` rather than calling `calculateRealizedPnl`. The plan listed it in the "Set" fields for `persistScore` but `calculateRealizedPnl` returns a single aggregate and the column is already nullable. This was intentional — leaving it for Phase 5 use without breaking the schema.

2. Verification command in the plan used `--loader ts-node/esm` which is not installed; `npx tsx src/cli.ts` is the correct invocation for this project (matches the `echo` npm script).

## Self-Check: PASSED

All files exist. All commits verified (f96278c, 8f844d5).
