import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { sourcing_log } from '../../db/schema.js';
import { desc } from 'drizzle-orm';

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin', async (_req, reply) => {
    // Use dynamic imports to avoid circular dependencies
    const { monitorLoop } = await import('../../commands/wallet.js');
    const { autoSourcer } = await import('../../monitor/index.js');

    const monitorStats = {
      cycleCount: monitorLoop.cycleCount,
      lastCycleDurationMs: monitorLoop.lastCycleDurationMs,
      lastCycleCompletedAt: monitorLoop.lastCycleCompletedAt,
      // Stall detection: stalled if lastCycleCompletedAt > 5 minutes ago
      stalled: monitorLoop.lastCycleCompletedAt !== null
        && (Date.now() - monitorLoop.lastCycleCompletedAt) > 5 * 60 * 1000,
    };

    const sourcerStats = autoSourcer.getStats();

    // Recent sourcing log — last 10 entries
    const recentSourcingLog = db.select()
      .from(sourcing_log)
      .orderBy(desc(sourcing_log.polled_at))
      .limit(10)
      .all();

    // Provider status: use the shared singleton updated by loop.ts
    let providerStatus: Array<{ index: number; name: string; state: string; lastError: string | null }> = [];
    try {
      const { getSharedProviderStatus } = await import('../../fetchers/providers/index.js');
      providerStatus = getSharedProviderStatus();
    } catch {
      providerStatus = [{ index: 0, name: 'unavailable', state: 'unknown', lastError: null }];
    }

    return reply.view('admin', { monitorStats, sourcerStats, recentSourcingLog, providerStatus, now: Date.now() }, { layout: 'layout' });
  });
}
