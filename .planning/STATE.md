---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Forward Testing & Deployment
status: executing
last_updated: "2026-04-09T10:14:16Z"
last_activity: "2026-04-09 — Plan 03 complete: Phase 14 accuracy stats extended with 4-window rug-excluded data and dashboard partial updated — 283 tests passing"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31 after v1.1 milestone started)

**Core value:** Know what smart money is doing before the crowd does — and trust the signals because the noise (bots, bundlers, dev wallets) has already been filtered out.
**Current focus:** Phase 13 complete — all 4 plans executed (including gap closure plan 04)

## Current Position

Phase: 14 — Signal Outcome Tracking (In progress — 3/4 plans complete)
Plan: 03 complete — accuracy stats 4-window rug-excluded
Status: Phase 14 in progress
Last activity: 2026-04-09 — Plan 03 complete: TierAccuracy extended with 4-window stats, rug exclusion WHERE filter, accuracy_stats.ejs 4-column table with time-to-peak display

```
v1.1 Progress: [██████████] 98% (8/8 plans in Phases 13-14 complete — awaiting Phase 14 Plan 04)
```

## Milestone History

- ✅ v1.0 MVP — shipped 2026-03-30 — 12 phases, 38 plans, ~14,500 LOC TypeScript

## Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 13 - Railway Deployment | Persistent Railway deployment with data integrity safeguards | DEPLOY-01–04 | Complete |
| 14 - Signal Outcome Tracking | Accurate forward-testing dataset: 30m window, peak price, rug classification | OUTCOME-01–06 | In progress (2/4 plans) |
| 15 - Coin Sourcing + Observability | Automated discovery via DexScreener with caps and dashboard health | SEED-01–06, OBS-01–02 | Not started |
| 16 - ProviderRouter Extension | Bundler/wash-trader detection with full Shyft fallback | API-01–03 | Not started |

## Accumulated Context

### Carried from v1.0

- Full pipeline live: Helius → DEX parsing → detection gate → scoring → signals → dashboard + Telegram
- Known tech debt: bundler.ts + wash-trader.ts bypass ProviderRouter (Helius-only, no Shyft fallback) — addressed in Phase 16
- signal_events table exists from Phase 12 — tracks signal fires but no 30m window, peak price, or rug status yet
- Discovery is CA-seeded manually only — no automated coin sourcing exists yet

### v1.1 Decisions

- Phase ordering is data-integrity driven: 13 (deployment substrate) → 14 (schema migrations) → 15 (auto-sourcing needs Phase 14 columns) → 16 (router extension, highest regression risk, benefits from Phase 15 throughput as test load)
- Telegram admin error/crash alerting is explicitly out of scope for v1.1 (signal channel reserved for signals only; operational info goes to dashboard and /status command)
- signal_event_holders table (sell signal infrastructure) to be created in Phase 15 as passive data capture for v1.2 — costs one extra insert per signal fire, needs 30+ days of data before v1.2 exit-tracking analysis is meaningful

### Phase 13 Plan 04 Decisions (2026-04-02)

- DEPLOY-03 requirement text updated to warning-only: RAILWAY_REPLICA_ID is present on all Railway deployments (including single-replica); hard-fail on its presence is not feasible and was never the correct behaviour
- Phase 13 progress table row corrected: v1.1 milestone column added, plan count updated to 4/4
- docs/railway-deployment.md now includes operator-facing explanation of advisory warning and why it fires on all Railway deployments

### Phase 13 Plan 03 Decisions (2026-04-01)

- Substring match on 'max_usage_reached' used for credit exhaustion detection (resilient to Helius body format variations vs exact JSON parse)
- monitorLoop imported lazily via dynamic import() in providers/index.ts to avoid circular dependency at module load time
- HeliusCreditExhaustedError re-thrown after monitorLoop.pause() so ProviderRouter can still fall back to Shyft for the current request cycle
- ESM test pattern: simulate onFailedAttempt logic directly without jest.mock (jest.mock incompatible with NODE_OPTIONS=--experimental-vm-modules)

### Phase 13 Plan 02 Decisions (2026-04-01)

- Used dependency injection (VolumeCheckOptions) for fs/setTimeout testability — @jest/globals not installed, project avoids module mocking
- validateVolumeMount uses dynamic import in serve action to ensure volume check runs before db static-import side-effects (db/index.ts creates dir + opens db on import)
- Replica warning is advisory (console.warn), not a hard fail — Railway blocks volumes+replicas at infra level; warning helps operators diagnose config issues
- Telegram bot hard-fail only when TELEGRAM_BOT_TOKEN is configured — no token means bot is intentionally absent

### Phase 13 Plan 01 Decisions (2026-04-01)

- Used node:20-slim (Debian/glibc) not Alpine — better-sqlite3 native module requires glibc; Alpine's MUSL libc causes build failures
- No USER switch in Dockerfile — Railway volumes mount as root; non-root user breaks volume read/write permissions
- healthcheckTimeout = 300s — allows 5 minutes for volume validation retry loop plus app startup
- Checked in railway.toml — deployment configuration reproducible from git without manual Railway dashboard steps

### Phase 14 Plan 03 Decisions (2026-04-09)

- Rug exclusion uses or(is_rug=false, is_rug IS NULL) to handle rows predating the is_rug column (which default to NULL)
- hits_1h and hits_4h intentionally omitted — only 30m and 24h define hits; 1h/4h expose avg returns which are more useful for those windows
- Time-to-peak derived inline in EJS from recentEvents rather than adding route-level aggregation, keeping accuracy route unchanged
- Sparse data consistently shows "Insufficient data (N/20)" for both 30m and 24h hit rate columns

### Phase 14 Plan 02 Decisions (2026-04-09)

- MILESTONE_COLUMNS map keyed by integer threshold (50/100/300) for clean extensibility if OUTCOME_MILESTONES adds new thresholds
- updatePeakPrice reads current peak_price first (one SELECT) then conditionally writes — avoids unconditional UPDATE on every resolution cycle
- Rug detection uses continue statement after rug write to skip normal 4h write path — keeps rug/non-rug paths clearly separated
- 24h loop uses WHERE eq(signal_events.is_rug, false) to prevent re-fetching price for already-rugged tokens
- MAX_PER_CYCLE cap test updated from resolved=20 to resolved=40 (30m and 1h windows each process 20 of 25 due rows); timeout extended to 15s for 40 * 200ms mock delays

### Research Flags for Planning

- **Phase 15**: Before building AutoSourcer filter logic, verify DexScreener boost endpoint (`/token-boosts/latest/v1`) live JSON response field names (`chainId`, `tokenAddress`, `boostAmount`). A mismatch silently breaks the Solana token filter.
- **Phase 16**: Before implementing ShyftProvider `getTransactionDetails`, get a real Shyft response for a known bundled transaction to verify native transfer action type names. Building against inferred field names risks silent bundler detection failures.

## Blockers

None.

## Next Action

Phase 14 in progress. Execute Plan 04: final plan (dashboard wiring or integration verification).
