# Echo - Wallet Categories

How Echo classifies wallets into 6 distinct trader types.

## Category Priority

Categories are checked in this order (most specific first):

1. Sniper/Bot
2. Smart Money
3. Whale
4. Degen
5. Emerging
6. KOL
7. Unclassified (default)

## 1. Smart Money

**Definition:** Consistently profitable traders with strong risk management

**Criteria:**

- Win rate ≥ 65%
- Positive P&L in at least 3 out of last 4 months
- Sharpe ratio ≥ 1.5
- Max drawdown < 25%
- At least 30 total trades

**Behavioral Patterns:**

- Selective entries (doesn't chase every pump)
- Strategic exits (takes profits near peaks)
- Disciplined position sizing (consistent trade sizes)
- Holds through volatility when conviction is high

**Why Track:**
These are your best wallets to follow. They make money consistently and manage risk well.

**Example Score Range:** 80-95

---

## 2. Whale

**Definition:** Large capital deployers who can move markets

**Criteria:**

- Average trade size ≥ 50 SOL
- Total P&L ≥ 500 SOL
- Wallet balance ≥ 100 SOL
- Account age ≥ 180 days

**Behavioral Patterns:**

- Can move token prices with their entries/exits
- Longer hold times (days to weeks)
- Fewer but larger trades
- Selective token picks

**Why Track:**
When whales enter, price often follows. Their exits can signal tops.

**Example Score Range:** 70-85

---

## 3. Sniper/Bot

**Definition:** Automated or extremely fast traders targeting launches

**Criteria:**

- Average entry speed < 10 seconds from token launch
- At least 20 launch entries (first 100 holders)
- High trade frequency (≥5 trades/day)
- Very short hold times (median < 2 hours)

**Behavioral Patterns:**

- Programmatic execution
- Sub-second entries on new tokens
- Quick flips (often within minutes)
- High win rate on launches

**Why Track:**
If you can't beat them, follow them. Good for identifying hot launches early.

**Example Score Range:** 65-80

---

## 4. Emerging Trader

**Definition:** Newer wallets showing strong early performance

**Criteria:**

- Wallet age < 90 days
- Win rate ≥ 70%
- At least 15 total trades
- Positive P&L in last 30 days

**Behavioral Patterns:**

- Aggressive entry style
- Trend following
- High risk tolerance
- Still learning but performing well

**Why Track:**
Fresh perspective, often ahead of trends. High risk but high potential.

**Example Score Range:** 70-85

---

## 5. Degen Trader

**Definition:** High volume, high risk, volatile performance

**Criteria:**

- ≥100 trades in last 30 days
- Average hold time < 24 hours
- High volatility (daily return std dev ≥ 50%)
- Doesn't qualify as Smart Money

**Behavioral Patterns:**

- Scalping and momentum plays
- FOMO entries on pumps
- High turnover
- Volatile P&L (big wins and big losses)

**Why Track:**
Good for identifying trending tokens, but copy their entries not their exits.

**Example Score Range:** 50-70

---

## 6. KOL (Key Opinion Leader)

**Definition:** Influential traders with public presence

**Criteria:**

- Large wallet balance (≥100 SOL)
- Consistent activity (≥10 trades/month)
- Win rate between 50-70% (steady, not elite)
- Average trade size ≥ 20 SOL

**Manual Tagging:**
In Phase 1, KOLs may need manual tagging since social influence isn't on-chain.

**Behavioral Patterns:**

- Can influence token prices through followers
- Slower exits (gives followers time to enter)
- Larger position sizes
- More public about holdings

**Why Track:**
Not the best traders, but their influence can create opportunities.

**Example Score Range:** 60-75

---

## 7. Unclassified

**Definition:** Doesn't fit clear patterns or insufficient data

**Criteria:**

- < 10 total trades
- OR doesn't meet any category thresholds
- OR suspicious activity patterns (wash trading, rug participants)

**Action:**
Skip these wallets or wait for more data.

---

## Categorization Logic (TypeScript)

```typescript
function categorizeWallet(
  metrics: WalletMetrics,
  accountInfo: AccountInfo,
  wallet: Wallet
): CategoryResult {
  const { profitability, activity, risk, timing, timePeriods } = metrics;

  // 1. Check for Sniper/Bot (most specific)
  if (
    timing.avgEntrySpeedMinutes < 0.17 && // 10 seconds
    timing.launchEntries >= 20 &&
    activity.tradesPerDay >= 5 &&
    activity.medianHoldHours < 2
  ) {
    return {
      primary: "sniper",
      confidence: 0.9,
      reasons: [
        `Ultra-fast entries (avg ${timing.avgEntrySpeedMinutes.toFixed(
          2
        )} min)`,
        `${timing.launchEntries} launch snipes`,
        "Bot-like behavior pattern",
      ],
      alternatCategories: [],
    };
  }

  // 2. Check for Smart Money
  if (
    profitability.winRatePercent >= 65 &&
    timePeriods.positiveMonths >= 3 &&
    risk.sharpeRatio >= 1.5 &&
    risk.maxDrawdownPercent < 25 &&
    activity.totalTrades >= 30
  ) {
    return {
      primary: "smart_money",
      confidence: 0.92,
      reasons: [
        `${profitability.winRatePercent.toFixed(1)}% win rate`,
        `Sharpe ratio ${risk.sharpeRatio.toFixed(2)}`,
        `Profitable ${timePeriods.positiveMonths}/${timePeriods.totalMonths} months`,
      ],
      alternatCategories: [],
    };
  }

  // 3. Check for Whale
  if (
    profitability.totalCapitalDeployedSol / activity.totalTrades >= 50 && // avg trade size
    profitability.totalPnlSol >= 500 &&
    accountInfo.currentBalanceSol >= 100 &&
    accountInfo.ageDays >= 180
  ) {
    return {
      primary: "whale",
      confidence: 0.85,
      reasons: [
        `Large avg trade size (${(
          profitability.totalCapitalDeployedSol / activity.totalTrades
        ).toFixed(1)} SOL)`,
        `Total P&L: ${profitability.totalPnlSol.toFixed(1)} SOL`,
        "Established account with significant capital",
      ],
      alternatCategories: ["smart_money"],
    };
  }

  // 4. Check for Degen
  const tradesLast30d = activity.totalTrades * (30 / accountInfo.ageDays); // estimate
  if (
    tradesLast30d >= 100 &&
    activity.avgHoldHours < 24 &&
    risk.volatility >= 50
  ) {
    return {
      primary: "degen",
      confidence: 0.8,
      reasons: [
        `High frequency (${tradesLast30d.toFixed(0)} trades/month)`,
        `Short holds (avg ${activity.avgHoldHours.toFixed(1)}h)`,
        "High volatility trading",
      ],
      alternatCategories: [],
    };
  }

  // 5. Check for Emerging
  if (
    accountInfo.ageDays < 90 &&
    profitability.winRatePercent >= 70 &&
    activity.totalTrades >= 15 &&
    timePeriods.last30dPnlSol > 0
  ) {
    return {
      primary: "emerging",
      confidence: 0.88,
      reasons: [
        `New account (${accountInfo.ageDays} days)`,
        `Strong ${profitability.winRatePercent.toFixed(1)}% win rate`,
        "Positive recent performance",
      ],
      alternatCategories: ["smart_money"],
    };
  }

  // 6. Check for KOL (requires manual tag or meets criteria)
  if (
    wallet.manualTag === "kol" ||
    (accountInfo.currentBalanceSol >= 100 &&
      activity.tradesPerDay >= 0.33 && // 10 per month
      profitability.winRatePercent >= 50 &&
      profitability.winRatePercent <= 70 &&
      profitability.totalCapitalDeployedSol / activity.totalTrades >= 20)
  ) {
    return {
      primary: "kol",
      confidence: wallet.manualTag === "kol" ? 1.0 : 0.7,
      reasons: [
        wallet.manualTag === "kol"
          ? "Manually tagged as KOL"
          : "Meets KOL criteria",
        `${profitability.winRatePercent.toFixed(
          1
        )}% win rate (steady, not elite)`,
        "Large position sizes",
      ],
      alternatCategories: [],
    };
  }

  // 7. Default to unclassified
  return {
    primary: "unclassified",
    confidence: 0,
    reasons: [
      activity.totalTrades < 10
        ? "Insufficient trade history"
        : "Does not meet any category criteria",
    ],
    alternatCategories: [],
  };
}
```

## Category Tags

Echo also adds descriptive tags beyond the primary category:

**Trading Style:**

- `scalper` - Very short holds
- `swing_trader` - Days to weeks
- `position_trader` - Weeks to months

**Specialization:**

- `memecoin_specialist` - Focuses on memecoins
- `early_entry` - Consistently early to tokens
- `high_conviction` - Larger position sizes
- `diversified` - Trades many different tokens

**Performance:**

- `consistent` - Low volatility returns
- `volatile` - High risk/reward
- `trending_up` - Improving performance
- `trending_down` - Declining performance

## Next Steps

See [metrics.md](metrics.md) for how each metric is calculated.
