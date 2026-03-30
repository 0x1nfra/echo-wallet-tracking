# Echo - Metrics Guide

Detailed explanation of every metric Echo calculates and why it matters.

## Profitability Metrics

### Total P&L (SOL)

**Formula:** Realized P&L + Unrealized P&L

**What it measures:** Overall profit/loss in SOL across all trades and positions

**Why it matters:** The bottom line - are they making money?

**Good value:** >50 SOL over 90 days

---

### Realized P&L (SOL)

**Formula:** Sum of all closed position profits/losses

**What it measures:** Actual profits taken (sold positions only)

**Calculation:**

```typescript
realizedPnL = sum(exitPrice - entryPrice) * quantity for all closed positions
```

**Why it matters:** Shows discipline in taking profits vs. paper gains

**Good value:** Positive and growing

---

### Unrealized P&L (SOL)

**Formula:** (Current Price - Entry Price) × Remaining Quantity

**What it measures:** Paper gains/losses on open positions

**Why it matters:** Shows if they're sitting on winners or bagholding

**Note:** Requires current token prices from DexScreener

---

### ROI (Return on Investment) %

**Formula:** (Total P&L / Total Capital Deployed) × 100

**What it measures:** Percentage return on money invested

**Example:**

- Deployed: 100 SOL
- Total P&L: 150 SOL
- ROI: 150%

**Why it matters:** Normalizes performance across different capital sizes

**Good value:** >100% over 90 days

---

### Win Rate %

**Formula:** (Profitable Trades / Total Trades) × 100

**What it measures:** Percentage of trades that made money

**Example:**

- 73 total trades
- 50 profitable
- Win rate: 68.5%

**Why it matters:** Consistency indicator - even 55%+ is good with proper risk management

**Good value:** >60%

---

### Profit Factor

**Formula:** Gross Profit / Gross Loss

**What it measures:** How much you make per dollar lost

**Example:**

- Gross profit: $2,800
- Gross loss: $1,000
- Profit factor: 2.8 (make $2.80 for every $1 lost)

**Why it matters:** Shows if winners are bigger than losers

**Good value:** >2.0

---

### Average Win/Loss (SOL)

**Formula:**

- Avg Win: Sum of winning trades / Number of wins
- Avg Loss: Sum of losing trades / Number of losses

**What it measures:** Typical profit/loss per trade

**Why it matters:** Shows position sizing and exit discipline

**Good ratio:** Avg Win should be 1.5-3x Avg Loss

---

## Activity Metrics

### Total Trades

**Formula:** Count of complete buy-sell cycles

**What it measures:** Trading frequency

**Note:** A "trade" = 1 buy + 1 sell (can be partial)

**Why it matters:** More data = more reliable metrics

**Minimum:** 10-20 for meaningful analysis

---

### Tokens Traded

**Formula:** Count of unique token addresses

**What it measures:** Diversification

**Why it matters:**

- Too few (1-5): Concentrated risk
- Moderate (10-30): Balanced
- Too many (50+): Scattered, might lack focus

---

### Trades Per Day

**Formula:** Total Trades / Active Days

**What it measures:** Activity level

**Interpretation:**

- <1: Swing trader
- 1-5: Active trader
- 5-10: Day trader
- 10+: Scalper/bot

---

### Average Hold Time (hours)

**Formula:** Sum of (sell_time - buy_time) / Total Trades

**What it measures:** Typical position duration

**Interpretation:**

- <1 hour: Scalper
- 1-24 hours: Day trader
- 1-7 days: Swing trader
- 7+ days: Position trader

---

### Median Hold Time (hours)

**Formula:** Middle value of all hold times

**Why use median:** Not skewed by outliers (one 30-day hold among 100 day trades)

**Why it matters:** More accurate "typical" hold than average

---

## Risk Metrics

### Max Drawdown %

**Formula:** (Peak Portfolio Value - Trough Value) / Peak Value × 100

**What it measures:** Largest peak-to-trough decline

**Example:**

- Peak: 150 SOL
- Lowest point after peak: 127 SOL
- Drawdown: 15.3%

**Why it matters:** Shows worst-case loss experience

**Good value:** <25%
**Acceptable:** 25-40%
**Risky:** >40%

---

### Sharpe Ratio

**Formula:** (Average Return - Risk Free Rate) / Standard Deviation of Returns

**What it measures:** Risk-adjusted returns

