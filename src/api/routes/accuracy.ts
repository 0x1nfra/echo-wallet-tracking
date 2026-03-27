import { FastifyInstance } from 'fastify';
import { getAccuracyStats, MIN_SAMPLE } from '../../signals/accuracy.js';
import { db } from '../../db/index.js';
import { signal_events } from '../../db/schema.js';
import { desc } from 'drizzle-orm';

export default async function accuracyRoutes(app: FastifyInstance) {
  // REST: accuracy stats as JSON
  app.get('/api/accuracy', async (_req, reply) => {
    const stats = getAccuracyStats();
    return reply.send(stats);
  });

  // HTMX partial: renders accuracy_stats.ejs for dashboard refresh
  app.get('/api/accuracy/partial', async (_req, reply) => {
    const stats = getAccuracyStats();

    // Recent signal events: last 50, all tiers, ordered by fired_at DESC
    const recentEvents = db.select().from(signal_events)
      .orderBy(desc(signal_events.fired_at))
      .limit(50)
      .all();

    return reply.view('partials/accuracy_stats', { stats, recentEvents, MIN_SAMPLE });
  });
}
