---
phase: 03-bundle-scam-detection
verified: 2026-03-13T10:00:00Z
status: passed
score: 17/17 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 14/14
  gaps_closed:
    - "After wallet flag --tier suspected, wallets.detection_status is written as 'suspected'"
    - "After wallet flag --tier confirmed_suspicious, wallet does not appear in getEligibleWallets()"
    - "wallet review shows flagged wallets after manual flag"
  gaps_remaining: []
  regressions: []
---

# Phase 3: Bundle Scam Detection Verification Report

**Phase Goal:** The system can classify wallets as clean or suspicious using tiered confidence before they are ever scored
**Verified:** 2026-03-13T10:00:00Z
**Status:** PASSED
**Re-verification:** Yes — after UAT gap closure (Plan 05)

---

## Summary of Re-verification Scope

The initial VERIFICATION.md (2026-03-12) passed with 14/14 truths. Subsequent UAT (03-UAT.md) exposed three major gaps: all three shared the same root cause — `computeOverallStatus` returned `confirmed_passing` whenever the only uncleared flag had `detector='manual'` because `'manual'` is absent from `SEVERITY_ORDER`. Plan 05 fixed this with an out-of-band pre-pass.

This re-verification fully checks the three gap-closure truths from Plan 05 must_haves and performs regression checks on the 14 previously-verified truths.

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | wallet_flags table exists in SQLite schema with all required columns after migration runs | VERIFIED | Unchanged from initial verification — no schema changes in Plan 05 |
| 2  | wallets.detection_status enum includes confirmed_passing and confirmed_suspicious | VERIFIED | Unchanged from initial verification |
| 3  | DetectorResult and DetectorConfig interfaces exported from src/detection/types.ts | VERIFIED | Unchanged from initial verification |
| 4  | All detection threshold constants exported from src/detection/thresholds.ts | VERIFIED | Unchanged from initial verification; SEVERITY_ORDER still excludes 'manual' (by design) |
| 5  | Bundler detector flags wallet with 2+ coordination events sharing a SOL funder | VERIFIED | Unchanged; 10 tests passing |
| 6  | Dev wallet detector flags wallet that received direct token transfer from deployer | VERIFIED | `src/detection/dev-wallet.ts` updated: `getDefaultFetcher` now calls `f.fetchOnePage()` instead of `f.getTransactions()` — functional change only (improved mint-address fetch), not a regression; 7 tests still pass |
| 7  | Sniper detector uses launch slot approximation and only flags wallets with consistently early entries | VERIFIED | Unchanged; 11 tests passing |
| 8  | Wash trader detector identifies circular patterns requiring MIN_CIRCULAR_PATTERNS_SUSPECTED=2 | VERIFIED | Unchanged; 10 tests passing |
| 9  | All four detectors respect threshold_multiplier | VERIFIED | Unchanged from initial verification |
| 10 | Detection runs automatically after importWalletHistory sets history_complete=true | VERIFIED | Unchanged from initial verification |
| 11 | runDetection orchestrates all four detectors in parallel (Promise.all) and upserts results to wallet_flags | VERIFIED | Unchanged from initial verification |
| 12 | Tier resolution uses severity order AND honours out-of-band (manual) flags, returns confirmed_passing only when no active flags exist | VERIFIED | `src/detection/engine.ts` lines 17-48: out-of-band pre-pass collects flags not in SEVERITY_ORDER; final result is worst-of-two between outOfBandWorst and severityWorst; `if (unclearedFlags.length === 0) return 'confirmed_passing'` is the only confirmed_passing early-return path now |
| 13 | CLI commands (wallet review, wallet clear-flag, wallet flag) exist with full evidence-display and confirmation prompts | VERIFIED | Unchanged from initial verification |
| 14 | Only wallets with detection_status='confirmed_passing' are returned by getEligibleWallets() | VERIFIED | Unchanged from initial verification; now correctly excludes manually-flagged wallets because computeOverallStatus writes the correct tier |
| 15 | After wallet flag --tier suspected, wallets.detection_status is written as 'suspected' | VERIFIED | `engine.ts` line 18: `outOfBandFlags` catches 'manual'; line 43: `if (severityWorst === null) return outOfBandWorst` returns 'suspected'; wallet.ts line 299-307: computeOverallStatus called after insert, result written to wallets.detection_status |
| 16 | After wallet flag --tier confirmed_suspicious, wallet does not appear in getEligibleWallets() | VERIFIED | `getEligibleWallets` (engine.ts:122-127) queries `WHERE detection_status = 'confirmed_passing'`; with the fix, wallets.detection_status is now written as 'confirmed_suspicious', so they are excluded |
| 17 | wallet review shows flagged wallets after manual flag | VERIFIED | wallet review (wallet.ts:118-124) queries `WHERE detection_status IN ('suspected', 'review', 'confirmed_suspicious')`; because computeOverallStatus now writes the correct tier, flagged wallets appear in review results |

