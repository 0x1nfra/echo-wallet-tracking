# Roadmap: Echo Wallet Tracker

## Milestones

- ✅ **v1.0 MVP** — Phases 1-12 (shipped 2026-03-30)
- **v1.1 Forward Testing & Deployment** — Phases 13-16 (active)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-12) — SHIPPED 2026-03-30</summary>

- [x] Phase 1: Data Foundation (2/2 plans) — completed 2026-03-11
- [x] Phase 2: Transaction Parsing (3/3 plans) — completed 2026-03-11
- [x] Phase 3: Bundle/Scam Detection (5/5 plans) — completed 2026-03-13
- [x] Phase 4: Metrics and Scoring (3/3 plans) — completed 2026-03-13
- [x] Phase 5: Monitoring Loop and Auto-Removal (4/4 plans) — completed 2026-03-15
- [x] Phase 6: Token Signal Engine (3/3 plans) — completed 2026-03-15
- [x] Phase 7: API, Dashboard, and Telegram Alerts (3/3 plans) — completed 2026-03-16
- [x] Phase 8: Wallet Discovery (4/4 plans) — completed 2026-03-17
- [x] Phase 9: Fix Incremental Detection Timestamp Bug (1/1 plan) — completed 2026-03-30
- [x] Phase 10: Tech Debt Cleanup (1/1 plan) — completed 2026-03-26
- [x] Phase 11: Helius RPC Provider Rotation (4/4 plans) — completed 2026-03-27
- [x] Phase 12: Signal Accuracy Logging (4/4 plans) — completed 2026-03-27

See full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 Forward Testing & Deployment

- [x] **Phase 13: Railway Deployment** - Deploy Echo to Railway with persistent SQLite, WAL safeguards, and credit exhaustion handling (completed 2026-04-01)
- [ ] **Phase 14: Signal Outcome Tracking** - Extend outcome resolver with 30m window, peak price capture, rug classification, and % tier milestones
- [ ] **Phase 15: Coin Sourcing + Observability** - Automate token discovery via DexScreener boost API with rate limits, caps, and dashboard health visibility
- [ ] **Phase 16: ProviderRouter Extension** - Extend ProviderRouter to cover bundler and wash-trader detection with full Shyft fallback

## Phase Details

### Phase 13: Railway Deployment
**Goal**: Echo runs persistently on Railway with guaranteed data integrity — forward-testing data is never silently wiped
**Depends on**: Nothing (deployment substrate, enables all other phases)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04
**Success Criteria** (what must be TRUE):
  1. User can deploy Echo to Railway with a single command and the service starts with monitoring loop, API, and Telegram bot all running
  2. If the SQLite database file is not on the mounted volume, the service exits immediately with a clear error message identifying the path mismatch
  3. If a Railway replica environment is detected (RAILWAY_REPLICA_ID set), the service logs a WAL integrity warning; the service does not hard-fail because RAILWAY_REPLICA_ID is present on all Railway deployments including single-replica
  4. When Helius credits are exhausted (429 with `max_usage_reached` body), the monitoring loop pauses rather than silently continuing on Shyft fallback indefinitely
**Plans**: TBD

### Phase 14: Signal Outcome Tracking
**Goal**: Signal outcomes produce a forward-testing dataset that accurately reflects real on-chain performance — including fast movers, peak prices, and rugged tokens
**Depends on**: Phase 13 (schema migrations must persist to Railway volume from day one)
**Requirements**: OUTCOME-01, OUTCOME-02, OUTCOME-03, OUTCOME-04, OUTCOME-05, OUTCOME-06
**Success Criteria** (what must be TRUE):
  1. Each signal event records a 30-minute outcome (price, percentage change, status) in addition to 1h/4h/24h windows
  2. Each signal event records peak price and time-to-peak (in minutes) as observed over the 24h post-signal window
  3. Rugged tokens are stored with `rug` status rather than `failed`, and are counted as 0-return outcomes in all accuracy denominators
  4. When a tracked signal token crosses a fixed % milestone (50%, 100%, 300%), the result is stored per outcome record
  5. When a tracked signal token hits a user-configured % threshold, a Telegram alert fires for that token
  6. The dashboard accuracy section shows per-tier hit rates and return distribution for all four time windows (30m/1h/4h/24h)
**Plans**: 4 plans

