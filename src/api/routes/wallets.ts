import { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { wallets, wallet_metrics, wallet_flags, swaps } from '../../db/schema.js';
import { eq, and, desc, isNull, isNotNull, lt, lte, gt, or } from 'drizzle-orm';

export default async function walletsRoutes(app: FastifyInstance) {
  app.get('/api/wallets', async (_req, reply) => {
    const nowMs = Date.now();
    const allMetrics = db.select().from(wallet_metrics).all();
    const metricsMap = new Map(allMetrics.map(m => [m.wallet_address, m]));

    // Active wallets: status='tracked' AND (probation_until IS NULL OR probation_until <= now)
    const activeWalletRows = db.select().from(wallets)
      .where(and(eq(wallets.status, 'tracked'), or(isNull(wallets.probation_until), lte(wallets.probation_until, nowMs))))
      .all();

    // Probationary wallets: status='tracked' AND probation_until IS NOT NULL AND probation_until > now
    const probationaryWalletRows = db.select().from(wallets)
      .where(and(eq(wallets.status, 'tracked'), isNotNull(wallets.probation_until), gt(wallets.probation_until, nowMs)))
      .all();

    const mapRow = (w: typeof activeWalletRows[number]) => ({
      address: w.address,
      label: w.label,
      status: w.status,
      detection_status: w.detection_status,
      score: metricsMap.get(w.address)?.score_total ?? null,
      last_active: w.last_trade_at,
      added_at: w.added_at,
      probation_until: w.probation_until,
    });

    return reply.send({
      active: activeWalletRows.map(mapRow),
      probationary: probationaryWalletRows.map(mapRow),
    });
  });

  // HTML page route — wallet detail view
  app.get('/wallets/:address', async (req, reply) => {
    const { address } = req.params as { address: string };
    const wallet = db.select().from(wallets).where(eq(wallets.address, address)).get();
    if (!wallet) return reply.code(404).send('Wallet not found');

    const metrics = db.select().from(wallet_metrics)
      .where(eq(wallet_metrics.wallet_address, address)).get();
    const flags = db.select().from(wallet_flags)
      .where(and(eq(wallet_flags.wallet_address, address), eq(wallet_flags.cleared, false))).all();
    const recentTrades = db.select().from(swaps)
      .where(eq(swaps.wallet_address, address))
      .orderBy(desc(swaps.timestamp)).limit(20).all();

    // Current holdings: tokens where net buy > sell (positive position)
    const allTrades = db.select().from(swaps)
      .where(eq(swaps.wallet_address, address)).all();
    const positions = new Map<string, number>();
    for (const t of allTrades) {
      const cur = positions.get(t.token_mint) ?? 0;
      positions.set(t.token_mint, cur + (t.side === 'buy' ? t.token_amount : -t.token_amount));
    }
    const holdings = [...positions.entries()]
      .filter(([, qty]) => qty > 0.001)
      .map(([mint, qty]) => ({ mint, quantity: qty }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return reply.view('wallet', { wallet, metrics, flags, recentTrades, holdings }, { layout: 'layout' });
  });
}
