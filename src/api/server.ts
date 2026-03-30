import Fastify from 'fastify';
import SSEPlugin from '@fastify/sse';
import StaticPlugin from '@fastify/static';
import ViewPlugin from '@fastify/view';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildServer() {
  const app = Fastify({ logger: { level: 'warn' } }); // reduce noise in monitor output

  await app.register(SSEPlugin);
  await app.register(StaticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/public/',
  });
  await app.register(ViewPlugin, {
    engine: { ejs },
    root: path.join(__dirname, 'views'),
  });

  await app.register(import('./routes/signals.js'));
  await app.register(import('./routes/wallets.js'));
  await app.register(import('./routes/status.js'));
  await app.register(import('./routes/accuracy.js'));

  // Dashboard root — query and pass data for initial server-side render
  app.get('/', async (_req, reply) => {
    const { db } = await import('../db/index.js');
    const { token_signals, token_metadata, wallets, wallet_metrics, swaps, signal_events } = await import('../db/schema.js');
    const { desc, eq, and, or, isNull, isNotNull, lt, lte, gt } = await import('drizzle-orm');
    const { getAccuracyStats, MIN_SAMPLE } = await import('../signals/accuracy.js');

    const signals = db.select().from(token_signals).orderBy(desc(token_signals.signal_score)).all();
    const metas = db.select().from(token_metadata).all();
    const metaMap = new Map(metas.map(m => [m.token_mint, m]));

    // Pre-load tracked wallets once — avoid N+1 per signal
    const trackedSet = new Set(
      db.select({ address: wallets.address }).from(wallets).where(eq(wallets.status, 'tracked')).all().map(w => w.address)
    );

    const rows = signals.map(s => {
      const buyerRows = db.select({ wallet_address: swaps.wallet_address })
        .from(swaps)
        .where(eq(swaps.token_mint, s.token_mint))
        .orderBy(desc(swaps.timestamp))
        .all();
      const topHolderAddress = buyerRows.find(r => trackedSet.has(r.wallet_address))?.wallet_address ?? null;
      return {
        ...s,
        name: metaMap.get(s.token_mint)?.name ?? null,
        topHolderAddress,
      };
    });

    // Batch load all wallet metrics in one query, keyed by address
    const allMetrics = db.select().from(wallet_metrics).all();
    const metricsMap = new Map(allMetrics.map(m => [m.wallet_address, m]));

    const nowMs = Date.now();

    // Active wallets: status='tracked' AND (probation_until IS NULL OR probation_until <= now)
    const activeWalletRows = db.select().from(wallets)
      .where(and(eq(wallets.status, 'tracked'), or(isNull(wallets.probation_until), lte(wallets.probation_until, nowMs))))
      .all()
      .map(w => ({ ...w, score: metricsMap.get(w.address)?.score_total ?? null }));

    // Probationary wallets: status='tracked' AND probation_until IS NOT NULL AND probation_until > now
    const probationaryWalletRows = db.select().from(wallets)
      .where(and(eq(wallets.status, 'tracked'), isNotNull(wallets.probation_until), gt(wallets.probation_until, nowMs)))
      .all()
      .map(w => ({ ...w, score: metricsMap.get(w.address)?.score_total ?? null }));

    const accuracyStats = getAccuracyStats();
    const recentSignalEvents = db.select().from(signal_events)
      .orderBy(desc(signal_events.fired_at))
      .limit(50)
      .all();

    return reply.view('dashboard', { rows, active: activeWalletRows, probationary: probationaryWalletRows, accuracyStats, recentSignalEvents, MIN_SAMPLE }, { layout: 'layout' });
  });

  return app;
}
