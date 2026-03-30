---
status: complete
phase: 04-metrics-and-scoring
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md]
started: 2026-03-13T14:00:00Z
updated: 2026-03-13T14:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Score All Eligible Wallets
expected: Running `pnpm echo wallet score --all` prints "Scoring complete: N scored, N skipped". Zero scored is valid if no wallets in DB meet eligibility criteria (history_complete + confirmed_passing + ≥20 swaps).
result: pass

### 2. Score Single Wallet — Ineligible (No History)
expected: Running `pnpm echo wallet score <any-address>` for a wallet without full history import prints an explanation like "Cannot score: transaction history not complete" (or similar) rather than crashing. No stack trace.
result: pass

### 3. Score Single Wallet — Not Found
expected: Running `pnpm echo wallet score <fake-address-not-in-db>` prints an explanation like "Wallet not found" or "No wallet found" rather than crashing. No stack trace.
result: pass

### 4. CLI Help — wallet score command exists
expected: Running `pnpm echo wallet --help` (or `npx tsx src/cli.ts wallet --help`) shows `score` as a sub-command in the help output. The old "Coming soon" stub should be gone.
result: pass

### 5. Schema Migration Applied — score_history table exists
expected: After the migration was applied, the database contains a `score_history` table. You can verify by running:
  `node -e "const Database = require('better-sqlite3'); const db = new Database('data/echo.db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='score_history'\").get())"`
  Should print `{ name: 'score_history' }` (not undefined/null).
result: pass

### 6. Bundler vs Genuine Trader Score Separation (Test Data)
expected: This is an automated test already validated. The test suite confirms: bundler profile (high win rate, volatile returns, Sharpe~0.35) scores ~58 while genuine trader (consistent, Sharpe~1.5) scores ~68 — a 10-point separation. Running `pnpm test` should show 136 tests passing.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
