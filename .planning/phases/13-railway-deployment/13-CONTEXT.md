# Phase 13: Railway Deployment - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy Echo to Railway with persistent SQLite on a mounted volume. Includes startup validation guards (volume path check, replica count check), credit exhaustion handling, and deployment configuration. No new features — this is the deployment substrate that makes forward-testing data durable from day one.

</domain>

<decisions>
## Implementation Decisions

### Startup Validation
- Volume path check: poll/wait with retries (up to ~30s) before giving up — handles Railway's volume mount timing edge case
- Error messages on failure: structured and actionable — include expected path, actual directory contents, and a fix hint
- Replica > 1 check: Claude's discretion on guard vs warning and detection mechanism (see Claude's Discretion below)

### Credit Exhaustion
- When Helius returns 429 with `max_usage_reached`: fall back to Shyft for Helius-dependent operations (monitoring continues via Shyft)
- Retry/resume: auto-resume when Helius responds normally again — no manual restart required
- Alerting: no Telegram alert — credit exhaustion is visible via dashboard and `/status` command only
- Retry interval/backoff strategy: Claude's discretion (see Claude's Discretion below)

### Railway Configuration
- SQLite volume path: configured via env var (e.g. `DB_PATH=/data/echo.db`) — operator sets in Railway dashboard
- Build approach (Nixpacks vs Dockerfile): Claude's discretion
- railway.toml inclusion: Claude's discretion on whether to check it in
- A deployment doc should be written and checked in — document Railway setup steps so the deployment is reproducible

### Service Sequencing
- Startup order: Claude's discretion on order
- Failure policy: hard fail — if any of the three components (monitoring loop, API, Telegram bot) fails to start, the whole process exits
- Health check: `GET /health` endpoint required — returns 200 when API is up; Railway uses this for deployment success detection
- Startup summary: log a startup summary once all components are running (cycle interval, API port, Telegram status)

### Claude's Discretion
- Replica count detection mechanism (Railway env vars vs explicit operator flag)
- Replica > 1 guard vs warning behavior
- Helius credit exhaustion retry interval and backoff strategy
- Build tooling (Nixpacks vs Dockerfile)
- Whether to check in railway.toml
- Service startup order

</decisions>

<specifics>
## Specific Ideas

- No specific product references — standard Railway deployment patterns apply
- The operator (user) is the sole deployer; deployment doc should be self-contained enough to reproduce setup from scratch

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-railway-deployment*
*Context gathered: 2026-04-01*
