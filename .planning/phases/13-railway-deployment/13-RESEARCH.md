# Phase 13: Railway Deployment - Research

**Researched:** 2026-04-01
**Domain:** Railway PaaS deployment — Node.js/TypeScript, SQLite persistent volumes, startup guards, credit exhaustion handling
**Confidence:** HIGH (core Railway facts verified via official docs; Helius credit exhaustion body format is MEDIUM)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Startup Validation
- Volume path check: poll/wait with retries (up to ~30s) before giving up — handles Railway's volume mount timing edge case
- Error messages on failure: structured and actionable — include expected path, actual directory contents, and a fix hint
- Replica > 1 check: Claude's discretion on guard vs warning and detection mechanism (see Claude's Discretion below)

#### Credit Exhaustion
- When Helius returns 429 with `max_usage_reached`: fall back to Shyft for Helius-dependent operations (monitoring continues via Shyft)
- Retry/resume: auto-resume when Helius responds normally again — no manual restart required
- Alerting: no Telegram alert — credit exhaustion is visible via dashboard and `/status` command only
- Retry interval/backoff strategy: Claude's discretion (see Claude's Discretion below)

#### Railway Configuration
- SQLite volume path: configured via env var (e.g. `DB_PATH=/data/echo.db`) — operator sets in Railway dashboard
- Build approach (Nixpacks vs Dockerfile): Claude's discretion
- railway.toml inclusion: Claude's discretion on whether to check it in
- A deployment doc should be written and checked in — document Railway setup steps so the deployment is reproducible

#### Service Sequencing
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-01 | User can deploy Echo to Railway with a single command (Dockerfile + railway.toml, unified process: monitoring loop + API + Telegram bot) | Dockerfile multi-stage build pattern, railway.toml schema, Railpack vs Dockerfile decision documented below |
| DEPLOY-02 | System verifies at startup that SQLite DB is on a persistent volume, exits with clear error if not mounted | Volume env vars (`RAILWAY_VOLUME_MOUNT_PATH`), poll-with-retry pattern, `fs.existsSync` check documented below |
| DEPLOY-03 | System refuses to start with WAL mode if Railway replica count > 1 | `RAILWAY_REPLICA_ID` detection approach, Railway's platform restriction (volumes block replicas) documented below |
| DEPLOY-04 | System distinguishes Helius credit exhaustion from rate-limit 429 and pauses monitoring loop on credit exhaustion | Helius 429 body `max_usage_reached` distinction, `MonitorLoop.pause()`/`resume()` hooks already exist |
</phase_requirements>

---

## Summary

Echo is a Node.js/TypeScript ESM project using `better-sqlite3` (native module), Fastify, grammY, and drizzle-orm. All three service components (API, Telegram bot, monitoring loop) currently start from `src/cli.ts serve`. The deployment work is primarily: (1) hardening the startup sequence with volume and replica checks, (2) adding a `/health` endpoint to `server.ts`, (3) wiring Helius credit exhaustion detection into the existing provider router, and (4) providing Dockerfile + `railway.toml` + a deployment doc.

Railway's platform enforces a critical constraint relevant to DEPLOY-03: **volumes cannot be used with replicas > 1** — Railway will prevent the combination at the infrastructure level. This means the replica guard is defensive belt-and-suspenders coding, but it is still worth implementing because an operator could detach the volume and re-enable replicas without realizing the WAL integrity risk.

The current `cli.ts` server binding uses `host: '127.0.0.1'`, which will silently fail on Railway — it must be changed to `0.0.0.0` (or `::` for dual-stack). This is a deployment-blocking bug that must be fixed as part of this phase.

