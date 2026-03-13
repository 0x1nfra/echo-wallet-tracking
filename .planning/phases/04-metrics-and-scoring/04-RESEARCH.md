# Phase 4: Metrics and Scoring - Research

**Researched:** 2026-03-13
**Domain:** Financial metric calculation (Sharpe ratio, win rate, drawdown), score normalization, SQLite/Drizzle persistence, CLI extension with Commander.js
**Confidence:** HIGH for architecture and DB patterns (derived from existing codebase and proven Phase 3 structure); HIGH for metric formulas (standard finance, no external dependencies needed); MEDIUM for score calibration (recommended thresholds are reasonable defaults, must be tuned against real data)

## Summary

Phase 4 calculates five raw metrics (win rate, realized PnL, Sharpe-like ratio, max drawdown, recency score) from the `swaps` table and combines them into a 0-100 wallet quality score. The phase is entirely computational — no new API calls or data fetches are required; all inputs come from the existing `swaps` table populated by Phase 2. The `wallet_metrics` table and `wallets.score` column already exist in the schema and just need to be written to.

The existing codebase establishes clear patterns: a `src/detection/` module with one file per concern plus an orchestrating `engine.ts`. Phase 4 should mirror this with a `src/metrics/` module (calculators) and a `src/scoring/` module (composition + persistence). Both already exist as empty directories in `src/`. The CLI already has a stubbed `score` command in `cli.ts` that needs to be wired up.

Phase 5 requires score history with timestamps for "N consecutive cycles below threshold" logic, which means Phase 4 must store more than just the current score. The `wallet_metrics` table has a `calculated_at` timestamp but uses `UNIQUE` on `wallet_address` (upsert-only). A separate `score_history` table (append-only, timestamped) is needed to support Phase 5's trend detection. This is the most significant schema addition Phase 4 introduces.

**Primary recommendation:** Implement pure calculator functions in `src/metrics/`, a score composer in `src/scoring/`, schema migration adding `score_history` table, and wire the existing `score` CLI command stub to trigger scoring. Score sub-components should be stored in `wallet_metrics` and the total in both `wallets.score` and `score_history` for Phase 5 compatibility.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary**
- Calculate WalletMetrics from clean wallet swap history and produce a 0-100 quality score. This phase produces the score — it does not display it (Phase 7) or act on it (Phase 5 auto-removal). Wallets without `history_complete=true` or without `confirmed_passing` detection status are silently skipped.

**Score Normalization**
- Score is bounded to soft range 5-95 — no wallet is perfectly trustworthy or completely worthless from metrics alone

**Recency Weighting**
- The meaningful activity window is **180 days** — trades older than 180 days are considered stale

**Minimum Activity Floor**
- Minimum **20 trades** required before a wallet earns a score — fewer than 20 trades = no score produced

