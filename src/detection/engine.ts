import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallets, swaps, wallet_flags } from '../db/schema.js';
import { SEVERITY_ORDER } from './thresholds.js';
import type { ActiveFlag, DetectionStatus, DetectionTier } from './types.js';
import { detectBundler } from './bundler.js';
import { detectDevWallet } from './dev-wallet.js';
import { detectSniper } from './sniper.js';
import { detectWashTrader } from './wash-trader.js';

const TIER_ORDER: DetectionTier[] = ['confirmed_suspicious', 'review', 'suspected'];

export function computeOverallStatus(activeFlags: ActiveFlag[]): DetectionStatus {
  const unclearedFlags = activeFlags.filter(f => !f.cleared);
  if (unclearedFlags.length === 0) return 'confirmed_passing';

  // Find worst detector by severity order
  const worstDetector = SEVERITY_ORDER.find(d => unclearedFlags.some(f => f.detector === d));
  if (!worstDetector) return 'confirmed_passing';

  // Among flags from worst detector, find highest confidence tier
  const worstFlags = unclearedFlags.filter(f => f.detector === worstDetector);
  for (const tier of TIER_ORDER) {
    if (worstFlags.some(f => f.confidence === tier)) return tier;
  }
  return 'confirmed_passing';
}

export async function runDetection(walletAddress: string): Promise<void> {
  // 1. Read existing cleared flags to get per-detector threshold_multiplier values
  const clearedFlags = db.select().from(wallet_flags)
    .where(and(eq(wallet_flags.wallet_address, walletAddress), eq(wallet_flags.cleared, true)))
    .all();

  const multiplierFor = (detector: string) =>
    Math.max(...clearedFlags.filter(f => f.detector === detector).map(f => f.threshold_multiplier), 1.0);

  // 2. Run all four detectors in parallel
  const results = await Promise.all([
    detectBundler({ walletAddress, thresholdMultiplier: multiplierFor('bundler') }),
    detectDevWallet({ walletAddress, thresholdMultiplier: multiplierFor('dev_wallet') }),
    detectSniper({ walletAddress, thresholdMultiplier: multiplierFor('sniper') }),
    detectWashTrader({ walletAddress, thresholdMultiplier: multiplierFor('wash_trader') }),
  ]);

  // 3. For each flagged result: find existing ACTIVE (cleared=false) flag for same wallet+detector
  //    and UPDATE it, or INSERT new row if none exists.
  for (const result of results) {
    if (!result.flagged || !result.confidence) continue;

    const existingActive = db.select().from(wallet_flags)
      .where(and(
        eq(wallet_flags.wallet_address, walletAddress),
        eq(wallet_flags.detector, result.detector),
        eq(wallet_flags.cleared, false)
      )).get();

    if (existingActive) {
      db.update(wallet_flags).set({
        confidence: result.confidence,
        evidence_summary: JSON.stringify(result.evidenceSummary),
        evidence_detail: JSON.stringify(result.evidenceDetail),
        updated_at: Date.now(),
      }).where(eq(wallet_flags.id, existingActive.id)).run();
    } else {
      db.insert(wallet_flags).values({
        wallet_address: walletAddress,
        detector: result.detector,
        confidence: result.confidence,
        evidence_summary: JSON.stringify(result.evidenceSummary),
        evidence_detail: JSON.stringify(result.evidenceDetail),
      }).run();
    }
  }

  // 4. Read all active flags, compute overall status, write to wallets.detection_status
  const activeFlags = db.select().from(wallet_flags)
    .where(and(eq(wallet_flags.wallet_address, walletAddress), eq(wallet_flags.cleared, false)))
    .all();

  const overallStatus = computeOverallStatus(activeFlags as ActiveFlag[]);

  db.update(wallets).set({ detection_status: overallStatus, last_checked_at: Date.now() })
    .where(eq(wallets.address, walletAddress)).run();
}

export async function runDetectionIfNeeded(walletAddress: string): Promise<void> {
  const wallet = db.select().from(wallets).where(eq(wallets.address, walletAddress)).get();
  if (!wallet?.history_complete) return; // Not yet eligible

  const lastChecked = wallet.last_checked_at ?? 0;
  const hasNewSwaps = db.select({ id: swaps.id }).from(swaps)
    .where(and(eq(swaps.wallet_address, walletAddress), gt(swaps.timestamp, lastChecked)))
    .get();
  if (!hasNewSwaps) return; // No new data — skip

  await runDetection(walletAddress);
}

export function getEligibleWallets(): string[] {
  return db.select({ address: wallets.address }).from(wallets)
    .where(eq(wallets.detection_status, 'confirmed_passing'))
    .all()
    .map(r => r.address);
}
