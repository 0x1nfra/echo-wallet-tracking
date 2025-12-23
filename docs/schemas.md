# Echo - Data Schemas

All TypeScript interfaces and types used throughout Echo.

## Core Types

### Wallet

```typescript
interface Wallet {
  address: string;
  label?: string;
  manualTag?: string; // Optional manual category override
}
```

### Transaction

```typescript
interface Transaction {
  signature: string;
  timestamp: number; // Unix timestamp
  blockTime: number;
  slot: number;
  success: boolean;
  fee: number; // SOL
}
```

### Swap

```typescript
type SwapType = "buy" | "sell";

interface Swap {
  signature: string;
  timestamp: number;
  type: SwapType;
  tokenAddress: string;
  tokenSymbol: string;
  amountSol: number;
  amountTokens: number;
  pricePerToken: number;
  dex: "raydium" | "jupiter" | "pump.fun" | "orca" | "unknown";
}
```

### Position

```typescript
type PositionStatus = "open" | "closed";

interface Position {
  token: string;
  tokenSymbol: string;
  status: PositionStatus;
  entries: PositionEntry[];
  exits: PositionExit[];
  remainingQuantity: number;
  totalInvestedSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  avgEntryPrice: number;
  currentPrice?: number;
}

interface PositionEntry {
  timestamp: number;
  quantity: number;
  pricePerToken: number;
  costSol: number;
}

interface PositionExit {
  timestamp: number;
  quantity: number;
  pricePerToken: number;
  proceedsSol: number;
  pnlSol: number;
}
```

## Metrics Types

### Profitability Metrics

```typescript
interface ProfitabilityMetrics {
  totalPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalCapitalDeployedSol: number;
  roiPercent: number;
  winRatePercent: number;
  avgWinSol: number;
  avgLossSol: number;
  winLossRatio: number;
  profitFactor: number;
  totalWinningTrades: number;
  totalLosingTrades: number;
}
```

### Activity Metrics

```typescript
interface ActivityMetrics {
  totalTrades: number;
  tokensTraded: number;
  activeDays: number;
  tradesPerDay: number;
  avgHoldHours: number;
  medianHoldHours: number;
  minHoldHours: number;
  maxHoldHours: number;
}
```

### Risk Metrics

```typescript
interface RiskMetrics {
  maxDrawdownPercent: number;
  sharpeRatio: number;
  volatility: number;
  largestLossSol: number;
  largestWinSol: number;
  riskOfRuinScore: number; // 0-1, probability of account blowup
  avgRiskPerTrade: number; // as % of capital
}
```

### Timing Metrics

```typescript
interface TimingMetrics {
  earlyEntryRatePercent: number; // % bought in first 10% of holders
  avgEntrySpeedMinutes: number; // time from launch to buy
  launchEntries: number; // # of times bought within first 100 holders
  exitDisciplineScore: number; // 0-100, measured by profit-taking ability
}
```

### Time Period Metrics

```typescript
interface TimePeriodMetrics {
  last7dPnlSol: number;
  last30dPnlSol: number;
  last90dPnlSol: number;
  consistencyScore: number; // % of 30-day periods that were profitable
  positiveMonths: number; // # of profitable months
  totalMonths: number;
}
```

### Complete Metrics Object

```typescript
interface WalletMetrics {
  profitability: ProfitabilityMetrics;
  activity: ActivityMetrics;
  risk: RiskMetrics;
  timing: TimingMetrics;
  timePeriods: TimePeriodMetrics;
}
```

## Category Types

```typescript
type WalletCategory =
  | "smart_money"
  | "whale"
  | "sniper"
  | "emerging"
  | "degen"
  | "kol"
  | "unclassified";

interface CategoryResult {
  primary: WalletCategory;
  confidence: number; // 0-1
  reasons: string[];
  alternatCategories: WalletCategory[];
}
```

## Scoring Types

```typescript
interface WalletScore {
  overall: number; // 0-100
  breakdown: {
    profitability: number; // 0-40
    consistency: number; // 0-30
    activity: number; // 0-20
    recentPerformance: number; // 0-10
  };
  categoryBonus: number;
  rank?: number; // Optional, set when scoring multiple wallets
}
```

## Account Info

```typescript
interface AccountInfo {
  ageDays: number;
  currentBalanceSol: number;
  firstTradeTimestamp: number;
  lastTradeTimestamp: number;
  isActive: boolean; // traded in last 30 days
}
```

## Complete Wallet Analysis

```typescript
interface WalletAnalysis {
  wallet: string;
  label: string;
  category: CategoryResult;
  score: WalletScore;
  metrics: WalletMetrics;
  accountInfo: AccountInfo;
  positions: Position[];
  tags: string[];
  notes?: string;
  analyzedAt: number; // timestamp
}
```

## Export Format (Axiom)

```typescript
interface AxiomExport {
  version: string;
  generatedAt: string; // ISO 8601
  analysisPeriodDays: number;
  totalWallets: number;
  wallets: AxiomWallet[];
  summary: ExportSummary;
}

interface AxiomWallet {
  address: string;
  label: string;
  category: WalletCategory;
  score: number;
  rank: number;
  metrics: WalletMetrics;
  categoryDetails: CategoryResult;
  tags: string[];
  accountInfo: AccountInfo;
  notes?: string;
  addedDate: string; // ISO 8601
}

interface ExportSummary {
  categoryBreakdown: Record<WalletCategory, number>;
  avgScore: number;
  totalTrackedPnlSol: number;
}
```

## Config Types

```typescript
interface Config {
  api: ApiConfig;
  calculation: CalculationConfig;
  filters: FilterConfig;
  categories: CategoriesConfig;
  scoring: ScoringConfig;
  export: ExportConfig;
  cache: CacheConfig;
}

interface ApiConfig {
  helius: {
    key: string;
    endpoint: string;
    rateLimit: number;
  };
  dexscreener: {
    endpoint: string;
    rateLimit: number;
  };
  solana: {
    rpc: string;
    commitment: "processed" | "confirmed" | "finalized";
  };
}

interface CalculationConfig {
  accountingMethod: "fifo" | "lifo";
  minTradesForMetrics: number;
  lookbackDays: number;
  riskFreeRate: number;
}

interface FilterConfig {
  minTrades: number;
  minAccountAgeDays: number;
  excludeSuspectedWashTrading: boolean;
  excludeFailedTokens: boolean;
}

interface CategoriesConfig {
  smartMoney: CategoryCriteria;
  whale: CategoryCriteria;
  sniper: CategoryCriteria;
  emerging: CategoryCriteria;
  degen: CategoryCriteria;
  kol: CategoryCriteria;
}

interface CategoryCriteria {
  [key: string]: number | boolean;
}

interface ScoringConfig {
  weights: {
    profitability: number;
    consistency: number;
    activity: number;
    recentPerformance: number;
  };
}

interface ExportConfig {
  outputDir: string;
  format: "axiom_json" | "csv" | "json";
  includeMetadata: boolean;
  includeTransactionHistory: boolean;
}

interface CacheConfig {
  enabled: boolean;
  ttlMinutes: number;
  directory: string;
}
```

## Validation Schemas (Joi)

See `configuration.md` for Joi validation schemas.

## Next Steps

- See [configuration.md](configuration.md) for config validation
- See [metrics.md](metrics.md) for metric calculation details
- See [categories.md](categories.md) for category rules
