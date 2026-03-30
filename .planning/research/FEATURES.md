# Features Research: Solana Memecoin Wallet Tracking

**Domain:** Smart money tracking, copy-trade signals, bundle detection
**Date:** 2026-03-11
**Reference tools:** Cielo Finance, gmgn.ai, Photon, Bullx, Birdeye

## Table Stakes (Must Have)

### Wallet Registry
- **Track wallet list**: Add/remove wallets, label them (complexity: low)
- **Wallet metadata**: address, label, date added, current score, last active (complexity: low)
- **Persistent storage**: Survives restarts, queryable (complexity: low)

### Transaction Parsing
- **Swap normalization**: Convert Helius raw tx to Buy/Sell swap with token, amount, price, timestamp (complexity: medium)
- **DEX identification**: Raydium, Jupiter, Pump.fun, Orca, Meteora — each has different instruction format (complexity: medium)
- **Position tracking**: Match buys to sells per token to calculate realized PnL per trade (complexity: high)

### Wallet Scoring
- **Win rate**: % of closed positions that are profitable (complexity: low)
- **Realized PnL**: Total profit in SOL/USD across all trades (complexity: medium)
- **Risk-adjusted return**: Sharpe-like ratio — returns / volatility. Penalizes high variance even if profitable (complexity: medium)
- **Recency weighting**: Recent performance weighted more than old (complexity: low)

### Bundle/Scam Detection (Gate)
- **Bundler detection**: Multiple wallets buying same token in same block/slot (complexity: high)
- **Dev wallet detection**: Wallet received tokens from deployer address (complexity: medium)
- **Sniper bot detection**: Consistently buys in first 2-3 blocks of token launch (complexity: medium)
- **Wash trader detection**: Circular trades between related wallets (complexity: high)

### Token Signal Engine
- **Smart wallet accumulation count**: How many tracked wallets hold a token (complexity: low)
- **Buy velocity**: Tracked wallets buying in last 30m/1h/4h windows (complexity: low)
- **Exit pressure**: Tracked wallets selling — early warning signal (complexity: low)
- **Composite score**: Weighted combination → 0-100 buy signal score (complexity: medium)

### Alerts
- **Telegram push**: Alert when signal score crosses threshold (complexity: low)
- **Alert deduplication**: Don't spam same token repeatedly (complexity: low)

### Dashboard
- **Token signal table**: Sorted by signal score, live-updating (complexity: medium)
- **Wallet table**: All tracked wallets with current score, status (complexity: low)
- **Wallet drill-down**: Recent trades, score breakdown, detection status (complexity: medium)

## Differentiators (Competitive Advantage)

### Auto-Discovery
- **Top traders from token**: Given a token CA, extract wallets that bought early and profited (complexity: high)
  - Dependency: transaction parsing + scoring must work first
- **Graph traversal**: Find wallets that frequently traded alongside known smart money (complexity: very high)
- **KOL seeding**: Seed with known alpha wallets, then discover similar (complexity: medium)

### Auto-Removal
- **Score decay removal**: Wallet score drops below threshold over rolling window (complexity: medium)
- **Scam detection removal**: Bundle/scam flag triggers automatic removal (complexity: low, depends on detection)
- **Inactivity removal**: No trades in configurable N days (complexity: low)
- **Removal audit log**: Track why wallets were removed, reversible (complexity: low)

### Signal Quality Tracking
- **Signal accuracy log**: Track what happened to tokens after signal fired (complexity: high)
- **Score calibration**: Adjust weights based on historical signal outcomes (complexity: very high)

## Anti-Features (Do NOT Build in v1)

| Feature | Why Not |
|---------|---------|
| Copy-trading execution | Out of scope — signals only, user executes manually |
| Real-time WebSocket streaming | ~30s polling sufficient, avoids Helius WebSocket API costs |
| Multi-user / SaaS | Personal tool only |
| Backtesting UI | Interesting but not needed for signal generation |
| Social graph visualization | Nice to have, not signal-critical |
| MEV/sandwich detection | Complex, niche, out of scope |
| NFT wallet tracking | Memecoin focus only |

## Feature Dependencies

```
Transaction Parsing
  └── Metrics Calculation
        └── Bundle Detection (uses timing + clustering)
              └── Wallet Scoring (only clean wallets)
                    └── Token Signal Engine (aggregates wallet scores)
                          └── Dashboard + Telegram Alerts
                                └── Auto-Removal (uses scores + detection)

Wallet Discovery (Auto)
  └── Requires: Transaction Parsing + Scoring (must work first)
```

## Complexity Notes

- **Hardest**: Bundle detection (false positive risk high), graph traversal discovery, signal accuracy tracking
- **Medium**: Position tracking (matching buys to sells across time), DEX-specific parsing, composite signal scoring
- **Easy**: Wallet registry, alerts, dashboard rendering, auto-removal triggers