**Score:** 17/17 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/detection/engine.ts` | computeOverallStatus with manual-flag pre-pass | VERIFIED | 128 lines; out-of-band pre-pass lines 17-25; severity-order path lines 28-38; worst-of-two merge lines 41-48 |
| `src/detection/__tests__/engine.test.ts` | Unit tests for manual flag handling | VERIFIED | 12 tests across 4 describe blocks: no-active-flags (3), manual-only (3), severity-order-only (2), mixed (4) |
| `src/fetchers/helius.ts` | fetchOnePage method for mint-address transaction fetch | VERIFIED | Lines 81-92: new `fetchOnePage` method, rate-limited via heliusQueue, used by dev-wallet.ts getDefaultFetcher |
| `src/detection/dev-wallet.ts` | getDefaultFetcher updated to use fetchOnePage | VERIFIED | Lines 199-206: calls `f.fetchOnePage(address, Math.min(limit, 100))`; removes the broken `getTransactions` date-window approach |
| `src/cli.ts` | dotenv/config import and 'echo' script name | VERIFIED | Line 2: `import 'dotenv/config'`; package.json updated: `"echo": "tsx src/cli.ts"` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/commands/wallet.ts` | `src/detection/engine.ts` | computeOverallStatus call after flag insert | WIRED | wallet.ts line 9: `import { computeOverallStatus } from '../detection/engine.js'`; lines 295-307: reads all active flags, calls computeOverallStatus, writes result to wallets.detection_status |
| `src/detection/engine.ts` | wallets.detection_status | db.update after computeOverallStatus | WIRED | engine.ts line 103-106: `computeOverallStatus(activeFlags)` result stored in `overallStatus`, then `db.update(wallets).set({ detection_status: overallStatus })` |
| `src/detection/dev-wallet.ts` | `src/fetchers/helius.ts` | fetchOnePage call in getDefaultFetcher | WIRED | dev-wallet.ts lines 199-206: `f.fetchOnePage(address, Math.min(limit, 100))`; helius.ts lines 81-92: method exists and is rate-limited |
| All previously-verified key links | — | unchanged | WIRED | Journal entry, schema imports, detector→thresholds/types wiring, importers→engine, engine→schema: all unchanged |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DETC-01 | 03-02 | System detects bundler wallets | SATISFIED | Unchanged; 10 tests passing |
| DETC-02 | 03-02 | System detects dev wallets | SATISFIED | dev-wallet.ts updated to use fetchOnePage; detection logic unchanged; 7 tests passing |
| DETC-03 | 03-03 | System detects sniper bots | SATISFIED | Unchanged; 11 tests passing |
| DETC-04 | 03-03 | System detects wash traders | SATISFIED | Unchanged; 10 tests passing |
| DETC-05 | 03-01, 03-04, 03-05 | System applies tiered confidence before flagging | SATISFIED | computeOverallStatus now correctly honours all tiers including manual flags; TIER_ORDER worst-of-two resolution; 12 engine tests covering all tier combinations |
| DETC-06 | 03-01, 03-04, 03-05 | Only wallets with passing detection status are eligible for scoring | SATISFIED | getEligibleWallets() remains gated on confirmed_passing; manually-flagged wallets now correctly excluded because detection_status is written with the correct tier |

