const WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Calculates a recency score 0–100 based on recent swap activity.
 * 180-day hard cutoff applied.
 * Formula:
 *   count = 0    → 0
 *   count < 5    → count * 5
 *   count >= 5   → min(100, 25 + (count - 5) * (75 / 45))
 */
export function calculateRecencyScore(
  swaps: Array<{ timestamp: number }>,
  nowMs: number = Date.now(),
): number {
  const cutoff = nowMs - WINDOW_MS;
  const recentCount = swaps.filter((s) => s.timestamp >= cutoff).length;

  if (recentCount === 0) return 0;
  if (recentCount < 5) return recentCount * 5;
  return Math.min(100, Math.round(25 + (recentCount - 5) * (75 / 45)));
}
