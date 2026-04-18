/**
 * Signal Accuracy Aggregation — per-tier hit rate query.
 *
 * Aggregates fully-resolved signal_events rows grouped by tier.
 * Returns hit_rate_30m and hit_rate_24h only when total_resolved >= MIN_SAMPLE (20).
 * Excludes rows with null entry_price and rug tokens (is_rug=true) from all aggregates.
 *
 * Requirements: QUAL-02
 */
import { db as defaultDb } from '../db/index.js';
import { signal_events } from '../db/schema.js';
import { eq, and, isNotNull, or, isNull, sql } from 'drizzle-orm';

/** Minimum sample size before reporting hit_rate_24h. Below this, hit_rate_24h is null. */
export const MIN_SAMPLE = 20;

/** Per-tier accuracy statistics returned by getAccuracyStats() */
export interface TierAccuracy {
  tier: string;
  total_resolved: number;       // non-rug only (is_rug=false or null)
  hits_30m: number;
  hits_24h: number;
  hit_rate_30m: number | null;  // null if total_resolved < MIN_SAMPLE
  hit_rate_24h: number | null;  // null if total_resolved < MIN_SAMPLE
  avg_return_30m: number | null;
  avg_return_1h: number | null;
  avg_return_4h: number | null;
  avg_return_24h: number | null;
}

/**
 * Aggregate signal accuracy statistics per tier.
 *
 * Filters: is_fully_resolved=true AND entry_price IS NOT NULL AND (is_rug=false OR is_rug IS NULL).
 * Rug outcomes are excluded from all denominators to avoid survivorship bias.
 * Groups by tier. Calculates 30m and 24h hit counts/rates, and average returns for all windows.
 *
 * Returns hit_rate_30m and hit_rate_24h = null when total_resolved < MIN_SAMPLE (20)
 * to avoid reporting misleading rates from small samples.
 *
 * @param db - Injectable db instance (defaults to shared singleton; override in tests)
 * @returns Array of TierAccuracy rows, one per tier with resolved non-rug events
 */
export function getAccuracyStats(db: typeof defaultDb = defaultDb): TierAccuracy[] {
  const rows = db.select({
    tier: signal_events.tier,
    total_resolved: sql<number>`COUNT(*)`,
    hits_30m: sql<number>`SUM(CASE WHEN ${signal_events.outcome_30m_status} = 'hit' THEN 1 ELSE 0 END)`,
    hits_24h: sql<number>`SUM(CASE WHEN ${signal_events.outcome_24h_status} = 'hit' THEN 1 ELSE 0 END)`,
    avg_return_30m: sql<number>`AVG(${signal_events.outcome_30m_pct})`,
    avg_return_1h: sql<number>`AVG(${signal_events.outcome_1h_pct})`,
    avg_return_4h: sql<number>`AVG(${signal_events.outcome_4h_pct})`,
    avg_return_24h: sql<number>`AVG(${signal_events.outcome_24h_pct})`,
  })
    .from(signal_events)
    .where(and(
      eq(signal_events.is_fully_resolved, true),
      isNotNull(signal_events.entry_price),
      or(eq(signal_events.is_rug, false), isNull(signal_events.is_rug)),
    ))
    .groupBy(signal_events.tier)
    .all();

  return rows.map((r) => ({
    ...r,
    hit_rate_30m: r.total_resolved >= MIN_SAMPLE
      ? r.hits_30m / r.total_resolved
      : null,
    hit_rate_24h: r.total_resolved >= MIN_SAMPLE
      ? r.hits_24h / r.total_resolved
      : null,
  }));
}
