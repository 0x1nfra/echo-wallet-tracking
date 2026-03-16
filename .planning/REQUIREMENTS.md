# Requirements: Echo Wallet Tracker

**Defined:** 2026-03-11
**Core Value:** Know what smart money is doing before the crowd — with noise filtered out

## v1 Requirements

### Data Foundation

- [x] **DATA-01**: System persists wallet registry, swap history, metrics, signals, and removal log to SQLite
- [x] **DATA-02**: Database uses WAL mode to allow concurrent reads during monitoring loop writes
- [x] **DATA-03**: User can add a wallet to the tracker by address with optional label
- [x] **DATA-04**: User can remove a wallet from the tracker
- [x] **DATA-05**: User can view all tracked wallets with current score and status

### Transaction Parsing

- [x] **PARS-01**: System normalizes Helius enhanced transactions into Swap objects for Pump.fun, Raydium, Jupiter, Orca, and Meteora
- [x] **PARS-02**: System fetches and paginates full transaction history on first wallet import before calculating any metrics
- [x] **PARS-03**: System uses FIFO cost basis to track positions and calculate realized PnL per closed trade

### Bundle/Scam Detection

- [x] **DETC-01**: System detects bundler wallets (same-block coordinated buys from wallets sharing a funding source)
- [x] **DETC-02**: System detects dev wallets (wallet received tokens directly from the token deployer address)
- [x] **DETC-03**: System detects sniper bots (wallet consistently buys in first 2-3 blocks of token launches)
- [x] **DETC-04**: System detects wash traders (circular trades between related wallets)
- [x] **DETC-05**: System applies tiered confidence to detection (suspected → review → confirmed) before flagging a wallet
- [x] **DETC-06**: Only wallets with passing detection status are eligible for scoring

### Wallet Scoring

- [x] **SCOR-01**: System calculates wallet metrics: win rate, realized PnL in SOL, risk-adjusted return (Sharpe-like ratio), max drawdown, and recency score
- [x] **SCOR-02**: System produces a 0-100 wallet score weighted: risk-adjusted return (40%), win rate (20%), consistency and recency (20%), activity health (20%)
- [x] **SCOR-03**: System only scores wallets with complete transaction history and confirmed-passing detection status

### Monitoring Loop

- [x] **MNTR-01**: System polls all tracked wallets on a ~30-second cycle
- [x] **MNTR-02**: System uses incremental fetching per wallet (only transactions since last_checked_at) after first import
- [x] **MNTR-03**: System rate-limits all Helius API calls (max 5 concurrent, exponential backoff on 429 responses)

### Auto-Removal

- [x] **RMVL-01**: System automatically removes a wallet when its score falls below threshold over a rolling 30-day window for N consecutive cycles
- [x] **RMVL-02**: System automatically removes a wallet when bundle/scam detection reaches "confirmed" confidence level
- [x] **RMVL-03**: System automatically removes a wallet after configurable days of inactivity (no trades)
- [x] **RMVL-04**: System logs all removals with reason, timestamp, and detection details — removals are auditable and reversible

### Token Signal Engine

- [x] **SGNL-01**: System computes a per-token signal score (0-100) based on: count of smart wallets holding, buy velocity in last 1h, exit pressure from sells, and PnL-weighted holder score
- [x] **SGNL-02**: System updates all token signals after each monitoring cycle completes
- [x] **SGNL-03**: System discounts a token's signal score when its holders appear coordinated (share a common funding source)

### Web Dashboard

- [x] **DASH-01**: User can view a live token signal feed sorted by signal score
- [x] **DASH-02**: User can view all tracked wallets with their current score, detection status, and last active time
- [x] **DASH-03**: User can drill into a wallet to see recent trades, score breakdown, and detection flags
- [x] **DASH-04**: Dashboard receives live score updates via SSE without manual page refresh

### Telegram Bot

- [x] **TGRM-01**: User receives a Telegram alert when a token signal score crosses a configured threshold
- [x] **TGRM-02**: System deduplicates alerts — no more than 1 alert per token per 2 hours
- [x] **TGRM-03**: User can query the bot with /status, /top (top current signals), and /wallet <address>

### Wallet Discovery

- [x] **DISC-01**: User can trigger discovery from a token contract address to extract wallets that bought early and profited
- [x] **DISC-02**: System scores each candidate wallet and only adds those scoring above 70
- [x] **DISC-03**: Newly discovered wallets enter 7-day probation status and are excluded from signal scoring during probation
- [x] **DISC-04**: System discovers additional wallet candidates via graph traversal (wallets that co-traded with known smart money)

## v2 Requirements

### Signal Quality

- **QUAL-01**: System logs token outcomes after each signal fires (did the token pump or dump?)
- **QUAL-02**: System tracks signal accuracy rate over time (% of high-score signals that resulted in price increases)
- **QUAL-03**: System supports manual score weight calibration based on historical signal outcomes

### Commercialization

- **COMM-01**: Telegram bot supports multiple subscribers (multi-user signal delivery)
- **COMM-02**: User management (add/remove Telegram subscribers)
- **COMM-03**: Tiered alert thresholds per subscriber

## Out of Scope

| Feature | Reason |
|---------|---------|
| Copy-trade execution | Signals only — user executes manually |
| SaaS web platform with auth | Validate logic first; Telegram bot is the simpler commercial path |
| Backtesting UI | Not needed to validate signal quality |
| Social graph visualization | Nice to have, not signal-critical |
| MEV / sandwich detection | Complex, out of scope for memecoin signal use case |
| NFT wallet tracking | Memecoin focus only |
| WebSocket streaming | ~30s polling is sufficient; avoids Helius WS API costs |
| Multi-user web dashboard | Personal tool in v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| PARS-01 | Phase 2 | Complete |
| PARS-02 | Phase 2 | Complete |
| PARS-03 | Phase 2 | Complete |
| DETC-01 | Phase 3 | Complete |
| DETC-02 | Phase 3 | Complete |
| DETC-03 | Phase 3 | Complete |
| DETC-04 | Phase 3 | Complete |
| DETC-05 | Phase 3 | Complete |
| DETC-06 | Phase 3 | Complete |
| SCOR-01 | Phase 4 | Complete |
| SCOR-02 | Phase 4 | Complete |
| SCOR-03 | Phase 4 | Complete |
| MNTR-01 | Phase 5 | Complete |
| MNTR-02 | Phase 5 | Complete |
| MNTR-03 | Phase 5 | Complete |
| RMVL-01 | Phase 5 | Complete |
| RMVL-02 | Phase 5 | Complete |
| RMVL-03 | Phase 5 | Complete |
| RMVL-04 | Phase 5 | Complete |
| SGNL-01 | Phase 6 | Complete |
| SGNL-02 | Phase 6 | Complete |
| SGNL-03 | Phase 6 | Complete |
| DASH-01 | Phase 7 | Complete |
| DASH-02 | Phase 7 | Complete |
| DASH-03 | Phase 7 | Complete |
| DASH-04 | Phase 7 | Complete |
| TGRM-01 | Phase 7 | Complete |
| TGRM-02 | Phase 7 | Complete |
| TGRM-03 | Phase 7 | Complete |
| DISC-01 | Phase 8 | Complete |
| DISC-02 | Phase 8 | Complete |
| DISC-03 | Phase 8 | Complete |
| DISC-04 | Phase 8 | Complete |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after initial definition*
