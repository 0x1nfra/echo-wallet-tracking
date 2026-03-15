---
phase: 05-monitoring-loop-and-auto-removal
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - src/monitor/loop.ts
  - src/monitor/pid.ts
  - src/monitor/index.ts
  - src/cli.ts
  - src/commands/wallet.ts
autonomous: false
gap_closure: true
requirements: [MNTR-01, MNTR-02, MNTR-03]

must_haves:
  truths:
    - "Running 'wallet monitor start' once produces a single '[monitor] starting' log and a single cycle log per interval"
    - "Running 'wallet monitor stop' in a second terminal sends SIGTERM to the running loop, which logs '[monitor] stopped' and exits"
    - "cli.ts auto-start does not fire when the subcommand is 'wallet monitor start'"
  artifacts:
    - path: "src/monitor/pid.ts"
      provides: "writePid, readPid, clearPid helpers for cross-process IPC"
      exports: ["writePid", "readPid", "clearPid", "PID_FILE_PATH"]
    - path: "src/monitor/loop.ts"
      provides: "Idempotency guard and SIGTERM handler"
      contains: "private running"
    - path: "src/cli.ts"
      provides: "Auto-start gated away from wallet monitor start subcommand"
    - path: "src/commands/wallet.ts"
      provides: "monitor start writes PID; monitor stop reads PID and sends SIGTERM"
  key_links:
    - from: "src/commands/wallet.ts monitor start action"
      to: "src/monitor/pid.ts"
      via: "writePid called after monitorLoop.start()"
      pattern: "writePid"
    - from: "src/commands/wallet.ts monitor stop action"
      to: "running loop process"
      via: "readPid then process.kill with SIGTERM"
      pattern: "process\\.kill"
    - from: "src/monitor/loop.ts start()"
      to: "SIGTERM handler"
      via: "process.once SIGTERM registered inside start()"
      pattern: "SIGTERM"
---

<objective>
Close two major UAT gaps in Phase 5:

1. Double-start: MonitorLoop.start() has no idempotency guard, and cli.ts auto-starts the loop unconditionally for every invocation — so wallet monitor start triggers a second concurrent loop in the same process.

2. Stop no-op: wallet monitor stop operates on a fresh in-process MonitorLoop instance and cannot reach the running loop in the other terminal. No IPC mechanism exists.

Purpose: The monitoring loop must be controllable — starting once must mean one loop, and stopping must actually stop it.
Output: pid.ts helper, idempotency guard in loop.ts, SIGTERM-based stop, gated auto-start in cli.ts, SIGTERM handler in MonitorLoop.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/05-monitoring-loop-and-auto-removal/05-03-SUMMARY.md

<interfaces>
<!-- Current MonitorLoop state (src/monitor/loop.ts) -->
```typescript
export class MonitorLoop {
  private paused: boolean = false;
  private stopped: boolean = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cycleRunning: boolean = false;

  start(): void { /* no running guard — logs and re-schedules even if already running */ }
  pause(): void { /* sets paused, logs */ }
  resume(): void { /* clears paused, reschedules */ }
  stop(): void { /* sets stopped, clears timer, logs */ }
}
```

<!-- Current cli.ts auto-start (unconditional) -->
```typescript
resumeImportingWallets()
  .catch(() => {})
  .then(() => {
    monitorLoop.start();   // fires for every CLI invocation including monitor start
  });
program.parse();
```

<!-- Current monitor start action (src/commands/wallet.ts lines 409-420) -->
```typescript
monitor
  .command('start')
  .action(() => {
    monitorLoop.start();   // second start() call in same process
    console.log('Monitoring loop started. Press Ctrl+C to exit.');
    process.on('SIGINT', () => { monitorLoop.stop(); process.exit(0); });
  });
```

<!-- Current monitor stop action (src/commands/wallet.ts lines 429-435) -->
```typescript
monitor
  .command('stop')
  .action(() => {
    monitorLoop.stop();   // operates on this process's instance, not the running one
    process.exit(0);
  });
```

