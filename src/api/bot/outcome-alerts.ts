/**
 * Outcome Alerts — fires Telegram alerts when signal outcomes cross
 * user-configured thresholds and fixed milestones.
 *
 * Alert types:
 * - 'threshold': first time ANY resolved window shows pct >= ALERT_THRESHOLD_PCT
 *   Full alert: CA, ticker, market cap at signal, wallet count, current return
 * - 'milestone_50', 'milestone_100', 'milestone_300': when hit_50/100/300=true
 *   Lean alert: ticker, CA, wallet count, milestone reached
 *
 * Dedup: outcome_alert_log table with unique(signal_event_id, event_type)
 * One-cycle delay is acceptable — milestone flags are written by outcome-resolver
 * on the previous cycle and picked up here on the next cycle.
 *
 * Requirements: OUTCOME-05
 */

import { Bot } from 'grammy';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { signal_events, outcome_alert_log } from '../../db/schema.js';

const ALERT_THRESHOLD_PCT = parseFloat(process.env.ALERT_THRESHOLD_PCT ?? '100');

const MILESTONES = [
  { flag: 'hit_50' as const, label: '50%', eventType: 'milestone_50' as const },
  { flag: 'hit_100' as const, label: '100%', eventType: 'milestone_100' as const },
  { flag: 'hit_300' as const, label: '300%', eventType: 'milestone_300' as const },
];

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatTicker(tokenMint: string): string {
  return `${tokenMint.slice(0, 4)}...${tokenMint.slice(-4)}`;
}

export async function runOutcomeAlertCycle(bot: Bot, chatId: string | number): Promise<void> {
  // Query signal_events that have at least one resolved window and are not rugs
  const candidates = db.select({
    id: signal_events.id,
    token_mint: signal_events.token_mint,
    signal_market_cap: signal_events.signal_market_cap,
    smart_wallet_count: signal_events.smart_wallet_count,
    outcome_30m_pct: signal_events.outcome_30m_pct,
    outcome_1h_pct: signal_events.outcome_1h_pct,
    outcome_4h_pct: signal_events.outcome_4h_pct,
    outcome_24h_pct: signal_events.outcome_24h_pct,
    hit_50: signal_events.hit_50,
    hit_100: signal_events.hit_100,
    hit_300: signal_events.hit_300,
  })
    .from(signal_events)
    .where(and(
      isNotNull(signal_events.entry_price),
      // At least one window resolved
      or(
        isNotNull(signal_events.outcome_30m_pct),
        isNotNull(signal_events.outcome_1h_pct),
        isNotNull(signal_events.outcome_4h_pct),
        isNotNull(signal_events.outcome_24h_pct),
      ),
      // Not a rug (rugs don't get alerts)
      or(eq(signal_events.is_rug, false), isNull(signal_events.is_rug)),
    ))
    .all();

  for (const event of candidates) {
    const ticker = formatTicker(event.token_mint);

    // --- Threshold alert ---
    const resolvedPcts = [
      event.outcome_30m_pct,
      event.outcome_1h_pct,
      event.outcome_4h_pct,
      event.outcome_24h_pct,
    ].filter((v): v is number => v !== null);

    if (resolvedPcts.length > 0) {
      const maxPct = Math.max(...resolvedPcts);

      // maxPct is stored as a decimal fraction (e.g. 1.0 = 100%)
      if (maxPct * 100 >= ALERT_THRESHOLD_PCT) {
        const existing = db.select({ id: outcome_alert_log.id })
          .from(outcome_alert_log)
          .where(and(
            eq(outcome_alert_log.signal_event_id, event.id),
            eq(outcome_alert_log.event_type, 'threshold'),
          ))
          .get();

        if (!existing) {
          // Determine which window label produced maxPct
          const windowLabels = ['30m', '1h', '4h', '24h'];
          const windowPcts = [
            event.outcome_30m_pct,
            event.outcome_1h_pct,
            event.outcome_4h_pct,
            event.outcome_24h_pct,
          ];
          const maxIdx = windowPcts.indexOf(maxPct);
          const windowLabel = maxIdx >= 0 ? windowLabels[maxIdx] : 'unknown';

          const mcText = event.signal_market_cap != null
            ? formatUsd(event.signal_market_cap)
            : 'N/A';

          const html =
            `<b>OUTCOME ALERT: ${ticker}</b>\n` +
            `CA: <code>${event.token_mint}</code>\n` +
            `Market cap at signal: ${mcText}\n` +
            `Tracked wallets: ${event.smart_wallet_count}\n` +
            `Current return: +${(maxPct * 100).toFixed(1)}% at ${windowLabel}`;

          try {
            await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
            db.insert(outcome_alert_log).values({
              signal_event_id: event.id,
              event_type: 'threshold',
              fired_at: Date.now(),
            }).onConflictDoNothing().run();
          } catch (err) {
            console.error('[outcome-alerts] threshold alert send failed:', err instanceof Error ? err.message : err);
          }
        }
      }
    }

    // --- Milestone alerts ---
    for (const milestone of MILESTONES) {
      if (event[milestone.flag] === true) {
        const existing = db.select({ id: outcome_alert_log.id })
          .from(outcome_alert_log)
          .where(and(
            eq(outcome_alert_log.signal_event_id, event.id),
            eq(outcome_alert_log.event_type, milestone.eventType),
          ))
          .get();

        if (!existing) {
          const html =
            `<b>${ticker} hit ${milestone.label}</b>\n` +
            `CA: <code>${event.token_mint}</code> | ${event.smart_wallet_count} wallets`;

          try {
            await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
            db.insert(outcome_alert_log).values({
              signal_event_id: event.id,
              event_type: milestone.eventType,
              fired_at: Date.now(),
            }).onConflictDoNothing().run();
          } catch (err) {
            console.error(`[outcome-alerts] milestone ${milestone.eventType} alert send failed:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }
  }
}
