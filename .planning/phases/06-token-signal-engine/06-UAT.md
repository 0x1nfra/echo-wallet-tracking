---
status: complete
phase: 06-token-signal-engine
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md
started: 2026-03-16T00:00:00Z
updated: 2026-03-16T00:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. echo signal list command
expected: Running `echo signal list` prints a formatted table of active token signals. Columns include token mint, signal score (0-100), tier label (strong/moderate/weak/inactive), and buy velocity. If no signals exist yet, the command exits cleanly without crashing.
result: pass

### 2. Signal tier color-coding in table
expected: In the `echo signal list` output, strong-tier tokens appear in green, moderate-tier in yellow, and weak-tier in red. The tier column text reflects the tier label (strong/moderate/weak/inactive).
result: issue
reported: "yes the time is the bug but the color is okay"
severity: major
note: Color-coding confirmed working. Bug: Updated column shows 1/21/1970 — display code treats stored Unix seconds as milliseconds.

### 3. Token signals update after monitoring cycle
expected: After running a monitoring cycle, the token_signals table is updated. Running `echo signal list` afterward shows updated signal scores and timestamps reflecting the cycle just run (today's date, not 1970).
result: skipped
reason: No tracked wallets or active monitor loop available to test

### 4. Coordinated wallets discount signal score
expected: A token whose holders are all flagged as coordinated (share a common funding source) shows a discounted or suppressed signal score compared to a token held by independent wallets with similar metrics. If all holders are coordinated, the signal score is 0/inactive.
result: skipped
reason: No live wallet data available; covered by TDD tests in scorer.test.ts

## Summary

total: 4
passed: 1
issues: 1
pending: 0
skipped: 2

## Gaps

- truth: "Updated column in echo signal list shows the correct current timestamp"
  status: failed
  reason: "User reported: the time is the bug — Updated column shows 1/21/1970 instead of today's date"
  severity: major
  test: 2
  artifacts: []
  missing: []
