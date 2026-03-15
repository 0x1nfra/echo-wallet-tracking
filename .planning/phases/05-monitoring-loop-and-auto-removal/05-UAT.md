---
status: complete
phase: 05-monitoring-loop-and-auto-removal
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
started: 2026-03-14T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Monitor loop auto-starts on CLI launch
expected: When you run any wallet command (e.g. `pnpm echo wallet list`), the process logs `[monitor] starting — cycle interval 30s` and `[monitor] cycle start — N wallets` in the background.
result: pass

### 2. wallet monitor start
expected: Running `pnpm echo wallet monitor start` logs `[monitor] starting — cycle interval 30s`, then shortly after `[monitor] cycle start — N wallets`. Process stays alive and cycles every 30 seconds. Ctrl+C exits cleanly.
result: issue
reported: "[monitor] starting — cycle interval 30s logged twice; monitor starts twice causing concurrent cycles (two cycle start lines in a row, two cycle complete at different timestamps) — doubles API calls per cycle"
severity: major

### 3. wallet monitor pause
expected: Running `pnpm echo wallet monitor pause` (in a separate invocation or while the loop is running) logs `[monitor] paused — current cycle will drain`.
result: pass

### 4. wallet monitor stop
expected: Running `pnpm echo wallet monitor stop` logs `[monitor] stopped` and the process exits.
result: issue
reported: "logged [monitor] stopped but the loop did not really stop — cycle continues in the first terminal"
severity: major

### 5. wallet removals list (empty)
expected: Running `pnpm echo wallet removals list` when no wallets have been auto-removed prints `No wallets have been auto-removed.`
result: pass

### 6. wallet removals restore
expected: Running `pnpm echo wallet removals restore <address>` for a wallet that was never removed prints an error like `No removal log entry found for <address>.` — or, if the wallet was previously removed, it restores it and prints `Wallet <address> restored — incremental fetch will run on next monitoring cycle.`
result: pass

## Summary

total: 6
passed: 4
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Running `wallet monitor start` starts exactly one monitoring loop instance — single set of cycle logs per interval"
  status: failed
  reason: "User reported: [monitor] starting — cycle interval 30s logged twice; monitor starts twice causing concurrent cycles (two cycle start lines in a row, two cycle complete at different timestamps) — doubles API calls per cycle"
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Running `wallet monitor stop` stops the monitoring loop — no further cycles run in the first terminal"
  status: failed
  reason: "User reported: logged [monitor] stopped but the loop did not really stop — cycle continues in the first terminal"
  severity: major
  test: 4
  artifacts: []
  missing: []
