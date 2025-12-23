# Echo - Solana Wallet Scoring System

## What is Echo?

Echo is a Node.js/TypeScript tool that analyzes Solana wallet trading performance and categorizes traders by behavior patterns. It helps you identify profitable wallets to track for memecoin trading.

## The Problem

Manual wallet research takes hours. You need to:

- Find profitable traders
- Calculate their performance metrics
- Verify they're consistently good
- Export clean lists for your trading platform (Axiom)

## The Solution

Echo automates all of this:

```
Input: Wallet address(es)
Output: Scored, categorized, Axiom-ready JSON
```

## Development Philosophy

**Build the brain before the eyes.**

- **Phase 1 (Weeks 1-3):** Perfect the scoring engine with 10-20 known wallets
- **Phase 2 (Week 4+):** Add automated discovery to find thousands of wallets

This way, you validate accuracy before scaling.

## Core Features

### Scoring Engine

- Calculate P&L (realized + unrealized)
- 30+ metrics: win rate, ROI, Sharpe ratio, max drawdown, hold times, etc.
- Overall score 0-100 for easy ranking

### Categorization

Automatically classify wallets into 6 types:

- **Smart Money:** Consistently profitable, disciplined (65%+ win rate)
- **Whales:** Large capital deployers (50+ SOL avg trades)
- **Snipers/Bots:** Automated fast traders (<10s entries)
- **Emerging:** New wallets with strong performance (<90 days old)
- **Degens:** High volume, volatile traders (100+ trades/month)
- **KOLs:** Influential traders with public presence

### Export

Axiom-compatible JSON format with all metrics, ready to import

## Tech Stack

- **Node.js + TypeScript** - Type-safe, modern JS
- **pnpm** - Fast package manager
- **Helius API** - Transaction data
- **DexScreener API** - Token prices
- **Joi** - Config validation

## Success Metrics

- P&L accuracy within ±5% of manual verification
- Score a wallet in <30 seconds
- Category assignment matches intuition 80%+ of the time

## Quick Start Timeline

- **Week 1:** Core infrastructure (fetchers, parsers, P&L calculator)
- **Week 2:** Metrics engine, categorization, scoring
- **Week 3:** Testing with real wallets, refinement
- **Week 4:** Polish, CLI improvements, ready to use

## Project Structure

```
echo/
├── docs/           # All documentation (you are here)
├── src/            # Source code
├── tests/          # Unit & integration tests
├── config/         # Configuration files
├── data/           # Test wallets, cache
└── exports/        # Output directory
```

## Documentation Index

1. **[Overview](this file)** - What Echo does and why
2. **[Architecture](architecture.md)** - How the system works
3. **[Data Schemas](schemas.md)** - TypeScript interfaces and types
4. **[Configuration](configuration.md)** - Config options and setup
5. **[Metrics Guide](metrics.md)** - What each metric means
6. **[Category Rules](categories.md)** - How wallets are classified
7. **[CLI Usage](cli.md)** - How to run Echo
8. **[Development](development.md)** - Setup and contribution guide

## Next Steps

1. Read [Architecture](architecture.md) to understand how Echo works
2. Check [Configuration](configuration.md) to set up your API keys
3. Review [Development](development.md) to start building
