---
status: complete
phase: 05-monitoring-loop-and-auto-removal
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md]
started: 2026-03-14T00:00:00Z
updated: 2026-03-15T14:12:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Monitor loop auto-starts on CLI launch
expected: When you run any wallet command (e.g. `pnpm echo wallet list`), the process logs `[monitor] starting — cycle interval 30s` and `[monitor] cycle start — N wallets` in the background.
result: pass

### 2. wallet monitor start
expected: Running `pnpm echo wallet monitor start` logs `[monitor] starting — cycle interval 30s`, then shortly after `[monitor] cycle start — N wallets`. Process stays alive and cycles every 30 seconds. Ctrl+C exits cleanly.
result: pass
fixed_by: 05-GAP-PLAN.md (Tasks 1+3) — idempotency guard in loop.ts + cli.ts argv gate

### 3. wallet monitor pause
expected: Running `pnpm echo wallet monitor pause` (in a separate invocation or while the loop is running) logs `[monitor] paused — current cycle will drain`.
result: pass

### 4. wallet monitor stop
expected: Running `pnpm echo wallet monitor stop` logs `[monitor] stopped` and the process exits.
result: pass
fixed_by: 05-GAP-PLAN.md (Task 2) — pid.ts IPC + SIGTERM handler in loop.ts

### 5. wallet removals list (empty)
expected: Running `pnpm echo wallet removals list` when no wallets have been auto-removed prints `No wallets have been auto-removed.`
result: pass

### 6. wallet removals restore
expected: Running `pnpm echo wallet removals restore <address>` for a wallet that was never removed prints an error like `No removal log entry found for <address>.` — or, if the wallet was previously removed, it restores it and prints `Wallet <address> restored — incremental fetch will run on next monitoring cycle.`
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Running `wallet monitor start` starts exactly one monitoring loop instance — single set of cycle logs per interval"
  status: closed
  closed_by: 05-GAP-PLAN.md Tasks 1+3
  fix: "idempotency guard (private running flag + early-return) in loop.ts; cli.ts argv gate skips auto-start when subcommand is wallet monitor start"
  verified: 2026-03-15 (human-verify checkpoint approved)
  test: 2

- truth: "Running `wallet monitor stop` stops the monitoring loop — no further cycles run in the first terminal"
  status: closed
  closed_by: 05-GAP-PLAN.md Task 2
  fix: "pid.ts IPC helper writes PID on start; monitor stop reads PID and sends SIGTERM cross-process; MonitorLoop registers process.once SIGTERM handler that calls stop()"
  verified: 2026-03-15 (human-verify checkpoint approved)
  test: 4
