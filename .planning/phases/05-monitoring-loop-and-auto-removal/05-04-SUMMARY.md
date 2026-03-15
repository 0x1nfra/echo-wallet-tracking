---
phase: 05-monitoring-loop-and-auto-removal
plan: 04
subsystem: monitoring
tags: [pid-file, sigterm, ipc, idempotency, process-control]

# Dependency graph
requires:
  - phase: 05-monitoring-loop-and-auto-removal
    provides: MonitorLoop class, wallet monitor subcommands, cli.ts auto-start

provides:
  - MonitorLoop idempotency guard (private running flag, early-return on duplicate start)
  - SIGTERM handler registered via process.once inside MonitorLoop.start()
  - pid.ts helper: writePid, readPid, clearPid, PID_FILE_PATH (OS tmpdir)
  - wallet monitor start writes PID and registers SIGTERM handler
  - wallet monitor stop reads PID and sends SIGTERM cross-process
  - cli.ts auto-start gated away from wallet monitor start invocation

affects: [Phase 6 — any future monitoring enhancements or process lifecycle changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PID file IPC pattern for cross-process CLI stop commands
    - process.once for non-accumulating signal handlers
    - argv snapshot before program.parse() for pre-parse command detection

key-files:
  created:
    - src/monitor/pid.ts
    - tests/unit/monitor/loop.test.ts
  modified:
    - src/monitor/loop.ts
    - src/monitor/index.ts
    - src/commands/wallet.ts
    - src/cli.ts

key-decisions:
  - "PID file stored in OS tmpdir (echo-monitor.pid) for cross-process IPC — no Redis, no named pipes, no sockets needed at current scale"
  - "process.once used (not process.on) for SIGTERM handler in MonitorLoop.start() to prevent listener accumulation on repeated start/stop cycles"
  - "argv snapshot taken before program.parse() so isMonitorStart check reflects literal tokens typed by user"
  - "monitor stop uses process.kill(pid, SIGTERM) from new process — no shared memory; stale PID file handled by try/catch with clearPid"
  - "Idempotency guard (running flag) is primary safety net; cli.ts gate is belt-and-suspenders to prevent even first spurious start"

patterns-established:
  - "PID file IPC: start writes PID via writePid(process.pid), stop reads and sends signal via readPid() + process.kill"
  - "Idempotency guard: private boolean flag at top of class, early-return path, reset in stop()"

requirements-completed: [MNTR-01, MNTR-02, MNTR-03]

# Metrics
duration: 15min
completed: 2026-03-15
---

# Phase 5 Plan GAP: Monitoring Loop Gap Closure Summary

**MonitorLoop idempotency guard + PID file IPC for cross-process stop — closes double-start and stop no-op UAT gaps**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-15T13:57:57Z
- **Completed:** 2026-03-15T14:12:00Z
- **Tasks:** 3 (+ 1 checkpoint awaiting human verify)
- **Files modified:** 6

## Accomplishments
- MonitorLoop.start() is now idempotent — duplicate calls are silently dropped with "already running" log, no duplicate timer chains
- SIGTERM handler registered via process.once inside start() — MonitorLoop responds to cross-process signals without listener accumulation
- pid.ts provides clean OS-tmpdir PID file IPC — writePid on start, readPid + process.kill on stop, clearPid on exit
- cli.ts auto-start gated away from `wallet monitor start` — no spurious auto-start or "already running" warning when running monitor start
- 139 unit tests pass (3 new TDD tests for idempotency and SIGTERM)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for MonitorLoop idempotency** - `02482b8` (test)
2. **Task 1 GREEN: Add idempotency guard and SIGTERM handler** - `f5893ef` (feat)
3. **Task 2: Create pid.ts and wire PID into monitor start/stop** - `16088dc` (feat)
4. **Task 3: Gate cli.ts auto-start from wallet monitor start** - `f6a8fa9` (feat)

## Files Created/Modified
- `src/monitor/pid.ts` - PID file helpers: writePid, readPid, clearPid, PID_FILE_PATH
- `src/monitor/loop.ts` - Added private running flag, idempotency guard in start(), running=false in stop(), process.once SIGTERM handler
- `src/monitor/index.ts` - Added re-export of pid helpers
- `src/commands/wallet.ts` - monitor start writes PID + SIGTERM handler; monitor stop reads PID and sends SIGTERM cross-process
- `src/cli.ts` - isMonitorStart argv gate wrapping monitorLoop.start() auto-start call
- `tests/unit/monitor/loop.test.ts` - 3 TDD tests: duplicate start, restart after stop, SIGTERM triggers stop

## Decisions Made
- PID file stored in OS tmpdir as `echo-monitor.pid` — simplest IPC for single-machine use at current scale, no extra infrastructure
- process.once (not process.on) for SIGTERM in loop.ts to prevent listener accumulation across repeated start/stop cycles
- argv snapshot before program.parse() for isMonitorStart detection — reflects exact user invocation, not parsed command tree
- monitor stop gracefully handles missing PID (no-op message) and stale PID (try/catch + clearPid)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `@jest/globals` not installed in project — adapted TDD tests to use console.log capture pattern instead of jest.spyOn, avoiding dependency on the @jest/globals package. Tests use global `describe`/`expect`/`beforeEach`/`afterEach` which are injected by ts-jest.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both UAT gaps are now closed — human verification checkpoint next
- wallet monitor start/stop form a proper cross-process control loop
- All 139 existing tests pass with no regressions

---
*Phase: 05-monitoring-loop-and-auto-removal*
*Completed: 2026-03-15*
