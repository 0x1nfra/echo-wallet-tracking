import { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { token_signals, token_metadata, swaps, wallets } from '../../db/schema.js';
import { desc, eq, and } from 'drizzle-orm';
import { cycleEmitter } from '../cycle-events.js';

function getTopHolderAddress(tokenMint: string, trackedSet: Set<string>): string | null {
  const rows = db.select({ wallet_address: swaps.wallet_address })
    .from(swaps)
    .where(and(eq(swaps.token_mint, tokenMint), eq(swaps.side, 'buy')))
    .orderBy(desc(swaps.timestamp))
    .all();
  return rows.find(r => trackedSet.has(r.wallet_address))?.wallet_address ?? null;
}

export default async function signalsRoutes(app: FastifyInstance) {
  // REST: all signals sorted by score DESC
  app.get('/api/signals', async (_req, reply) => {
    const signals = db.select().from(token_signals)
      .orderBy(desc(token_signals.signal_score))
      .all();
    const metas = db.select().from(token_metadata).all();
    const metaMap = new Map(metas.map(m => [m.token_mint, m]));
    return reply.send(signals.map(s => ({
      ...s,
      name: metaMap.get(s.token_mint)?.name ?? null,
      symbol: metaMap.get(s.token_mint)?.symbol ?? null,
    })));
  });

  // REST: single token
  app.get('/api/signals/:mint', async (req, reply) => {
    const { mint } = req.params as { mint: string };
    const signal = db.select().from(token_signals)
      .where(eq(token_signals.token_mint, mint)).get();
    if (!signal) return reply.code(404).send({ error: 'not found' });
    const meta = db.select().from(token_metadata)
      .where(eq(token_metadata.token_mint, mint)).get();
    return reply.send({ ...signal, name: meta?.name ?? null, symbol: meta?.symbol ?? null });
  });

  // HTMX partial: signal rows HTML (re-rendered on each SSE cycle)
  app.get('/api/signals/partial', async (_req, reply) => {
    const signals = db.select().from(token_signals)
      .orderBy(desc(token_signals.signal_score))
      .all();
    const metas = db.select().from(token_metadata).all();
    const metaMap = new Map(metas.map(m => [m.token_mint, m]));
    const trackedSet = new Set(
      db.select({ address: wallets.address }).from(wallets).where(eq(wallets.status, 'tracked')).all().map(w => w.address)
    );

    const rows = signals.map(s => ({
      ...s,
      name: metaMap.get(s.token_mint)?.name ?? s.token_mint.slice(0, 12) + '...',
      topHolderAddress: getTopHolderAddress(s.token_mint, trackedSet),
    }));

    return reply.view('partials/signal_rows', { rows });
  });

  // SSE: broadcast 'cycle' event after each MonitorLoop cycle
  app.get('/events/cycle', { sse: true }, async (_req, reply) => {
    reply.sse.onClose(() => { /* cleanup handled by generator break */ });

    await reply.sse.send((async function* () {
      // Send initial keepalive so browser knows connection is alive
      yield { event: 'connected', data: JSON.stringify({ ts: Date.now() }) };
      while (reply.sse.isConnected) {
        await new Promise<void>(resolve => cycleEmitter.once('cycle', resolve));
        if (!reply.sse.isConnected) break;
        yield { event: 'cycle', data: JSON.stringify({ ts: Date.now() }) };
      }
    })());
  });
}
