---
phase: 13-railway-deployment
verified: 2026-04-02T12:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 3.5/4 (one partial)
  gaps_closed:
    - "DEPLOY-03: REQUIREMENTS.md now says 'logs a WAL integrity warning' — matches console.warn implementation in src/cli.ts"
    - "ROADMAP.md Phase 13 success criterion 3 updated to warning-only language"
    - "docs/railway-deployment.md WAL integrity warning troubleshooting section added with RAILWAY_REPLICA_ID explanation"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Deploy to Railway, set DATABASE_URL=/data/echo.db without a volume attached, then run 'railway up'"
    expected: "Service exits immediately with a structured error message showing expected path /data, parent directory listing, and fix hint 'Set DATABASE_URL to a path on your Railway volume'"
    why_human: "Cannot run actual Railway deployment in programmatic verification. Volume mount behavior is infrastructure-level."
  - test: "Deploy to Railway with a volume mounted at /data, verify 'railway up' completes and GET /health returns 200"
    expected: "Railway healthcheck passes (300s timeout), deployment marked successful in Railway dashboard"
    why_human: "Docker build was not run locally. End-to-end Railway deploy needs live environment."
---

# Phase 13: Railway Deployment Verification Report

**Phase Goal:** Echo runs persistently on Railway with guaranteed data integrity — forward-testing data is never silently wiped
**Verified:** 2026-04-02
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 04 aligned DEPLOY-03 requirement text with warning-only implementation)

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can deploy Echo to Railway with a single command and the service starts with monitoring loop, API, and Telegram bot all running | VERIFIED | `railway.toml` sets builder=DOCKERFILE + startCommand; `Dockerfile` builds Node 20-slim with pnpm + better-sqlite3 deps; `src/cli.ts` serve command starts API, bot, and monitorLoop with hard-fail policy |
| 2 | If SQLite database file is not on the mounted volume, service exits immediately with a clear error message identifying path mismatch | VERIFIED | `validateVolumeMount()` polls up to 30s then throws `VolumeCheckError` with expected directory, parent contents, and fix hint; `cli.ts` calls `process.exit(1)` on catch |
| 3 | If a Railway replica environment is detected (RAILWAY_REPLICA_ID set), the service logs a WAL integrity warning; service does not hard-fail because RAILWAY_REPLICA_ID is present on all Railway deployments including single-replica | VERIFIED | `src/cli.ts` lines 42-47 emit `console.warn` on `RAILWAY_REPLICA_ID`; REQUIREMENTS.md DEPLOY-03 and ROADMAP.md success criterion 3 both now say "logs a WAL integrity warning" — implementation and requirement contract match |
| 4 | When Helius credits exhausted (429 + max_usage_reached body), monitoring loop pauses not silently continues on Shyft fallback | VERIFIED | `HeliusCreditExhaustedError` thrown in `fetchSwapHistory`/`fetchEarlySwapsForMint` on 429 + body substring match; `providers/index.ts` wraps HeliusProvider, catches the error, calls `monitorLoop.pause()`, starts exponential-backoff probe (5m base, doubles, 60m cap) |

**Score:** 4/4 truths verified

---

## Required Artifacts (Three-Level Check)

### Plan 01 Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `Dockerfile` | Node 20-slim + pnpm + better-sqlite3 native deps | Yes | Yes — node:20-slim, apt-get python3+build-essential, corepack pnpm, pnpm install, pnpm build, CMD node dist/cli.js serve | Yes — referenced by railway.toml builder=DOCKERFILE | VERIFIED |
| `railway.toml` | DOCKERFILE builder, /health healthcheck, ON_FAILURE restart | Yes | Yes — builder=DOCKERFILE, healthcheckPath=/health, healthcheckTimeout=300, restartPolicyType=ON_FAILURE, restartPolicyMaxRetries=3 | Yes — references Dockerfile; startCommand matches cli.ts serve entry | VERIFIED |
| `src/api/server.ts` | GET /health route returning 200 with { status: 'ok', uptime } | Yes (modified) | Yes — `app.get('/health', async (_req, reply) => reply.status(200).send({ status: 'ok', uptime: process.uptime() }))` | Yes — 3 TDD tests pass (HTTP 200, body shape, route registration) | VERIFIED |
| `docs/railway-deployment.md` | Runbook: env vars, volume, deploy, verify, troubleshoot | Yes | Yes — covers DATABASE_URL, PORT, TELEGRAM_BOT_TOKEN, HELIUS_API_KEY, SHYFT_API_KEY, volume setup steps, `railway up`, curl /health verification, 3 troubleshooting sections, and new WAL warning section | N/A (documentation) | VERIFIED |