### Claude's Discretion
- Score normalization calibration (what "50" means)
- Risk-adjusted return penalty magnitude to separate bundler-profile vs genuine trader
- Score storage format (consider Phase 7 breakdown display needs)
- Recency decay model and dormancy handling
- Activity health formula (frequency, diversity, or both)
- Maximum trade count cap
- Score update triggers (cycle vs new-transactions, status-change rescoring)
- Score history storage strategy — NOTE: Phase 5 requires score trend data for consecutive-cycle auto-removal, so some history tracking is likely necessary

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCOR-01 | System calculates wallet metrics: win rate, realized PnL in SOL, risk-adjusted return (Sharpe-like ratio), max drawdown, and recency score | All inputs available in `swaps` table (sol_amount, side, realized_pnl_sol, timestamp, cost_basis_sol); pure computation, no API calls; existing `wallet_metrics` table stores all five fields |
| SCOR-02 | System produces a 0-100 wallet score weighted: risk-adjusted return (40%), win rate (20%), consistency and recency (20%), activity health (20%) | Score composition is arithmetic; sub-scores normalized to 0-100 before weighting; final score clamped to 5-95; store total + sub-scores in wallet_metrics for Phase 7 breakdown display |
| SCOR-03 | System only scores wallets with complete transaction history and confirmed-passing detection status | Filter: `wallets.history_complete = true AND wallets.detection_status = 'confirmed_passing' AND trade_count >= 20`; implemented in eligibility gate at scoring engine entry point |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 (already installed) | DB queries for swaps table, wallet_metrics upsert, score_history insert | Already the project ORM; synchronous better-sqlite3 driver used throughout |
| better-sqlite3 | ^12.6.2 (already installed) | SQLite execution | Already the DB driver; synchronous API suits computation-heavy phase |
| commander | ^11.1.0 (already installed) | CLI wiring for `wallet score` command | Already used for all CLI commands |
| chalk | ^5.3.0 (already installed) | CLI output formatting | Already used throughout commands |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dayjs | ^1.11.10 (already installed) | Timestamp arithmetic for recency window calculations | Use for 180-day window cutoff calculations; already in project |
| drizzle-kit | ^0.31.9 (already installed) | Migration generation for score_history table | Run `drizzle-kit generate` after schema changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure JS Sharpe calculation | External stats library (simple-statistics) | No external dependency needed; Sharpe is simple: mean/stdev of per-trade returns. Don't add a dependency for 5 lines of math. |
| score_history table | Extending wallet_metrics with JSON history blob | score_history append-only table is cleaner for Phase 5 queries (count rows in rolling window); blob requires parsing JSON in SQL |
| Exponential decay weighting | Hard cutoff at 180 days | Decay adds complexity; hard cutoff aligns with Phase 2's 180-day import window so is consistent |

**Installation:** No new packages required. All dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── metrics/
│   ├── win-rate.ts         # calculateWinRate(swaps) → number
│   ├── pnl.ts              # calculateRealizedPnl(swaps) → number
│   ├── sharpe.ts           # calculateSharpeRatio(swaps) → number
│   ├── drawdown.ts         # calculateMaxDrawdown(swaps) → number
│   ├── recency.ts          # calculateRecencyScore(swaps, nowMs) → number
│   └── index.ts            # re-exports all calculators
├── scoring/
│   ├── composer.ts         # composeScore(metrics) → WalletScore (0-100 + sub-scores)
│   ├── engine.ts           # scoreWallet(address), scoreAllEligible()
│   └── index.ts            # re-exports
└── db/
    └── schema.ts           # add score_history table
```

### Pattern 1: Pure Calculator Functions
**What:** Each metric is a pure function taking an array of swap rows and returning a number. No DB access, no side effects.
**When to use:** All five metric calculations (win rate, PnL, Sharpe, drawdown, recency).
**Example:**
```typescript
// src/metrics/win-rate.ts
import type { SwapRow } from '../types/transaction.js';

export function calculateWinRate(trades: ClosedTrade[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => t.realizedPnlSol > 0).length;
  return wins / trades.length; // 0-1
}

// A "closed trade" is a token_mint where the wallet has at least one sell
// (partial closes count — sum all realized_pnl_sol entries for the token)
```

### Pattern 2: Scoring Engine (Mirrors Detection Engine)
**What:** `src/scoring/engine.ts` loads eligible wallets from DB, runs calculators, composes score, writes to DB. Mirrors `src/detection/engine.ts`.
**When to use:** Entry point for all scoring runs.
**Example:**
```typescript
// src/scoring/engine.ts
export async function scoreWallet(walletAddress: string): Promise<void> {
  // 1. Eligibility gate (SCOR-03)
  const wallet = db.select().from(wallets).where(eq(wallets.address, walletAddress)).get();
  if (!wallet?.history_complete) return;
  if (wallet.detection_status !== 'confirmed_passing') return;

  // 2. Load swaps for wallet
  const walletSwaps = db.select().from(swaps)
    .where(eq(swaps.wallet_address, walletAddress))
    .orderBy(asc(swaps.timestamp))
    .all();

  // 3. Activity floor check
  if (walletSwaps.length < 20) return;

  // 4. Calculate metrics (pure functions)
  const metrics = computeMetrics(walletSwaps);

  // 5. Compose score
  const score = composeScore(metrics);

  // 6. Persist: upsert wallet_metrics, update wallets.score, append score_history
  persistScore(walletAddress, metrics, score);
}

