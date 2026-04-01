---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Forward Testing & Deployment
status: executing
last_updated: "2026-04-01T03:59:36Z"
last_activity: "2026-04-01 — Plan 03 complete: HeliusCreditExhaustedError + monitorLoop pause/resume with exponential-backoff probe"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 3
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31 after v1.1 milestone started)

**Core value:** Know what smart money is doing before the crowd does — and trust the signals because the noise (bots, bundlers, dev wallets) has already been filtered out.
**Current focus:** Phase 13 complete — all 3 plans executed

## Current Position

Phase: 13 — Railway Deployment (Complete — 3/3 plans complete)
Plan: 03 complete (all plans done)
Status: Phase 13 complete
Last activity: 2026-04-01 — Plan 03 complete: HeliusCreditExhaustedError + monitorLoop pause/resume with exponential-backoff probe

```
v1.1 Progress: [██████████] 98% (3/3 plans in Phase 13 complete)
```

## Milestone History

- ✅ v1.0 MVP — shipped 2026-03-30 — 12 phases, 38 plans, ~14,500 LOC TypeScript

## Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 13 - Railway Deployment | Persistent Railway deployment with data integrity safeguards | DEPLOY-01–04 | Complete |
| 14 - Signal Outcome Tracking | Accurate forward-testing dataset: 30m window, peak price, rug classification | OUTCOME-01–06 | Not started |
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

### Phase 13 Plan 03 Decisions (2026-04-01)

- Substring match on 'max_usage_reached' used for credit exhaustion detection (resilient to Helius body format variations vs exact JSON parse)
- monitorLoop imported lazily via dynamic import() in providers/index.ts to avoid circular dependency at module load time
- HeliusCreditExhaustedError re-thrown after monitorLoop.pause() so ProviderRouter can still fall back to Shyft for the current request cycle
- ESM test pattern: simulate onFailedAttempt logic directly without jest.mock (jest.mock incompatible with NODE_OPTIONS=--experimental-vm-modules)

### Phase 13 Plan 01 Decisions (2026-04-01)

- Used node:20-slim (Debian/glibc) not Alpine — better-sqlite3 native module requires glibc; Alpine's MUSL libc causes build failures
- No USER switch in Dockerfile — Railway volumes mount as root; non-root user breaks volume read/write permissions
- healthcheckTimeout = 300s — allows 5 minutes for volume validation retry loop plus app startup
- Checked in railway.toml — deployment configuration reproducible from git without manual Railway dashboard steps

### Research Flags for Planning

- **Phase 15**: Before building AutoSourcer filter logic, verify DexScreener boost endpoint (`/token-boosts/latest/v1`) live JSON response field names (`chainId`, `tokenAddress`, `boostAmount`). A mismatch silently breaks the Solana token filter.
- **Phase 16**: Before implementing ShyftProvider `getTransactionDetails`, get a real Shyft response for a known bundled transaction to verify native transfer action type names. Building against inferred field names risks silent bundler detection failures.

## Blockers

None.

## Next Action

Phase 13 complete. Execute Phase 14: `/gsd:execute-phase 14` — Signal Outcome Tracking (30m window, peak price, rug classification).
