# Railway Deployment

A self-contained runbook for deploying Echo to Railway. Use this to reproduce the setup from scratch.

## Prerequisites

- Railway CLI installed: `npm install -g @railway/cli`
- Logged in: `railway login`
- Git repository linked to a Railway project (`railway link` in repo root)

## Environment Variables

Set these in the Railway dashboard under **Settings > Variables**, or via `railway variables set KEY=VALUE`:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Absolute path to SQLite file on the mounted volume | `/data/echo.db` |
| `PORT` | Injected automatically by Railway — **do not set manually** | (auto) |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | `123456:ABC...` |
| `HELIUS_API_KEY` | Helius RPC API key | `abc123...` |
| `SHYFT_API_KEY` | Shyft fallback RPC key | `xyz789...` |

> **Important:** `DATABASE_URL` MUST use the volume mount path (e.g. `/data/echo.db`). A relative path like `./echo.db` is written to the container filesystem and **will be lost on every deploy**.

## Volume Setup

Railway volumes provide persistent storage across deploys. Without a volume, the SQLite database is wiped on each deployment.

1. In the Railway dashboard, open your service
2. Go to **Settings > Volumes**
3. Click **Add Volume**, set mount path: `/data`
4. Click **Save** and **Redeploy**

The service startup sequence verifies the volume path exists and will hard-fail with an actionable error if the volume is not mounted.

## Deploy

```bash
railway up
```

Railway reads `railway.toml` automatically. The build uses the `Dockerfile` (Node 20-slim with native deps for `better-sqlite3`). The healthcheck polls `GET /health` and marks the deployment successful once it returns 200.

## Verification

After the deploy completes:

1. Check health endpoint:
   ```bash
   curl https://<your-service>.railway.app/health
   ```
   Expected response: `{"status":"ok","uptime":...}`

2. Check Railway logs for the startup summary. The `serve` command logs all three components (monitoring loop, API, Telegram bot) with their config (cycle interval, API port, Telegram status).

3. Confirm `DATABASE_URL` path is accessible: look for the volume-check log line in the startup output.

## Troubleshooting

### SQLITE_READONLY or SQLITE_CANTOPEN

Volume permission issue. Verify:
- The volume is mounted at `/data`
- `DATABASE_URL` is set to `/data/echo.db`

Railway volumes mount as root. The service also runs as root (the Dockerfile does not switch user), so permissions should match.

### Health check timeout / deployment stuck

Host binding issue. The server must listen on `0.0.0.0`, not `127.0.0.1`. Railway's load balancer cannot reach loopback addresses. Confirm the `serve` command passes `host: '0.0.0.0'` to Fastify's `listen()` call.

### Service exits immediately on startup

Volume not mounted. The startup sequence runs a 30-second retry loop waiting for the volume path (`/data` by default). If the path never appears, the service hard-fails with an error message that includes the expected path and actual directory contents. To fix: attach the volume in Railway dashboard and redeploy.