export function getEligibleWalletsForScoring(): string[] {
  return db.select({ address: wallets.address }).from(wallets)
    .where(and(
      eq(wallets.history_complete, true),
      eq(wallets.detection_status, 'confirmed_passing')
    ))
    .all()
    .map(r => r.address);
}
```

### Pattern 3: Score Composition with Sub-Scores
**What:** Each component is normalized to 0-100 before weighting, then combined. Sub-scores stored in `wallet_metrics` for Phase 7 breakdown.
**When to use:** Score composition in `src/scoring/composer.ts`.
**Example:**
```typescript
// src/scoring/composer.ts
export interface WalletScoreResult {
  total: number;          // 5-95 clamped
  riskAdjustedReturn: number;  // 0-100 sub-score
  winRate: number;             // 0-100 sub-score
  consistencyRecency: number;  // 0-100 sub-score
  activityHealth: number;      // 0-100 sub-score
}

const WEIGHTS = {
  riskAdjustedReturn: 0.40,
  winRate: 0.20,
  consistencyRecency: 0.20,
  activityHealth: 0.20,
};

export function composeScore(metrics: ComputedMetrics): WalletScoreResult {
  const riskAdjustedReturn = normalizeSharpeLike(metrics.sharpeRatio);
  const winRate = normalizeWinRate(metrics.winRate);
  const consistencyRecency = normalizeConsistencyRecency(metrics.recencyScore, metrics.consistencyScore);
  const activityHealth = normalizeActivityHealth(metrics.tradeCount, metrics.activeDays, metrics.tokenDiversity);

  const raw =
    riskAdjustedReturn * WEIGHTS.riskAdjustedReturn +
    winRate * WEIGHTS.winRate +
    consistencyRecency * WEIGHTS.consistencyRecency +
    activityHealth * WEIGHTS.activityHealth;

  const total = Math.max(5, Math.min(95, raw));
  return { total, riskAdjustedReturn, winRate, consistencyRecency, activityHealth };
}
```

### Pattern 4: Append-Only Score History
**What:** Each scoring run appends a row to `score_history` (wallet_address, score, scored_at). Phase 5 queries this table for trend detection.
**When to use:** Every call to `persistScore()`.
**Example:**
```typescript
// In persistScore():
db.insert(score_history).values({
  wallet_address: walletAddress,
  score: scoreResult.total,
  scored_at: Date.now(),
}).run();
```

### Anti-Patterns to Avoid
- **Computing metrics with DB subqueries instead of loaded arrays:** Sharpe ratio requires iterating trade-by-trade returns (mean + stdev); loading all swaps into memory first is cleaner and more testable than complex SQL window functions.
- **Overwriting score_history on re-score:** Phase 5 needs the trend; always append, never update existing rows.
- **Scoring on every monitoring cycle regardless of new data:** Mirror Phase 3's `runDetectionIfNeeded` pattern — only re-score if new swaps exist since last scoring run. (Stored as `calculated_at` in `wallet_metrics`.)
- **Mixing eligibility logic into calculator functions:** Eligibility gate belongs in `scoring/engine.ts`, not inside individual calculators.
- **Storing only total score:** Phase 7 needs sub-score breakdown. Store `riskAdjustedReturn`, `winRate`, `consistencyRecency`, `activityHealth` as columns in `wallet_metrics`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sharpe ratio standard deviation | Custom iterative variance formula | Plain JS: `Math.sqrt(returns.reduce(variance, 0) / n)` | One-pass Welford or two-pass both fine for N < 10k; no library needed |
| Database migration for score_history | Manual SQL file | `drizzle-kit generate` after adding table to schema.ts | Existing drizzle-kit setup already handles this; consistent with Phase 1-3 approach |
| Score normalization sigmoid | External sigmoid library | Simple piecewise linear or tanh clamped to [5,95] | Two lines of math; no library justified |
| CLI output table for score breakdown | Custom formatter | `cli-table3` (already installed) | Already used in wallet commands |

**Key insight:** This phase is pure computation. The only "complexity" is in financial formula correctness and storage design. Don't introduce external dependencies for math that fits in 20 lines of TypeScript.

---

## Common Pitfalls

### Pitfall 1: Closed-Trade Definition Ambiguity
**What goes wrong:** Win rate is computed on "trades" but swaps table stores individual buy/sell transactions, not round trips. Counting raw sells as wins/losses inflates trade count.
**Why it happens:** A "trade" in trading finance means an entry + exit cycle. One token position may have 3 buys and 2 sells.
**How to avoid:** Group swaps by `token_mint` per wallet. A "closed trade" = a token with total `realized_pnl_sol` > or < 0 (sum of all realized_pnl_sol for that token). Partially closed positions (some sells, remaining tokens held) count as partial closed trades.
**Warning signs:** Win rate > 90% or < 10% for most wallets suggests the denominator is wrong.

### Pitfall 2: Sharpe Ratio With Few Data Points
**What goes wrong:** Sharpe with N < 20 trades has extremely high variance — a wallet with 3 wins and 1 loss can get Sharpe > 5.0, looking better than a seasoned trader.
**Why it happens:** Standard deviation of a small sample is noisy.
**How to avoid:** The 20-trade minimum floor (locked decision) handles this. Additionally, apply a confidence dampener: `effective_sharpe = raw_sharpe * min(1.0, trade_count / 50)`. Wallets with 20-49 trades get a damped Sharpe that grows toward full weight at 50 trades.
**Warning signs:** Scores for wallets near the 20-trade floor are notably higher than wallets with 100+ trades.

### Pitfall 3: Max Drawdown on SOL vs Percentage
**What goes wrong:** SOL-denominated drawdown disadvantages wallets that trade with small size. A 0.1 SOL loss in a 0.5 SOL portfolio is more severe than a 1 SOL loss in a 50 SOL portfolio.
**Why it happens:** Raw SOL amounts are scale-dependent.
**How to avoid:** Compute max drawdown as percentage of peak cumulative PnL, not raw SOL. Track a running cumulative PnL, find the peak-to-trough percentage drop.
**Warning signs:** Large wallets always score better on drawdown metric than small wallets doing the same relative behavior.

### Pitfall 4: Recency Score When 180-Day Window Has Few Trades
**What goes wrong:** A wallet with 80 historical trades but only 2 in the last 180 days passes the 20-trade floor (80 >= 20) but produces a stale, unreliable score.
**Why it happens:** The 20-trade floor counts total trades, not recent trades. Activity health score must separately penalize thin recent activity.
**How to avoid:** In activity health calculation, use recent trade count (last 180 days) as a significant input. Recommended: if recent_trades < 5, activity health score = 0 regardless of total trades. If recent_trades is 5-20, scale linearly.
**Warning signs:** Wallets that haven't traded in 6 months appear in scoring output with scores > 50.

### Pitfall 5: Score History Table Missed in Migration
**What goes wrong:** Phase 5 queries score history but the table doesn't exist because Phase 4 only upserted `wallet_metrics`.
**Why it happens:** The existing schema already has `wallet_metrics` (upsert-only), making it easy to forget that Phase 5 needs trend data.
**How to avoid:** Phase 4 MUST add a `score_history` table in the migration. It's append-only. Migration must run before any scoring code executes.
**Warning signs:** Phase 5 planning references `score_history` but the schema file doesn't have it.

### Pitfall 6: Bundler-Profile vs Genuine Trader Separation
**What goes wrong:** A bundler wallet with 80% win rate but no risk-adjusted penalty scores higher than a genuine trader with 60% win rate and consistent Sharpe.
**Why it happens:** Win rate (20% weight) alone favors high-frequency correct bets. Bundlers can have artificially high win rates.
**How to avoid:** The Sharpe-like ratio is the primary differentiator at 40% weight. The key formula insight: use per-trade SOL return variability (standard deviation), not just mean return. High variance + high mean = penalized Sharpe. Recommended normalization: `sharpe_sub_score = tanh(sharpe_ratio * 0.5) * 100` — this maps Sharpe of 0 → 50, 1.0 → 76, 2.0 → 96, -1.0 → 24. A bundler with high win rate but swing returns (Sharpe 0.2-0.5) scores 55-62 on this component vs a consistent trader at Sharpe 1.5 scoring ~90.
**Warning signs:** Wallets you know are bundlers from Phase 3 detection (flagged then cleared) are scoring above 70.

---

## Code Examples

### Win Rate Calculation (Closed Trades)
```typescript
// src/metrics/win-rate.ts
// Source: Standard financial metric, project-specific grouping by token_mint