<!-- Shared monitorLoop instance (src/commands/wallet.ts line 14) -->
```typescript
export const monitorLoop = new MonitorLoop();
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add idempotency guard to MonitorLoop and SIGTERM handler</name>
  <files>src/monitor/loop.ts, tests/unit/monitor/loop.test.ts</files>
  <behavior>
    - Test 1: Calling start() twice on the same instance logs "[monitor] starting" exactly once — the second call logs "[monitor] already running" and returns without creating a second timer chain
    - Test 2: Calling start() after stop() re-starts normally — the running guard is reset by stop() so a fresh start works
    - Test 3: When SIGTERM fires, stop() is called — stopped becomes true and timer is cleared
  </behavior>
  <action>
Create tests/unit/monitor/ directory and write tests/unit/monitor/loop.test.ts first using Jest and jest.useFakeTimers(). Mock console.log to capture log output. Assert on call counts and timer state.

Then update src/monitor/loop.ts:

1. Add `private running = false` alongside the existing boolean fields at the top of the class.

2. In start(): insert an early-return guard as the very first statement inside the method:
   ```typescript
   if (this.running) {
     console.log('[monitor] already running — ignoring duplicate start');
     return;
   }
   this.running = true;
   ```
   The existing `this.stopped = false; this.paused = false;` lines and the log and scheduleNextCycle call remain unchanged after the guard.

3. In stop(): after `this.stopped = true`, add `this.running = false;`. Everything else in stop() is unchanged.

4. At the end of start(), after `this.scheduleNextCycle(0);`, register the SIGTERM handler using process.once (not process.on) to avoid listener accumulation:
   ```typescript
   process.once('SIGTERM', () => { this.stop(); });
   ```

Do NOT change the existing paused/stopped/timer/cycleRunning logic. The running flag is an entry gate only.
  </action>
  <verify>
    <automated>NODE_OPTIONS=--experimental-vm-modules npx jest tests/unit/monitor/loop.test.ts --no-coverage 2>&1 | tail -15</automated>
  </verify>
  <done>
    All three behavior tests pass. loop.ts has `private running = false`, start() early-returns on duplicate call with the "already running" log, stop() resets running to false, SIGTERM handler registered with process.once.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create pid.ts helper and wire PID into monitor start/stop actions</name>
  <files>src/monitor/pid.ts, src/monitor/index.ts, src/commands/wallet.ts</files>
  <action>
Create src/monitor/pid.ts:

```typescript
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export const PID_FILE_PATH = join(tmpdir(), 'echo-monitor.pid');

export function writePid(pid: number): void {
  writeFileSync(PID_FILE_PATH, String(pid), 'utf8');
}

export function readPid(): number | null {
  if (!existsSync(PID_FILE_PATH)) return null;
  const raw = readFileSync(PID_FILE_PATH, 'utf8').trim();
  const pid = parseInt(raw, 10);
  return isNaN(pid) ? null : pid;
}

export function clearPid(): void {
  if (existsSync(PID_FILE_PATH)) unlinkSync(PID_FILE_PATH);
}
```

Append to src/monitor/index.ts:
```typescript
export { writePid, readPid, clearPid, PID_FILE_PATH } from './pid.js';
```

Update src/commands/wallet.ts:

1. Add to the existing import from '../monitor/index.js':
   ```typescript
   import { MonitorLoop, writePid, readPid, clearPid } from '../monitor/index.js';
   ```

2. monitor start action — after `monitorLoop.start()` add:
   ```typescript
   writePid(process.pid);
   process.on('SIGTERM', () => { monitorLoop.stop(); clearPid(); process.exit(0); });
   ```
   Keep the existing SIGINT handler and the 'Monitoring loop started' log line.

3. monitor stop action — replace the current body entirely:
   ```typescript
   const pid = readPid();
   if (pid === null) {
     console.log('[monitor] no running loop found (no PID file)');
     process.exit(0);
   }
   try {
     process.kill(pid, 'SIGTERM');
     clearPid();
     console.log(`[monitor] sent SIGTERM to process ${pid}`);
   } catch (_err) {
     clearPid();
     console.log('[monitor] loop process was not running — PID file cleaned up');
   }
   process.exit(0);
   ```

The monitor pause action is unchanged.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    pid.ts exists and exports all four symbols. monitor/index.ts re-exports them. wallet.ts monitor start writes PID and registers SIGTERM. wallet.ts monitor stop reads PID and sends SIGTERM. TypeScript compiles with no errors.
  </done>
</task>

<task type="auto">
  <name>Task 3: Gate cli.ts auto-start away from wallet monitor start subcommand</name>
  <files>src/cli.ts</files>
  <action>
The problem: cli.ts calls monitorLoop.start() unconditionally after resumeImportingWallets() resolves. When the user runs `pnpm echo wallet monitor start`, the auto-start fires AND then the monitor start action handler also calls start() — the idempotency guard from Task 1 catches the duplicate, but the spurious "already running" log is still confusing and the auto-start timer creates unnecessary work.

Fix: snapshot argv before program.parse() and skip auto-start when the command is wallet monitor start.

Replace the auto-start block in src/cli.ts:

```typescript
// Before:
resumeImportingWallets()
  .catch(() => {})
  .then(() => {
    monitorLoop.start();
  });
