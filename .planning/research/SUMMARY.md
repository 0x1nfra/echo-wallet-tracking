# Project Research Summary

**Project:** Echo Wallet Tracker
**Domain:** Solana memecoin smart-money wallet tracking and signal generation
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

Echo is a personal Solana wallet tracking tool designed to monitor smart money wallets trading memecoins, detect scam/bundler activity, and generate actionable buy signals. The right way to build this is a pipeline: raw transactions flow through parsing, then bundle/scam detection gates which wallets qualify as "clean," then metrics and scoring produce wallet quality scores, and finally a signal engine aggregates wallet scores into per-token signals. The entire system runs on a ~30s polling loop. This is a well-understood domain with established patterns — the complexity is not in infrastructure choices but in getting detection heuristics right without generating false positives that hollow out the wallet list.

The recommended stack extends the existing TypeScript/Node.js + Helius + DexScreener foundation with SQLite (better-sqlite3 + drizzle-orm) for persistence, node-cron for scheduling, Fastify for API/SSE, HTMX + Alpine.js for the dashboard, and grammy for the Telegram bot. This stack is deliberately minimal: no Redis, no React, no queues, no WebSockets. p-queue and p-retry handle rate limit management against Helius's 300 req/min free-tier cap, which is the tightest operational constraint in the system.

The primary risk is false-positive bundle detection removing legitimate smart wallets. The mitigation is a tiered confidence model (suspected → review → confirmed) before any removal fires, and using risk-adjusted return (not win rate alone) as the primary scoring dimension. A secondary risk is Helius rate limit exhaustion when tracking 100+ wallets — this must be addressed from day one with p-queue concurrency limiting and incremental fetching (only new transactions since last_checked_at).

## Key Findings

### Recommended Stack

The existing stack (TypeScript, Node.js, Helius, DexScreener) is the right foundation. The recommended additions are lean and purposeful: SQLite via better-sqlite3 + drizzle-orm covers all persistence needs without infrastructure overhead. node-cron handles the monitoring loop cleanly. Fastify serves the API and SSE endpoint. For the dashboard, HTMX + Alpine.js + Chart.js is the right call for a personal tool — no build pipeline, no framework overhead. grammy is the modern TypeScript-first Telegram bot library.

**Core technologies:**
- `better-sqlite3 ^9.4.x` + `drizzle-orm ^0.30.x`: persistence — zero-infra, queryable, type-safe migrations
- `node-cron ^3.0.x`: monitoring loop scheduling — declarative, prevents overlapping runs
- `Fastify ^4.x` + SSE: API and live dashboard push — fastest Node.js HTTP framework, built-in schema validation
- `HTMX ^1.9.x` + `Alpine.js ^3.x` + `Chart.js ^4.x`: dashboard — no build pipeline needed for a personal tool
- `grammy ^1.21.x`: Telegram bot — TypeScript-first, actively maintained
- `p-queue ^8.x` + `p-retry ^6.x`: rate limit and resilience — wraps all Helius/DexScreener calls

**Do not use:** Redis, React/Next.js, WebSockets, GraphQL, BullMQ — all add complexity without benefit at this scale.

### Expected Features

The feature dependency chain is strictly ordered: transaction parsing must exist before metrics, detection must gate scoring, scoring must exist before signals, signals gate alerts and dashboard. Build in this order or downstream features produce garbage.

**Must have (table stakes):**
- Wallet registry — add/remove/label wallets, persistent across restarts
- Transaction parsing — normalize Helius enhanced txs to Swap objects per DEX (Pump.fun, Raydium, Jupiter, Orca, Meteora)
- Position tracking — FIFO cost basis, match buys to sells for realized PnL
- Bundle/scam detection — bundler clustering, dev wallet linkage, sniper pattern, wash trading
- Wallet scoring — risk-adjusted return (40%), win rate (20%), consistency/recency (20%), activity health (20%)
- Token signal engine — smart wallet accumulation count, buy velocity, exit pressure, composite 0-100 score
- Telegram alerts — threshold-based push, dedup within 1h per token
- Dashboard — signal feed, wallet table, wallet drill-down with live SSE updates

