# Requirements: Echo Wallet Tracker

**Defined:** 2026-03-31
**Milestone:** v1.1 — Forward Testing & Deployment
**Core Value:** Know what smart money is doing before the crowd does — and trust the signals because the noise (bots, bundlers, dev wallets) has already been filtered out.

## v1.1 Requirements

### Deployment

- [x] **DEPLOY-01**: User can deploy Echo to Railway with a single command (Dockerfile + railway.toml, unified process: monitoring loop + API + Telegram bot)
- [ ] **DEPLOY-02**: System verifies at startup that SQLite DB is on a persistent volume, exits with clear error if not mounted
- [ ] **DEPLOY-03**: System refuses to start with WAL mode if Railway replica count > 1
- [x] **DEPLOY-04**: System distinguishes Helius credit exhaustion from rate-limit 429 and pauses monitoring loop on credit exhaustion

### Signal Outcomes

- [ ] **OUTCOME-01**: Signal events tracked at 30m window (in addition to existing 1h/4h/24h — memecoins often peak before 1h)
- [ ] **OUTCOME-02**: Peak price and time-to-peak (minutes) tracked per signal over 24h post-signal window
- [ ] **OUTCOME-03**: Rugged tokens classified as `rug` status (not `failed`) — fixes survivorship bias in accuracy stats
- [ ] **OUTCOME-04**: Fixed % tier milestones (50%/100%/300%) stored per resolved outcome
- [ ] **OUTCOME-05**: Configurable % threshold Telegram alert when a tracked signal token hits the milestone (e.g. 2x)
- [ ] **OUTCOME-06**: Multi-timeframe accuracy display on dashboard (30m/1h/4h/24h per tier with return distribution)

### Coin Sourcing

- [ ] **SEED-01**: System periodically fetches trending/boosted Solana tokens from DexScreener boost API
- [ ] **SEED-02**: Auto-sourced tokens filtered by minimum liquidity ($10k) before running discovery
- [ ] **SEED-03**: Auto-sourced discovery runs direct-buyers-only mode (graph traversal disabled for automated runs)
- [ ] **SEED-04**: Configurable daily wallet add cap (default 20/day) prevents discovery loops
- [ ] **SEED-05**: Configurable total wallet ceiling (default 200) with circuit breaker stops auto-adds at limit
- [ ] **SEED-06**: Manual CA seeding via CLI confirmed working in Railway deployed environment

### Observability

- [ ] **OBS-01**: Dashboard admin section shows cycle health, provider status (Helius/Shyft), error log, and credit exhaustion state
- [ ] **OBS-02**: `/status` Telegram command returns on-demand system health summary (not scheduled pings)

### API Resilience

- [ ] **API-01**: `getTransactionDetails` added to `RpcProvider` interface, covering `bundler.ts` and `wash-trader.ts`
- [ ] **API-02**: `ShyftProvider` normalization handles all SOL transfer action types for `nativeTransfers` (fixes silent bundler detection gaps under Shyft fallback)
- [ ] **API-03**: Detection engines throw on provider exhaustion rather than silently returning null results

## v1.2 Requirements (Deferred)

### Multi-User

- **COMM-01**: User can support multiple Telegram subscribers with individual alert thresholds
- **COMM-02**: User can add/remove Telegram subscribers

### Signal Calibration

- **QUAL-03**: User can manually calibrate signal weights based on accumulated accuracy data

### Sell Signals

- **SELL-01**: System generates sell signal alerts based on exit timing patterns from collected peak/dump data

## Out of Scope

| Feature | Reason |
|---------|--------|
| Historical backfill | Forward-testing only — live data is the goal |
| Telegram admin alerts (errors, health pings) | Signal channel reserved for signals only; operational info goes to dashboard |
| Sell signal generation | Data collection first; generate signals after patterns emerge |
| Multi-user web dashboard | Personal tool; Telegram handles multi-user delivery (v1.2) |
| Copy-trade execution | Signals only — user executes manually |
| WebSocket streaming | ~30s polling is sufficient |

## Traceability

All 21 v1.1 requirements mapped to phases. Updated during roadmap creation (2026-03-31).

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | Phase 13 | Complete |
| DEPLOY-02 | Phase 13 | Pending |
| DEPLOY-03 | Phase 13 | Pending |
| DEPLOY-04 | Phase 13 | Complete |
| OUTCOME-01 | Phase 14 | Pending |
| OUTCOME-02 | Phase 14 | Pending |
| OUTCOME-03 | Phase 14 | Pending |
| OUTCOME-04 | Phase 14 | Pending |
| OUTCOME-05 | Phase 14 | Pending |
| OUTCOME-06 | Phase 14 | Pending |
| SEED-01 | Phase 15 | Pending |
| SEED-02 | Phase 15 | Pending |
| SEED-03 | Phase 15 | Pending |
| SEED-04 | Phase 15 | Pending |
| SEED-05 | Phase 15 | Pending |
| SEED-06 | Phase 15 | Pending |
| OBS-01 | Phase 15 | Pending |
| OBS-02 | Phase 15 | Pending |
| API-01 | Phase 16 | Pending |
| API-02 | Phase 16 | Pending |
| API-03 | Phase 16 | Pending |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 — roadmap created, traceability confirmed*
