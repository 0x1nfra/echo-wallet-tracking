# Roadmap: Echo Wallet Tracker

## Overview

Echo is built in strict dependency order — each phase unblocks the next. Raw transactions flow through parsing, then bundle/scam detection gates which wallets qualify as clean, then metrics and scoring produce wallet quality scores, and finally a signal engine aggregates wallet scores into per-token buy signals. The monitoring loop orchestrates the full pipeline on a 30-second cycle. The delivery layer (dashboard + Telegram) sits on top of proven signals. Wallet discovery — the key differentiator — is last because it requires all upstream layers to be solid before candidate wallets can be evaluated.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - SQLite schema, drizzle-orm migrations, WAL mode, and CLI wallet registry (completed 2026-03-11)
- [x] **Phase 2: Transaction Parsing** - Helius enhanced transaction normalization, DEX-specific parsers, full history import, FIFO position tracking (completed 2026-03-11)
- [ ] **Phase 3: Bundle/Scam Detection** - Bundler, dev wallet, sniper, and wash trader detection with tiered confidence gating
- [ ] **Phase 4: Metrics and Scoring** - WalletMetrics calculation and 0-100 wallet score with risk-adjusted return weighting
- [ ] **Phase 5: Monitoring Loop and Auto-Removal** - 30s cron loop with p-queue rate limiting, incremental fetching, and auditable auto-removal
- [ ] **Phase 6: Token Signal Engine** - Per-token 0-100 signal score aggregating smart wallet activity, buy velocity, exit pressure, and coordination discounting
- [ ] **Phase 7: API, Dashboard, and Telegram Alerts** - Fastify REST+SSE API, HTMX dashboard, and grammy Telegram bot with threshold alerts
- [ ] **Phase 8: Wallet Discovery** - Token-CA candidate extraction, scoring gate, 7-day probation, and graph traversal discovery

## Phase Details

### Phase 1: Data Foundation
**Goal**: The system has a stable, persistent data layer and the user can manage their tracked wallet list
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. User can add a wallet address (with optional label) from the CLI and it persists across process restarts
  2. User can remove a tracked wallet from the CLI
  3. User can list all tracked wallets with their current status in the CLI
  4. Database schema (wallets, swaps, wallet_metrics, token_signals, removal_log) exists with drizzle-orm migrations that run cleanly on a fresh install
  5. SQLite WAL mode is enabled and the database survives concurrent reads during writes without locking errors
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — DB schema, migration, WAL connection, test infrastructure
- [ ] 01-02-PLAN.md — Wallet add/remove/list commands + CLI wiring

### Phase 2: Transaction Parsing
**Goal**: The system can convert raw Helius API responses into normalized Swap objects for any of the five supported DEXes
**Depends on**: Phase 1
**Requirements**: PARS-01, PARS-02, PARS-03
**Success Criteria** (what must be TRUE):
  1. A newly imported wallet has its full transaction history fetched, paginated, and persisted to the swaps table before any metrics are calculated
  2. Swaps are correctly identified and normalized for Pump.fun, Raydium, Jupiter, Orca, and Meteora transactions — each with correct token amounts, SOL amounts, and timestamps
  3. Each wallet has a `history_complete` flag that is only set to true after full history import finishes successfully
  4. FIFO cost basis is applied to match buys to sells and produce correct realized PnL values for closed positions
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — parse_errors schema migration, DEX program ID registry, HeliusTransaction type extensions
- [ ] 02-02-PLAN.md — parseSwaps and applyFifo implementation (TDD)
- [ ] 02-03-PLAN.md — Helius fetcher upgrade (p-queue + p-retry), history import orchestrator, wallet add --full-history

### Phase 3: Bundle/Scam Detection
**Goal**: The system can classify wallets as clean or suspicious using tiered confidence before they are ever scored
**Depends on**: Phase 2
**Requirements**: DETC-01, DETC-02, DETC-03, DETC-04, DETC-05, DETC-06
**Success Criteria** (what must be TRUE):
  1. A wallet that coordinated same-block buys from a shared funding source is flagged as a bundler (with suspected → review → confirmed progression)
  2. A wallet that received tokens directly from the token deployer address is detected and flagged as a dev wallet
  3. A wallet that consistently buys in the first 2-3 blocks of launches is detected as a sniper bot
  4. Circular trade relationships between related wallets are detected and flagged as wash trading
  5. Only wallets with "confirmed passing" detection status are eligible for scoring — wallets at "suspected" or "review" status are excluded but not removed
**Plans**: TBD

