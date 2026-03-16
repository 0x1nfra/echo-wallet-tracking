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

  // Dashboard root — query and pass data for initial server-side render
  app.get('/', async (_req, reply) => {
    const { db } = await import('../db/index.js');
    const { token_signals, token_metadata, wallets, wallet_metrics, swaps } = await import('../db/schema.js');
    const { desc, eq } = await import('drizzle-orm');

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
    const allWallets = [...trackedSet].map(address =>
      db.select().from(wallets).where(eq(wallets.address, address)).get()!
    );
    const allMetrics = db.select().from(wallet_metrics).all();
    const metricsMap = new Map(allMetrics.map(m => [m.wallet_address, m]));
    const walletRows = allWallets.map(w => ({ ...w, score: metricsMap.get(w.address)?.score_total ?? null }));

    return reply.view('dashboard', { rows, wallets: walletRows }, { layout: 'layout' });
  });

  return app;
}
