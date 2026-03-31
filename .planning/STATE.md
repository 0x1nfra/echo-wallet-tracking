---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Forward Testing & Deployment
status: roadmap_complete
stopped_at: Roadmap created — ready to plan Phase 13
last_updated: "2026-03-31T00:00:00.000Z"
last_activity: 2026-03-31 — Roadmap written for v1.1 (Phases 13-16)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31 after v1.1 milestone started)

**Core value:** Know what smart money is doing before the crowd does — and trust the signals because the noise (bots, bundlers, dev wallets) has already been filtered out.
**Current focus:** Ready to plan Phase 13: Railway Deployment

## Current Position

Phase: 13 — Railway Deployment (Not started)
Plan: —
Status: Roadmap complete, awaiting phase planning
Last activity: 2026-03-31 — Roadmap written (Phases 13-16), 21/21 requirements mapped

```
v1.1 Progress: [                    ] 0% (0/4 phases)
```

## Milestone History

- ✅ v1.0 MVP — shipped 2026-03-30 — 12 phases, 38 plans, ~14,500 LOC TypeScript

## Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 13 - Railway Deployment | Persistent Railway deployment with data integrity safeguards | DEPLOY-01–04 | Not started |
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

### Research Flags for Planning

- **Phase 15**: Before building AutoSourcer filter logic, verify DexScreener boost endpoint (`/token-boosts/latest/v1`) live JSON response field names (`chainId`, `tokenAddress`, `boostAmount`). A mismatch silently breaks the Solana token filter.
- **Phase 16**: Before implementing ShyftProvider `getTransactionDetails`, get a real Shyft response for a known bundled transaction to verify native transfer action type names. Building against inferred field names risks silent bundler detection failures.

## Blockers

None.

## Next Action

Run `/gsd:plan-phase 13` to decompose Phase 13: Railway Deployment into executable plans.
