---
phase: 03-bundle-scam-detection
plan: 01
subsystem: database
tags: [drizzle-orm, sqlite, detection, schema, types, thresholds]

# Dependency graph
requires:
  - phase: 02-transaction-parsing
    provides: swaps table, parse_errors table, schema.ts patterns established
provides:
  - wallet_flags table definition in schema.ts with 12 columns
  - migration 0002_wallet_flags.sql for CREATE TABLE
  - DetectorResult, DetectorConfig, DetectorId, DetectionTier, DetectionStatus, ActiveFlag types
  - BUNDLER, DEV_WALLET, SNIPER, WASH_TRADER, SEVERITY_ORDER threshold constants
  - Updated wallets.detection_status enum (confirmed_suspicious/confirmed_passing replacing passing/confirmed)
affects: [03-02-detectors-bundler-dev, 03-03-detectors-sniper-wash, 03-04-detection-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ORM-only enum enforcement — SQLite does not enforce CHECK constraints, so enum changes are schema.ts-only with no SQL migration needed"
    - "Detection threshold constants centralized in thresholds.ts with bias labels (AGGRESSIVE/CONSERVATIVE) for tuning guidance"
    - "Detector interface contract: DetectorConfig in / DetectorResult out — all detectors implement same shape"

key-files:
  created:
    - src/detection/types.ts
    - src/detection/thresholds.ts
    - src/db/migrations/0002_wallet_flags.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json

key-decisions:
  - "wallet_flags has no composite unique constraint — engine upsert uses WHERE conditions; multiple cleared historical rows per wallet+detector are allowed to preserve escalation history"
  - "DetectionTier (suspected/review/confirmed_suspicious) is distinct from DetectionStatus — tier is flag-level confidence, status is wallet-level aggregate"
  - "KNOWN_SYSTEM_ACCOUNTS set in BUNDLER thresholds excludes Jupiter v6, System program, SPL Token program, ATA program from shared-funder detection to prevent false positives"
  - "Threshold multiplier doubles on each user clear, capped at 4.0 — provides false-positive protection without permanently disabling detection"

patterns-established:
  - "Detector contract: all detectors accept DetectorConfig, return DetectorResult with flagged/confidence/evidenceSummary/evidenceDetail"
  - "Evidence split: evidenceSummary for CLI display, evidenceDetail for Phase 7 dashboard — keeps CLI output concise"
  - "Severity order: bundler > dev_wallet > wash_trader > sniper — highest severity drives wallet-level status"

requirements-completed: [DETC-05, DETC-06]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 3 Plan 01: Schema and Detection Types Foundation Summary

**wallet_flags SQLite table, updated detection_status enum (confirmed_suspicious/confirmed_passing), DetectorResult/DetectorConfig interfaces, and all four detector threshold constant sets centralized in src/detection/**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T15:31:09Z
- **Completed:** 2026-03-11T15:33:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extended wallets.detection_status enum with confirmed_suspicious and confirmed_passing (replacing old passing/confirmed values)
- Added wallet_flags table to schema.ts with 12 columns supporting detection evidence storage with threshold multiplier and cleared state
- Created SQL migration 0002_wallet_flags.sql and updated migration journal at idx=2
- Created src/detection/types.ts defining DetectorResult, DetectorConfig, DetectorId, DetectionTier, DetectionStatus, ActiveFlag
- Created src/detection/thresholds.ts with BUNDLER, DEV_WALLET, SNIPER, WASH_TRADER constants plus SEVERITY_ORDER and threshold multiplier constants

## Task Commits

Each task was committed atomically:

1. **Task 1: Add wallet_flags table to schema and create migration** - `6c95ab3` (feat)
2. **Task 2: Create detection types and thresholds modules** - `d7cf84a` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/db/schema.ts` - Added wallet_flags table definition; updated wallets.detection_status enum
- `src/db/migrations/0002_wallet_flags.sql` - CREATE TABLE IF NOT EXISTS wallet_flags with all columns
- `src/db/migrations/meta/_journal.json` - Added idx=2 entry for 0002_wallet_flags migration
- `src/detection/types.ts` - DetectorResult, DetectorConfig, DetectorId, DetectionTier, DetectionStatus, ActiveFlag types
- `src/detection/thresholds.ts` - BUNDLER, DEV_WALLET, SNIPER, WASH_TRADER, SEVERITY_ORDER threshold constants

## Decisions Made
- wallet_flags has no composite unique constraint (wallet_address + detector) — the engine upsert uses WHERE conditions; multiple cleared historical rows per wallet+detector are allowed to preserve escalation history
- DetectionTier is distinct from DetectionStatus: tier is per-flag confidence, status is wallet-level aggregate computed by the engine
- KNOWN_SYSTEM_ACCOUNTS in BUNDLER constants excludes Jupiter v6, System program, SPL Token program, and ATA program from shared-funder detection to prevent routing-pool false positives
- Threshold multiplier caps at 4.0 (doubles on each user clear) — provides false-positive protection without permanently disabling detection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- npx tsx -e inline mode cannot resolve relative paths for verification; workaround: use a project-root temp .ts file for tsx verification. No impact on deliverables.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All types and thresholds ready for Plans 02 and 03 (detector implementations)
- DetectorConfig/DetectorResult interface contract locks in the shape all detectors must implement
- wallet_flags migration ready to run via standard drizzle migrate command
- Zero TypeScript errors confirmed — type foundation is stable

---
*Phase: 03-bundle-scam-detection*
*Completed: 2026-03-11*

## Self-Check: PASSED

- FOUND: src/detection/types.ts
- FOUND: src/detection/thresholds.ts
- FOUND: src/db/migrations/0002_wallet_flags.sql
- FOUND: .planning/phases/03-bundle-scam-detection/03-01-SUMMARY.md
- FOUND: commit 6c95ab3 (Task 1)
- FOUND: commit d7cf84a (Task 2)
