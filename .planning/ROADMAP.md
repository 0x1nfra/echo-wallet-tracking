# Roadmap: Echo Wallet Tracker

## Overview

Echo is built in strict dependency order — each phase unblocks the next. Raw transactions flow through parsing, then bundle/scam detection gates which wallets qualify as clean, then metrics and scoring produce wallet quality scores, and finally a signal engine aggregates wallet scores into per-token buy signals. The monitoring loop orchestrates the full pipeline on a 30-second cycle. The delivery layer (dashboard + Telegram) sits on top of proven signals. Wallet discovery — the key differentiator — is last because it requires all upstream layers to be solid before candidate wallets can be evaluated.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation** - SQLite schema, drizzle-orm migrations, WAL mode, and CLI wallet registry (completed 2026-03-11)
- [x] **Phase 2: Transaction Parsing** - Helius enhanced transaction normalization, DEX-specific parsers, full history import, FIFO position tracking (completed 2026-03-11)
- [x] **Phase 3: Bundle/Scam Detection** - Bundler, dev wallet, sniper, and wash trader detection with tiered confidence gating (completed 2026-03-12)
- [x] **Phase 4: Metrics and Scoring** - WalletMetrics calculation and 0-100 wallet score with risk-adjusted return weighting (completed 2026-03-13)
- [x] **Phase 5: Monitoring Loop and Auto-Removal** - 30s cron loop with p-queue rate limiting, incremental fetching, and auditable auto-removal (completed 2026-03-13)
- [x] **Phase 6: Token Signal Engine** - Per-token 0-100 signal score aggregating smart wallet activity, buy velocity, exit pressure, and coordination discounting (completed 2026-03-15)
- [x] **Phase 7: API, Dashboard, and Telegram Alerts** - Fastify REST+SSE API, HTMX dashboard, and grammy Telegram bot with threshold alerts (completed 2026-03-16)
- [x] **Phase 8: Wallet Discovery** - Token-CA candidate extraction, scoring gate, 7-day probation, and graph traversal discovery (completed 2026-03-17)

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
   **Plans**: 4 plans

Plans:

- [ ] 03-01-PLAN.md — wallet_flags schema, detection_status enum extension, types.ts, thresholds.ts
- [ ] 03-02-PLAN.md — bundler and dev wallet detectors (TDD)
- [ ] 03-03-PLAN.md — sniper and wash trader detectors (TDD)
- [ ] 03-04-PLAN.md — detection engine orchestrator, history.ts integration, wallet review/clear-flag/list commands

### Phase 4: Metrics and Scoring

**Goal**: Clean wallets receive a reliable 0-100 quality score based on risk-adjusted trading performance
**Depends on**: Phase 3
**Requirements**: SCOR-01, SCOR-02, SCOR-03
**Success Criteria** (what must be TRUE):

1. Each clean wallet has calculated metrics stored: win rate, realized PnL in SOL, Sharpe-like risk-adjusted return, max drawdown, and recency score
2. Each eligible wallet receives a 0-100 score weighted: risk-adjusted return (40%), win rate (20%), consistency and recency (20%), activity health (20%)
3. Wallets without complete transaction history or without confirmed-passing detection status produce no score (are skipped)
4. A bundler-style wallet with high win rate but volatile returns scores materially lower than a genuine smart trader with consistent risk-adjusted performance
   **Plans**: 3 plans

Plans:

- [ ] 04-01-PLAN.md — Schema migration: score_history table + wallet_metrics sub-score columns
- [ ] 04-02-PLAN.md — Metric calculators TDD: win-rate, PnL, Sharpe, drawdown, recency + score composer
- [ ] 04-03-PLAN.md — Scoring engine (DB wiring, eligibility gate) + CLI wallet score command

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
   **Plans**: 3 plans

Plans:

- [ ] 05-01-PLAN.md — Schema migration (4 new monitoring columns) + heliusQueue concurrency: 5 with 429 backoff
- [ ] 05-02-PLAN.md — MonitorLoop class (30s cycle, incremental fetch, auto-restart) + removal policy engine (3 policies)
- [ ] 05-03-PLAN.md — CLI wallet monitor start/pause/stop + wallet removals list/restore + auto-start in cli.ts

### Phase 6: Token Signal Engine

**Goal**: The system produces a per-token buy/sell signal score after each monitoring cycle that reflects genuine smart money activity
**Depends on**: Phase 5
**Requirements**: SGNL-01, SGNL-02, SGNL-03
**Success Criteria** (what must be TRUE):

1. After each monitoring cycle completes, every token held by tracked wallets receives an updated 0-100 signal score reflecting smart wallet count, buy velocity in the last 1 hour, exit pressure from sells, and PnL-weighted holder score
2. Token signals are stored in the token_signals table and are available immediately after each cycle ends
3. A token whose smart-wallet holders appear coordinated (share a common funding source) receives a discounted signal score compared to a token held by independent wallets with similar metrics
   **Plans**: 3 plans

Plans:

- [ ] 06-01-PLAN.md — Schema migration: signal_tier + coordinated_wallet_count columns
- [ ] 06-02-PLAN.md — Signal scorer TDD: pure computeSignalScore() function
- [ ] 06-03-PLAN.md — Signal engine, MonitorLoop hook, signal list CLI command

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
   **Plans**: 3 plans

Plans:

- [ ] 07-01-PLAN.md — Install deps (fastify, grammy, etc.), add alert_log + token_metadata schema + migration, wire cycleEmitter into MonitorLoop
- [ ] 07-02-PLAN.md — Fastify REST + SSE API routes, HTMX/Alpine.js dashboard views (signal feed + wallet list), wire server startup into CLI
- [ ] 07-03-PLAN.md — Wallet detail page + grammY Telegram bot (commands + alert dispatcher with dedup and accumulation override)

### Phase 8: Wallet Discovery

**Goal**: The user can grow the tracked wallet list automatically by discovering profitable early traders from a token contract address
**Depends on**: Phase 7
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04
**Success Criteria** (what must be TRUE):

1. User can trigger discovery by providing a token contract address and the system extracts wallets that bought early and realized profit
2. Only discovered wallets that score above 70 are added to the tracker — low-quality wallets are rejected automatically
3. Newly discovered wallets enter a 7-day probation period and are excluded from token signal scoring during that window
4. The system can extend discovery via graph traversal — identifying wallet candidates that co-traded with known smart money wallets
   **Plans**: 4 plans

Plans:

- [ ] 08-01-PLAN.md — Schema migration: probation_until column + discovery_runs + discovery_candidates tables
- [ ] 08-02-PLAN.md — HeliusFetcher.fetchEarlySwapsForMint + fetchEarlyBuyers TDD (Wave 1, parallel)
- [ ] 08-03-PLAN.md — Signal engine probation guard (TDD) + graph traversal + discovery orchestrator
- [ ] 08-04-PLAN.md — CLI wallet discover command + probation section in wallet list + dashboard probation view

### Phase 9: Fix Incremental Detection Timestamp Bug

**Goal:** Incremental monitoring cycles correctly re-run bundle/scam detection on new swaps so wallets that become scammers post-import are caught and auto-removed
**Depends on:** Phase 3, Phase 5
**Requirements:** DETC-01, DETC-02, DETC-03, DETC-04, RMVL-02
**Gap Closure:** Closes gaps from v1.0 audit — timestamp units mismatch in `runDetectionIfNeeded()`
**Success Criteria** (what must be TRUE):

1. After the fix, `runDetectionIfNeeded()` fires on every wallet that has new swaps since its last check — not just on initial import
2. A wallet that exhibits bundler/sniper/dev/wash-trader behavior in swaps added after initial import is detected and flagged on the next monitoring cycle
3. A wallet confirmed as a scam post-import is automatically removed (RMVL-02 satisfied end-to-end)
4. A regression test verifies the timestamp comparison uses the same units on both sides

**Plans:** 1 plan