### Plan 02 Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `src/startup/volume-check.ts` | validateVolumeMount() with poll-retry, VolumeCheckError | Yes | Yes — polls every 2s up to 30s (15 attempts), throws VolumeCheckError with expected dir, parent listing, fix hint; VolumeCheckOptions DI interface for testability | Yes — dynamically imported in cli.ts before db import | VERIFIED |
| `src/cli.ts` | Rewritten serve: volume check, replica warning, hard-fail API/bot, startup summary | Yes | Yes — 6-step startup sequence: volume check, RAILWAY_REPLICA_ID warning, API server (hard fail), Telegram bot (hard fail if configured), monitorLoop start, startup summary log | Yes — imports validateVolumeMount, buildServer, startBot, monitorLoop, resumeImportingWallets | VERIFIED |

### Plan 03 Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `src/fetchers/helius.ts` | HeliusCreditExhaustedError thrown on 429 + max_usage_reached | Yes (modified) | Yes — class exported with message containing 'max_usage_reached'; 429 body substring check in fetchSwapHistory (line 78) and fetchEarlySwapsForMint (line 141) | Yes — imported by providers/index.ts, caught in handleCreditExhaustion wrapper | VERIFIED |
| `src/fetchers/providers/index.ts` | Credit exhaustion wired to monitorLoop.pause() + probe loop | Yes (modified) | Yes — startCreditExhaustionProbe() function, handleCreditExhaustion() wrapper, heliusProviderWrapped intercepts all three methods, 5m/60m delay constants | Yes — monitorLoop lazily imported, pause() called, probe auto-resumes via resume() | VERIFIED |

### Plan 04 Artifacts (Gap Closure)

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `.planning/REQUIREMENTS.md` | DEPLOY-03 text says "logs a WAL integrity warning" | Yes | Yes — line 13: "System logs a WAL integrity warning if a Railway replica environment is detected (RAILWAY_REPLICA_ID set); does not hard-fail because RAILWAY_REPLICA_ID is present on all Railway deployments including single-replica" | Yes — requirement contract now matches console.warn in src/cli.ts lines 42-47 | VERIFIED |
| `.planning/ROADMAP.md` | Success criterion 3 mirrors updated DEPLOY-03 text | Yes | Yes — "If a Railway replica environment is detected (RAILWAY_REPLICA_ID set), the service logs a WAL integrity warning; the service does not hard-fail..." | Yes — mirrors REQUIREMENTS.md DEPLOY-03 and matches implementation | VERIFIED |
| `docs/railway-deployment.md` | WAL integrity warning troubleshooting section with RAILWAY_REPLICA_ID | Yes | Yes — "WAL integrity warning on startup" section explains RAILWAY_REPLICA_ID is always injected, warning is advisory-only, service continues to start | Yes — operator-facing explanation linked to the console.warn implementation in cli.ts | VERIFIED |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Pattern | Status |
|------|-----|-----|---------|--------|
| `railway.toml` | `Dockerfile` | build config | `builder.*DOCKERFILE` | VERIFIED — line 2: `builder = "DOCKERFILE"`, line 3: `dockerfilePath = "Dockerfile"` |
| `src/api/server.ts` | `GET /health` | Fastify route registration | `app\.get.*health` | VERIFIED — `app.get('/health', async (_req, reply) => {...})` |

### Plan 02 Key Links

| From | To | Via | Pattern | Status |
|------|-----|-----|---------|--------|
| `src/cli.ts` | `src/startup/volume-check.ts` | validateVolumeMount() called before db import | `validateVolumeMount` | VERIFIED — dynamic import at line 29, called at line 31, before any db-touching import |
| `src/cli.ts` | `process.env.RAILWAY_REPLICA_ID` | replica warning check | `RAILWAY_REPLICA_ID` | VERIFIED — line 42: `if (process.env.RAILWAY_REPLICA_ID)` emits console.warn, service continues (warning-only per DEPLOY-03 as updated) |

### Plan 03 Key Links

| From | To | Via | Pattern | Status |
|------|-----|-----|---------|--------|
| `src/fetchers/helius.ts` | `HeliusCreditExhaustedError` | thrown on 429 + max_usage_reached body | `HeliusCreditExhaustedError` | VERIFIED — exported class, thrown at lines 79 and 142 |
| `src/fetchers/providers/index.ts` | `monitorLoop.pause()` | handleCreditExhaustion catches HeliusCreditExhaustedError | `monitorLoop\.pause` | VERIFIED — line 76: `monitorLoop.pause()` inside handleCreditExhaustion |

### Plan 04 Key Links

