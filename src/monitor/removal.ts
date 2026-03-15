import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallets, removal_log } from '../db/schema.js';

export const LOW_SCORE_THRESHOLD = 30;     // score below this counts toward streak
export const LOW_SCORE_STREAK_LIMIT = 10;  // consecutive cycles before removal
export const INACTIVITY_DAYS = 30;         // configurable inactivity window

/**
 * Mark a wallet as removed and write an entry to removal_log.
 */
export function removeWallet(
  address: string,
  reason: string,
  label: string | null,
  scoreAtRemoval: number | null,
  detectionDetails: string | null,
): void {
  db.update(wallets)
    .set({ status: 'removed' })
    .where(eq(wallets.address, address))
    .run();

  db.insert(removal_log).values({
    wallet_address: address,
    reason,
    label,
    score_at_removal: scoreAtRemoval,
    detection_details: detectionDetails,
    removed_by: 'auto',
  }).run();

  console.log(
    `[monitor] auto-removed ${address}${label ? ` (${label})` : ''} — ${reason}`,
  );
}

/**
 * Check all three removal policies for a wallet after a successful pipeline run.
 * Returns true if the wallet was removed, false otherwise.
 *
 * NOTE: This must only be called after a *successful* fetch→detect→score pipeline.
 * Fetch errors must be caught in the loop layer without calling this function,
 * so the low_score_streak counter is never incremented on failure.
 */
export function checkRemovalPolicies(walletAddress: string): boolean {
  const wallet = db.select().from(wallets).where(eq(wallets.address, walletAddress)).get();
  if (!wallet) return false;

  // Policy 1 — Confirmed scam (RMVL-02)
  if (wallet.detection_status === 'confirmed_suspicious') {
    removeWallet(
      wallet.address,
      'confirmed_suspicious detection',
      wallet.label,
      wallet.score,
      wallet.detection_status,
    );
    return true;
  }

  // Policy 2 — Score streak (RMVL-01)
  if (wallet.score !== null && wallet.score < LOW_SCORE_THRESHOLD) {
    // Increment streak counter
    db.update(wallets)
      .set({ low_score_streak: (wallet.low_score_streak ?? 0) + 1 })
      .where(eq(wallets.address, walletAddress))
      .run();

    // Re-read updated row
    const updated = db.select().from(wallets).where(eq(wallets.address, walletAddress)).get();
    if (updated && (updated.low_score_streak ?? 0) >= LOW_SCORE_STREAK_LIMIT) {
      removeWallet(
        updated.address,
        `score below ${LOW_SCORE_THRESHOLD} for ${LOW_SCORE_STREAK_LIMIT} consecutive cycles`,
        updated.label,
        updated.score,
        null,
      );
      return true;
    }
  } else if (wallet.score !== null && wallet.score >= LOW_SCORE_THRESHOLD) {
    // Reset streak — wallet is performing above threshold this cycle
    db.update(wallets)
      .set({ low_score_streak: 0 })
      .where(eq(wallets.address, walletAddress))
      .run();
  }

  // Policy 3 — Inactivity (RMVL-03)
  // Wallets with last_trade_at = NULL are "not yet tracked by the loop" — skip
  if (wallet.last_trade_at !== null) {
    const inactivityMs = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - wallet.last_trade_at > inactivityMs) {
      removeWallet(
        wallet.address,
        `no trades for ${INACTIVITY_DAYS} days`,
        wallet.label,
        wallet.score,
        null,
      );
      return true;
    }
  }

  return false;
}