Plans:
- [ ] 09-01-PLAN.md — Fix timestamp unit bugs (detection engine, wash-trader, scoring engine) and add regression tests

### Phase 10: Tech Debt Cleanup

**Goal:** Remove schema type violations, dead exports, and leftover scaffolding that create false impressions of system behavior
**Depends on:** Phase 9
**Requirements:** None (internal code quality)
**Gap Closure:** Closes tech debt items from v1.0 audit
**Success Criteria** (what must be TRUE):

1. `wallet_flags.detector` enum includes `'manual'` — no `as any` cast needed in the flag command
2. `getEligibleWallets()` is either wired up or removed — no dead exports presenting false cross-phase linkage
3. `scoreWallet()` stub is removed from `src/index.ts` — no leftover scaffold in entry point
4. TypeScript compiles cleanly with no type errors after changes
   **Plans**: 1 plan

Plans:

- [x] 10-01-PLAN.md — Add 'manual' to DetectorId + schema enum, remove as-any casts, delete getEligibleWallets() and scoreWallet() stub

### Phase 11: Helius RPC Provider Rotation

**Goal:** The system survives Helius 429 outages by rotating to a fallback RPC provider, scoped to handle per-provider response normalization explicitly
**Depends on:** Phase 10
**Requirements:** MNTR-03 (resilience extension)
**Gap Closure:** Closes Phase 8 tech debt — no fallback when Helius returns 429 during wallet discovery
**Success Criteria** (what must be TRUE):

1. A provider abstraction interface wraps all Helius API calls — each provider implements `fetchSwapHistory()`, `fetchEarlySwapsForMint()`, and `fetchOnePage()` separately
2. When Helius returns 429 and exhausts backoff retries, the system rotates to the next configured provider rather than failing
3. Each provider's response normalization is isolated — no shared parsing path that assumes Helius response shape
4. Provider rotation is transparent to callers (MonitorLoop, discovery orchestrator) — no callsite changes needed
5. System degrades gracefully if all providers are exhausted (logs error, skips wallet cycle, does not crash)
   **Plans**: 4 plans

Plans:

- [x] 11-01-PLAN.md — RpcProvider interface + HeliusProvider wrapper + delegation tests
- [x] 11-02-PLAN.md — ProviderRouter (priority failover, 60s cooldown) + createProviderRouter() factory + router tests
- [x] 11-03-PLAN.md — ShyftProvider with Shyft API normalization to HeliusTransaction + normalization tests
- [x] 11-04-PLAN.md — Migrate 4 callsites to createProviderRouter() + startup warning + full regression

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase                                      | Plans Complete | Status   | Completed  |
| ------------------------------------------ | -------------- | -------- | ---------- |
| 1. Data Foundation                         | 2/2            | Complete | 2026-03-11 |
| 2. Transaction Parsing                     | 3/3            | Complete | 2026-03-11 |
| 3. Bundle/Scam Detection                   | 5/5            | Complete | 2026-03-13 |
| 4. Metrics and Scoring                     | 3/3            | Complete | 2026-03-13 |
| 5. Monitoring Loop and Auto-Removal        | 4/4            | Complete | 2026-03-15 |
| 6. Token Signal Engine                     | 3/3            | Complete | 2026-03-15 |
| 7. API, Dashboard, and Telegram Alerts     | 3/3            | Complete | 2026-03-16 |
| 8. Wallet Discovery                        | 4/4            | Complete | 2026-03-17 |
| 9. Fix Incremental Detection Timestamp Bug | 0/?            | Pending  | —          |
| 10. Tech Debt Cleanup                      | 1/1            | Complete | 2026-03-26 |
| 11. Helius RPC Provider Rotation           | 4/4            | Complete | 2026-03-27 |

### Phase 12: Signal Accuracy Logging

**Goal:** [To be planned]
**Depends on:** Phase 11
**Plans:** 4/4 plans complete

Plans:

- [x] TBD (run /gsd:plan-phase 12 to break down) (completed 2026-03-27)