**Primary recommendation:** Use a Dockerfile (not Railpack) because `better-sqlite3` is a native module that requires Python + build-essential at compile time and `node:20-slim` (Debian) at runtime. Railpack's zero-config approach does not reliably handle native module rebuilds. Check in both `Dockerfile` and `railway.toml` so the deployment is fully reproducible from git.

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.6.2 | SQLite driver | Already used; synchronous API fits single-process model |
| fastify | ^5.8.2 | HTTP server | Already used; `/health` route is trivially added |
| grammy | ^1.41.1 | Telegram bot | Already used; `startBot()` already non-blocking |
| drizzle-orm | ^0.45.1 | ORM + migrations | Already used; `migrate()` called at db init |

### No New Libraries Needed
All phase work is configuration + code changes to existing modules. No new npm dependencies are required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dockerfile | Railpack | Railpack fails on `better-sqlite3` native rebuild without extra config; Dockerfile gives full control |
| `RAILWAY_REPLICA_ID` detection | Explicit `REPLICA_GUARD=true` env flag | Env flag is more explicit but requires operator discipline; `RAILWAY_REPLICA_ID` is automatic and available when replicas are deployed |
| Poll-with-retry for volume check | `fs.existsSync` immediate exit | Railway may mount volumes with slight delay after container start; polling up to 30s prevents false negatives |

---

## Architecture Patterns

### Recommended File Changes

```
src/
├── cli.ts                    # MODIFY: add startup validation, startup summary, hard-fail policy
├── api/
│   └── server.ts             # MODIFY: fix host binding (127.0.0.1 → 0.0.0.0), add /health route
├── db/
│   └── index.ts              # MODIFY: use DB_PATH env var (currently uses DATABASE_URL)
├── fetchers/
│   ├── helius.ts             # MODIFY: distinguish max_usage_reached 429 from rate-limit 429
│   └── providers/
│       ├── router.ts         # MODIFY: propagate credit-exhaustion signal to MonitorLoop
│       └── index.ts          # MODIFY: wire Helius credit exhaustion to MonitorLoop.pause()
└── monitor/
    └── loop.ts               # VERIFY: pause()/resume() already exist (confirmed); no changes needed

(new files)
Dockerfile                    # NEW: multi-stage build for Node.js + pnpm + better-sqlite3
railway.toml                  # NEW: deploy config (healthcheck, start command, restart policy)
docs/deployment.md            # NEW: operator runbook
```

### Pattern 1: Volume Path Validation with Poll-and-Wait

**What:** At startup, check that the DB file's parent directory is the expected volume mount path. Poll with retries to handle Railway's volume mount timing edge case.

**When to use:** Before initializing the database connection — db module init must not run until the volume is confirmed.

**Implementation approach:**
```typescript
// src/startup/volume-check.ts (new file or inline in cli.ts)
import fs from 'node:fs';
import path from 'node:path';

const POLL_INTERVAL_MS = 2_000;
const MAX_RETRIES = 15; // 15 × 2s = 30s max wait

export async function validateVolumeMount(dbPath: string): Promise<void> {
  const expectedDir = path.dirname(dbPath);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (fs.existsSync(expectedDir)) {
      console.log(`[startup] volume confirmed at ${expectedDir}`);
      return;
    }
    if (attempt < MAX_RETRIES) {
      console.log(`[startup] waiting for volume at ${expectedDir} (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  // Hard fail with actionable message
  const actualContents = listDirContents('/');
  console.error(`[startup] FATAL: volume not mounted`);
  console.error(`  Expected directory: ${expectedDir}`);
  console.error(`  Root directory contents: ${actualContents}`);
  console.error(`  Fix hint: In Railway dashboard → your service → Storage, attach a volume at ${expectedDir}`);
  process.exit(1);
}