Plans:
- [ ] 14-01-PLAN.md — Schema migration: all Phase 14 columns + outcome_alert_log table
- [ ] 14-02-PLAN.md — Outcome resolver extension: 30m window, peak tracking, rug detection, milestones
- [ ] 14-03-PLAN.md — Accuracy stats + dashboard: 4-window TierAccuracy, rug exclusion, accuracy_stats.ejs
- [ ] 14-04-PLAN.md — Outcome alerts: runOutcomeAlertCycle, market cap capture, bot wiring

### Phase 15: Coin Sourcing + Observability
**Goal**: Discovery pipeline runs continuously without manual CA seeding, within Helius credit and wallet count limits, with operational health visible from Telegram
**Depends on**: Phase 14 (auto-sourced tokens generate signal events that require Phase 14 schema columns on first insertion)
**Requirements**: SEED-01, SEED-02, SEED-03, SEED-04, SEED-05, SEED-06, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. System periodically fetches trending Solana tokens from the DexScreener boost API and seeds them into discovery, with tokens below $10k liquidity filtered out before any discovery runs
  2. Auto-sourced discovery runs direct-buyers-only mode — graph traversal is disabled for automated inputs
  3. Daily wallet additions from auto-sourcing are capped (default 20/day) and a total wallet ceiling (default 200) halts auto-adds when reached
  4. Manual CA seeding via CLI works in the Railway deployed environment without local machine access
  5. The dashboard admin section shows monitoring cycle health, provider status (Helius/Shyft), recent errors, and credit exhaustion state
  6. The `/status` Telegram command returns an on-demand system health summary including cycle count, last cycle duration, and stall detection
**Plans**: TBD

### Phase 16: ProviderRouter Extension
**Goal**: Bundler and wash-trader detection remain accurate under Helius rate limiting — no silent degradation to empty results
**Depends on**: Phase 15 (higher auto-sourcing throughput provides a realistic test load to validate detection under new router paths)
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. `getTransactionDetails` is available on the `RpcProvider` interface, with both HeliusProvider and ShyftProvider implementations, so bundler.ts and wash-trader.ts can be routed through the ProviderRouter
  2. ShyftProvider correctly normalizes all SOL native transfer action types (`SOL_TRANSFER`, `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER`) so bundler detection does not silently miss funder transactions when running under Shyft fallback
  3. When all providers are exhausted, detection engines throw an explicit error rather than returning null or empty results
**Plans**: TBD

## Progress

| Phase                              | Milestone | Plans Complete | Status      | Completed |
| ---------------------------------- | --------- | -------------- | ----------- | --------- |
| 1. Data Foundation                 | v1.0      | 2/2            | Complete    | 2026-03-11 |
| 2. Transaction Parsing             | v1.0      | 3/3            | Complete    | 2026-03-11 |
| 3. Bundle/Scam Detection           | v1.0      | 5/5            | Complete    | 2026-03-13 |
| 4. Metrics and Scoring             | v1.0      | 3/3            | Complete    | 2026-03-13 |
| 5. Monitoring Loop and Auto-Removal| v1.0      | 4/4            | Complete    | 2026-03-15 |
| 6. Token Signal Engine             | v1.0      | 3/3            | Complete    | 2026-03-15 |
| 7. API, Dashboard, and Telegram    | v1.0      | 3/3            | Complete    | 2026-03-16 |
| 8. Wallet Discovery                | v1.0      | 4/4            | Complete    | 2026-03-17 |
| 9. Fix Timestamp Bug               | v1.0      | 1/1            | Complete    | 2026-03-30 |
| 10. Tech Debt Cleanup              | v1.0      | 1/1            | Complete    | 2026-03-26 |
| 11. Helius RPC Provider Rotation   | v1.0      | 4/4            | Complete    | 2026-03-27 |
| 12. Signal Accuracy Logging        | v1.0      | 4/4            | Complete    | 2026-03-27 |
| 13. Railway Deployment             | v1.1      | Complete    | 2026-04-02 | 2026-04-01 |
| 14. Signal Outcome Tracking        | 3/4 | In Progress|  | -          |
| 15. Coin Sourcing + Observability  | v1.1      | 0/TBD          | Not started | -          |
| 16. ProviderRouter Extension       | v1.1      | 0/TBD          | Not started | -          |
