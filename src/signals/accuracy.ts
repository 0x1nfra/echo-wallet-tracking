/**
 * Signal Accuracy Aggregation — per-tier hit rate query.
 *
 * Aggregates fully-resolved signal_events rows grouped by tier.
 * Returns hit_rate_24h only when total_resolved >= MIN_SAMPLE (20).
 * Excludes rows with null entry_price from all aggregates.
 *
 * Requirements: QUAL-02
 */
import { db as defaultDb } from '../db/index.js';
import { signal_events } from '../db/schema.js';
import { eq, and, isNotNull, sql } from 'drizzle-orm';

/** Minimum sample size before reporting hit_rate_24h. Below this, hit_rate_24h is null. */
export const MIN_SAMPLE = 20;

/** Per-tier accuracy statistics returned by getAccuracyStats() */
export interface TierAccuracy {
  tier: string;
  total_resolved: number;
  hits_24h: number;
  hit_rate_24h: number | null; // null if total_resolved < MIN_SAMPLE
  avg_return_1h: number | null;
  avg_return_4h: number | null;
  avg_return_24h: number | null;
}

/**
 * Aggregate signal accuracy statistics per tier.
 *
 * Filters: is_fully_resolved=true AND entry_price IS NOT NULL.
 * Groups by tier. Calculates hit counts, hit rates, and average returns.
 *
 * Returns hit_rate_24h = null when total_resolved < MIN_SAMPLE (20)
 * to avoid reporting misleading rates from small samples.
 *
 * @param db - Injectable db instance (defaults to shared singleton; override in tests)
 * @returns Array of TierAccuracy rows, one per tier with resolved events
 */
export function getAccuracyStats(db: typeof defaultDb = defaultDb): TierAccuracy[] {
  const rows = db.select({
    tier: signal_events.tier,
    total_resolved: sql<number>`COUNT(*)`,
    hits_24h: sql<number>`SUM(CASE WHEN ${signal_events.outcome_24h_status} = 'hit' THEN 1 ELSE 0 END)`,
    avg_return_1h: sql<number>`AVG(${signal_events.outcome_1h_pct})`,
    avg_return_4h: sql<number>`AVG(${signal_events.outcome_4h_pct})`,
    avg_return_24h: sql<number>`AVG(${signal_events.outcome_24h_pct})`,
  })
    .from(signal_events)
    .where(and(
      eq(signal_events.is_fully_resolved, true),
      isNotNull(signal_events.entry_price),
    ))
    .groupBy(signal_events.tier)
    .all();

  return rows.map((r) => ({
    ...r,
    hit_rate_24h: r.total_resolved >= MIN_SAMPLE
      ? r.hits_24h / r.total_resolved
      : null,
  }));
}