interface ClosedTrade {
  token_mint: string;
  realized_pnl_sol: number; // sum of all realized_pnl_sol for this token
}

export function groupIntoClosedTrades(
  swaps: Array<{ token_mint: string; side: string; realized_pnl_sol: number | null }>
): ClosedTrade[] {
  // A closed trade = any token with at least one sell and non-null realized_pnl_sol
  const byToken = new Map<string, number>();
  for (const swap of swaps) {
    if (swap.side === 'sell' && swap.realized_pnl_sol !== null) {
      byToken.set(swap.token_mint, (byToken.get(swap.token_mint) ?? 0) + swap.realized_pnl_sol);
    }
  }
  return Array.from(byToken.entries()).map(([token_mint, realized_pnl_sol]) => ({
    token_mint,
    realized_pnl_sol,
  }));
}

export function calculateWinRate(closedTrades: ClosedTrade[]): number {
  if (closedTrades.length === 0) return 0;
  const wins = closedTrades.filter(t => t.realized_pnl_sol > 0).length;
  return wins / closedTrades.length; // 0.0 to 1.0
}
```

### Sharpe-Like Ratio (Per-Trade SOL Returns)
```typescript
// src/metrics/sharpe.ts
// "Trade return" = realized_pnl_sol / cost_basis_sol (percentage return per trade)
// Sharpe = mean(returns) / stdev(returns) — omit risk-free rate for crypto context

