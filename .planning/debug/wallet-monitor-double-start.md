---
status: resolved
trigger: "wallet monitor start — double start: logs '[monitor] starting' twice, spawns two concurrent cycles"
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Focus

hypothesis: confirmed — both cli.ts auto-start and the `wallet monitor start` subcommand call monitorLoop.start() on the same in-process singleton, with no guard against being already running
test: trace execution path of `pnpm echo wallet monitor start`
expecting: two start() calls execute serially in the same process
next_action: complete — root cause confirmed

## Symptoms

expected: `wallet monitor start` starts exactly one monitoring cycle
actual: logs `[monitor] starting — cycle interval 30s` twice; two independent setTimeout chains run concurrently
errors: none (silent double-loop)
reproduction: run `pnpm echo wallet monitor start`
started: always present by design — both code paths were wired to call start()

## Eliminated

- hypothesis: MonitorLoop constructor starts the loop automatically
  evidence: constructor sets paused/stopped flags only; start() must be called explicitly
  timestamp: 2026-03-15T00:00:00Z

- hypothesis: commander parses `wallet monitor start` and fires the action before top-level code runs
  evidence: program.parse() is on line 24 of cli.ts, AFTER the resumeImportingWallets().then(monitorLoop.start) chain on lines 18-22; however program.parse() is synchronous and the .then() callback is microtask-queued — but the real issue is that BOTH paths always execute unconditionally, not their order
  timestamp: 2026-03-15T00:00:00Z

## Evidence

- timestamp: 2026-03-15T00:00:00Z
  checked: cli.ts lines 18-22
  found: resumeImportingWallets().catch(() => {}).then(() => { monitorLoop.start(); }) — unconditional, fires for every invocation of the CLI binary
  implication: every time the echo binary runs (including `wallet monitor start`), the auto-start path fires

- timestamp: 2026-03-15T00:00:00Z
  checked: commands/wallet.ts lines 409-419 (monitor start action)
  found: monitorLoop.start() called directly inside the action handler
  implication: the same singleton's start() is called a second time in the same process

- timestamp: 2026-03-15T00:00:00Z
  checked: monitor/loop.ts MonitorLoop.start() lines 20-25
  found: start() does not check whether the loop is already running before calling scheduleNextCycle(0). It unconditionally sets stopped=false, paused=false, and calls scheduleNextCycle(0).
  implication: calling start() twice creates two independent setTimeout chains; both run tick() concurrently from that point forward

- timestamp: 2026-03-15T00:00:00Z
  checked: MonitorLoop private state fields (lines 15-18)
  found: no `running` or `started` boolean; no idempotency guard in start()
  implication: start() is not idempotent — every call unconditionally launches a new cycle chain

## Resolution

root_cause: |
  Two independent callers invoke monitorLoop.start() in the same OS process:
    1. cli.ts line 21 — the unconditional auto-start chained after resumeImportingWallets()
    2. commands/wallet.ts line 413 — the `wallet monitor start` action handler

  MonitorLoop.start() (loop.ts line 20) has no idempotency guard. It does not check whether
  a cycle chain is already active before calling scheduleNextCycle(0), so two concurrent
  setTimeout chains are spawned. Both call tick() independently and both print the startup log.

  This is a single-process problem. There is no IPC involved.

fix: |
  Two complementary changes are required:

  Option A — Guard in start() (defensive):
    In loop.ts, add a `private running: boolean = false` field.
    In start(), if (this.running) return early (or cancel the old timer first, depending on desired semantics).
    Set running=true at the beginning of start(). Set running=false in stop() and when tick() exits without rescheduling.

  Option B — Remove the unconditional auto-start from cli.ts for the `wallet monitor` subcommands (targeted):
    In cli.ts, only call monitorLoop.start() when the parsed command is NOT `wallet monitor start`
    (i.e., guard the auto-start on the parsed subcommand). This is more surgical but fragile to
    future subcommand additions.

  Recommended: Option A. An idempotency guard in start() is the correct long-term fix regardless
  of how many callers exist. Option B alone would leave start() callable twice by accident in future.

verification: n/a — diagnosis only
files_changed: []
