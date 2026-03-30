---
phase: 05-monitoring-loop-and-auto-removal
verified: 2026-03-15T00:00:00Z
status: passed
score: 20/20 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 17/17
  gaps_closed:
    - "double-start: MonitorLoop.start() now idempotent — duplicate calls log 'already running' and return"
    - "stop no-op: wallet monitor stop now uses PID file IPC + SIGTERM to reach the running loop in another process"
    - "cli.ts auto-start now gated away from wallet monitor start subcommand via argv snapshot"
  gaps_remaining: []
  regressions: []
---

# Phase 5: Monitoring Loop and Auto-Removal Verification Report

**Phase Goal:** The system continuously updates wallet data on a 30-second cycle without exhausting Helius rate limits, and automatically removes wallets that degrade or are confirmed scams
**Verified:** 2026-03-15
**Status:** PASSED
**Re-verification:** Yes — after gap closure (05-GAP-PLAN.md executed 2026-03-15)

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | wallets table has `low_score_streak` (int, default 0) and `last_trade_at` (int, nullable) columns | VERIFIED | `src/db/schema.ts` lines 18-19 |
| 2  | removal_log table has `label` (text, nullable) and `score_at_removal` (real, nullable) columns | VERIFIED | `src/db/schema.ts` lines 88-89 |
| 3  | Helius API calls use `concurrency: 5` (not interval-based) and retry with exponential backoff on 429 | VERIFIED | `src/fetchers/helius.ts` line 11: `new PQueue({ concurrency: 5 })`; lines 57-67: pRetry retries:5, 429-specific delay |
| 4  | MonitorLoop.start() runs one cycle immediately then schedules subsequent cycles every 30 seconds | VERIFIED | `src/monitor/loop.ts` line 30: `this.scheduleNextCycle(0)`; line 75: `scheduleNextCycle(CYCLE_INTERVAL_MS)` after each cycle |
| 5  | Each cycle fetches only transactions since last_checked_at (incremental, not full re-fetch) | VERIFIED | `src/monitor/loop.ts` lines 109-111: `afterTimestamp = Math.floor(wallet.last_checked_at / 1000)` |
| 6  | A wallet with detection_status = 'confirmed_suspicious' is removed on the next cycle | VERIFIED | `src/monitor/removal.ts` lines 51-59: Policy 1 checks `confirmed_suspicious` and calls removeWallet immediately |
| 7  | A wallet whose score stays below 30 for 10 consecutive cycles is removed; low_score_streak resets to 0 on any above-threshold cycle | VERIFIED | `src/monitor/removal.ts` lines 63-88: streak increment on score < 30, limit 10; reset to 0 on score >= 30 |
| 8  | A wallet with no trades for 30+ days (last_trade_at set AND older than 30d) is removed; last_trade_at = NULL skips the inactivity check | VERIFIED | `src/monitor/removal.ts` lines 92-104: null-guard at line 92; 30-day window check at line 94 |
| 9  | All auto-removals write to removal_log with reason, label, score_at_removal, and detection_details | VERIFIED | `src/monitor/removal.ts` lines 24-31: inserts `{ reason, label, score_at_removal, detection_details, removed_by: 'auto' }` |
| 10 | MonitorLoop supports pause() and stop(); pause lets current cycle drain, stop clears the timer | VERIFIED | `src/monitor/loop.ts` lines 34-54: pause sets `paused=true`; stop clears timer via `clearTimeout` |
| 11 | Single-wallet fetch failures skip that wallet and log to stderr; failure does not increment low_score_streak | VERIFIED | `src/monitor/loop.ts` lines 163-169: catch block logs to stderr, increments `failed`; `checkRemovalPolicies` only called inside the try block (success path) |
| 12 | `wallet monitor start/pause/stop` commands exist and delegate to the shared monitorLoop instance | VERIFIED | `src/commands/wallet.ts` lines 407-449: three subcommands calling `monitorLoop.start()`, `.pause()`, and SIGTERM-based stop |
| 13 | `wallet removals list` prints a table of removal_log rows with address, label, score, detection status, reason, timestamp | VERIFIED | `src/commands/wallet.ts` lines 455-486: table with columns ADDRESS, LABEL, SCORE, DETECTION STATUS, REASON, REMOVED AT; reads `score_at_removal`, `label`, `detection_details` |
| 14 | `wallet removals restore <address>` re-adds wallet to tracked status and resets low_score_streak | VERIFIED | `src/commands/wallet.ts` lines 488-518: sets `status: 'tracked', detection_status: 'pending', low_score_streak: 0`; marks `restored_at` |
| 15 | MonitorLoop auto-starts when process launches (cli.ts chains loop.start() after resumeImportingWallets, gated away from wallet monitor start) | VERIFIED | `src/cli.ts` lines 19-28: `isMonitorStart` argv gate; `monitorLoop.start()` called in `.then()` only when not `wallet monitor start` |
| 16 | Migration 0004 registered in journal and includes last_trade_at backfill from swaps | VERIFIED | `_journal.json` idx=4 tag=`0004_monitoring_columns`; migration SQL lines 9-17: UPDATE wallets SET last_trade_at |
| 17 | MonitorLoop.start() is idempotent — duplicate calls log "already running" and return without creating a second timer chain | VERIFIED | `src/monitor/loop.ts` lines 21-26: `private running = false`; early-return guard on duplicate start; stop() resets `running = false` |
| 18 | SIGTERM signal stops the running MonitorLoop — registered via process.once inside start() | VERIFIED | `src/monitor/loop.ts` line 31: `process.once('SIGTERM', () => { this.stop(); })` |
| 19 | pid.ts provides cross-process IPC: writePid/readPid/clearPid using OS tmpdir; monitor stop sends SIGTERM to running process via PID file | VERIFIED | `src/monitor/pid.ts` all 20 lines; `src/commands/wallet.ts` lines 434-448: `readPid()` then `process.kill(pid, 'SIGTERM')` |
| 20 | All 139 tests pass (136 original + 3 new TDD tests for idempotency and SIGTERM) with no regressions | VERIFIED | `NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage`: 139 passed, 0 failed, 14 suites |