**Should have (differentiators):**
- Auto-discovery — extract wallet candidates from token CA's early buyers, score and add qualifying ones
- Auto-removal — score decay, scam flag, inactivity triggers with audit log
- Signal accuracy tracking — log what happened to tokens after signal fired

**Defer to v2+:**
- Copy-trade execution, backtesting UI, social graph visualization, MEV detection, multi-user/SaaS, real-time WebSocket streaming

### Architecture Approach

The system is a pipeline: a node-cron loop fires every 30s, loads all tracked wallets, and pushes each through Fetch → Parse → Detect → Score via a p-queue (max 5 concurrent Helius calls). Results persist to SQLite. After each cycle, the Signal Engine aggregates wallet scores into token signals, SSE pushes updates to the dashboard, and the Telegram bot checks alert conditions. SQLite uses WAL mode to support concurrent reads during writes.

**Major components:**
1. Monitoring Loop (`src/monitor/loop.ts`) — cron trigger, orchestrates the per-wallet pipeline, manages rate limiting
2. Data Pipeline — Parser (`src/parsers/helius.ts`), Detector (`src/detection/`), Metrics Calculator (`src/calculators/`), Scorer (`src/scoring/`)
3. SQLite DB — tables: `wallets`, `swaps`, `wallet_metrics`, `token_signals`, `removal_log`
4. Token Signal Engine (`src/signals/`) — aggregates wallet scores into per-token buy signal scores
5. Fastify API + SSE (`src/api/`) — REST endpoints + `/api/events` SSE for dashboard live updates
6. Dashboard (`src/dashboard/`) — HTMX + Alpine.js static pages served by Fastify
7. Telegram Bot (`src/telegram/`) — grammy, long-polling, threshold alerts with dedup
8. Wallet Discovery (`src/discovery/`) — token-CA-based and graph-traversal candidate sourcing

### Critical Pitfalls

1. **False-positive bundle detection** — Use tiered confidence (suspected → review → confirmed), require correlated signals (same block + shared funding source), never trigger removal on "suspected" alone. Build in this gating from day one in the detection phase.
2. **Win rate gaming by bundlers/devs** — Make risk-adjusted return the primary scoring component (40%+ weight), not win rate. Penalize wallets with >80% trades in first 5 blocks of launch.
3. **Helius rate limit exhaustion** — p-queue with max 4-5 concurrent calls from day one. Incremental fetching (last_checked_at). Exponential backoff via p-retry. Do not build the monitoring loop without this.
4. **Stale position tracking / PnL miscalculation** — On first wallet import, fetch and paginate full history before calculating any metrics. Track `history_complete` flag per wallet. Only run scoring on complete-history wallets.
5. **Auto-removal too aggressive during market downturns** — Use rolling 30-day window for score evaluation, require N consecutive low-score cycles before removal, pause auto-removal if >50% of tracked wallets drop simultaneously.

## Implications for Roadmap

Based on research, the build order is dictated by hard dependencies in the data pipeline. Nothing works correctly until the layer below it is solid.

### Phase 1: Data Foundation
**Rationale:** SQLite schema and migration setup is the prerequisite for all other phases. Nothing can be built without a stable data layer.
**Delivers:** Database schema (wallets, swaps, wallet_metrics, token_signals, removal_log), drizzle-orm migrations, WAL mode enabled
**Addresses:** Wallet registry (table stakes), persistence requirement
**Avoids:** SQLite write contention (WAL mode from the start)

