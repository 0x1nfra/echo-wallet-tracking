import { Bot } from 'grammy';
import { db } from '../../db/index.js';
import { token_signals, alert_log, token_metadata, swaps, wallets } from '../../db/schema.js';
import { eq, gte, desc, and } from 'drizzle-orm';

const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const ACCUMULATION_DELTA = 3;

/**
 * Return the top 2-3 wallet addresses holding this token.
 * Strategy: find swaps for this token_mint from tracked wallets, group by wallet_address,
 * order by most-recent buy timestamp DESC, return top 3 distinct addresses.
 */
export function getTopHolders(tokenMint: string): string[] {
  const trackedSet = new Set(
    db.select({ address: wallets.address })
      .from(wallets)
      .where(eq(wallets.status, 'tracked'))
      .all()
      .map(w => w.address)
  );

  if (trackedSet.size === 0) return [];

  const rows = db.select({ wallet_address: swaps.wallet_address, ts: swaps.timestamp })
    .from(swaps)
    .where(and(eq(swaps.token_mint, tokenMint), eq(swaps.side, 'buy')))
    .orderBy(desc(swaps.timestamp))
    .all();

  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    if (!seen.has(row.wallet_address) && trackedSet.has(row.wallet_address)) {
      seen.add(row.wallet_address);
      result.push(row.wallet_address);
      if (result.length >= 3) break;
    }
  }
  return result;
}

function formatAlert(
  signal: typeof token_signals.$inferSelect,
  meta: { name?: string | null, symbol?: string | null } | undefined,
  type: 'SIGNAL' | 'ACCUMULATION',
  topHolders: string[],
): string {
  const name = meta?.name ?? meta?.symbol ?? signal.token_mint.slice(0, 16) + '...';
  const prefix = type === 'ACCUMULATION' ? 'ACCUMULATION ALERT' : 'SIGNAL ALERT';
  const holderLines = topHolders.length > 0
    ? '\nTop holders:\n' + topHolders.map(a => `  <code>${a.slice(0, 16)}...</code>`).join('\n')
    : '';
  return (
    `<b>${prefix}</b>\n` +
    `Token: <b>${name}</b>\n` +
    `Mint: <code>${signal.token_mint}</code>\n` +
    `Score: <b>${signal.signal_score?.toFixed(1)}</b>/100 [${signal.signal_tier ?? 'weak'}]\n` +
    `Smart holders: ${signal.smart_wallet_count ?? 0}` +
    holderLines
  );
}

export async function runAlertCycle(bot: Bot, chatId: string | number): Promise<void> {
  const threshold = Number(process.env.ALERT_SIGNAL_THRESHOLD ?? 50);
  const activeSignals = db.select().from(token_signals)
    .where(gte(token_signals.signal_score, threshold)).all();

  for (const signal of activeSignals) {
    const log = db.select().from(alert_log)
      .where(eq(alert_log.token_mint, signal.token_mint)).get();

    const now = Date.now();
    const withinDedup = log?.last_alerted_at != null && (now - log.last_alerted_at) < DEDUP_WINDOW_MS;
    const holderDelta = log ? ((signal.smart_wallet_count ?? 0) - (log.last_holder_count ?? 0)) : 0;
    const isAccumulation = withinDedup && holderDelta >= ACCUMULATION_DELTA;

    if (!withinDedup || isAccumulation) {
      const meta = db.select().from(token_metadata)
        .where(eq(token_metadata.token_mint, signal.token_mint)).get();
      const topHolders = getTopHolders(signal.token_mint);
      const msgType = isAccumulation ? 'ACCUMULATION' : 'SIGNAL';
      try {
        await bot.api.sendMessage(chatId, formatAlert(signal, meta, msgType, topHolders), { parse_mode: 'HTML' });
        db.insert(alert_log).values({
          token_mint: signal.token_mint,
          last_alerted_at: now,
          last_holder_count: signal.smart_wallet_count ?? 0,
        }).onConflictDoUpdate({
          target: alert_log.token_mint,
          set: { last_alerted_at: now, last_holder_count: signal.smart_wallet_count ?? 0 },
        }).run();
      } catch (err) {
        console.error('[bot] alert send failed:', err instanceof Error ? err.message : err);
      }
    }
  }
}