```

```typescript
// After:
// Gate: skip auto-start when user is explicitly running 'wallet monitor start'
// (the action handler starts the loop itself in that case)
const isMonitorStart =
  process.argv.includes('monitor') && process.argv.includes('start');

resumeImportingWallets()
  .catch(() => {})
  .then(() => {
    if (!isMonitorStart) {
      monitorLoop.start();
    }
  });
```

The check uses raw argv tokens. No other command in the CLI uses both 'monitor' and 'start' as argv tokens simultaneously. The snapshot is taken before program.parse() runs so it reflects the literal command typed.

Note: The idempotency guard in Task 1 is the primary safety net. This gate prevents even the first spurious start() call and removes the "already running" warning log from appearing in normal usage.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    cli.ts has the isMonitorStart guard wrapping the monitorLoop.start() call. TypeScript compiles cleanly. Running wallet list, wallet add, etc. still trigger auto-start. Running wallet monitor start skips auto-start.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Checkpoint: Verify both UAT gaps are closed</name>
  <action>Human verification — see how-to-verify below for exact steps.</action>
  <what-built>
    - MonitorLoop.start() is idempotent — duplicate calls log a warning and return immediately
    - MonitorLoop registers a SIGTERM handler via process.once that calls stop()
    - pid.ts writes and reads a PID file in the OS temp directory
    - monitor start writes PID after starting the loop
    - monitor stop reads PID and sends SIGTERM to the running process
    - cli.ts auto-start is gated away from wallet monitor start
  </what-built>
  <how-to-verify>
    Before testing, run the full unit test suite:

    ```
    NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage 2>&1 | tail -20
    ```

    All tests must pass.

    **Gap 1 — double-start fixed:**
    1. Run: `pnpm echo wallet monitor start`
    2. Count the "[monitor] starting" log lines. You should see exactly ONE.
    3. Wait 30-40 seconds. Count the "[monitor] cycle start" lines. You should see exactly ONE per interval (not two).
    4. Press Ctrl+C to stop.

    **Gap 2 — stop actually stops:**
    1. In terminal A run: `pnpm echo wallet monitor start`
    2. Wait to see at least one `[monitor] cycle start` log.
    3. In terminal B run: `pnpm echo wallet monitor stop`
    4. Terminal B should print: `[monitor] sent SIGTERM to process <PID>`
    5. Terminal A should log `[monitor] stopped` and the process should exit.
    6. Wait 40 seconds — confirm no further cycle logs appear in terminal A.

    **Auto-start still works for other commands:**
    1. Run: `pnpm echo wallet list`
    2. You should still see `[monitor] starting — cycle interval 30s` in the background (auto-start fires).
    3. Ctrl+C to stop.
  </how-to-verify>
  <resume-signal>Type "approved" if both gaps are fixed, or describe any remaining issues</resume-signal>
</task>

</tasks>

<verification>
Run the full unit test suite to confirm no regressions:

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage 2>&1 | tail -20
```

Run type check:

```bash
npx tsc --noEmit
```

Both must pass before the human-verify checkpoint.
</verification>

<success_criteria>
- MonitorLoop.start() called twice: first call starts normally, second call logs "[monitor] already running" and returns without creating a duplicate timer chain
- wallet monitor start in terminal A, then wallet monitor stop in terminal B: SIGTERM is delivered, terminal A logs "[monitor] stopped" and exits — no further cycles
- cli.ts auto-start fires for wallet list/add/remove/score but NOT for wallet monitor start
- All existing Jest unit tests pass
- TypeScript compiles with no errors
</success_criteria>

<output>
After completion, create `.planning/phases/05-monitoring-loop-and-auto-removal/05-04-SUMMARY.md` following the standard summary template. Record:
- Files modified: src/monitor/loop.ts, src/monitor/pid.ts, src/monitor/index.ts, src/cli.ts, src/commands/wallet.ts
- New test file: tests/unit/monitor/loop.test.ts
- Gap closures: double-start (idempotency guard + cli.ts gate) and stop no-op (PID file + SIGTERM)
</output>
