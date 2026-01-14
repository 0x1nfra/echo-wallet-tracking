# Echo

Solana wallet scoring system for tracking profitable memecoin traders.

## What is Echo?

Echo analyzes Solana wallet trading performance and categorizes traders by behavior patterns. It helps you identify profitable wallets to track for memecoin trading on Axiom.

## Features

- 📊 **Score wallets 0-100** based on profitability, consistency, and risk management
- 🏷️ **Auto-categorize traders** into 6 types: Smart Money, Whales, Snipers, Emerging, Degens, KOLs
- 📈 **30+ metrics** including P&L, win rate, ROI, Sharpe ratio, max drawdown
- 📤 **Export to Axiom** in ready-to-import JSON format
- ⚡ **Fast analysis** - score a wallet in <30 seconds

## Quick Start

### Prerequisites

- Node.js v18+
- pnpm (`npm install -g pnpm`)
- Helius API key (free tier: https://helius.dev)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd echo

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env and add your HELIUS_API_KEY
```

### Usage

```bash
# Score a single wallet
pnpm run score --wallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Score multiple wallets from file
pnpm run score --file wallets.txt

# Export to Axiom format
pnpm run score --file wallets.txt --export --output axiom-import.json
```

## Project Status

**Current Phase:** Phase 1 - Building the scoring engine

- [x] Project setup
- [ ] Transaction fetcher
- [ ] Transaction parser
- [ ] PnL calculator
- [ ] Metrics engine
- [ ] Categorization system
- [ ] Scoring algorithm
- [ ] Export to JSON
- [ ] CLI interface

**Next Phase:** Phase 2 - Automated wallet discovery

## Documentation

- 📖 [Overview](docs/overview.md) - What Echo does and why
- 🏗️ [Architecture](docs/architecture.md) - How the system works
- 📋 [Schemas](docs/schemas.md) - TypeScript types and interfaces
- 🏷️ [Categories](docs/categories.md) - Wallet classification rules
- 📊 [Metrics](docs/metrics.md) - What each metric means
- ⚙️ [Configuration](docs/configuration.md) - Config options
- 💻 [CLI Usage](docs/cli.md) - Command-line examples
- 🛠️ [Development](docs/development.md) - Setup and contribution guide

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
