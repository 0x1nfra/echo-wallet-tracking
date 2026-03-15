---
status: resolved
trigger: "wallet monitor stop — no-op: logs '[monitor] stopped' but loop in first terminal continues cycling"
created: 2026-03-15T00:00:00Z
updated: 2026-03-15T00:00:00Z
---

## Current Focus

hypothesis: confirmed — each CLI invocation is a separate OS process with its own in-memory MonitorLoop instance; stop() mutates the stopped flag only in the second process's instance, never reaching the first process's instance
test: trace what object monitorLoop.stop() operates on when run in a second terminal
expecting: a fresh MonitorLoop object, not the one running in terminal 1
next_action: complete — root cause confirmed

## Symptoms

expected: `wallet monitor stop` (terminal 2) halts the cycle running in terminal 1
actual: terminal 2 logs `[monitor] stopped` and exits; terminal 1 continues cycling
errors: none
reproduction: start loop in terminal 1 with `pnpm echo wallet monitor start`; in terminal 2 run `pnpm echo wallet monitor stop`
started: always present by architecture — this is a fundamental cross-process communication gap

## Eliminated

- hypothesis: stop() implementation is buggy (doesn't actually cancel the timer)
  evidence: stop() in loop.ts lines 38-46 correctly sets stopped=true, calls clearTimeout(this.timer), and nulls the timer. The timer IS cancelled — but only in the process that called stop(), which is the second terminal process, not the first.
  timestamp: 2026-03-15T00:00:00Z

- hypothesis: the module-level singleton is somehow shared between processes via Node module caching
  evidence: Node.js module caching is per-process. Each `pnpm echo ...` invocation spawns a new node process. `export const monitorLoop = new MonitorLoop()` in commands/wallet.ts creates a fresh instance on each process startup.
  timestamp: 2026-03-15T00:00:00Z

## Evidence

- timestamp: 2026-03-15T00:00:00Z
  checked: commands/wallet.ts line 14
  found: `export const monitorLoop = new MonitorLoop()` — module-level singleton, constructed at import time
  implication: each process that imports this module constructs its own independent MonitorLoop instance

- timestamp: 2026-03-15T00:00:00Z
  checked: monitor/loop.ts stop() lines 38-46
  found: stop() sets this.stopped=true and clears this.timer — operates entirely on in-memory state
  implication: no persistent signal (file, DB row, IPC socket, signal) is written when stop() is called; the mutation is invisible to other processes

- timestamp: 2026-03-15T00:00:00Z
  checked: monitor/loop.ts tick() / scheduleNextCycle() lines 48-68
  found: the loop's continuation guard is `if (this.stopped) return` — an in-memory boolean read inside the running process
  implication: there is no mechanism for the running process to learn that a second process called stop(); it will reschedule forever

- timestamp: 2026-03-15T00:00:00Z
  checked: cli.ts and commands/wallet.ts — full file
  found: no PID file written at start, no lock file, no shared state (DB table, flag file) consulted by the loop on each tick
  implication: the running loop has no way to detect an external stop request; stop subcommand has no way to reach the running process

## Resolution

root_cause: |
  `wallet monitor stop` and the running loop live in separate OS processes. Each process
  constructs its own MonitorLoop instance (commands/wallet.ts line 14). Calling stop() in
  the second process sets stopped=true on that process's instance only. The first process's
  instance never sees the mutation. This is a cross-process communication problem.

  The `[monitor] stopped` log in terminal 2 is truthful — that process's loop object is stopped —
  but the running loop in terminal 1 is unreachable.

fix: |
  A cross-process signalling mechanism is required. Three viable approaches, in increasing complexity:

  Option A — OS signal (SIGTERM / SIGUSR1) via PID file (simplest):
    On start: write the current process.pid to a known file (e.g. .echo-monitor.pid).
    On stop subcommand: read the PID file, send process.kill(pid, 'SIGTERM') (or SIGUSR1 for graceful),
    then delete the PID file. The running process registers a handler that calls monitorLoop.stop().
    Pros: zero dependencies, reliable on Unix/macOS/Linux (the target platform for a CLI tool).
    Cons: PID file can go stale if process crashes without cleanup; needs a cleanup handler for SIGINT too.

  Option B — Shared database flag (already have SQLite):
    Add a monitor_state table (or a key-value config table) with a `should_stop` boolean.
    stop subcommand writes should_stop=true to DB.
    loop.ts tick() reads the flag at the start of each tick; if true, calls this.stop() and clears the flag.
    Pros: no new dependencies; survives restarts; auditable.
    Cons: stop latency is up to one full cycle interval (30s); not instant.

  Option C — Unix domain socket / named pipe (most responsive):
    Running process listens on a local socket. Stop subcommand connects and sends a stop message.
    Pros: instant, bidirectional, can return status.
    Cons: most implementation complexity; must handle socket cleanup.

  Recommended: Option A (PID file + OS signal) for a CLI tool. It is the conventional Unix pattern,
  requires no DB schema changes, and delivers immediate stop. Option B is a viable fallback if
  cross-platform Windows support is needed and signal delivery is unreliable.

  Key files to change regardless of approach:
    - src/monitor/loop.ts — register process signal handler in start(); clean up PID file in stop()
    - src/commands/wallet.ts — write PID file in `monitor start` action; read+signal in `monitor stop` action
    - (Option A only) src/monitor/pid.ts — new helper: writePid(), readPid(), clearPid()

verification: n/a — diagnosis only
files_changed: []
