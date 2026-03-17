---
phase: 08-wallet-discovery
plan: 04
subsystem: cli, api, ui
tags: [commander, cli-table3, drizzle-orm, ejs, htmx, probation, discovery]

requires:
  - phase: 08-wallet-discovery plan 03
    provides: runDiscovery() orchestrator, DiscoveryOptions, DiscoveryResult interfaces
  - phase: 07-api-dashboard-and-telegram-alerts
    provides: Fastify server, dashboard.ejs, /api/wallets route, reply.view() pattern

provides:
  - wallet discover <mint> CLI subcommand with --min-score and --dry-run flags
  - wallet list Probationary Wallets section (separated from active/flagged wallets)
  - /api/wallets returns { active, probationary } shape (was flat array)
  - server.ts passes active and probationary arrays to dashboard template
  - dashboard.ejs Active Wallets + Probationary Wallets (excluded from signals) sections

affects:
  - Any client consuming /api/wallets (now expects object not array)
  - dashboard.ejs consumers expecting flat wallets template variable

tech-stack:
  added: []
  patterns:
    - Dynamic import of runDiscovery in CLI action — consistent with Phase 5 scoring dynamic import pattern
    - Drizzle OR(isNull, lt) / AND(isNotNull, gt) patterns for probation_until split queries
    - /api/wallets response shape changed from flat array to { active, probationary } object

key-files:
  created: []
  modified:
    - src/commands/wallet.ts
    - src/api/routes/wallets.ts
    - src/api/server.ts
    - src/api/views/dashboard.ejs

key-decisions:
  - "wallet discover uses dynamic import of runDiscovery — avoids circular dependency at module load time, consistent with Phase 5 pattern"
  - "/api/wallets shape changed from flat array to { active, probationary } — breaking change accepted as dashboard was only consumer"
  - "server.ts passes both active and probationary arrays to template; old flat wallets variable replaced to avoid template ambiguity"
  - "Probationary wallets excluded from active/flagged wallet list sections in CLI — shown only in their own section"

patterns-established:
  - "Probation split query: active = OR(probation_until IS NULL, probation_until < nowMs); probationary = AND(NOT NULL, > nowMs)"

requirements-completed: [DISC-01, DISC-02, DISC-03]

duration: ~10min
completed: 2026-03-17
---

# Phase 08 Plan 04: Wallet Discovery CLI + Dashboard Integration Summary

**wallet discover <CA> CLI command wired to runDiscovery(), wallet list/dashboard split into Active and Probationary Wallets sections, /api/wallets restructured from flat array to { active, probationary }**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-17T13:35:00Z
- **Completed:** 2026-03-17T07:01:25Z
- **Tasks:** 2 (+ checkpoint verified by user)
- **Files modified:** 4

## Accomplishments
- wallet discover <mint> command added to CLI with --min-score (default 70) and --dry-run flags, calling runDiscovery() via dynamic import and printing cli-table3 summary with totals and dry-run notice
- wallet list now queries probationary wallets separately (probation_until IS NOT NULL AND > now) and renders a distinct Probationary Wallets table section; probationary wallets excluded from active/flagged sections
- /api/wallets route restructured to return { active: [...], probationary: [...] } instead of flat array; probation_until included in each row
- server.ts dashboard route splits wallets into active and probationary arrays and passes both to dashboard.ejs template
- dashboard.ejs replaces single Tracked Wallets table with Active Wallets + Probationary Wallets (excluded from signals) sections
- All 184 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add wallet discover subcommand and probationary section to wallet list** - `db45752` (feat)
2. **Task 2: Expose probationary wallets in API, server template, and dashboard view** - `69780f1` (feat)

## Files Created/Modified
- `src/commands/wallet.ts` — Added wallet discover subcommand; probationary query + table section in wallet list
- `src/api/routes/wallets.ts` — Split into active/probationary queries; response shape changed to { active, probationary }
- `src/api/server.ts` — Dashboard route now queries active and probationary separately and passes both to reply.view()
- `src/api/views/dashboard.ejs` — Wallet list section replaced with Active Wallets + Probationary Wallets sections

## Decisions Made
- wallet discover dynamically imports runDiscovery — avoids circular dependency at module load time, consistent with Phase 5 scoring pattern
- /api/wallets response shape changed from flat array to { active, probationary } object — breaking change accepted since dashboard.ejs was the only consumer and was updated in the same plan
- server.ts old flat wallets variable fully replaced by active and probationary — no ambiguity in template
- Probationary wallets excluded from active/flagged CLI sections; they appear only in their own Probationary Wallets table to make probation state unambiguous

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DISC-01, DISC-02, DISC-03 requirements complete — full Phase 8 (Wallet Discovery) done
- All 184 tests passing, 8 phases complete, v1.0 milestone achieved
- Discovery surface (CLI + dashboard + API) fully wired end-to-end
- No blockers

## Self-Check: PASSED
- All 4 modified files exist on disk
- Commits db45752 and 69780f1 verified in git log

---
*Phase: 08-wallet-discovery*
*Completed: 2026-03-17*