function listDirContents(dir: string): string {
  try {
    return fs.readdirSync(dir).join(', ');
  } catch {
    return '(could not list)';
  }
}
```

### Pattern 2: Replica Guard via RAILWAY_REPLICA_ID

**What:** Railway injects `RAILWAY_REPLICA_ID` into each replica. When replicas > 1 are deployed, every replica gets a distinct ID. However, Railway also **blocks** attaching a volume to a service with replicas, so this situation should be impossible in normal operation. The guard is defensive.

**Recommended behavior:** Hard fail with WAL integrity warning. If `RAILWAY_REPLICA_ID` is set AND the DB path is on a volume, refuse to start. Rationale: WAL mode + multiple writers = data corruption.

**Detection approach:**
```typescript
// Railway injects RAILWAY_REPLICA_ID for ALL deployments, not just replicas
// The value is a UUID unique to each replica instance
// With replicas=1 (default), there is still exactly one RAILWAY_REPLICA_ID
// Railway's platform PREVENTS volume + replicas combination at infra level
// So the guard should just emit a warning (not hard fail), since the scenario
// is blocked at infra level already
```

**Revised recommendation (Claude's discretion):** Emit a structured WARNING log at startup if `RAILWAY_REPLICA_ID` is set. Do NOT hard fail. Reason: `RAILWAY_REPLICA_ID` is present for all Railway deployments (including single-replica), so checking replica count is not directly detectable via env vars alone. The infra-level block is the real protection. Log a warning so the operator sees it in Railway logs.

```typescript
// Startup warning (not hard fail)
if (process.env.RAILWAY_REPLICA_ID) {
  console.warn('[startup] WARNING: Running on Railway with WAL mode SQLite.');
  console.warn('[startup] Railway blocks volumes with replicas > 1, but if you bypass this,');
  console.warn('[startup] multiple writers to the same SQLite WAL file WILL cause corruption.');
}
```

### Pattern 3: Helius Credit Exhaustion Detection

**What:** Distinguish Helius 429 (rate limit — transient, retry) from Helius 429 with `max_usage_reached` body (credit exhaustion — pause until credits restored).

**Helius response body format** (MEDIUM confidence — verified via Helius billing FAQ):
- Rate limit 429: standard HTTP 429, response body does NOT contain `max_usage_reached`
- Credit exhaustion 429: HTTP 429, response body contains `"max_usage_reached"` string

**Where the change goes:** `src/fetchers/helius.ts` in the `pRetry` `onFailedAttempt` handler. When credit exhaustion is detected, throw a typed error that `ProviderRouter` catches. `ProviderRouter` propagates to `MonitorLoop.pause()`. Auto-resume via periodic Helius health probe.

```typescript
// In HeliusFetcher.fetchSwapHistory (and other methods) — pRetry handler
onFailedAttempt: async (error) => {
  const status = (error as any).response?.status;
  const body = (error as any).response?.data;
  if (status === 401) throw error; // never retry auth

  if (status === 429) {
    // Check for credit exhaustion (distinct from rate limit)
    const isCreditExhausted =
      typeof body === 'string' && body.includes('max_usage_reached') ||
      typeof body === 'object' && JSON.stringify(body).includes('max_usage_reached');

    if (isCreditExhausted) {
      // Throw a typed error — do NOT retry
      const err = new Error('Helius credit exhausted: max_usage_reached');
      (err as any).creditExhausted = true;
      throw err;
    }
    // Regular rate limit — exponential backoff
    const delayMs = Math.pow(2, error.attemptNumber) * 1000;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}
```

**Auto-resume strategy (Claude's discretion):** Use exponential backoff with a cap. Start at 5 minutes, double each retry, cap at 60 minutes. Each retry: attempt a single Helius probe request. On success: `monitorLoop.resume()`. This avoids hammering the API while ensuring fast recovery when credits are restored.

```typescript
const HELIUS_PROBE_INITIAL_MS = 5 * 60 * 1000;   // 5 minutes
const HELIUS_PROBE_MAX_MS = 60 * 60 * 1000;        // 60 minutes cap
```

### Pattern 4: /health Endpoint

**What:** Fastify route returning HTTP 200. Railway uses this to detect deployment success. Without it, Railway cannot verify the service is alive.

**Critical fix also needed:** Current `server.ts` binds to `host: '127.0.0.1'` — this means Railway's load balancer cannot reach the server. Must change to `'0.0.0.0'`.

```typescript
// In buildServer() return, add:
app.get('/health', async (_req, reply) => {
  return reply.status(200).send({ status: 'ok' });
});

// In cli.ts serve action:
await server.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
```

### Pattern 5: railway.toml Configuration

```toml
[build]
builder = "DOCKERFILE"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Check in:** Yes. Checking in `railway.toml` ensures the build and deploy config is version-controlled and reproducible. "Configuration defined in code will always override values from the dashboard." (Railway docs)

### Pattern 6: Multi-Stage Dockerfile

**Build tooling decision (Claude's discretion):** Use Dockerfile, not Railpack. Reason: `better-sqlite3` is a native module that requires `python3`, `make`, `g++`, and `node-gyp` at build time. Railpack's zero-config does not guarantee these build tools are present. Dockerfile gives explicit control.

**Base image:** `node:20-slim` (Debian-based). Do NOT use Alpine — `better-sqlite3` has known compatibility issues with Alpine's MUSL libc.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim AS build

RUN corepack enable

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install build tools for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pnpm-lock.yaml package.json ./

RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# --- Runtime stage ---
FROM node:20-slim AS runtime

RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

COPY pnpm-lock.yaml package.json ./

# Install only production deps (native module included)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/* && \
    --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./dist/db/migrations

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

**Note:** `better-sqlite3` requires native rebuild, so build tools are needed in the runtime stage too (or use `--ignore-scripts=false` with prebuilt binaries). The simplest correct approach is to keep build tools in runtime for the prod install. This makes the image larger but avoids binary mismatch issues.

### Pattern 7: Startup Sequence (Claude's discretion)

**Recommended order:**
1. Validate volume mount (poll-wait, hard fail if not mounted)
2. Log replica warning if `RAILWAY_REPLICA_ID` present
3. Initialize DB (runs drizzle migrations)
4. Start Fastify API server (hard fail if it throws)
5. Start Telegram bot (hard fail if token present but bot.start() throws synchronously; non-blocking long polling)
6. Resume pending wallet imports + start monitor loop (hard fail if `resumeImportingWallets` throws)
7. Log startup summary: cycle interval, API port, Telegram status

**Hard-fail policy:** If any component throws during startup, call `process.exit(1)`. This is already the pattern in `cli.ts` for the server — extend it consistently.

### Anti-Patterns to Avoid

- **Binding to `127.0.0.1` in production:** Railway's load balancer cannot reach `localhost`. Must use `0.0.0.0`. Current code has this bug.
- **Using Alpine for native modules:** `better-sqlite3` + Alpine = MUSL glibc incompatibility. Use `node:20-slim` (Debian).
- **Checking `RAILWAY_REPLICA_ID` for single-vs-multiple replica detection:** `RAILWAY_REPLICA_ID` is present for ALL Railway deployments, including single-replica. It does NOT indicate replica count. Only use it as a hint that the app is running on Railway, not as a replica count signal.
- **Writing to relative paths in container:** The `src/db/index.ts` currently uses `DATABASE_URL` env var resolved relative to `process.cwd()`. If `DB_PATH` is the new env var name per CONTEXT.md, the db module must be updated to use `DB_PATH` (or the env var documentation must be reconciled).
- **Running migrations in `preDeployCommand`:** Railway's pre-deploy commands run before the volume is mounted. Migrations that touch the SQLite file must run at runtime startup (which is already the case — `migrate()` is called in `db/index.ts`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry logic for API calls | Custom retry loop | `p-retry` (already in project) | Already handles exponential backoff, attempt counting |
| Health endpoint framework | Custom HTTP server | Fastify (already running) | Single route on existing server, zero overhead |
| Process management | Custom process supervisor | Railway's restart policy in railway.toml | `restartPolicyType = "ON_FAILURE"` handles crash recovery |
| SQLite volume backup | Custom backup script | Not needed for v1.1 scope | Litestream is the standard tool if needed later |

**Key insight:** This phase is mostly wiring and configuration, not new infrastructure. The monitoring loop already has `pause()`/`resume()`. The provider router already has cooldown logic. The API server just needs a `/health` route and a host fix.

---

## Common Pitfalls

### Pitfall 1: 127.0.0.1 Host Binding (deployment blocker)
**What goes wrong:** Server starts successfully in logs but Railway health check times out (300s), deployment fails.
**Why it happens:** `host: '127.0.0.1'` rejects connections from outside the container's loopback interface. Railway's load balancer connects from outside.
**How to avoid:** Use `host: '0.0.0.0'` in the `server.listen()` call. Respect `process.env.PORT` (Railway injects this).
**Warning signs:** Health check timeout in Railway build logs despite app logging "server started".

### Pitfall 2: RAILWAY_RUN_UID / Volume Permission Errors
**What goes wrong:** SQLite operations fail with `SQLITE_READONLY` or permission denied on `/data/echo.db`.
**Why it happens:** Railway volumes mount as root by default. If the Dockerfile switches to a non-root user, the process cannot write to the volume.
**How to avoid:** Either (a) don't switch to non-root user in Dockerfile (simpler), or (b) add `RAILWAY_RUN_UID=0` as a service variable in Railway dashboard.
**Warning signs:** `SQLITE_READONLY: attempt to write a readonly database` in logs.

### Pitfall 3: better-sqlite3 Binary Mismatch
**What goes wrong:** `Error: The module '.../better_sqlite3.node' was compiled against a different Node.js version`.
**Why it happens:** Native module was compiled in the build stage against one Node version, but the runtime stage uses a different version, OR the prebuilt binary doesn't match the OS.
**How to avoid:** Use the same base image (`node:20-slim`) in both build and runtime stages. Include build tools in the runtime stage for `pnpm install --prod` to recompile from source.
**Warning signs:** Error at container startup before any application code runs.

### Pitfall 4: Migrations Run Before Volume Is Mounted
**What goes wrong:** `drizzle migrate()` runs against the wrong path, creating a new database file in the ephemeral container filesystem instead of the volume.
**Why it happens:** The db module is imported at startup before the volume check completes.
**How to avoid:** Run volume validation BEFORE importing the db module. The volume check must be the first thing in the `serve` command handler.
**Warning signs:** Data is present in Railway logs but missing after redeploy; database starts empty after each deployment.

### Pitfall 5: DB_PATH vs DATABASE_URL Env Var Naming
**What goes wrong:** Operator sets `DB_PATH=/data/echo.db` in Railway dashboard, but `src/db/index.ts` reads `DATABASE_URL`. The volume check uses `DB_PATH` but the database opens at a different path.
**Why it happens:** CONTEXT.md specifies `DB_PATH` but the existing code uses `DATABASE_URL`.
**How to avoid:** Either (a) update `db/index.ts` to read `DB_PATH` (rename the env var) or (b) keep `DATABASE_URL` and update CONTEXT.md/docs. Pick one name and be consistent throughout the codebase and deployment doc.
**Recommendation:** Keep `DATABASE_URL` in the code (it's already there and in `.env.example`) but document clearly that operators must set `DATABASE_URL=/data/echo.db` in Railway — not `DB_PATH`. The CONTEXT.md used `DB_PATH` as an example name only.

### Pitfall 6: Helius Credit Exhaustion Body Format
**What goes wrong:** The `max_usage_reached` check fails to match the actual response body, causing infinite retry on credit exhaustion.
**Why it happens:** The exact JSON structure of the Helius 429 credit exhaustion body is MEDIUM confidence — verified by Helius billing FAQ text ("a 429 max usage reached error") but exact JSON field name not confirmed.
**How to avoid:** Check both `body.includes('max_usage_reached')` and `body?.error === 'max_usage_reached'` and `body?.message?.includes('max_usage_reached')` — cover multiple possible formats. Log the raw body when a 429 is received with no matching retry-able condition.
**Warning signs:** Monitor loop retries indefinitely after credits exhausted; Shyft fallback never activates.

---

## Code Examples

### /health Route (Fastify)
```typescript
// Source: Railway healthcheck docs + Fastify docs
// Add to buildServer() in src/api/server.ts BEFORE return app
app.get('/health', async (_req, reply) => {
  return reply.status(200).send({ status: 'ok' });
});
```

### Server Host Fix
```typescript
// Source: Railway Node.js deploy guide
// In cli.ts serve action — replace:
await server.listen({ port: 3000, host: '127.0.0.1' });
// With:
await server.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
```

### railway.toml
```toml
# Source: https://docs.railway.com/reference/config-as-code
[build]
builder = "DOCKERFILE"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### DB_PATH / DATABASE_URL Consistency
```typescript
// Existing src/db/index.ts — already correct pattern, just needs env var alignment
const dbUrl = process.env.DATABASE_URL ?? 'data/echo.db';
const dbPath = path.resolve(process.cwd(), dbUrl);
// Operator sets DATABASE_URL=/data/echo.db in Railway dashboard
```

### Startup Summary Log Pattern
```typescript
// Emit after all three components are running
const cycleIntervalSec = 30; // CYCLE_INTERVAL_MS / 1000 from monitor/loop.ts
const port = process.env.PORT ?? 3000;
const telegramStatus = process.env.TELEGRAM_BOT_TOKEN ? 'enabled' : 'disabled';
console.log(`[startup] Echo running — cycle: ${cycleIntervalSec}s, API: :${port}, Telegram: ${telegramStatus}`);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nixpacks (auto-builder) | Railpack (new default auto-builder) | 2024 | Railpack recommended for new services; Nixpacks in maintenance mode |
| `app.listen(port, '127.0.0.1')` | `app.listen(port, '0.0.0.0')` | Always correct for Railway | Current code has the wrong binding — deployment blocker |
| `preDeployCommand` for migrations | Start-time migrations | Always correct for volumes | Volumes unavailable during pre-deploy; must run in start command |

**Deprecated/outdated:**
- Nixpacks: Railway has moved to Railpack as the default. Nixpacks is maintenance-mode. However, for this project, Dockerfile is recommended over both (native module complexity).

---

## Open Questions

1. **Exact Helius 429 credit exhaustion response body format**
   - What we know: Helius billing FAQ states "a 429 max usage reached error" — confirms the phrase `max_usage_reached` appears
   - What's unclear: Is it `{ "error": "max_usage_reached" }`, plain text body `"max_usage_reached"`, or something else?
   - Recommendation: Check for `max_usage_reached` substring anywhere in the response body (string or JSON). Log the full body on any unhandled 429 so it can be confirmed in Railway logs on first occurrence.

2. **DB_PATH vs DATABASE_URL env var naming**
   - What we know: CONTEXT.md says `DB_PATH=/data/echo.db`; existing code reads `DATABASE_URL`
   - What's unclear: Should the code be changed to `DB_PATH` or should the docs use `DATABASE_URL`?
   - Recommendation: Keep `DATABASE_URL` — it's already in `.env.example` and `db/index.ts`. Document this clearly in the deployment doc. Update CONTEXT.md example to match.

3. **Replica count detection**
   - What we know: Railway injects `RAILWAY_REPLICA_ID` on ALL deployments (single and multi-replica). There is no env var for total replica count.
   - What's unclear: Can we distinguish 1 replica from multiple replicas via env vars alone?
   - Recommendation: Cannot detect replica count from env vars. Emit a startup warning that WAL mode is active. Railway's infra already blocks volumes + replicas, so this is a belt-and-suspenders warning only.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest |
| Config file | `jest.config.cjs` |
| Quick run command | `pnpm test` (runs `tests/unit/**/*.test.ts`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | Dockerfile builds and railway.toml is valid | manual | n/a | ❌ Wave 0 (manual verification) |
| DEPLOY-02 | Volume path check exits with error when dir missing | unit | `pnpm test -- --testPathPattern=startup` | ❌ Wave 0 |
| DEPLOY-02 | Volume path check retries before giving up (poll logic) | unit | `pnpm test -- --testPathPattern=startup` | ❌ Wave 0 |
| DEPLOY-03 | Replica warning logged when RAILWAY_REPLICA_ID is set | unit | `pnpm test -- --testPathPattern=startup` | ❌ Wave 0 |
| DEPLOY-04 | Helius 429 with max_usage_reached pauses monitor loop | unit | `pnpm test -- --testPathPattern=helius` | ❌ Wave 0 |
| DEPLOY-04 | Helius 429 without max_usage_reached retries normally | unit | `pnpm test -- --testPathPattern=helius` | ❌ Wave 0 |
| DEPLOY-04 | Monitor loop auto-resumes when Helius recovers | unit | `pnpm test -- --testPathPattern=helius` | ❌ Wave 0 |
| n/a | /health returns 200 | unit | `pnpm test -- --testPathPattern=health` | ❌ Wave 0 |
| n/a | server.ts binds to 0.0.0.0 not 127.0.0.1 | unit | `pnpm test -- --testPathPattern=server` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- --testPathPattern=startup|helius|health|server`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/startup/volume-check.test.ts` — covers DEPLOY-02 (poll logic, hard fail, actionable message)
- [ ] `tests/unit/startup/replica-guard.test.ts` — covers DEPLOY-03 (warning log when RAILWAY_REPLICA_ID set)
- [ ] `tests/unit/fetchers/helius-credit-exhaustion.test.ts` — covers DEPLOY-04 (credit 429 vs rate-limit 429 distinction)
- [ ] `tests/unit/api/health.test.ts` — covers /health endpoint returning 200
- [ ] `tests/unit/api/server-binding.test.ts` — verifies server binds to 0.0.0.0 not 127.0.0.1

---

## Sources

### Primary (HIGH confidence)
- https://docs.railway.com/reference/volumes — volumes limitations, `RAILWAY_VOLUME_MOUNT_PATH`, replica restriction confirmed ("Replicas cannot be used with volumes")
- https://docs.railway.com/reference/config-as-code — railway.toml schema, builder options, healthcheck config
- https://docs.railway.com/guides/healthchecks — healthcheck path, 300s timeout, deployment success behavior
- https://docs.railway.com/reference/variables — `RAILWAY_REPLICA_ID`, `RAILWAY_VOLUME_NAME`, `RAILWAY_VOLUME_MOUNT_PATH` confirmed
- https://railpack.com/languages/node/ — pnpm detection via lockfile, engines field, start command priority
- Project codebase — `src/cli.ts`, `src/db/index.ts`, `src/api/server.ts`, `src/monitor/loop.ts`, `src/fetchers/providers/router.ts`

### Secondary (MEDIUM confidence)
- https://www.helius.dev/docs/faqs/billing — confirms "a 429 max usage reached error" for credit exhaustion; exact response body JSON structure not documented
- https://depot.dev/docs/container-builds/optimal-dockerfiles/node-pnpm-dockerfile — pnpm multi-stage Dockerfile pattern
- WebSearch findings on `better-sqlite3` + Alpine incompatibility (multiple sources converge on "use Debian slim")

### Tertiary (LOW confidence)
- Community reports on `RAILWAY_RUN_UID=0` for volume permissions — verified by multiple Railway Help Station posts but not in official docs explicitly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies needed; all libraries already in project
- Railway configuration: HIGH — verified directly in Railway official docs
- Architecture patterns: HIGH — based on existing codebase structure + verified Railway docs
- Helius credit exhaustion body format: MEDIUM — phrase confirmed, exact JSON structure unconfirmed
- Pitfalls: HIGH — most verified via official Railway docs or confirmed multi-source

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (Railway docs change infrequently; Helius API details may shift)
