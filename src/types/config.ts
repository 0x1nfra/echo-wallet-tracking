/**
 * Configuration types
 */

export interface Config {
  api: ApiConfig;
  calculation: CalculationConfig;
  filters: FilterConfig;
  categories: CategoriesConfig;
  scoring: ScoringConfig;
  export: ExportConfig;
  cache: CacheConfig;
}

export interface ApiConfig {
  helius: {
    key: string;
    endpoint: string;
    rateLimit: number; // requests per minute
  };
  dexscreener: {
    endpoint: string;
    rateLimit: number;
  };
  solana: {
    rpc: string;
    commitment: 'processed' | 'confirmed' | 'finalized';
  };
}

export interface CalculationConfig {
  accountingMethod: 'fifo' | 'lifo';
  minTradesForMetrics: number;
  lookbackDays: number;
  riskFreeRate: number; // decimal, e.g., 0.05 for 5%
}

export interface FilterConfig {
  minTrades: number;
  minAccountAgeDays: number;
  excludeSuspectedWashTrading: boolean;
  excludeFailedTokens: boolean;
}

export interface CategoriesConfig {
  smartMoney: SmartMoneyCriteria;
  whale: WhaleCriteria;
  sniper: SniperCriteria;
  emerging: EmergingCriteria;
  degen: DegenCriteria;
  kol: KolCriteria;
}

export interface SmartMoneyCriteria {
  minWinRate: number;
  minPositiveMonths: number;
  minSharpeRatio: number;
  maxDrawdown: number;
  minTrades: number;
}

export interface WhaleCriteria {
  minAvgTradeSol: number;
  minTotalPnl: number;
  minBalance: number;
  minAgeDays: number;
}

export interface SniperCriteria {
  maxEntrySpeedSeconds: number;
  minLaunchEntries: number;
  minTradesPerDay: number;
  maxMedianHoldHours: number;
}

export interface EmergingCriteria {
  maxAgeDays: number;
  minWinRate: number;
  minTrades: number;
  requirePositive30d: boolean;
}

export interface DegenCriteria {
  minTradesPerMonth: number;
  maxAvgHoldHours: number;
  minVolatility: number;
}

export interface KolCriteria {
  minBalance: number;
  minTradesPerMonth: number;
  minWinRate: number;
  maxWinRate: number;
  minAvgTradeSol: number;
}

export interface ScoringConfig {
  weights: {
    profitability: number; // 0-100
    consistency: number;
    activity: number;
    recentPerformance: number;
  };
}

export interface ExportConfig {
  outputDir: string;
  format: 'axiom_json' | 'csv' | 'json';
  includeMetadata: boolean;
  includeTransactionHistory: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  ttlMinutes: number;
  directory: string;
}