### Phase 4: Metrics and Scoring
**Goal**: Clean wallets receive a reliable 0-100 quality score based on risk-adjusted trading performance
**Depends on**: Phase 3
**Requirements**: SCOR-01, SCOR-02, SCOR-03
**Success Criteria** (what must be TRUE):
  1. Each clean wallet has calculated metrics stored: win rate, realized PnL in SOL, Sharpe-like risk-adjusted return, max drawdown, and recency score
  2. Each eligible wallet receives a 0-100 score weighted: risk-adjusted return (40%), win rate (20%), consistency and recency (20%), activity health (20%)
  3. Wallets without complete transaction history or without confirmed-passing detection status produce no score (are skipped)
  4. A bundler-style wallet with high win rate but volatile returns scores materially lower than a genuine smart trader with consistent risk-adjusted performance
**Plans**: TBD

### Phase 5: Monitoring Loop and Auto-Removal
**Goal**: The system continuously updates wallet data on a 30-second cycle without exhausting Helius rate limits, and automatically removes wallets that degrade or are confirmed scams
**Depends on**: Phase 4
**Requirements**: MNTR-01, MNTR-02, MNTR-03, RMVL-01, RMVL-02, RMVL-03, RMVL-04
**Success Criteria** (what must be TRUE):
  1. The monitoring loop runs every 30 seconds and processes all tracked wallets through fetch → parse → detect → score without manual intervention
  2. After first import, each wallet only fetches transactions since its last_checked_at timestamp — full re-fetch never happens in steady state
  3. All Helius API calls are queued with max 5 concurrent requests and retry with exponential backoff on 429 responses — rate limit exhaustion does not crash the loop
  4. A wallet whose score falls below threshold for N consecutive cycles over a 30-day rolling window is automatically removed with a logged reason
  5. All auto-removals are written to the removal_log table with reason, timestamp, and detection details — and can be reviewed and reversed
**Plans**: TBD

### Phase 6: Token Signal Engine
**Goal**: The system produces a per-token buy/sell signal score after each monitoring cycle that reflects genuine smart money activity
**Depends on**: Phase 5
**Requirements**: SGNL-01, SGNL-02, SGNL-03
**Success Criteria** (what must be TRUE):
  1. After each monitoring cycle completes, every token held by tracked wallets receives an updated 0-100 signal score reflecting smart wallet count, buy velocity in the last 1 hour, exit pressure from sells, and PnL-weighted holder score
  2. Token signals are stored in the token_signals table and are available immediately after each cycle ends
  3. A token whose smart-wallet holders appear coordinated (share a common funding source) receives a discounted signal score compared to a token held by independent wallets with similar metrics
**Plans**: TBD

### Phase 7: API, Dashboard, and Telegram Alerts
**Goal**: The user can monitor live signals and wallet activity via a web dashboard and receive time-sensitive alerts via Telegram
**Depends on**: Phase 6
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, TGRM-01, TGRM-02, TGRM-03
**Success Criteria** (what must be TRUE):
  1. User can open the dashboard in a browser and see a live token signal feed sorted by signal score that updates without manual page refresh when a new cycle completes
  2. User can see all tracked wallets in the dashboard with their current score, detection status, and last active time
  3. User can click into a wallet on the dashboard to see recent trades, score breakdown, and detection flags
  4. User receives a Telegram alert when a token signal crosses a configured threshold — and does not receive duplicate alerts for the same token within a 2-hour window
  5. User can send /status, /top, and /wallet <address> commands to the Telegram bot and receive current data in response
**Plans**: TBD

### Phase 8: Wallet Discovery
**Goal**: The user can grow the tracked wallet list automatically by discovering profitable early traders from a token contract address
**Depends on**: Phase 7
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04
**Success Criteria** (what must be TRUE):
  1. User can trigger discovery by providing a token contract address and the system extracts wallets that bought early and realized profit
  2. Only discovered wallets that score above 70 are added to the tracker — low-quality wallets are rejected automatically
  3. Newly discovered wallets enter a 7-day probation period and are excluded from token signal scoring during that window
  4. The system can extend discovery via graph traversal — identifying wallet candidates that co-traded with known smart money wallets
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 2/2 | Complete   | 2026-03-11 |
| 2. Transaction Parsing | 3/3 | Complete   | 2026-03-11 |
| 3. Bundle/Scam Detection | 0/TBD | Not started | - |
| 4. Metrics and Scoring | 0/TBD | Not started | - |
| 5. Monitoring Loop and Auto-Removal | 0/TBD | Not started | - |
| 6. Token Signal Engine | 0/TBD | Not started | - |
| 7. API, Dashboard, and Telegram Alerts | 0/TBD | Not started | - |
| 8. Wallet Discovery | 0/TBD | Not started | - |
