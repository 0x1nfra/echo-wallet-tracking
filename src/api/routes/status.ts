import { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { wallets, token_signals } from '../../db/schema.js';
import { count, gt, max } from 'drizzle-orm';

export default async function statusRoutes(app: FastifyInstance) {
  app.get('/api/status', async (_req, reply) => {
    const walletCount = db.select({ count: count() }).from(wallets).get()!.count;
    const signalCount = db.select({ count: count() }).from(token_signals)
      .where(gt(token_signals.signal_score, 0)).get()!.count;
    // last cycle: get max updated_at from token_signals
    const latest = db.select({ max: max(token_signals.updated_at) }).from(token_signals).get();
    return reply.send({
      status: 'ok',
      wallet_count: walletCount,
      active_signal_count: signalCount,
      last_cycle_at: latest?.max ?? null,
    });
  });
}