**Score:** 20/20 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `src/db/migrations/0004_monitoring_columns.sql` | DDL for 4 new columns + last_trade_at backfill | VERIFIED | 17 lines; 4 ALTER TABLE statements + backfill UPDATE |
| `src/db/schema.ts` | Drizzle types for low_score_streak, last_trade_at, label, score_at_removal | VERIFIED | All 4 columns present at lines 18-19 (wallets) and 88-89 (removal_log) |
| `src/fetchers/helius.ts` | heliusQueue with concurrency: 5 and 429-aware retry | VERIFIED | Line 11: `new PQueue({ concurrency: 5 })`; retries: 5; 429 exponential backoff |
| `src/monitor/removal.ts` | checkRemovalPolicies, removeWallet, exported constants | VERIFIED | 107 lines; three policies; writes to both wallets and removal_log |
| `src/monitor/loop.ts` | MonitorLoop class with start/pause/resume/stop/runCycle | VERIFIED | 178 lines; idempotency guard (running flag); SIGTERM handler; crash-restart; stagger |
| `src/monitor/index.ts` | Re-exports MonitorLoop and PID helpers | VERIFIED | Two export lines: loop.js + pid.js |
| `src/monitor/pid.ts` | writePid, readPid, clearPid, PID_FILE_PATH | VERIFIED | 20 lines; OS tmpdir-based PID file IPC |
| `src/commands/wallet.ts` | wallet monitor start/pause/stop and wallet removals list/restore; shared monitorLoop export | VERIFIED | Lines 407-518; PID write on start; SIGTERM-based stop; removals subcommands |
| `src/cli.ts` | MonitorLoop auto-start after resumeImportingWallets, gated away from wallet monitor start | VERIFIED | Lines 19-28: isMonitorStart argv gate; monitorLoop.start() in .then() |
| `tests/unit/monitor/loop.test.ts` | 3 TDD tests for idempotency and SIGTERM handler | VERIFIED | 67 lines; tests pass in 139-test suite run |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/fetchers/helius.ts` | p-queue | `new PQueue({ concurrency: 5 })` | WIRED | Line 11 exact match |
| `src/db/schema.ts` | wallets table | `low_score_streak` column | WIRED | Line 18 |
| `src/db/migrations/0004_monitoring_columns.sql` | wallets.last_trade_at | UPDATE from swaps backfill | WIRED | Lines 9-17 |
| `src/monitor/loop.ts` | `src/importers/history.ts` (via helius fetcher) | `fetchSwapHistory` for incremental fetch | WIRED | Line 113: `fetcher.fetchSwapHistory(wallet.address, afterTimestamp)` |
| `src/monitor/loop.ts` | `src/detection/engine.ts` | `runDetectionIfNeeded` per wallet | WIRED | Line 155 |
| `src/monitor/loop.ts` | `src/scoring/engine.ts` | `scoreWalletIfNeeded` per wallet | WIRED | Line 156 |
| `src/monitor/loop.ts` | `src/monitor/removal.ts` | `checkRemovalPolicies` after each wallet pipeline | WIRED | Line 159; in try block only (success path) |
| `src/monitor/removal.ts` | `src/db/schema.ts` | writes to removal_log, updates wallets.status | WIRED | Lines 19-31 |
| `src/cli.ts` | `src/commands/wallet.ts` | `import monitorLoop`, call `loop.start()` in .then() | WIRED | Lines 5, 27 |
| `src/commands/wallet.ts` | `src/monitor/index.ts` | `MonitorLoop`, `writePid`, `readPid`, `clearPid` shared instance | WIRED | Lines 11, 14 |
| `src/commands/wallet.ts` | `src/db/schema.ts` | `removals list` reads `removal_log` | WIRED | Lines 7, 459 |
| `src/commands/wallet.ts monitor start` | `src/monitor/pid.ts` | `writePid(process.pid)` after monitorLoop.start() | WIRED | Line 414 |
| `src/commands/wallet.ts monitor stop` | running loop process | `readPid()` then `process.kill(pid, 'SIGTERM')` | WIRED | Lines 435-447 |
| `src/monitor/loop.ts start()` | SIGTERM handler | `process.once('SIGTERM', () => { this.stop(); })` | WIRED | Line 31 |

All 14 key links: WIRED

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MNTR-01 | 05-02, 05-03, 05-04 | System polls all tracked wallets on ~30-second cycle | SATISFIED | `CYCLE_INTERVAL_MS = 30_000` in loop.ts line 10; `scheduleNextCycle(CYCLE_INTERVAL_MS)` after each cycle (line 75); idempotency guard and stop IPC ensure single-loop operation |
| MNTR-02 | 05-02 | Incremental fetching per wallet using last_checked_at | SATISFIED | loop.ts lines 109-111: `afterTimestamp = Math.floor(wallet.last_checked_at / 1000)` passed to `fetchSwapHistory` |
| MNTR-03 | 05-01, 05-02, 05-04 | Rate-limits Helius calls: max 5 concurrent, exponential backoff on 429 | SATISFIED | helius.ts line 11: `PQueue({ concurrency: 5 })`; pRetry retries:5 with 429-specific delay (`Math.pow(2, attemptNumber) * 1000`) |
| RMVL-01 | 05-02 | Auto-removes wallet when score falls below threshold for N consecutive cycles | SATISFIED | removal.ts lines 63-81: streak increments below threshold 30, removes at limit 10; streak resets on score >= 30 |
| RMVL-02 | 05-02 | Auto-removes wallet when detection reaches "confirmed" confidence | SATISFIED | removal.ts lines 51-59: Policy 1 checks `confirmed_suspicious` and removes immediately |
| RMVL-03 | 05-02 | Auto-removes wallet after configurable days of inactivity | SATISFIED | removal.ts lines 92-104: `INACTIVITY_DAYS = 30`; null-guard skips wallets with `last_trade_at = null` |
| RMVL-04 | 05-02, 05-03 | Logs all removals with reason, timestamp, detection details; reversible | SATISFIED | removeWallet() inserts full audit row including label + score_at_removal; `wallet removals restore` restores status and marks `restored_at` |

All 7 requirement IDs: SATISFIED. No orphaned requirements for Phase 5.

REQUIREMENTS.md traceability table confirms all 7 IDs (MNTR-01 through MNTR-03, RMVL-01 through RMVL-04) mapped to Phase 5 with status "Complete".

---

### Anti-Patterns Found

No blocker or warning anti-patterns found in any Phase 5 files. No TODOs, FIXMEs, empty implementations, or stub returns in `src/monitor/loop.ts`, `src/monitor/removal.ts`, `src/monitor/pid.ts`, or `src/monitor/index.ts`.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/fetchers/helius.ts` | 163, 197 | TODO comments in legacy `getTransactions`/`getTransaction` methods | Info | No impact — these pre-existing legacy methods are not used by the monitoring loop; monitoring loop exclusively uses `fetchSwapHistory()` which is correctly implemented with retry and concurrency control |

