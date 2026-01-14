/**
 * Export format types
 */

import { WalletCategory, WalletMetrics, CategoryResult, AccountInfo } from './wallet.js';

export interface AxiomExport {
  version: string;
  generatedAt: string; // ISO 8601
  analysisPeriodDays: number;
  totalWallets: number;
  wallets: AxiomWallet[];
  summary: ExportSummary;
}

export interface AxiomWallet {
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

export interface ExportSummary {
  categoryBreakdown: Record<WalletCategory, number>;
  avgScore: number;
  totalTrackedPnlSol: number;
}

export interface CsvRow {
  address: string;
  score: number;
  category: WalletCategory;
  totalPnlSol: number;
  roiPercent: number;
  winRatePercent: number;
  totalTrades: number;
  avgHoldHours: number;
  sharpeRatio: number;
  maxDrawdownPercent: number;
  last30dPnlSol: number;
}
