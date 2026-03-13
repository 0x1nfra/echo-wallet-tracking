---
phase: 05-monitoring-loop-and-auto-removal
verified: 2026-03-14T00:00:00Z
status: passed
score: 17/17 must-haves verified
re_verification: false
---

# Phase 5: Monitoring Loop and Auto-Removal Verification Report

**Phase Goal:** The system continuously updates wallet data on a 30-second cycle without exhausting Helius rate limits, and automatically removes wallets that degrade or are confirmed scams
**Verified:** 2026-03-14
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | wallets table has `low_score_streak` (int, default 0) and `last_trade_at` (int, nullable) columns | VERIFIED | `src/db/schema.ts` lines 18-19; migration 0004 lines 1-3 |
| 2  | removal_log table has `label` (text, nullable) and `score_at_removal` (real, nullable) columns | VERIFIED | `src/db/schema.ts` lines 88-89; migration 0004 lines 5-7 |
| 3  | Helius API calls use concurrency: 5 (not interval-based) and retry with exponential backoff on 429 | VERIFIED | `src/fetchers/helius.ts` line 11: `new PQueue({ concurrency: 5 })`; lines 57-67: pRetry retries:5 with 429 backoff |
| 4  | MonitorLoop.start() runs one cycle immediately then schedules subsequent cycles every 30 seconds | VERIFIED | `src/monitor/loop.ts` lines 20-25: `scheduleNextCycle(0)` on start; line 67: `scheduleNextCycle(CYCLE_INTERVAL_MS)` after each cycle |
| 5  | Each cycle fetches only transactions since last_checked_at (incremental, not full re-fetch) | VERIFIED | `src/monitor/loop.ts` lines 101-103: `afterTimestamp = Math.floor(wallet.last_checked_at / 1000)` |
| 6  | A wallet with detection_status = 'confirmed_suspicious' is removed on the next cycle | VERIFIED | `src/monitor/removal.ts` lines 51-60: Policy 1 checks `confirmed_suspicious` and calls removeWallet immediately |
| 7  | A wallet whose score stays below 30 for 10 consecutive cycles is removed; low_score_streak resets to 0 on any above-threshold cycle | VERIFIED | `src/monitor/removal.ts` lines 63-88: streak increment on score < 30, threshold 30, limit 10; reset to 0 on score >= 30 |
| 8  | A wallet with no trades for 30+ days (last_trade_at set AND older than 30d) is removed; last_trade_at = NULL skips the inactivity check | VERIFIED | `src/monitor/removal.ts` lines 91-104: null-guard on line 92; 30-day window check on line 94 |
| 9  | All auto-removals write to removal_log with reason, label, score_at_removal, and detection_details | VERIFIED | `src/monitor/removal.ts` lines 24-31: `db.insert(removal_log).values({ reason, label, score_at_removal, detection_details, removed_by: 'auto' })` |
| 10 | MonitorLoop supports pause() and stop(); pause lets current cycle drain, stop clears the timer | VERIFIED | `src/monitor/loop.ts` lines 27-46: pause sets `paused=true` with drain semantics; stop clears timer via `clearTimeout` |
| 11 | Single-wallet fetch failures skip that wallet and log to stderr; failure does not increment low_score_streak | VERIFIED | `src/monitor/loop.ts` lines 155-162: catch block logs to stderr, increments `failed` counter; `checkRemovalPolicies` only called inside the try block (success path) |
| 12 | `wallet monitor start/pause/stop` commands exist and delegate to the shared monitorLoop instance | VERIFIED | `src/commands/wallet.ts` lines 407-437: three subcommands calling `monitorLoop.start()`, `.pause()`, `.stop()` |
| 13 | `wallet removals list` prints a table of all removal_log rows with address, label, score at removal, detection status, reason, and timestamp | VERIFIED | `src/commands/wallet.ts` lines 444-472: table with columns ADDRESS, LABEL, SCORE, DETECTION STATUS, REASON, REMOVED AT; reads `score_at_removal`, `label`, `detection_details` |
| 14 | `wallet removals restore <address>` re-adds wallet to tracked status and resets low_score_streak | VERIFIED | `src/commands/wallet.ts` lines 474-508: sets `status: 'tracked', detection_status: 'pending', low_score_streak: 0`; marks `restored_at` |
| 15 | MonitorLoop auto-starts when process launches (cli.ts calls loop.start() after resumeImportingWallets completes) | VERIFIED | `src/cli.ts` lines 18-22: `resumeImportingWallets().catch(() => {}).then(() => { monitorLoop.start(); })` |
| 16 | Migration 0004 registered in journal and includes last_trade_at backfill from swaps | VERIFIED | `_journal.json` idx=4 tag=`0004_monitoring_columns`; migration SQL lines 9-17: UPDATE wallets SET last_trade_at from swaps |
| 17 | All 136 prior tests pass with no regressions | VERIFIED | `pnpm test` output: 136 passed, 0 failed, 13 suites |