All 6 requirement IDs (DETC-01 through DETC-06) are satisfied and marked complete (checked) in REQUIREMENTS.md.

---

## Anti-Patterns Found

No blockers, warnings, or stubs detected in the modified files.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/cli.ts` | 24-27 | `console.log('Coming soon...')` in score command | INFO | Intentional — score command is a Phase 4 placeholder; not part of Phase 3 scope |

---

## Test Suite Results

Full suite run: **79 tests, 11 suites, all passing.**

Breakdown of new tests (Plan 05 addition):
- `src/detection/__tests__/engine.test.ts`: 12 tests — manual-only flags at all 3 tiers, severity-order-only flags, mixed manual+ranked-detector flags, cleared flags (ignored), empty flag list

No previously-passing tests regressed.

---

## Human Verification Required

### 1. End-to-end detection pipeline with real wallet data

**Test:** Add a real Solana wallet known to be a bundler or dev wallet via `pnpm echo wallet add <address>`. Let import complete.
**Expected:** `wallets.detection_status` updated to something other than 'confirmed_passing'; `pnpm echo wallet review` shows the wallet with appropriate flags and evidence summaries.
**Why human:** Helius API calls with live data, real blockchain state, and actual transaction parsing required — cannot mock this end-to-end.

### 2. wallet review output formatting

**Test:** Add at least one flagged wallet and run `pnpm echo wallet review`.
**Expected:** Table shows detector name, confidence tier, and truncated evidence summary per flag; output is readable in a terminal.
**Why human:** Visual formatting and terminal rendering cannot be verified programmatically.

### 3. wallet clear-flag threshold escalation persistence

**Test:** Clear a flag on a wallet, re-import, confirm detection re-runs with raised threshold.
**Expected:** `wallet_flags` shows the cleared row with `threshold_multiplier` doubled; new detection run does not immediately re-flag unless evidence is significantly stronger.
**Why human:** Requires real detection data and a two-phase test (clear + re-import) to observe multiplier behavior in practice.

### 4. wallet list two-section output

**Test:** With at least one clean wallet and one flagged wallet tracked, run `pnpm echo wallet list`.
**Expected:** Two clearly separated sections — "Clean Wallets" heading followed by clean wallet rows, then "Flagged Wallets" heading followed by flagged rows.
**Why human:** Visual layout and color rendering are not verifiable programmatically.

### 5. manual flag smoke test with real wallet

**Test:** Run `pnpm echo wallet flag <any_tracked_address> --tier suspected`. Confirm output shows 'suspected', not 'confirmed_passing'. Run `pnpm echo wallet review` and confirm the wallet now appears. Run `pnpm echo wallet clear-flag <address>` and confirm wallet returns to 'confirmed_passing'.
**Expected:** Three-step round-trip demonstrates the complete manual flag lifecycle against a live DB.
**Why human:** Requires a pre-existing tracked wallet in the local database; end-to-end flow through commander CLI wiring cannot be verified with the unit test suite alone.

---

## Gaps Summary

No gaps. All three UAT gaps from 03-UAT.md are closed by Plan 05:

1. **wallet flag shows confirmed_passing** — CLOSED. `computeOverallStatus` out-of-band pre-pass (engine.ts lines 17-25) now picks up flags whose detector is not in SEVERITY_ORDER and returns the correct tier.

2. **wallet review shows empty after manual flag** — CLOSED. This was a downstream consequence of gap 1. Because wallets.detection_status is now written correctly, the review query finds the flagged wallet.

3. **manually flagged wallet stays in scoring pool** — CLOSED. Same root cause as gap 1. getEligibleWallets() now correctly excludes wallets whose detection_status is not 'confirmed_passing'.

The additional changes in this pass (helius.ts fetchOnePage, dev-wallet.ts adapter update, cli.ts dotenv import, package.json echo script rename) are non-breaking improvements that do not affect the detection logic and do not introduce regressions.

---

_Verified: 2026-03-13T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
