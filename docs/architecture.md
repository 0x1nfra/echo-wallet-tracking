# Echo - System Architecture

## High-Level Data Flow

```
Input: Wallet Address
  ↓
[Transaction Fetcher] → Helius/DexScreener API
  ↓
[Transaction Parser] → Structured swap data
  ↓
[P&L Calculator] → FIFO accounting, position tracking
  ↓
[Metrics Engine] → Calculate 30+ metrics
  ↓
[Categorization Engine] → Assign category (Smart Money, Whale, etc.)
  ↓
[Scoring System] → Overall score 0-100
  ↓
Output: Scored Wallet Object → Export to JSON
```

## Component Breakdown

### 1. Transaction Fetcher

**Purpose:** Get all transactions for a wallet

**APIs Used:**

- **Helius (Primary):** Enhanced transactions with parsed swap data
- **DexScreener (Prices):** Current token prices for unrealized P&L
- **Solana RPC (Fallback):** Direct on-chain data if APIs fail

**Output:** Raw transaction array with signatures, timestamps, instructions

---

### 2. Transaction Parser

**Purpose:** Extract meaningful swap data from raw transactions

**What it does:**

- Identifies swap transactions (buy/sell on Raydium, Jupiter, Pump.fun, Orca)
- Extracts: token bought/sold, amounts, prices, timestamps
- Filters out: failed transactions, non-swap activity, spam tokens

**Output:** Structured swap history

```typescript
{
  wallet: string;
  swaps: Swap[];
}
```

---

### 3. P&L Calculator

**Purpose:** Calculate profit/loss using FIFO accounting

**How it works:**

- Tracks cost basis for each token bought
- When sold, matches against oldest purchases first (FIFO)
- Calculates realized P&L for closed positions
- Calculates unrealized P&L for open positions using current prices

**Handles:**

- Partial sells (only realize P&L on sold portion)
- Multiple entries at different prices
- Token balance verification

**Output:** Position tracking with realized/unrealized P&L

---

### 4. Metrics Engine

**Purpose:** Calculate all performance metrics

**Metrics Categories:**

**Profitability:**

- Total P&L, ROI, Win Rate, Profit Factor

**Activity:**

- Total trades, Trades/day, Hold times, Token diversity

**Risk:**

- Max Drawdown, Sharpe Ratio, Volatility, Largest loss

**Timing:**

- Early entry rate, Entry speed, Exit discipline

**Time Periods:**

- Last 7/30/90 days P&L, Consistency score

**Output:** Complete metrics object

---

### 5. Categorization Engine

**Purpose:** Classify wallet into one primary category

**Logic:**

```typescript
function categorizeWallet(metrics) {
  // Check most specific patterns first
  if (isSniperBot(metrics)) return "sniper";
  if (isSmartMoney(metrics)) return "smart_money";
  if (isWhale(metrics)) return "whale";
  if (isDegen(metrics)) return "degen";
  if (isEmerging(metrics)) return "emerging";
  if (isKOL(metrics)) return "kol";
  return "unclassified";
}
```

**Output:** Category + confidence + reasoning

---

### 6. Scoring System

**Purpose:** Calculate overall score 0-100 for ranking

**Formula:**

```
Score = Profitability (40%)
      + Consistency (30%)
      + Activity (20%)
      + Recent Performance (10%)
      + Category Bonus
```

**Score Ranges:**

- 90-100: Elite (top 1%)
- 80-89: Excellent (top 5%)
- 70-79: Strong (top 15%)
- 60-69: Above average
- 50-59: Average
- <50: Poor/insufficient data

---

## Project Structure

```
echo/
├── src/
│   ├── types/              # TypeScript interfaces
│   │   ├── wallet.ts
│   │   ├── transaction.ts
│   │   ├── metrics.ts
│   │   └── config.ts
│   │
│   ├── fetchers/           # API wrappers
│   │   ├── helius.ts
│   │   ├── dexscreener.ts
│   │   └── rpc.ts
│   │
│   ├── parsers/            # Transaction parsing
│   │   ├── transaction.ts
│   │   └── swap.ts
│   │
│   ├── calculators/        # P&L logic
│   │   ├── pnl.ts
│   │   └── positions.ts
│   │
│   ├── metrics/            # Metric calculations
│   │   ├── profitability.ts
│   │   ├── risk.ts
│   │   ├── timing.ts
│   │   └── activity.ts
│   │
│   ├── categorization/     # Category logic
│   │   ├── rules.ts
│   │   └── categorizer.ts
│   │
│   ├── scoring/            # Score calculation
│   │   └── scorer.ts
│   │
│   ├── exporters/          # Export formats
│   │   ├── json.ts
│   │   └── axiom.ts
│   │
│   ├── utils/              # Helpers
│   │   ├── cache.ts
│   │   ├── rateLimit.ts
│   │   └── validation.ts
│   │
│   └── index.ts            # Main entry point
│
├── tests/
│   ├── unit/               # Component tests
│   └── integration/        # Full pipeline tests
│
├── config/
│   ├── default.ts          # Default config
│   └── categories.ts       # Category definitions
│
├── data/
│   ├── test-wallets.json   # Known wallets for validation
│   └── cache/              # API response cache
│
└── exports/                # Output directory
```

## Error Handling Strategy

### API Failures

- Retry with exponential backoff (3 attempts)
- Fall back to alternative APIs (DexScreener → Helius → RPC)
- Cache responses to minimize API calls

### Data Issues

- Skip malformed transactions (log warning)
- Handle missing price data gracefully
- Validate wallet addresses before processing

### Rate Limiting

- Track API usage per minute
- Queue requests if approaching limits
- Cache aggressively (1 hour TTL)

## Performance Considerations

### Optimization Targets

- Score 1 wallet: <30 seconds
- Score 100 wallets: <15 minutes (parallel processing)
- Memory usage: <512MB for 100 wallets

### Strategies

- Parallel API requests where possible
- Cache transaction data locally
- Lazy load token prices (only when needed)
- Stream large wallet lists instead of loading all into memory

## Testing Strategy

### Unit Tests

Each component tested in isolation with mocked dependencies

### Integration Tests

Full pipeline with real API responses (cached)

### Validation Tests

Run against 10-20 known wallets, manually verify accuracy

## Next: Data Schemas

See [schemas.md](schemas.md) for TypeScript interfaces and data structures.
