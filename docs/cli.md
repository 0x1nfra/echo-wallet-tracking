# Echo - CLI Usage Guide

How to use Echo from the command line.

## Installation

```bash
# Clone repository
git clone <your-repo-url>
cd echo

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env and add your HELIUS_API_KEY
```

## Basic Commands

### Score a Single Wallet

```bash
pnpm run score --wallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

**Output:**

```
Analyzing wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 WALLET SCORE: 87/100 (Excellent)
🏷️  CATEGORY: Smart Money

💰 PROFITABILITY
   Total P&L:        +452.3 SOL
   ROI:              +234%
   Win Rate:         68.5%
   Profit Factor:    2.8

📈 PERFORMANCE
   Last 7 Days:      +45.2 SOL
   Last 30 Days:     +178.9 SOL
   Last 90 Days:     +452.3 SOL
   Consistency:      85%

🎯 TRADING STATS
   Total Trades:     73
   Tokens Traded:    45
   Avg Hold Time:    48.3 hours
   Trades/Day:       2.4

⚠️  RISK METRICS
   Max Drawdown:     15.2%
   Sharpe Ratio:     1.8
   Largest Loss:     -25.0 SOL

✅ Export to JSON? (Y/n)
```

---

### Score Multiple Wallets

**From file:**

```bash
pnpm run score --file wallets.txt
```

**wallets.txt format:**

```
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
9xKWtg3DX98e18TYJSDpbE6kClfeTrB94UASvKpthBtV
5yLYuh4FY09f29UZKTEqcG7mDkgfUuC05VBTwLqujCtW
```

**Output:**

```
Scoring 3 wallets...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/3] 7xKXtg... ✓ Score: 87 (Smart Money)
[2/3] 9xKWtg... ✓ Score: 72 (Whale)
[3/3] 5yLYuh... ✓ Score: 45 (Unclassified)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary:
- Total wallets: 3
- Avg score: 68
- Categories: Smart Money (1), Whale (1), Unclassified (1)

Export results? (Y/n)
```

---

## Advanced Options

### Custom Time Period

```bash
# Analyze last 30 days only
pnpm run score --wallet <address> --days 30

# Analyze last 7 days
pnpm run score --wallet <address> --days 7
```

---

### Verbose Mode

```bash
# Show detailed breakdown
pnpm run score --wallet <address> --verbose
```

**Verbose output includes:**

- Complete transaction history
- Individual trade P&L
- Position details
- All metric calculations
- Category reasoning

---

### Filter Results

```bash
# Only show wallets with score >70
pnpm run score --file wallets.txt --min-score 70

# Filter by category
pnpm run score --file wallets.txt --category smart_money

# Filter by win rate
pnpm run score --file wallets.txt --min-win-rate 65

# Combine filters
pnpm run score --file wallets.txt --min-score 70 --category smart_money,whale
```

---

### Export Options

```bash
# Export to Axiom JSON format
pnpm run score --file wallets.txt --export --output top-traders.json

# Export to CSV
pnpm run score --file wallets.txt --export --format csv --output traders.csv

# Export with full transaction history
pnpm run score --file wallets.txt --export --include-transactions
```

---

## Interactive Mode

```bash
pnpm run score
```

**Prompts:**

```
? What would you like to do?
  > Score a single wallet
    Score multiple wallets from file
    Score and export top performers
    Test with sample wallets

? Enter wallet address:
> 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

? Analysis period:
  > Last 90 days (default)
    Last 30 days
    Last 7 days
    Custom

? Export results?
  > Yes, to Axiom JSON
    Yes, to CSV
    No, just show on screen
```

---

## Testing Mode

### Test with Sample Wallets

```bash
pnpm run test:scoring
```

Runs Echo against 10-20 known wallets in `data/test-wallets.json` and validates accuracy.

---

## Configuration

### Override Config

```bash
# Use custom config file
pnpm run score --config ./my-config.ts --wallet <address>

