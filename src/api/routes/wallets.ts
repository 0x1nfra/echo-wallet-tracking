import { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { wallets, wallet_metrics } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function walletsRoutes(app: FastifyInstance) {
  app.get('/api/wallets', async (_req, reply) => {
    const allWallets = db.select().from(wallets)
      .where(eq(wallets.status, 'tracked'))
      .all();
    const result = allWallets.map(w => {
      const metrics = db.select().from(wallet_metrics)
        .where(eq(wallet_metrics.wallet_address, w.address)).get();
      return {
        address: w.address,
        label: w.label,
        status: w.status,
        detection_status: w.detection_status,
        score: metrics?.score_total ?? null,
        last_active: w.last_trade_at,
        added_at: w.added_at,
      };
    });
    return reply.send(result);
  });
}
