import { buildServer } from '../../../src/api/server.js';
import { FastifyInstance } from 'fastify';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns HTTP 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('response body contains { status: "ok" } and a numeric uptime field', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('buildServer() registers the /health route before listen is called', async () => {
    const routes = app.printRoutes();
    // printRoutes() returns a tree; the health route appears as "health (GET, HEAD)"
    expect(routes).toContain('health');
  });
});
