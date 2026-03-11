/**
 * Wallet-related types
 */

export interface Wallet {
  address: string;
  label?: string;
  manualTag?: string; // Optional manual category override (e.g., 'kol')
}

export interface AccountInfo {
  ageDays: number;
  currentBalanceSol: number;
  firstTradeTimestamp: number;
  lastTradeTimestamp: number;
  isActive: boolean; // Traded in last 30 days
}

export type WalletCategory =
  | 'smart_money'
  | 'whale'
  | 'sniper'
  | 'emerging'
  | 'degen'
  | 'kol'
  | 'unclassified';

export interface CategoryResult {
  primary: WalletCategory;
  confidence: number; // 0-1
  reasons: string[];
  alternateCategories: WalletCategory[];
}

export interface WalletScore {
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

export interface WalletAnalysis {
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

// Forward declarations
export interface WalletMetrics {
  profitability: ProfitabilityMetrics;
  activity: ActivityMetrics;
  risk: RiskMetrics;
  timing: TimingMetrics;
  timePeriods: TimePeriodMetrics;
}

export interface Position {
  token: string;
  tokenSymbol: string;
  status: 'open' | 'closed';
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

export interface PositionEntry {
  timestamp: number;
  quantity: number;
  pricePerToken: number;
  costSol: number;
}

export interface PositionExit {
  timestamp: number;
  quantity: number;
  pricePerToken: number;
  proceedsSol: number;
  pnlSol: number;
}

// Metrics interfaces (imported from metrics.ts)
export interface ProfitabilityMetrics {
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

export interface ActivityMetrics {
  totalTrades: number;
  tokensTraded: number;
  activeDays: number;
  tradesPerDay: number;
  avgHoldHours: number;
  medianHoldHours: number;
  minHoldHours: number;
  maxHoldHours: number;
}

export interface RiskMetrics {
  maxDrawdownPercent: number;
  sharpeRatio: number;
  volatility: number;
  largestLossSol: number;
  largestWinSol: number;
  riskOfRuinScore: number; // 0-1
  avgRiskPerTrade: number; // as % of capital
}

export interface TimingMetrics {
  earlyEntryRatePercent: number;
  avgEntrySpeedMinutes: number;
  launchEntries: number;
  exitDisciplineScore: number; // 0-100
}

export interface TimePeriodMetrics {
  last7dPnlSol: number;
  last30dPnlSol: number;
  last90dPnlSol: number;
  consistencyScore: number; // % of 30-day periods profitable
  positiveMonths: number;
  totalMonths: number;
}