---

### Human Verification Required

All Phase 5 goal-critical behaviors are verifiable from source code structure and logic. The following behaviors were human-verified during UAT (05-UAT.md, 2026-03-15, all 6 tests passed):

1. Monitor loop auto-starts on CLI launch — verified by running `pnpm echo wallet list`
2. `wallet monitor start` — verified single "[monitor] starting" log and single cycle per 30s
3. `wallet monitor pause` — verified drain semantics
4. `wallet monitor stop` — verified SIGTERM delivery and process exit
5. `wallet removals list` (empty) — verified correct empty-state message
6. `wallet removals restore` — verified error path and restore path

No further human verification required.

---

### Gaps Summary

No gaps. All 20 observable truths are verified, all 10 artifacts are substantive and wired, all 14 key links are confirmed, and all 7 requirement IDs (MNTR-01, MNTR-02, MNTR-03, RMVL-01, RMVL-02, RMVL-03, RMVL-04) are satisfied by concrete implementation evidence.

The previous verification (2026-03-14) passed at 17/17, but the codebase has since been extended by the gap-closure plan (05-GAP-PLAN.md, executed 2026-03-15) which resolved two UAT gaps:

1. **Double-start gap** — closed by: idempotency guard (`private running` flag + early-return) in loop.ts; cli.ts argv gate skips auto-start when subcommand is `wallet monitor start`.
2. **Stop no-op gap** — closed by: pid.ts PID file IPC helper; `monitor start` writes PID via `writePid(process.pid)`; `monitor stop` reads PID and sends SIGTERM cross-process; MonitorLoop registers `process.once('SIGTERM')` handler inside start().

All 6 UAT tests now pass. Test count increased from 136 to 139 (3 new TDD tests for idempotency and SIGTERM behavior in `tests/unit/monitor/loop.test.ts`).

Phase goal is fully achieved: the system continuously updates wallet data on a 30-second cycle without exhausting Helius rate limits (concurrency:5 + exponential backoff on 429), and automatically removes wallets that degrade (score streak below 30 for 10 cycles) or are confirmed scams (confirmed_suspicious detection status). The monitoring loop is controllable cross-process and auto-starts on every non-monitor-start CLI invocation.

---

_Verified: 2026-03-15_
_Verifier: Claude (gsd-verifier)_