### Phase 2: Transaction Parsing
**Rationale:** Every downstream component — detection, scoring, signals — depends on normalized Swap objects. This is the most complex parsing work and must be solid before building on top of it.
**Delivers:** Helius enhanced transaction normalization, DEX-specific parsers (Pump.fun, Raydium, Jupiter, Orca, Meteora), full history import with pagination, `history_complete` flag
**Addresses:** Transaction parsing, position tracking (FIFO), DEX identification
**Avoids:** Stale position tracking pitfall (full history before metrics), DEX parsing fragility (separate parsers per DEX, log unrecognized types)
**Research flag:** Needs deeper research — each DEX has distinct instruction layouts, Helius API pagination behavior needs validation

### Phase 3: Bundle/Scam Detection
**Rationale:** Detection gates scoring. Without it, scam wallets contaminate scores and corrupt signals. Must be built before any scoring layer.
**Delivers:** Slot-clustering detector, deployer linkage checker, sniper pattern detector, wash trade detector, tiered confidence output (suspected/review/confirmed)
**Addresses:** Bundle/scam detection (table stakes gate)
**Avoids:** False-positive bundle detection pitfall (tiered confidence model, never remove on "suspected" alone)
**Research flag:** Needs deeper research — false-positive risk is high, heuristics need careful tuning, Helius instruction data format for each check needs validation

### Phase 4: Metrics and Scoring
**Rationale:** Metrics and scoring depend on parsed swaps and detection results. Only clean wallets (passed detection) get scored. This is the core intelligence of the system.
**Delivers:** WalletMetrics calculation (PnL, win rate, Sharpe-like ratio, drawdown, recency), WalletScore 0-100 with weighted components
**Addresses:** Win rate, realized PnL, risk-adjusted return, recency weighting (all table stakes)
**Avoids:** Win rate gaming pitfall (risk-adjusted return at 40%+ weight), ensures bundler-style wallets score low

### Phase 5: Monitoring Loop and Auto-Removal
**Rationale:** The monitoring loop is the operational heart of the system. It orchestrates phases 2-4 on a schedule. Auto-removal is included here because it depends directly on scoring being stable.
**Delivers:** node-cron 30s loop, p-queue rate limiting (max 5 concurrent Helius calls), incremental fetching (last_checked_at), auto-removal (score decay, detection flag, inactivity) with audit log
**Addresses:** Persistent monitoring, auto-removal (differentiator)
**Avoids:** Helius rate limit exhaustion (p-queue from day one), auto-removal too aggressive (rolling window + market context check)

### Phase 6: Token Signal Engine
**Rationale:** Signal engine depends on stable wallet scores from phase 4/5. This is the primary output of the system — what translates wallet intelligence into actionable buy signals.
**Delivers:** Per-token signal score (smart wallet count, buy velocity 1h, exit pressure, weighted composite), token_signals table updated each cycle, wallet independence check to discount coordinated signals
**Addresses:** Smart wallet accumulation count, buy velocity, exit pressure, composite score (all table stakes)
**Avoids:** Token signal false positives from coordinated manipulation (wallet independence check)

### Phase 7: API, Dashboard, and Telegram Alerts
**Rationale:** Frontend and alerts depend on signal engine output. These are the delivery layer — the user-facing surfaces built on top of the data pipeline.
**Delivers:** Fastify REST API (wallets, signals, events SSE), HTMX + Alpine.js dashboard (signal feed, wallet list, wallet drill-down), grammy Telegram bot (threshold alerts with dedup, /status /top /wallet commands)
**Addresses:** Dashboard (table stakes), Telegram push alerts (table stakes)
**Avoids:** Alert fatigue (rate limit per token, 1h dedup window)
**Research flag:** Standard patterns — Fastify SSE, grammy long-polling, HTMX SSE integration are all well-documented

### Phase 8: Wallet Discovery
**Rationale:** Discovery is the key differentiator but depends on transaction parsing and scoring being fully operational to evaluate candidates. Adding low-quality wallets before detection/scoring works would corrupt the signal list.
**Delivers:** Token-CA-based candidate extraction (early buyers who profited), scoring gate (>70 to add), probation period (7 days, excluded from signals), graph traversal discovery
**Addresses:** Auto-discovery (differentiator)
**Avoids:** Discovery pollution pitfall (probation period + scoring gate before admission)
**Research flag:** Needs deeper research — graph traversal at scale, Helius API limits for bulk buyer extraction, probation logic implementation