**Score:** 17/17 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `src/db/migrations/0004_monitoring_columns.sql` | DDL for 4 new columns + last_trade_at backfill | VERIFIED | 17 lines; 4 ALTER TABLE statements + backfill UPDATE; statement-breakpoints correct |
| `src/db/schema.ts` | Drizzle types for low_score_streak, last_trade_at, label, score_at_removal | VERIFIED | All 4 columns present in wallets and removal_log table definitions |
| `src/fetchers/helius.ts` | heliusQueue with concurrency: 5 and 429-aware retry | VERIFIED | Line 11: `new PQueue({ concurrency: 5 })`; retries: 5; 429 exponential backoff |
| `src/monitor/removal.ts` | checkRemovalPolicies, removeWallet, exported constants | VERIFIED | 107 lines; three policies; writes to both wallets and removal_log |
| `src/monitor/loop.ts` | MonitorLoop class with start/pause/resume/stop/runCycle | VERIFIED | 170 lines; full cycle orchestration; stagger; crash-restart |
| `src/monitor/index.ts` | Re-exports MonitorLoop | VERIFIED | Single line export |
| `src/commands/wallet.ts` | wallet monitor start/pause/stop and wallet removals list/restore | VERIFIED | Lines 407-510; both subcommand groups wired; uses shared monitorLoop export |
| `src/cli.ts` | MonitorLoop auto-start after resumeImportingWallets | VERIFIED | Lines 5, 18-22: imports monitorLoop, chains start() in .then() |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/fetchers/helius.ts` | p-queue | `new PQueue({ concurrency: 5 })` | WIRED | Line 11 exact match |
| `src/db/schema.ts` | wallets table | `low_score_streak` column | WIRED | Line 18 |
| `src/db/migrations/0004_monitoring_columns.sql` | wallets.last_trade_at | UPDATE from swaps backfill | WIRED | Lines 9-17 |
| `src/monitor/loop.ts` | `src/importers/history.ts` | `fetchSwapHistory` for incremental fetch | WIRED | Line 105: `fetcher.fetchSwapHistory(wallet.address, afterTimestamp)` |
| `src/monitor/loop.ts` | `src/detection/engine.ts` | `runDetectionIfNeeded` per wallet | WIRED | Line 147 |
| `src/monitor/loop.ts` | `src/scoring/engine.ts` | `scoreWalletIfNeeded` per wallet | WIRED | Line 148 |
| `src/monitor/loop.ts` | `src/monitor/removal.ts` | `checkRemovalPolicies` after each wallet pipeline | WIRED | Line 151; in try block only (success path) |
| `src/monitor/removal.ts` | `src/db/schema.ts` | writes to removal_log, updates wallets.status | WIRED | Lines 19-31 |
| `src/cli.ts` | `src/monitor/index.ts` | `import monitorLoop`, call `loop.start()` | WIRED | Lines 5, 21 |
| `src/commands/wallet.ts` | `src/monitor/index.ts` | `MonitorLoop` shared instance | WIRED | Lines 11, 14 |
| `src/commands/wallet.ts` | `src/db/schema.ts` | `removals list` reads `removal_log` | WIRED | Lines 7, 445 |

All 11 key links: WIRED

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MNTR-01 | 05-02, 05-03 | System polls all tracked wallets on ~30-second cycle | SATISFIED | `CYCLE_INTERVAL_MS = 30_000` in loop.ts; `scheduleNextCycle(CYCLE_INTERVAL_MS)` after each cycle |
| MNTR-02 | 05-02 | Incremental fetching per wallet using last_checked_at | SATISFIED | loop.ts lines 101-103: `afterTimestamp = Math.floor(wallet.last_checked_at / 1000)` |
| MNTR-03 | 05-01, 05-02 | Rate-limits Helius calls: max 5 concurrent, exponential backoff on 429 | SATISFIED | helius.ts line 11: `PQueue({ concurrency: 5 })`; pRetry retries:5 with 429-specific delay |
| RMVL-01 | 05-02 | Auto-removes wallet when score falls below threshold for N consecutive cycles | SATISFIED | removal.ts lines 63-81: streak increments below threshold 30, removes at limit 10 |
| RMVL-02 | 05-02 | Auto-removes wallet when detection reaches "confirmed" confidence | SATISFIED | removal.ts lines 51-60: Policy 1 checks `confirmed_suspicious` and removes immediately |
| RMVL-03 | 05-02 | Auto-removes wallet after configurable days of inactivity | SATISFIED | removal.ts lines 91-104: `INACTIVITY_DAYS = 30`; null-guard skips wallets with no trade data |
| RMVL-04 | 05-02, 05-03 | Logs all removals with reason, timestamp, detection details; reversible | SATISFIED | removeWallet() inserts full audit row; `wallet removals restore` command restores and marks `restored_at` |

All 7 requirement IDs: SATISFIED. No orphaned requirements for Phase 5.

---

### Anti-Patterns Found

No blocker or warning anti-patterns detected in any Phase 5 files. No TODOs, FIXMEs, empty implementations, or stub returns found in `src/monitor/loop.ts`, `src/monitor/removal.ts`, or `src/monitor/index.ts`.

Note: `src/fetchers/helius.ts` still contains the legacy `getTransactions()` and `getTransaction()` methods with old-style TODO comments (lines 163, 199) and no retry logic, but these are pre-existing methods from an earlier phase and are not used by the monitoring loop. The monitoring loop exclusively uses `fetchSwapHistory()` which is correctly implemented. These legacy methods are informational only.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/fetchers/helius.ts` | 163, 199 | TODO comments in legacy `getTransactions`/`getTransaction` methods | Info | No impact — these methods are not called by the monitoring loop |

---

### Human Verification Required

None — all Phase 5 goal-critical behaviors are verifiable from source code structure and logic. The monitoring loop timing (30s cycle behavior in production) cannot be tested without running the process, but the implementation evidence is unambiguous.

---

### Gaps Summary

No gaps. All 17 observable truths are verified, all 8 artifacts are substantive and wired, all 11 key links are confirmed, and all 7 requirement IDs (MNTR-01, MNTR-02, MNTR-03, RMVL-01, RMVL-02, RMVL-03, RMVL-04) are satisfied by concrete implementation evidence.

Phase goal is fully achieved: the system continuously updates wallet data on a 30-second cycle without exhausting Helius rate limits (concurrency:5 + exponential backoff on 429), and automatically removes wallets that degrade (score streak below 30 for 10 cycles) or are confirmed scams (confirmed_suspicious detection status).

---

_Verified: 2026-03-14_
_Verifier: Claude (gsd-verifier)_