| From | To | Via | Pattern | Status |
|------|-----|-----|---------|--------|
| `.planning/REQUIREMENTS.md` | `src/cli.ts` | DEPLOY-03 text matches console.warn implementation | "logs a WAL integrity warning" | VERIFIED — REQUIREMENTS.md line 13 contains exact phrase; cli.ts lines 42-47 emit console.warn on RAILWAY_REPLICA_ID |
| `.planning/ROADMAP.md` | `.planning/REQUIREMENTS.md` | Success criterion 3 mirrors DEPLOY-03 updated text | "logs a WAL integrity warning" | VERIFIED — both documents use identical warning-only language |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DEPLOY-01 | Plan 01 | Deploy Echo to Railway with single command; monitoring loop + API + Telegram all running | SATISFIED | Dockerfile + railway.toml + `railway up` + serve command starts all three components |
| DEPLOY-02 | Plan 02 | Startup verifies SQLite DB on persistent volume; exits with clear error if not mounted | SATISFIED | validateVolumeMount() polls 30s, throws VolumeCheckError with actionable message, cli.ts exits 1 |
| DEPLOY-03 | Plans 02 + 04 | System logs a WAL integrity warning if a Railway replica environment is detected; does not hard-fail because RAILWAY_REPLICA_ID is present on all Railway deployments including single-replica | SATISFIED | console.warn emitted at cli.ts lines 42-47; requirement text in REQUIREMENTS.md updated by Plan 04 to match implementation; ROADMAP.md success criterion 3 aligned |
| DEPLOY-04 | Plan 03 | Distinguishes Helius credit exhaustion from rate-limit 429; pauses monitoring loop | SATISFIED | HeliusCreditExhaustedError thrown on 429+max_usage_reached body; monitorLoop.pause() called; probe-retry auto-resumes |

**Orphaned requirements:** None. All four DEPLOY-0[1-4] requirements claimed by plans and tracked in REQUIREMENTS.md.

---

## Commit Verification

All documented commits confirmed to exist in git history:

| Commit | Plan | Description |
|--------|------|-------------|
| `9ed7e08` | 01-T1 | chore: Dockerfile and railway.toml |
| `b33b0d5` | 01-T2 | feat: GET /health route with TDD tests |
| `6d4917c` | 01-T3 | docs: railway-deployment runbook |
| `f166b6a` | 02-T1-RED | test: failing validateVolumeMount tests |
| `3ba26f1` | 02-T1-GREEN | feat: validateVolumeMount with poll-retry |
| `3c6a491` | 02-T2-RED | test: failing replica-guard tests |
| `96eb725` | 02-T2-GREEN | feat: serve startup sequence rewrite |
| `1b0b5fe` | 03-T1-RED | test: failing HeliusCreditExhaustedError tests |
| `f93297b` | 03-T1-GREEN | feat: HeliusCreditExhaustedError detection |
| `54bdb7b` | 03-T2 | feat: wire credit exhaustion to monitorLoop |
| `a54265a` | 04-T1 | docs: update DEPLOY-03 requirement to warning-only replica detection |
| `83efc90` | 04-T2 | docs: update Phase 13 success criterion 3 to warning-only replica detection |
| `d27917a` | 04-T3 | docs: add WAL integrity warning troubleshooting section to railway runbook |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/fetchers/helius.ts` | 228, 262 | `// TODO: Implement automatic retry with exponential backoff` | Info | Pre-existing TODOs in legacy `getTransactions()`/`getTransaction()` methods (not introduced by phase 13). These methods are not part of the phase 13 scope and do not affect phase goal achievement. |

No blockers. No stub implementations in phase 13 artifacts. No regressions from Plan 04 changes (documentation-only edits).

---

## Human Verification Required

### 1. End-to-End Railway Deployment

**Test:** Run `railway up` from the repository root with a Railway project configured (no volume attached initially).
**Expected:** Build succeeds using Dockerfile. Service starts but fails volume check — logs show VolumeCheckError with path mismatch and fix hint. Exit code 1.
**Why human:** Docker daemon was not available during plan execution (noted in SUMMARY). Railway infrastructure required for actual deployment validation.

### 2. Health Endpoint Reachable via Railway Load Balancer

**Test:** Deploy with volume mounted at `/data`, `DATABASE_URL=/data/echo.db` set. Wait for healthcheck to pass.
**Expected:** `curl https://<service>.railway.app/health` returns `{"status":"ok","uptime":<number>}` with HTTP 200. Railway marks deployment successful.
**Why human:** Requires live Railway deployment to verify load balancer can reach the service at `0.0.0.0:$PORT`.

---

## Gap Closure Summary

The single gap from the initial verification (DEPLOY-03 partial) is fully closed.

**What was wrong:** REQUIREMENTS.md and ROADMAP.md both said the service "refuses to start" when `RAILWAY_REPLICA_ID` is detected. The implementation emits `console.warn` and continues. The gap was a requirement contract mismatch, not a missing or broken implementation.

**What Plan 04 did:** Updated the requirement text in REQUIREMENTS.md, updated the success criterion in ROADMAP.md, and added a troubleshooting section to `docs/railway-deployment.md` explaining that `RAILWAY_REPLICA_ID` is injected by Railway on ALL deployments (including single-replica) — making a hard-fail not feasible. The requirement now accurately describes the advisory-only warning behaviour that ships.

**Result:** All four DEPLOY-0[1-4] requirements are fully satisfied. All four observable truths verified. Phase goal achieved.

---

_Verified: 2026-04-02_
_Verifier: Claude (gsd-verifier)_
_Re-verification after gap closure: Plan 04 (documentation alignment)_
