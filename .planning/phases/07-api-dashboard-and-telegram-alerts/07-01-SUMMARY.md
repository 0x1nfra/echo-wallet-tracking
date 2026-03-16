---
phase: 07-api-dashboard-and-telegram-alerts
plan: "01"
subsystem: database
tags: [fastify, grammy, ejs, sqlite, drizzle, eventemitter]

# Dependency graph
requires:
  - phase: 06-token-signal-engine
    provides: computeAllTokenSignals() in MonitorLoop, token_signals schema
provides:
  - fastify, @fastify/sse, @fastify/static, @fastify/view, ejs, grammy packages installed
  - alert_log and token_metadata tables in schema.ts, migration SQL, and live SQLite database
  - cycleEmitter EventEmitter singleton in src/api/cycle-events.ts
  - MonitorLoop emitting 'cycle' event after each successful signal computation
affects:
  - 07-api-dashboard-and-telegram-alerts (plans 02, 03, 04 all depend on these foundations)

# Tech tracking
tech-stack:
  added:
    - fastify 5.8.2 (HTTP server framework)
    - "@fastify/sse 0.4.0 (Server-Sent Events plugin)"
    - "@fastify/static 9.0.0 (static file serving)"
    - "@fastify/view 11.1.1 (template rendering)"
    - ejs 5.0.1 (template engine)
    - grammy 1.41.1 (Telegram bot framework, TypeScript-native)
    - "@types/ejs 3.1.5 (dev dependency)"
  patterns:
    - EventEmitter singleton for cross-module event fanout (cycleEmitter)
    - Migration 0006 manually registered in __drizzle_migrations after direct db.exec() application

key-files:
  created:
    - src/api/cycle-events.ts
    - src/db/migrations/0006_alert_log_token_metadata.sql
  modified:
    - src/db/schema.ts
    - src/db/migrations/meta/_journal.json
    - src/monitor/loop.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "grammy is TypeScript-native and ships its own types — no @types/grammy needed"
  - "Migration 0006 applied via direct db.exec() then registered in __drizzle_migrations to keep drizzle tracking consistent (when=1773510000001)"
  - "cycleEmitter.setMaxListeners(50) to support many concurrent SSE browser connections"
  - "cycleEmitter.emit placed inside the try block after computeAllTokenSignals() — only fires on success, not in catch path"

patterns-established:
  - "Pattern: Shared EventEmitter singleton pattern — single module exports one instance, consumers import it directly"
  - "Pattern: Migration manually applied + drizzle tracking updated when drizzle-kit would regenerate already-applied tables"

requirements-completed: [DASH-01, TGRM-01, TGRM-03]

# Metrics
duration: 4min
completed: "2026-03-16"
---

# Phase 7 Plan 01: API, Dashboard, and Telegram Alerts — Foundation Summary

**Installed fastify/grammy/ejs ecosystem (6 packages), added alert_log and token_metadata tables to schema and SQLite, wired cycleEmitter EventEmitter into MonitorLoop for real-time SSE fanout**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T03:42:45Z
- **Completed:** 2026-03-16T03:46:46Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- All 6 runtime packages (fastify, @fastify/sse, @fastify/static, @fastify/view, ejs, grammy) installed and resolvable from node_modules
- alert_log and token_metadata tables added to schema.ts, migration SQL, and physically created in echo.db
- cycleEmitter singleton created and MonitorLoop now emits 'cycle' event after every successful signal computation
- All 167 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Install new npm packages** - `f8a5a86` (chore)
2. **Task 2: Add alert_log and token_metadata tables** - `a5c2f8f` (feat)
3. **Task 3: Create cycleEmitter and wire into MonitorLoop** - `1545ecf` (feat)

## Files Created/Modified

- `src/api/cycle-events.ts` - EventEmitter singleton exported as cycleEmitter with setMaxListeners(50)
- `src/db/schema.ts` - Added alert_log and token_metadata table definitions
- `src/db/migrations/0006_alert_log_token_metadata.sql` - CREATE TABLE SQL for both new tables with statement-breakpoint
- `src/db/migrations/meta/_journal.json` - Added journal entry idx=6, when=1773510000001
- `src/monitor/loop.ts` - Import cycleEmitter; emit 'cycle' event after computeAllTokenSignals()
- `package.json` - 6 new dependencies + @types/ejs devDependency
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made

- grammy is TypeScript-native — no @types/grammy package needed
- Migration 0006 was applied via direct `db.exec()` (per plan instructions), then manually registered in `__drizzle_migrations` table with the correct SHA256 hash so drizzle's migrator recognizes it as applied and does not re-run it. Without this step, test suites that import src/db/index.ts (triggering migrate()) would fail because the tables already exist in echo.db.
- cycleEmitter.setMaxListeners(50) prevents Node.js MaxListenersExceededWarning when many SSE connections are open simultaneously.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Registered migration 0006 in drizzle's __drizzle_migrations tracking table**
- **Found during:** Task 3 (running pnpm test after loop.ts changes)
- **Issue:** Plan instructed applying migration via `db.exec()` directly. This bypassed drizzle's migration tracker, so `migrate()` in src/db/index.ts would try to re-apply it (tables already exist) whenever tests loaded the module.
- **Fix:** After manually applying the migration, inserted the SHA256 hash of the SQL file into `__drizzle_migrations` with `created_at=1773510000001` so the migrator considers it already applied.
- **Files modified:** data/echo.db (__drizzle_migrations table row, not a source file)
- **Verification:** pnpm test — all 167 tests pass, no DrizzleError
- **Committed in:** a5c2f8f (Task 2 commit hash covers the schema/migration files; db row not in git)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Essential fix to maintain test correctness. Direct db.exec() application requires manual drizzle tracking table registration.

## Issues Encountered

None — plan executed smoothly once migration tracking was corrected.

## User Setup Required

None for this plan. Telegram bot token and chat ID are required for Phase 7 Plan 03 (Telegram alerts) — see the plan's user_setup section.

## Next Phase Readiness

- All package dependencies for Phase 7 are now installed
- alert_log deduplication table is ready for alert-sending logic (Plan 03)
- token_metadata caching table is ready for DexScreener enrichment (Plan 03)
- cycleEmitter is wired and will fan out to the SSE route (Plan 02) and any other subscribers
- No blockers for Plan 02 (Fastify server + dashboard) or Plan 03 (Telegram bot)

## Self-Check: PASSED

All created files found. All task commits verified in git log.

---
*Phase: 07-api-dashboard-and-telegram-alerts*
*Completed: 2026-03-16*