export function calculateSharpeRatio(
  closedTrades: Array<{ realized_pnl_sol: number; cost_basis_sol: number }>
): number {
  const trades = closedTrades.filter(t => t.cost_basis_sol > 0);
  if (trades.length < 2) return 0;

  const returns = trades.map(t => t.realized_pnl_sol / t.cost_basis_sol);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdev = Math.sqrt(variance);

  if (stdev === 0) return mean > 0 ? 3.0 : 0; // All trades same return (cap at 3.0)
  return mean / stdev;
}

// Normalize to 0-100 sub-score:
export function normalizeSharpeLike(sharpe: number): number {
  // tanh(sharpe * 0.5) maps: -2 → ~10, 0 → 50, 1 → 76, 2 → 96
  return Math.round(((Math.tanh(sharpe * 0.5) + 1) / 2) * 100);
}
```

### Max Drawdown (Percentage of Peak)
```typescript
// src/metrics/drawdown.ts
export function calculateMaxDrawdown(
  swaps: Array<{ side: string; realized_pnl_sol: number | null; timestamp: number }>
): number {
  // Build cumulative PnL series over time (sells only, sorted by timestamp)
  const sells = swaps
    .filter(s => s.side === 'sell' && s.realized_pnl_sol !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (sells.length === 0) return 0;

  let cumulativePnl = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const sell of sells) {
    cumulativePnl += sell.realized_pnl_sol!;
    if (cumulativePnl > peak) peak = cumulativePnl;
    if (peak > 0) {
      const drawdown = (peak - cumulativePnl) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }
  return maxDrawdown; // 0.0 to 1.0 (percentage as decimal)
}
```

### Recency Score (Hard Cutoff at 180 Days)
```typescript
// src/metrics/recency.ts
const WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

export function calculateRecencyScore(
  swaps: Array<{ timestamp: number }>,
  nowMs: number = Date.now()
): number {
  const cutoff = nowMs - WINDOW_MS;
  const recentSwaps = swaps.filter(s => s.timestamp >= cutoff);
  const recentCount = recentSwaps.length;

  // 0 recent = 0 score; scales up to 100 at 50+ recent trades
  // Penalizes dormant wallets strongly
  if (recentCount === 0) return 0;
  if (recentCount < 5) return recentCount * 5; // 5-25 for 1-5 trades
  return Math.min(100, 25 + (recentCount - 5) * (75 / 45)); // 25 → 100 over 5-50 trades
}
```

### Score History Schema Addition
```typescript
// Addition to src/db/schema.ts
export const score_history = sqliteTable('score_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wallet_address: text('wallet_address').notNull(),
  score: real('score').notNull(),
  scored_at: integer('scored_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});
```

### Extended wallet_metrics Schema (Sub-Scores for Phase 7)
```typescript
// wallet_metrics table needs additional sub-score columns (via migration):
// score_total: real
// score_risk_adjusted: real    (40% component, 0-100)
// score_win_rate: real         (20% component, 0-100)
// score_consistency_recency: real  (20% component, 0-100)
// score_activity_health: real  (20% component, 0-100)
// trade_count: integer         (for Phase 7 display)
// recent_trade_count: integer  (last 180 days)
```

### Scoring Engine Entry Point
```typescript
// src/scoring/engine.ts — mirrors detection/engine.ts pattern
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallets, swaps, wallet_metrics, score_history } from '../db/schema.js';

export async function scoreWalletIfNeeded(walletAddress: string): Promise<void> {
  const wallet = db.select().from(wallets).where(eq(wallets.address, walletAddress)).get();
  if (!wallet?.history_complete) return;
  if (wallet.detection_status !== 'confirmed_passing') return;

  // Check for new swaps since last scoring (correctness-first approach)
  const lastScored = db.select({ calculated_at: wallet_metrics.calculated_at })
    .from(wallet_metrics)
    .where(eq(wallet_metrics.wallet_address, walletAddress))
    .get()?.calculated_at ?? 0;

  const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
    .where(and(eq(swaps.wallet_address, walletAddress), gt(swaps.timestamp, lastScored)))
    .get();
  if (!hasNewSwaps) return;

  await scoreWallet(walletAddress);
}
```

---

## Schema Changes Required

Phase 4 requires two schema additions via Drizzle migration:

### 1. New table: `score_history` (Phase 5 dependency)
Append-only log of every scoring run. Phase 5 queries this for "N consecutive below-threshold scores" logic.

```sql
CREATE TABLE score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  wallet_address TEXT NOT NULL,
  score REAL NOT NULL,
  scored_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
CREATE INDEX score_history_wallet_scored ON score_history (wallet_address, scored_at DESC);
```

### 2. Extend `wallet_metrics` (Phase 7 dependency)
Add sub-score columns and trade count columns. The existing table stores five raw metric values; Phase 7 needs the score breakdown and trade counts.

New columns to add:
- `score_total REAL` — the 0-100 final score
- `score_risk_adjusted REAL` — 40% component sub-score (0-100)
- `score_win_rate REAL` — 20% component sub-score (0-100)
- `score_consistency_recency REAL` — 20% component sub-score (0-100)
- `score_activity_health REAL` — 20% component sub-score (0-100)
- `trade_count INTEGER` — total trades at time of scoring
- `recent_trade_count INTEGER` — trades in last 180 days

Migration flow: `npx drizzle-kit generate` after updating `src/db/schema.ts`.

---

## Score Calibration Recommendations

### What "50" Means
A score of 50 should represent a wallet that trades occasionally, breaks even on average, has moderate win rate (~50%), and has some recent activity. Not a strong signal either way.

Recommended normalization anchors:
- Win rate 50% → win rate sub-score = 50
- Sharpe 0.0 (mean return = 0) → risk-adjusted sub-score = 50
- Max drawdown 30% → consistency penalty brings score down from neutral
- 10 recent trades in 180 days → recency sub-score ~40 (below neutral)

### Risk-Adjusted Return Normalization (Bundler Separation)
Use `tanh(sharpe * 0.5)` scaled to 0-100:
- Bundler profile (many wins, volatile returns): Sharpe ~0.3-0.5 → sub-score 57-62
- Consistent trader (positive Sharpe 1.0-1.5): sub-score 76-87
- Excellent trader (Sharpe 2.0+): sub-score 96 (clamped to 95 by overall cap)
- Wash-through (Sharpe near 0): sub-score ~50

This produces "materially lower" scores for bundler profiles (40% weight × 57 = 22.8 contribution) vs consistent traders (40% × 87 = 34.8 contribution) — a meaningful 12-point difference from the risk-adjusted component alone.

### Dormancy Handling
Wallets with 0 recent trades (last 180 days) should NOT receive a score. A zero recency score collapses the 20% consistency/recency component and produces a misleadingly low (but not zero) overall score that could pollute Phase 5 signals. Recommendation: return early without scoring if `recent_trade_count < 1`. Store no score (leave `wallets.score = null`).

### Activity Health Formula
Composite of frequency + diversity:
- Frequency: recent_trade_count (last 180 days) normalized over 0-50 trades → 0-100
- Diversity: distinct_tokens_traded (last 180 days) normalized over 0-20 tokens → 0-100
- Activity health = 0.6 * frequency_score + 0.4 * diversity_score

Rationale: frequency is primary (active wallet signal); diversity penalizes single-token obsession (potential insider/coordinated play) and rewards genuine broad-market behavior.

### Score Update Triggers
- **Primary trigger:** New swaps since last `calculated_at` — run `scoreWalletIfNeeded` in monitoring loop alongside `runDetectionIfNeeded`.
- **Detection status change trigger:** When a wallet's `detection_status` changes to `confirmed_passing` (flag cleared), trigger immediate rescoring. When status changes away from `confirmed_passing`, nullify the score (`wallets.score = null`).
- **Manual CLI trigger:** Add `wallet score <address>` sub-command to force rescore. Useful for threshold tuning. The existing `score` command stub in `cli.ts` can be repurposed for this.

### Score History Strategy
- Append on every scoring run (even re-scores with no score change).
- Retain all history (no TTL in Phase 4; Phase 5 will query by rolling 30-day window).
- Index on `(wallet_address, scored_at DESC)` for Phase 5's rolling window query.

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 4 |
|--------------|------------------|-------------------|
| `wallets.score` only (initial schema) | `wallet_metrics` sub-scores + `score_history` append-only | Sub-scores enable Phase 7 breakdown; history enables Phase 5 trend |
| `WalletScore` type in `src/types/wallet.ts` (legacy pre-phase design) | New Phase 4 score types in `src/scoring/` | Legacy types have different weight breakdown (profitability 40/consistency 30/activity 20/recentPerformance 10) — do NOT use these; Phase 4 uses new weights (risk-adjusted 40/win rate 20/consistency+recency 20/activity 20) |
| `ScoringConfig` in `src/types/config.ts` | New scorer with hardcoded weights | Legacy config has different weight names; Phase 4 ignores legacy config types for scoring weights |

**Deprecated/outdated:**
- `WalletScore.breakdown` in `src/types/wallet.ts`: Uses old weight breakdown (profitability 40%, consistency 30%, activity 20%, recentPerformance 10%). Phase 4 should define new types in `src/scoring/` rather than extending this.
- `ScoringConfig.weights` in `src/types/config.ts`: Naming doesn't match Phase 4's component names. Create new types in scoring module.

---

## Open Questions

1. **Trade count definition for the 20-trade floor**
   - What we know: "20 trades" is locked. But swaps table rows represent individual transactions (one buy = one row), not round-trip trades.
   - What's unclear: Does the floor mean 20 swap rows, or 20 closed round-trip trades (tokens with at least one sell)?
   - Recommendation: Use 20 swap rows (total buys + sells). More permissive, consistent with how "trade count" is typically interpreted in this codebase context (ActivityMetrics.totalTrades). If this produces noisy scores, the activity health component will still penalize thin closed-trade history.

2. **Cost basis availability in swaps table**
   - What we know: `swaps.cost_basis_sol` and `swaps.realized_pnl_sol` are populated by the FIFO pass in Phase 2. Both are `real` (nullable).
   - What's unclear: Are there edge cases where sells have null `cost_basis_sol`? (e.g., sells before buys in import window)
   - Recommendation: Filter out swaps with null `cost_basis_sol` from Sharpe and drawdown calculations. Log count of excluded swaps in debug output.

3. **Interaction with detection engine in monitoring loop**
   - What we know: Detection runs first (Phase 3), then scoring should run. Both check `history_complete = true`.
   - What's unclear: Should scoring be triggered by the detection engine (post-detection hook) or independently in the monitoring loop?
   - Recommendation: Keep them independent in the monitoring loop. `runDetectionIfNeeded(address)` then `scoreWalletIfNeeded(address)` called in sequence. This mirrors the clean separation already established. Phase 5 will own the monitoring loop orchestration.

---

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `/src/db/schema.ts` — existing wallet_metrics, wallets.score, swaps table structure confirmed
- Codebase analysis: `/src/detection/engine.ts` — module pattern, eligibility gate pattern, incremental trigger pattern confirmed
- Codebase analysis: `/src/types/wallet.ts` — legacy WalletScore/WalletMetrics types noted as non-applicable for Phase 4 weights
- Codebase analysis: `/src/importers/history.ts` — 180-day window already enforced at import; hard cutoff is consistent

### Secondary (MEDIUM confidence)
- Sharpe ratio formula: Standard finance definition (mean/stdev of returns); tanh normalization is conventional for bounded score mapping; no external verification needed for this well-established formula
- Phase 3 RESEARCH.md patterns: Detection engine module structure, migration workflow with drizzle-kit, CLI Commander pattern — directly applicable

### Tertiary (LOW confidence)
- Score calibration anchors (what "50" means, tanh coefficient of 0.5): These are initial hypotheses. The tanh(x * 0.5) coefficient produces reasonable separation per back-of-envelope calculation, but requires validation against real wallet data. Expected to be tuned in Phase 5 or Phase 7.
- Activity health formula (0.6 frequency + 0.4 diversity): Reasonable but arbitrary split; not derived from empirical data.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing libraries confirmed present
- Architecture: HIGH — directly mirrors Phase 3 detection module pattern; schema additions are straightforward
- Score formulas: HIGH — standard finance formulas (Sharpe, drawdown, win rate); implementation is trivial
- Score calibration: MEDIUM — tanh normalization is reasonable; specific coefficient (0.5) and activity health weights (0.6/0.4) are initial estimates requiring real-data validation
- Pitfalls: HIGH — all pitfalls derived from direct schema analysis and formula math, not guesswork

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable — no external dependencies, internal codebase only)
