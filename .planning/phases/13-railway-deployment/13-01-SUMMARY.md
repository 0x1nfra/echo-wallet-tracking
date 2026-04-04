---
phase: 13-railway-deployment
plan: "01"
subsystem: infra
tags: [railway, docker, dockerfile, better-sqlite3, fastify, healthcheck, deployment]

# Dependency graph
requires: []
provides:
  - Dockerfile (Node 20-slim + python3 + build-essential for better-sqlite3 native compilation)
  - railway.toml (DOCKERFILE builder, /health healthcheck, ON_FAILURE restart policy)
  - GET /health endpoint returning { status: "ok", uptime: number } with HTTP 200
  - docs/railway-deployment.md runbook covering env vars, volume setup, deploy, verification, troubleshooting
affects:
  - 13-02 (host binding and serve-command rewrite that railway.toml startCommand depends on)
  - 13-03 (credit exhaustion handling builds on the service substrate)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dockerfile uses node:20-slim (Debian/glibc) to avoid MUSL/better-sqlite3 native module incompatibility"
    - "Railway volume safety: service runs as root (no USER switch) to match Railway's root volume mount"
    - "Health endpoint registered before dashboard root in buildServer() for logical ordering"

key-files:
  created:
    - Dockerfile
    - railway.toml
    - tests/unit/api/health.test.ts
    - docs/railway-deployment.md
  modified:
    - src/api/server.ts

key-decisions:
  - "Used node:20-slim (Debian) over Alpine to ensure glibc compatibility for better-sqlite3 native module"
  - "Did not add non-root USER in Dockerfile — Railway volumes mount as root; non-root breaks volume permissions"
  - "healthcheckTimeout = 300 seconds — allows up to 5 minutes for volume validation and startup"
  - "Checked in railway.toml to make deployments reproducible via git"

patterns-established:
  - "Health endpoint: GET /health returns { status: 'ok', uptime: process.uptime() } — used by Railway"

requirements-completed:
  - DEPLOY-01

# Metrics
duration: 3min
completed: 2026-04-01
---

# Phase 13 Plan 01: Railway Deployment Substrate Summary

**Node 20-slim Dockerfile with better-sqlite3 native deps, railway.toml healthcheck config, GET /health endpoint, and deployment runbook**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-01T03:56:44Z
- **Completed:** 2026-04-01T03:59:21Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Dockerfile builds Echo on Node 20-slim (Debian) with python3 + build-essential for better-sqlite3 native compilation via node-gyp
- railway.toml configures DOCKERFILE builder with /health healthcheck (300s timeout) and ON_FAILURE restart policy
- GET /health route added to server.ts, returning HTTP 200 with `{ status: 'ok', uptime: number }` — tested with 3 TDD tests (GREEN)
- docs/railway-deployment.md runbook covers all required env vars, volume setup, `railway up`, verification steps, and three troubleshooting scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerfile and railway.toml** - `9ed7e08` (chore)
2. **Task 2: Add /health route to server.ts** - `b33b0d5` (feat, TDD)
3. **Task 3: Write docs/railway-deployment.md** - `6d4917c` (docs)

_Note: Task 2 was TDD (RED then GREEN in same commit since test file and implementation were committed together after GREEN)_

## Files Created/Modified

- `Dockerfile` - Multi-stage Node 20-slim build with python3/build-essential for better-sqlite3 native compilation
- `railway.toml` - Railway DOCKERFILE builder config, /health healthcheck (300s), ON_FAILURE restart (3 retries)
- `src/api/server.ts` - Added GET /health route before dashboard root
- `tests/unit/api/health.test.ts` - 3 TDD tests: HTTP 200, response body shape, route registration
- `docs/railway-deployment.md` - Deployment runbook: env vars, volume setup, deploy, verify, troubleshoot

## Decisions Made

- Used `node:20-slim` (Debian/glibc) not Alpine — better-sqlite3 native module requires glibc; Alpine's MUSL libc causes build failures
- No `USER` switch in Dockerfile — Railway volumes mount as root; switching to non-root user breaks volume read/write permissions
- `healthcheckTimeout = 300` — provides 5 minutes for volume validation retry loop (up to 30s) plus app startup
- Checked in `railway.toml` — makes all deployment configuration reproducible from git without manual Railway dashboard config

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion corrected for printRoutes() output format**
- **Found during:** Task 2 (TDD GREEN phase)
- **Issue:** Test asserted `routes.toContain('/health')` but `printRoutes()` returns a tree where the route node is `health` (without leading slash)
- **Fix:** Updated test assertion to `toContain('health')` with comment explaining the tree format
- **Files modified:** `tests/unit/api/health.test.ts`
- **Verification:** All 3 tests pass
- **Committed in:** `b33b0d5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in test assertion)
**Impact on plan:** Minor test correction for Fastify's printRoutes() output format. No scope creep.

## Issues Encountered

- Docker daemon not running locally — `docker build` verification skipped. The Dockerfile syntax and build logic were verified by inspection (correct base image, package manager, build steps, CMD). The docker build will be validated when deployed to Railway.

## User Setup Required

None — no external service configuration required beyond Railway dashboard setup (documented in docs/railway-deployment.md).

## Next Phase Readiness

- Deployment substrate complete: Dockerfile, railway.toml, /health endpoint all ready
- Plan 02 owns the host binding fix (`cli.ts serve` command must listen on `0.0.0.0`:`$PORT`) — this is the remaining blocker before Railway load balancer can reach the service
- Plan 02 also owns startup validation guards (volume path check, replica count check) and the startup summary log

---
*Phase: 13-railway-deployment*
*Completed: 2026-04-01*
