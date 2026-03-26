// Detection tier values (confidence levels for flags)
export type DetectionTier = 'suspected' | 'review' | 'confirmed_suspicious';

// Overall wallet detection status (stored in wallets.detection_status)
export type DetectionStatus =
  | 'pending'
  | 'suspected'
  | 'review'
  | 'confirmed_suspicious'
  | 'confirmed_passing';

// Detector identifiers
export type DetectorId = 'bundler' | 'dev_wallet' | 'sniper' | 'wash_trader' | 'manual';

// Input config for each detector — includes raised threshold after user clear
export interface DetectorConfig {
  walletAddress: string;
  thresholdMultiplier: number; // 1.0 = normal; raised after user clear (e.g. 2.0, max 4.0)
}

// Output from each detector
export interface DetectorResult {
  detector: DetectorId;
  flagged: boolean;
  confidence: DetectionTier | null; // null when not flagged
  evidenceSummary: Record<string, unknown>; // key facts for CLI display (wallet review)
  evidenceDetail: Record<string, unknown>;  // full evidence blob for Phase 7 dashboard
}

// Active flag record (from wallet_flags table, used internally by engine)
export interface ActiveFlag {
  detector: DetectorId;
  confidence: DetectionTier;
  cleared: boolean;
  threshold_multiplier: number;
}