**Interpretation:**

- <1.0: Poor risk-adjusted returns
- 1.0-2.0: Good
- 2.0-3.0: Very good
- > 3.0: Excellent (rare)

**Why it matters:** High returns with low volatility = better trader

**Note:** Echo uses 5% annual risk-free rate (configurable)

---

### Volatility

**Formula:** Standard deviation of daily returns

**What it measures:** Consistency of returns

**Why it matters:**

- Low volatility: Smooth, consistent
- High volatility: Wild swings (even if profitable)

---

### Largest Loss (SOL)

**Formula:** Most negative single trade P&L

**What it measures:** Risk per trade

**Why it matters:** Shows if they blow up on one bad trade

**Red flag:** Single loss >20% of total capital

---

### Risk of Ruin Score

**Formula:** Based on win rate, avg win/loss ratio, and risk per trade

**What it measures:** Probability of account blowup

**Scale:** 0.0 (safe) to 1.0 (certain ruin)

**Why it matters:** Even profitable traders can blow up with poor risk management

**Good value:** <0.1

---

## Timing Metrics

### Early Entry Rate %

**Formula:** (Trades in first 10% of holders / Total Trades) × 100

**What it measures:** How often they're early to tokens

**Why it matters:** Early entries often = better prices

**Good value:** >30%

**Note:** Requires checking holder count at entry time

---

### Average Entry Speed (minutes)

**Formula:** Average time from token launch to first buy

**What it measures:** How fast they spot opportunities

**Interpretation:**

- <1 min: Bot or very fast manual
- 1-10 min: Quick sniper
- 10-60 min: Early adopter
- > 60 min: Later entry

---

### Launch Entries

**Formula:** Count of times bought in first 100 holders

**What it measures:** Launch trading skill

**Why it matters:** Launch trades can be most profitable (or most risky)

---

### Exit Discipline Score (0-100)

**Formula:** Measures ability to take profits near peaks vs. holding through dumps

**Calculation:**

1. For each closed position, check if exit was near local peak
2. Score: % of exits in top 20% of price range during hold period

**Why it matters:** Shows if they lock in gains or ride pumps back down

**Good value:** >70

---

## Time Period Metrics

### Last 7/30/90 Days P&L

**Formula:** Sum of P&L for trades in that period

**What it measures:** Recent performance

**Why it matters:** Recent results > ancient history

**Note:** Use these to spot trending traders

---

### Consistency Score

**Formula:** (Profitable 30-day periods / Total 30-day periods) × 100

**What it measures:** How often they're profitable month-to-month

**Example:**

- 90 days = 3 periods
- 3 profitable periods
- Consistency: 100%

**Why it matters:** One good month vs. consistently good

**Good value:** >70%

---

### Positive Months

**Formula:** Count of calendar months with positive P&L

**Why it matters:** Used in Smart Money categorization

**Requirement for Smart Money:** 3+ out of last 4 months

---

## Metric Interactions

### Win Rate + Profit Factor

- High win rate (>70%) + High profit factor (>2): **Elite trader**
- High win rate + Low profit factor (<1.5): Takes profits too early
- Low win rate (<50%) + High profit factor (>3): Big winner strategy (risky)

### ROI + Max Drawdown

- High ROI + Low drawdown: **Smart Money**
- High ROI + High drawdown: Lucky or risky
- Low ROI + Low drawdown: Conservative but not profitable

### Activity + Win Rate

- High activity + High win rate: **Scalper/Bot**
- Low activity + High win rate: **Selective Smart Money**
- High activity + Low win rate: **Degen**

---

## Calculation Example

**Sample Wallet:**

```
Trades:
1. Buy 1000 BONK @ 0.01 SOL each = 10 SOL
2. Sell 1000 BONK @ 0.015 SOL each = 15 SOL
3. Buy 500 PEPE @ 0.02 SOL each = 10 SOL
4. Sell 500 PEPE @ 0.015 SOL each = 7.5 SOL (loss)

Results:
- Total P&L: (15-10) + (7.5-10) = +2.5 SOL
- Win Rate: 1/2 = 50%
- ROI: 2.5/20 = 12.5%
- Profit Factor: 5 / 2.5 = 2.0
- Avg Win: 5 SOL
- Avg Loss: 2.5 SOL
```

---

## Next Steps

See [categories.md](categories.md) to understand how these metrics determine wallet categories.
