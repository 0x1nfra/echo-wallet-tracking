# Architecture Research: Echo Wallet Tracker

**Domain:** Solana wallet monitoring system with signal generation
**Date:** 2026-03-11

## Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        MONITORING LOOP (node-cron, ~30s)         │
│  For each tracked wallet → fetch recent txs → parse → update     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │         DATA PIPELINE                │
            │  Fetch → Parse → Detect → Score      │
            └──────────────────┬──────────────────┘
                               │
     ┌─────────────────────────▼──────────────────────────┐
     │                    SQLite DB                        │
     │  wallets | swaps | metrics | signals | removal_log  │
     └──────┬──────────────────────────────────┬──────────┘
            │                                  │
     ┌──────▼──────┐                   ┌───────▼──────────┐
     │  Fastify API │                  │  Signal Engine   │
     │  + SSE push  │                  │  (token scores)  │
     └──────┬──────┘                   └───────┬──────────┘
            │                                  │
     ┌──────▼──────┐                   ┌───────▼──────────┐
     │  Dashboard  │                   │  Telegram Bot    │
     │  (HTMX/SSE) │                   │  (grammy)        │
     └─────────────┘                   └──────────────────┘
```

## Components

### 1. Monitoring Loop (`src/monitor/loop.ts`)
- **Trigger**: node-cron every 30s
- **Logic**: Fetch all tracked wallets from DB → for each, fetch transactions since last_checked_at → push through pipeline → update DB
- **Rate limiting**: p-queue wraps all Helius calls (max 5 concurrent, respects 300 req/min)
- **State**: Tracks `last_checked_at` per wallet in DB to fetch only new txs (incremental)

### 2. Data Pipeline

**Parser** (`src/parsers/helius.ts`)
- Input: Helius raw enhanced transactions
- Output: Normalized Swap[] objects (token, amount, price, timestamp, dex, type: BUY/SELL)
- DEX routing: Pump.fun, Raydium, Jupiter aggregator, Orca, Meteora each have distinct instruction layouts

**Bundle/Scam Detector** (`src/detection/`)
- Input: Swap history for a wallet + cross-wallet clustering data
- Output: `DetectionResult { isFlagged: boolean, reasons: string[], confidence: number }`
- Checks: slot-clustering (bundlers buy same block), deployer linkage (dev wallets), snipe pattern (first 3 blocks), circular flows (wash trading)
- **Gate**: Only wallets that PASS detection proceed to scoring

**Metrics Calculator** (`src/calculators/`)
- Input: Swap[] for a wallet
- Output: WalletMetrics (PnL, win rate, Sharpe, drawdown, avg hold duration, recency score)
- Position matching: FIFO cost basis — buys stack, sells consume from oldest buy

**Scorer** (`src/scoring/`)
- Input: WalletMetrics
- Output: WalletScore 0-100
- Weights: risk-adjusted return (40%), win rate (20%), consistency/recency (20%), activity health (20%)
- Win rate alone insufficient — risk-adjusted return catches high-variance bundler-style wallets

### 3. SQLite Schema (key tables)

```sql
wallets (address, label, status, score, added_at, last_active_at, last_checked_at, detection_flags)
swaps (id, wallet_address, token_mint, type, amount_sol, price_usd, timestamp, dex, slot)
wallet_metrics (wallet_address, win_rate, total_pnl_sol, sharpe_ratio, max_drawdown, updated_at)
token_signals (token_mint, symbol, score, smart_wallet_count, buy_velocity_1h, exit_pressure, updated_at)
removal_log (wallet_address, reason, removed_at, was_flagged, details)
```

### 4. Token Signal Engine (`src/signals/`)
- Runs after each monitoring cycle
- For each token held by ≥1 tracked wallet: compute signal score
- Inputs: smart wallet count holding token, buy velocity (new buys in last 1h), exit pressure (sells in last 1h), avg PnL weight of holders
- Score formula: `(holders_score × 0.35) + (velocity_score × 0.30) + (pnl_weight_score × 0.25) + (exit_penalty × -0.10 × 100)`
- Persists to `token_signals` table

### 5. Fastify API (`src/api/`)
- `GET /api/signals` — top token signals sorted by score
- `GET /api/wallets` — all tracked wallets with scores
- `GET /api/wallets/:address` — wallet detail + recent trades
- `GET /api/events` — SSE endpoint for real-time dashboard updates
- `POST /api/wallets` — manually add wallet
- `POST /api/discover` — trigger wallet discovery from token CA

### 6. Dashboard (`src/dashboard/`)
- Static HTML + HTMX + Alpine.js served by Fastify
- Pages: Signal Feed, Wallet List, Wallet Detail
- SSE connection for live score updates without polling

### 7. Telegram Bot (`src/telegram/`)
- grammy bot, long-polling mode (no webhook needed for personal use)
- Alerts: fires when token signal score crosses configured threshold (e.g., >75)
- Dedup: don't re-alert same token within 1h
- Commands: `/status`, `/top` (top signals), `/wallet <addr>`

### 8. Wallet Discovery (`src/discovery/`)
- **Token-based**: Given token CA → fetch all buyers in first 30min → score each → add those scoring >70
- **Graph traversal**: Given seed wallet → find wallets that bought same tokens within 5 min → cluster → score candidates
- **KOL seeding**: Manual list of known alpha wallets as seed set

## Data Flow: Monitoring Cycle

```
1. node-cron fires (every 30s)
2. Load all active tracked wallets from DB
3. For each wallet (via p-queue, max 5 concurrent):
   a. Fetch txs since last_checked_at from Helius
   b. Parse txs into Swaps, persist to DB
   c. Re-run detection if new suspicious patterns
   d. Recalculate metrics from all swaps (rolling window)
   e. Update score in DB
   f. Check auto-removal rules
4. Run signal engine: recompute token_signals from current wallet state
5. Push SSE event to dashboard clients
6. Check Telegram alert conditions
```

## Build Order (Phase Dependencies)

1. **Database schema + migrations** (prerequisite for everything)
2. **Transaction parsing** (prerequisite for metrics + detection)
3. **Bundle/scam detection** (prerequisite for scoring)
4. **Metrics + scoring** (prerequisite for signals)
5. **Monitoring loop + auto-removal** (needs scoring to work)
6. **Token signal engine** (needs scoring to work)
7. **API + Dashboard** (needs signals + wallet data)
8. **Telegram bot** (needs signal engine)
9. **Wallet discovery** (needs scoring + parsing to validate candidates)

## Persistence Strategy

- **SQLite**: All application state. Single file, trivially backed up.
- **No Redis**: At <500 tracked wallets and 30s cycles, SQLite read performance is more than sufficient.
- **No in-memory cache**: SQLite with indexed queries is fast enough. Add cache only if profiling shows bottleneck.