# Override specific settings
pnpm run score --wallet <address> --min-trades 20 --lookback-days 60
```

---

## Common Workflows

### 1. Research New Wallets

```bash
# Get a list of wallets from somewhere (Twitter, on-chain data, etc.)
# Save to wallets.txt

# Score them all
pnpm run score --file wallets.txt

# Filter to top performers
pnpm run score --file wallets.txt --min-score 75

# Export for Axiom
pnpm run score --file wallets.txt --min-score 75 --export --output axiom-import.json
```

---

### 2. Monitor Existing Tracked Wallets

```bash
# Score your current tracked wallets
pnpm run score --file my-tracked-wallets.txt

# Check recent performance only
pnpm run score --file my-tracked-wallets.txt --days 7

# Identify declining performers
pnpm run score --file my-tracked-wallets.txt --verbose | grep "trending_down"
```

---

### 3. Find Category-Specific Traders

```bash
# Find only Smart Money wallets
pnpm run score --file candidates.txt --category smart_money --export

# Find Snipers
pnpm run score --file candidates.txt --category sniper --export

# Find Whales with high scores
pnpm run score --file candidates.txt --category whale --min-score 80
```

---

## Output Formats

### Console (Default)

Pretty-printed with colors and tables. Best for quick analysis.

### JSON

```bash
pnpm run score --wallet <address> --format json --output wallet.json
```

**Structure:**

```json
{
  "wallet": "7xKXtg...",
  "score": 87,
  "category": {
    "primary": "smart_money",
    "confidence": 0.92
  },
  "metrics": { ... },
  "analyzedAt": "2024-12-23T10:30:00Z"
}
```

### CSV

```bash
pnpm run score --file wallets.txt --format csv --output traders.csv
```

**Columns:**

```
address,score,category,total_pnl,roi,win_rate,total_trades,avg_hold_hours
```

### Axiom JSON

```bash
pnpm run score --file wallets.txt --format axiom_json --output axiom.json
```

Ready to import directly into Axiom.

---

## Performance Tips

### Parallel Processing

```bash
# Score 100 wallets in parallel (uses 10 workers)
pnpm run score --file wallets.txt --parallel 10
```

### Cache Results

```bash
# Enable caching (default: 1 hour)
pnpm run score --wallet <address> --cache

# Force refresh (bypass cache)
pnpm run score --wallet <address> --no-cache
```

---

## Troubleshooting

### API Rate Limit

```
Error: Helius API rate limit exceeded
```

**Solution:**

- Wait a few minutes
- Enable caching: `--cache`
- Reduce parallel workers: `--parallel 5`
- Upgrade Helius plan

---

### Insufficient Data

```
Warning: Wallet has only 8 trades (minimum: 10)
Category: Unclassified
```

**Solution:**

- Lower minimum trades: `--min-trades 5`
- Or wait for wallet to accumulate more trades

---

### Transaction Parse Errors

```
Warning: Could not parse 3 transactions
```

**Solution:**

- Check `--verbose` output to see which transactions failed
- Usually safe to ignore (failed/reverted transactions)
- Report if consistent issues with a DEX

---

## Environment Variables

```bash
# Required
HELIUS_API_KEY=your_key_here

# Optional
SOLANA_RPC=https://api.mainnet-beta.solana.com
OUTPUT_DIR=./exports
CACHE_DIR=./data/cache
LOG_LEVEL=info  # debug, info, warn, error
```

---

## Development Commands

```bash
# Run in dev mode (auto-reload)
pnpm run dev

# Build TypeScript
pnpm run build

# Run built version
pnpm run start

# Type check
pnpm run type-check

# Lint
pnpm run lint

# Format code
pnpm run format

# Run tests
pnpm run test
```

---

## Next Steps

- See [development.md](development.md) for setup
- See [configuration.md](configuration.md) for config options
- See [metrics.md](metrics.md) to understand the numbers
