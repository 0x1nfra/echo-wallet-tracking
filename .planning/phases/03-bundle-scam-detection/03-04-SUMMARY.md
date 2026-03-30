---
phase: 03-bundle-scam-detection
plan: 04
subsystem: detection
tags: [drizzle-orm, better-sqlite3, commander, inquirer, cli-table3, chalk]

# Dependency graph
requires:
  - phase: 03-bundle-scam-detection
    plan: 02
    provides: detectBundler, detectDevWallet from detection sub-detectors
  - phase: 03-bundle-scam-detection
    plan: 03
    provides: detectSniper, detectWashTrader from detection sub-detectors
provides:
  - runDetection engine orchestrating all four detectors in parallel via Promise.all
  - runDetectionIfNeeded incremental guard for monitoring loop
  - computeOverallStatus tier resolution by severity order
  - getEligibleWallets scoring gate returning only confirmed_passing wallets
  - Detection auto-triggered from importWalletHistory after history_complete=true
  - wallet review CLI command showing flagged wallets with per-flag evidence tables
  - wallet clear-flag CLI command with evidence display, confirmation prompt, threshold escalation
  - wallet flag CLI command for manual force-promote with tier and detector options
  - wallet list updated with two-section output (Clean Wallets / Flagged Wallets)
affects: [04-wallet-scoring, 05-monitoring-loop, 07-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Detection orchestration: Promise.all across all four detectors, then upsert to wallet_flags
    - Severity resolution: SEVERITY_ORDER array (bundler > dev_wallet > wash_trader > sniper) used to find worst detector; then TIER_ORDER for highest confidence
    - Threshold escalation: cleared flags double threshold_multiplier (capped at MAX_THRESHOLD_MULTIPLIER=4.0) to reduce re-flag sensitivity
    - SELECT-then-INSERT/UPDATE pattern for wallet_flags (no unique constraint — multiple cleared rows allowed per wallet+detector)

key-files:
  created:
    - src/detection/engine.ts
  modified:
    - src/importers/history.ts
    - src/commands/wallet.ts

key-decisions:
  - "wallet_flags SELECT-then-INSERT/UPDATE (no onConflictDoUpdate) — multiple cleared rows allowed per wallet+detector for escalation history"
  - "Detection triggered synchronously after importWalletHistory sets history_complete=true — no async queue needed for Phase 3"
  - "wallet flag --detector defaults to 'manual' (not a real DetectorId enum value) — allows user attribution without polluting detector namespace; cast as any for DB insert"
  - "computeOverallStatus returns confirmed_passing on empty uncleared flags — clean-by-default assumption"

patterns-established:
  - "Engine pattern: read cleared multipliers → run detectors in parallel → upsert results → recompute status"
  - "CLI pattern: show evidence before destructive operations, prompt confirmation, update DB, recompute status"

requirements-completed: [DETC-05, DETC-06]

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 3 Plan 04: Detection Engine and CLI Commands Summary

**runDetection engine wires all four detectors in Promise.all, triggers from history import, and adds wallet review/clear-flag/flag/list commands for full detection CLI coverage**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-12T13:26:46Z
- **Completed:** 2026-03-12T13:38:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Detection engine (engine.ts) orchestrates bundler, dev_wallet, sniper, wash_trader in Promise.all with per-detector threshold_multiplier from cleared flag history
- importWalletHistory now calls runDetection(address) after setting history_complete=true — full pipeline from wallet add to detection status in one command
- wallet list shows two separate sections: Clean Wallets (confirmed_passing/pending) and Flagged Wallets (suspected/review/confirmed_suspicious) with status colors
- wallet review, clear-flag, and flag commands added — complete detection management surface for CLI users
- getEligibleWallets() scoring gate returns only confirmed_passing wallets, closing the detection→scoring flow for Phase 4

## Task Commits

Each task was committed atomically:

1. **Task 1: Create detection engine orchestrator** - `fe426d0` (feat)
2. **Task 2: Wire detection into history importer and add wallet CLI commands** - `c9857b5` (feat)

**Plan metadata:** (committed after this summary)

## Files Created/Modified
- `src/detection/engine.ts` - runDetection, runDetectionIfNeeded, computeOverallStatus, getEligibleWallets
- `src/importers/history.ts` - Added runDetection call after history_complete=true
- `src/commands/wallet.ts` - Added review, clear-flag, flag commands; rewrote list with two-section output

## Decisions Made
- wallet_flags uses SELECT-then-INSERT/UPDATE (not onConflictDoUpdate) because multiple cleared rows per wallet+detector are allowed to preserve escalation history; only one active (cleared=false) row per wallet+detector at any time
- wallet flag --detector defaults to 'manual' (not in DetectorId enum) — gives user-attributed flags a distinct attribution without changing the enum definition
- Detection runs synchronously inline in importWalletHistory — no async queue needed for Phase 3; Phase 5 monitoring loop will use runDetectionIfNeeded instead

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Full detection pipeline complete: wallet add → import → detection → wallets.detection_status updated
- getEligibleWallets() scoring gate ready for Phase 4 (wallet scoring)
- runDetectionIfNeeded ready for Phase 5 (monitoring loop) — guards against redundant re-runs
- All 67 tests passing, zero TypeScript errors

## Self-Check: PASSED

- FOUND: src/detection/engine.ts
- FOUND: src/importers/history.ts
- FOUND: src/commands/wallet.ts
- FOUND: 03-04-SUMMARY.md
- FOUND commit: fe426d0 (Task 1)
- FOUND commit: c9857b5 (Task 2)

---
*Phase: 03-bundle-scam-detection*
*Completed: 2026-03-12*