### Phase Ordering Rationale

- Phases 1-4 are strictly dependency-ordered: no phase can start before its predecessor is stable. This is non-negotiable.
- Phase 5 (monitoring loop) wraps phases 2-4 in a scheduling harness. It cannot be built until parsing, detection, and scoring work in isolation.
- Phase 6 (signals) depends on phase 5 producing reliable scores per cycle.
- Phase 7 (API/dashboard/Telegram) is the delivery layer and can be partially scaffolded during phase 5-6 but cannot show real data until signals exist.
- Phase 8 (discovery) is isolated enough to develop last without blocking any other phase.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Transaction Parsing):** Each DEX has distinct instruction layouts. Helius enhanced transaction format for each DEX needs hands-on validation. Pagination behavior under rate limits needs testing.
- **Phase 3 (Bundle Detection):** Heuristics are high false-positive risk. Real transaction data needed to tune clustering thresholds. Helius instruction-level data availability for funding source tracing needs validation.
- **Phase 8 (Wallet Discovery):** Graph traversal at scale is non-trivial. Helius API limits for fetching all buyers of a token within a time window need validation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** SQLite + drizzle-orm setup is well-documented. WAL mode is standard config.
- **Phase 7 (API/Dashboard/Telegram):** Fastify SSE, grammy long-polling, HTMX SSE are all standard patterns with good documentation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All choices are well-documented libraries with clear rationale. No experimental dependencies. |
| Features | HIGH | Well-defined domain. Reference tools (Cielo, gmgn.ai, Photon, Birdeye) provide clear feature benchmarks. Dependency chain is explicit. |
| Architecture | HIGH | Pipeline architecture is standard for this domain. Component boundaries are clean. Build order is driven by hard data dependencies, not preference. |
| Pitfalls | HIGH | Pitfalls are specific and actionable with concrete prevention strategies. Rate limit math is validated against known Helius free-tier limits. |

**Overall confidence:** HIGH

### Gaps to Address

- **DEX instruction layout specifics:** Each DEX (Pump.fun, Raydium, Jupiter, Orca, Meteora) has different Helius enhanced transaction structure. Exact field paths need to be validated against live Helius API responses during Phase 2 implementation.
- **Bundle detection thresholds:** The clustering thresholds (same block + shared funding = bundle) need tuning against real transaction data. Initial values will likely need adjustment after seeing real false-positive rates.
- **Helius free-tier behavior under sustained load:** The 300 req/min limit is documented but behavior at the limit (429 response format, retry-after headers) needs to be tested during Phase 5 implementation.
- **Signal score weights:** The formula (`holders × 0.35 + velocity × 0.30 + pnl_weight × 0.25 + exit_penalty × -0.10`) is a starting hypothesis. Weights will need calibration once real signals can be back-checked against token outcomes.

## Sources

### Primary (HIGH confidence)
- Helius enhanced transactions API (existing integration in codebase) — transaction parsing, rate limits
- grammy documentation — Telegram bot setup, long-polling mode
- Fastify documentation — SSE support, schema validation
- drizzle-orm documentation — SQLite adapter, migrations
- HTMX documentation — SSE integration pattern

### Secondary (MEDIUM confidence)
- Reference tool analysis (Cielo Finance, gmgn.ai, Photon, Bullx, Birdeye) — feature benchmarking, UX patterns
- Solana on-chain data patterns — bundle detection heuristics, slot-level transaction clustering
- p-queue / p-retry npm documentation — rate limiting patterns

### Tertiary (LOW confidence)
- Signal score formula weights — initial hypothesis, needs calibration against real outcomes
- Bundle detection thresholds — informed estimates, needs empirical tuning

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
