---
phase: 15-coin-sourcing-observability
plan: "04"
subsystem: api
tags: [fastify, ejs, admin, observability, dashboard]

requires:
  - phase: 15-01
    provides: sourcing_log schema and getSharedProviderStatus() singleton in providers/index.ts
  - phase: 15-02
    provides: AutoSourcer class with getStats() method
  - phase: 15-03
    provides: autoSourcer singleton export from monitor/index.ts; monitorLoop export from commands/wallet.ts

provides:
  - GET /admin route serving HTML dashboard with system health
  - src/api/routes/admin.ts Fastify plugin aggregating monitorLoop, autoSourcer, providerStatus, sourcing_log
  - src/api/views/admin.ejs EJS template with 4 health sections

affects: [phase-16, ops-debugging]

tech-stack:
  added: []
  patterns:
    - "Dynamic import in Fastify route handler to avoid circular dependencies (same as server.ts / route)"
    - "reply.view('admin', data, { layout: 'layout' }) pattern matching existing dashboard routes"

key-files:
  created:
    - src/api/routes/admin.ts
    - src/api/views/admin.ejs
  modified:
    - src/api/server.ts

key-decisions:
  - "Dynamic import used for monitorLoop and autoSourcer in admin route handler to avoid circular dependency at module load"
  - "getSharedProviderStatus() called via dynamic import — module-level singleton populated by loop.ts on each cycle"
  - "providerStatus type includes index field from router.getStatus() — kept as-is rather than stripping it in the route"

patterns-established:
  - "Admin/ops routes follow the same Fastify plugin pattern as feature routes"

requirements-completed: [OBS-01]

duration: 10min
completed: 2026-04-18
---

# Phase 15 Plan 04: Admin Dashboard Summary

**GET /admin dashboard page showing monitor cycle health, AutoSourcer status, per-provider state, and last 10 sourcing log entries using EJS+Fastify pattern**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-18T12:30:00Z
- **Completed:** 2026-04-18T12:40:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created src/api/routes/admin.ts as Fastify plugin with GET /admin handler aggregating all system health data
- Created src/api/views/admin.ejs with 4 sections: Monitor Cycle Health, AutoSourcer, Provider Status, Recent Sourcing Runs
- Registered admin route in server.ts; TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /admin Fastify route with data aggregation** - `c161c55` (feat)
2. **Task 2: Create admin.ejs template with health sections** - `aec59af` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/api/routes/admin.ts` - Fastify plugin for GET /admin; aggregates monitorLoop stats, autoSourcer.getStats(), getSharedProviderStatus(), and last 10 sourcing_log rows
- `src/api/views/admin.ejs` - EJS template with monitor cycle health, AutoSourcer status, provider status, and recent sourcing log tables
- `src/api/server.ts` - Added `await app.register(import('./routes/admin.js'))` registration

## Decisions Made

- Dynamic import used for monitorLoop and autoSourcer in the route handler (same lazy-import pattern as other routes in server.ts) to avoid circular dependency at module load time
- getSharedProviderStatus() called via dynamic import — the singleton is populated by loop.ts's updateSharedProviderStatus() call on each monitor cycle; shows empty array before first cycle completes
- providerStatus objects retain the `index` field from router.getStatus() — no stripping needed since EJS only renders `name`, `state`, `lastError`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OBS-01 satisfied: /admin page accessible at http://localhost:PORT/admin showing all 4 operational health sections
- Ready for Plan 05: Telegram /status command (OBS-02)

---
*Phase: 15-coin-sourcing-observability*
*Completed: 2026-04-18*
