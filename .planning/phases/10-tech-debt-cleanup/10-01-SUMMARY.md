---
phase: 10-tech-debt-cleanup
plan: "01"
subsystem: detection
tags: [typescript, drizzle-orm, type-safety, dead-code-removal]

# Dependency graph
requires:
  - phase: 03-bundle-scam-detection
    provides: DetectorId union type, wallet_flags schema, computeOverallStatus engine
  - phase: 08-wallet-discovery
    provides: wallet flag CLI command with manual detector support
provides:
  - DetectorId union type including 'manual' (eliminates as-any casts in production code)
  - wallet_flags.detector Drizzle enum including 'manual'
  - computeOverallStatus without as-any casts (type-safe SEVERITY_ORDER widening)
  - flag command with type-safe detector insert
affects: [any future phases reading detection types or adding new detectors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type-safe enum widening: (SEVERITY_ORDER as readonly DetectorId[]).includes() for readonly const narrowing"
    - "DetectorId import pattern in both engine.ts and wallet.ts for type-safe schema inserts"

key-files:
  created: []
  modified:
    - src/detection/types.ts
    - src/db/schema.ts
    - src/detection/engine.ts
    - src/commands/wallet.ts

key-decisions:
  - "options.detector cast as DetectorId (not as any) in wallet.ts flag command — Commander types options as string; DetectorId is the correct narrowing since 'manual' is now in the union"
  - "DetectorId imported into wallet.ts to enable type-safe schema insert without as-any"
  - "wallets import kept in engine.ts after getEligibleWallets removal — still used in runDetection and runDetectionIfNeeded"
  - "src/index.ts deleted entirely — no importers exist and file was pure scaffolding stub with no production value"

patterns-established:
  - "Dead export removal: grep import sites before deleting to confirm zero consumers"
  - "Type-safe widening for readonly const: cast the array, not the element — (arr as readonly T[]).includes(val)"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 10 Plan 01: Tech Debt Cleanup — Type System Accuracy Summary

**'manual' added to DetectorId union and schema enum, five as-any casts removed from production code, getEligibleWallets() dead export and scoreWallet() stub deleted — TypeScript type system now accurately reflects runtime behavior**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T13:20:44Z
- **Completed:** 2026-03-26T13:23:08Z
- **Tasks:** 2
- **Files modified:** 4 (+ 1 deleted)

## Accomplishments

- Added 'manual' as fifth value to DetectorId union (types.ts) and wallet_flags.detector Drizzle enum (schema.ts), making the type system consistent with the runtime behavior documented in Phase 3 decision log
- Removed all five as-any casts on detector/confidence fields: three in engine.ts SEVERITY_ORDER filter replaced with type-safe widening cast; two pairs in wallet.ts clear-flag and flag commands resolved by type alignment
- Deleted getEligibleWallets() from engine.ts (zero import sites confirmed) and deleted src/index.ts entirely (14-line stub with no consumers)
- pnpm type-check exits 0 and all 184 tests pass — no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 'manual' to DetectorId union and schema enum; remove as-any casts** - `a227edd` (feat)
2. **Task 2: Remove getEligibleWallets() dead export and scoreWallet() stub** - `2bb8adf` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/detection/types.ts` - Added 'manual' to DetectorId union (fifth literal value)
- `src/db/schema.ts` - Added 'manual' to wallet_flags.detector enum array
- `src/detection/engine.ts` - Imported DetectorId; replaced as-any with (SEVERITY_ORDER as readonly DetectorId[]).includes(); deleted getEligibleWallets() function
- `src/commands/wallet.ts` - Imported DetectorId; replaced five as-any casts with direct field access or DetectorId cast; options.detector cast as DetectorId for schema insert

## Decisions Made

- `options.detector` in the flag command action is typed as `string` by Commander — cast as `DetectorId` (not `as any`) since 'manual' is now in the union, making this a correct type narrowing rather than suppression
- `wallets` import retained in engine.ts after `getEligibleWallets` deletion because `runDetection` and `runDetectionIfNeeded` both reference `wallets` table directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added DetectorId import and cast for options.detector in wallet.ts**
- **Found during:** Task 1 (type-check after removing as-any casts)
- **Issue:** After removing `options.detector as any`, TypeScript reported type error TS2769 — Commander types options as `string` which is not assignable to the Drizzle enum literal union
- **Fix:** Imported `DetectorId` from `./types.js` into wallet.ts and cast `options.detector as DetectorId` — a type-safe narrowing (not suppression) since 'manual' is now in the union
- **Files modified:** src/commands/wallet.ts
- **Verification:** pnpm type-check exits 0 after fix
- **Committed in:** a227edd (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type alignment issue surfaced by removing as-any cast)
**Impact on plan:** Necessary correction — the plan said "remove as-any cast" and the fix achieves that intent via proper type import rather than a different suppression. No scope creep.

## Issues Encountered

None beyond the auto-fixed type alignment deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Type system now accurately reflects the 'manual' detector at all layers (union type, schema enum, engine cast, CLI insert)
- All 184 tests green, type-check clean
- No blockers for subsequent tech debt cleanup plans

---
*Phase: 10-tech-debt-cleanup*
*Completed: 2026-03-26*
