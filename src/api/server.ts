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
    const { desc, eq, and } = await import('drizzle-orm');

    const signals = db.select().from(token_signals).orderBy(desc(token_signals.signal_score)).all();
    const metas = db.select().from(token_metadata).all();
    const metaMap = new Map(metas.map(m => [m.token_mint, m]));

    const rows = signals.map(s => {
      const trackedBuyer = db.select({ wallet_address: swaps.wallet_address })
        .from(swaps)
        .where(and(eq(swaps.token_mint, s.token_mint), eq(swaps.side, 'buy')))
        .orderBy(desc(swaps.timestamp))
        .all()
        .find(row => {
          const w = db.select().from(wallets)
            .where(and(eq(wallets.address, row.wallet_address), eq(wallets.status, 'tracked'))).get();
          return !!w;
        });
      return {
        ...s,
        name: metaMap.get(s.token_mint)?.name ?? null,
        topHolderAddress: trackedBuyer?.wallet_address ?? null,
      };
    });

    const allWallets = db.select().from(wallets).where(eq(wallets.status, 'tracked')).all();
    const walletRows = allWallets.map(w => {
      const metrics = db.select().from(wallet_metrics).where(eq(wallet_metrics.wallet_address, w.address)).get();
      return { ...w, score: metrics?.score_total ?? null };
    });

    return reply.view('dashboard', { rows, wallets: walletRows }, { layout: 'layout' });
  });

  return app;
}
