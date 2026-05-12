**Why this project exists**

Tracking profitable wallets is a core edge in memecoin trading, but verifying wallet quality across multiple data sources is slow and fragmented. I built Echo to automate that — it started as a simple wallet scorer and evolved into a full signal engine that continuously screens wallets and surfaces buy signals when tracked traders converge on the same token.

---

Echo is production-ready (v0.1.0). It scores Solana wallets 0–100 using 30+ metrics — P&L, win rate, Sharpe ratio, max drawdown — classifies them into six trader archetypes (Smart Money, Whale, Sniper, Emerging, Degen, KOL), and fires token buy signals when tracked wallets accumulate the same coin. The stack is TypeScript, Fastify, SQLite/Drizzle ORM, and the Helius + Shyft transaction APIs, with a grammy Telegram bot and a live SSE-powered web dashboard. The standout engineering decision is the graph-traversal wallet discovery engine: given a successful token, it finds who bought early, scores those wallets, and recursively surfaces new targets — turning a static watchlist into a self-expanding signal network.

# Echo

Solana wallet scoring system for tracking profitable memecoin traders.

## What is Echo?

Echo analyzes Solana wallet trading performance and categorizes traders by behavior patterns. It helps you identify profitable wallets to track for memecoin trading on Axiom.

## Features

- **Score wallets 0-100** based on profitability, consistency, and risk management
- **Auto-categorize traders** into 6 types: Smart Money, Whales, Snipers, Emerging, Degens, KOLs
- **30+ metrics** including P&L, win rate, ROI, Sharpe ratio, max drawdown
- **Token signals** — fires alerts when tracked wallets converge on the same coin
- **Wallet discovery** — graph-traversal finds new profitable wallets automatically
- **Telegram bot** with real-time alerts and accuracy tracking
- **Web dashboard** with live SSE updates at `http://localhost:3000`

## Quick Start

### Prerequisites

- Node.js v18+
- pnpm (`npm install -g pnpm`)
- Helius API key (free tier: https://helius.dev)

### Installation

```bash
git clone <your-repo-url>
cd echo

pnpm install

cp .env.example .env
# Edit .env and add your HELIUS_API_KEY
```

### Usage

```bash
# Start server (dashboard + Telegram bot + monitor loop)
pnpm dev

# Add a wallet to track
pnpm echo wallet add 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Add with label and full history
pnpm echo wallet add 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU --label "alpha-whale" --full-history

# List tracked wallets
pnpm echo wallet list

# Remove a wallet
pnpm echo wallet remove 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# View active token signals
pnpm echo signal list --limit 20
```

## Project Status

**v0.1.0** — completed. All core systems shipped: scoring engine, signal generation with accuracy tracking, graph-traversal wallet discovery, multi-provider transaction routing (Helius + Shyft), bad-actor detection (bundlers, wash traders, snipers, dev wallets), monitoring loop, Telegram bot, and web dashboard.

## Documentation

- [Overview](docs/overview.md) - What Echo does and why
- [Architecture](docs/architecture.md) - How the system works
- [Schemas](docs/schemas.md) - TypeScript types and interfaces
- [Categories](docs/categories.md) - Wallet classification rules
- [Metrics](docs/metrics.md) - What each metric means
- [Configuration](docs/configuration.md) - Config options
- [CLI Usage](docs/cli.md) - Command-line examples
- [Development](docs/development.md) - Setup and contribution guide

## Development

```bash
# Run in dev mode (auto-reload)
pnpm run dev

# Build TypeScript
pnpm run build

# Run tests
pnpm run test

# Type check
pnpm run type-check

# Lint
pnpm run lint

# Format code
pnpm run format
```

## License

MIT
