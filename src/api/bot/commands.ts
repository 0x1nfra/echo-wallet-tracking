import { Bot } from 'grammy';
import { db } from '../../db/index.js';
import { wallets, wallet_metrics, wallet_flags, token_signals, token_metadata, swaps } from '../../db/schema.js';
import { eq, and, desc, count, gt } from 'drizzle-orm';
import { getTopHolders } from './alerts.js';
import { getAccuracyStats, MIN_SAMPLE } from '../../signals/accuracy.js';

export function registerCommands(bot: Bot): void {
  // /status — system health
  bot.command('status', async (ctx) => {
    const walletCount = db.select({ count: count() }).from(wallets).get()!.count;
    const signalCount = db.select({ count: count() }).from(token_signals)
      .where(gt(token_signals.signal_score, 0)).get()!.count;
    const latest = db.select({ ts: token_signals.updated_at }).from(token_signals)
      .orderBy(desc(token_signals.updated_at)).limit(1).get();
    const lastCycle = latest?.ts
      ? new Date(latest.ts).toLocaleString()
      : 'No cycles yet';
    await ctx.reply(
      `<b>Echo System Status</b>\n` +
      `Wallets tracked: ${walletCount}\n` +
      `Active signals: ${signalCount}\n` +
      `Last cycle: ${lastCycle}`,
      { parse_mode: 'HTML' }
    );
  });

  // /top — top 5 signals; each entry includes token mint, score, tier, and top holder wallet address
  bot.command('top', async (ctx) => {
    const top = db.select().from(token_signals)
      .orderBy(desc(token_signals.signal_score))
      .limit(5).all();
    if (top.length === 0) {
      return ctx.reply('No signals yet. Start the monitor to generate signals.');
    }
    const metas = db.select().from(token_metadata).all();
    const metaMap = new Map(metas.map(m => [m.token_mint, m]));

    const lines = top.map((s, i) => {
      const meta = metaMap.get(s.token_mint);
      const name = meta?.symbol ?? s.token_mint.slice(0, 10) + '...';
      const topHolder = getTopHolders(s.token_mint)[0] ?? null;
      const holderStr = topHolder ? `\n   holder: <code>${topHolder.slice(0, 16)}...</code>` : '';
      return `${i + 1}. <b>${name}</b> — score <b>${s.signal_score?.toFixed(1)}</b> [${s.signal_tier ?? 'weak'}]` + holderStr;
    });
    await ctx.reply(`<b>Top 5 Signals</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  });

  // /wallet <address>
  bot.command('wallet', async (ctx) => {
    const address = ctx.match?.trim();
    if (!address) return ctx.reply('Usage: /wallet <address>');

    const wallet = db.select().from(wallets).where(eq(wallets.address, address)).get();
    if (!wallet) return ctx.reply('Wallet not found in tracker.');

    const metrics = db.select().from(wallet_metrics)
      .where(eq(wallet_metrics.wallet_address, address)).get();
    const flags = db.select().from(wallet_flags)
      .where(and(eq(wallet_flags.wallet_address, address), eq(wallet_flags.cleared, false))).all();
    const recentTrades = db.select().from(swaps)
      .where(eq(swaps.wallet_address, address))
      .orderBy(desc(swaps.timestamp)).limit(5).all();

    const detectionLines = flags.length > 0
      ? flags.map(f => `  • ${f.detector}: ${f.confidence}`).join('\n')
      : '  • All detectors: clean';
    const tradeLines = recentTrades.length > 0
      ? recentTrades.map(t =>
          `  ${t.side.toUpperCase()} ${t.sol_amount.toFixed(3)} SOL — ${t.token_mint.slice(0, 8)}...` +
          (t.realized_pnl_sol != null ? ` (PnL: ${t.realized_pnl_sol > 0 ? '+' : ''}${t.realized_pnl_sol.toFixed(4)} SOL)` : '')
        ).join('\n')
      : '  No recent trades';

    const subScores = metrics
      ? `  Risk-adj: ${metrics.score_risk_adjusted?.toFixed(1) ?? '—'} (40%)\n` +
        `  Win rate: ${metrics.score_win_rate?.toFixed(1) ?? '—'} (20%)\n` +
        `  Consistency: ${metrics.score_consistency_recency?.toFixed(1) ?? '—'} (20%)\n` +
        `  Activity: ${metrics.score_activity_health?.toFixed(1) ?? '—'} (20%)`
      : '  Not yet scored';

    await ctx.reply(
      `<b>Wallet</b> <code>${address.slice(0, 16)}...</code>\n` +
      (wallet.label ? `Label: ${wallet.label}\n` : '') +
      `Score: <b>${metrics?.score_total?.toFixed(1) ?? 'N/A'}</b>/100\n` +
      `Status: ${wallet.detection_status ?? 'pending'}\n\n` +
      `<b>Sub-scores:</b>\n${subScores}\n\n` +
      `<b>Detection:</b>\n${detectionLines}\n\n` +
      `<b>Last 5 trades:</b>\n${tradeLines}`,
      { parse_mode: 'HTML' }
    );
  });

  // /signal <mint>
  bot.command('signal', async (ctx) => {
    const mint = ctx.match?.trim();
    if (!mint) return ctx.reply('Usage: /signal <token_mint>');

    const signal = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, mint)).get();
    if (!signal) return ctx.reply('No signal found for that token mint. It may not be held by any tracked wallet.');

    const meta = db.select().from(token_metadata)
      .where(eq(token_metadata.token_mint, mint)).get();
    const name = meta?.name ?? meta?.symbol ?? mint.slice(0, 16) + '...';

    await ctx.reply(
      `<b>${name}</b>\n` +
      `Score: <b>${signal.signal_score?.toFixed(1) ?? '—'}</b>/100 [${signal.signal_tier ?? 'weak'}]\n` +
      `Smart holders: ${signal.smart_wallet_count ?? 0}\n` +
      `Buy velocity (1h): ${signal.buy_velocity_1h?.toFixed(2) ?? '—'}\n` +
      `Exit pressure: ${signal.exit_pressure?.toFixed(2) ?? '—'}\n` +
      `Coordinated wallets: ${signal.coordinated_wallet_count ?? 0}\n` +
      `Updated: ${signal.updated_at ? new Date(signal.updated_at).toLocaleString() : 'unknown'}`,
      { parse_mode: 'HTML' }
    );
  });

  // /accuracy — signal accuracy stats by tier
  bot.command('accuracy', async (ctx) => {
    const stats = getAccuracyStats();

    if (stats.length === 0) {
      return ctx.reply('No resolved signal outcomes yet. Check back after 24h of monitoring.');
    }

    const statsMap = new Map(stats.map(s => [s.tier, s]));
    const lines = ['strong', 'moderate'].map(tier => {
      const s = statsMap.get(tier);
      if (!s) return `<b>${tier}:</b> No data`;
      if (s.total_resolved < MIN_SAMPLE) {
        return `<b>${tier}:</b> Insufficient data (${s.total_resolved}/${MIN_SAMPLE})`;
      }
      const hr = (s.hit_rate_24h! * 100).toFixed(1);
      const avg24 = s.avg_return_24h != null ? (s.avg_return_24h * 100).toFixed(1) + '%' : '—';
      const avg1h = s.avg_return_1h != null ? (s.avg_return_1h * 100).toFixed(1) + '%' : '—';
      return `<b>${tier}:</b> ${hr}% hit rate | 1h avg: ${avg1h} | 24h avg: ${avg24} | n=${s.total_resolved}`;
    });

    // Include weak tier stats if available (for tier differentiation info, not primary display)
    const weakStats = statsMap.get('weak');
    if (weakStats && weakStats.total_resolved >= MIN_SAMPLE) {
      const weakDir = weakStats.hit_rate_24h != null ? (weakStats.hit_rate_24h * 100).toFixed(1) + '% directional' : '—';
      lines.push(`<b>weak:</b> ${weakDir} | n=${weakStats.total_resolved}`);
    }

    await ctx.reply(
      `<b>Signal Accuracy</b>\n\nThresholds: Strong ≥+50%, Moderate ≥+25%, Weak=directional\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML' }
    );
  });

  // Log chatId on /start (user must send /start first to receive alerts)
  bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    console.log(`[bot] chatId: ${chatId} — add TELEGRAM_CHAT_ID=${chatId} to your .env file`);
    await ctx.reply(
      `Echo bot active.\nYour chat ID: <code>${chatId}</code>\nAdd <b>TELEGRAM_CHAT_ID=${chatId}</b> to your .env to receive alerts.`,
      { parse_mode: 'HTML' }
    );
  });
}
