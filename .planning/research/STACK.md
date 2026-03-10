# Stack Research: Echo Wallet Tracker

**Domain:** Solana memecoin wallet tracking — extending existing TypeScript/Node.js + Helius + DexScreener
**Date:** 2026-03-11

## Recommended Additions to Existing Stack

### Data Persistence
**SQLite via better-sqlite3 ^9.4.x** — Confidence: High
- Rationale: Personal tool, single-user, no concurrency needs. SQLite is zero-infra, file-based, fast for reads. Stores: tracked wallets registry, wallet metrics/scores, token signals, detection history, removal log.
- Why not Postgres: overkill for single-user local/VPS tool
- Why not flat JSON files: not queryable, fragile under concurrent writes from polling loop
- Why not Redis: adds infra complexity, in-memory only without persistence config

**drizzle-orm ^0.30.x** — Confidence: High
- Rationale: Type-safe SQL with TypeScript, lightweight, works perfectly with better-sqlite3. Migrations built-in.
- Why not Prisma: heavier, slower cold start, overkill for this scale

### Polling / Scheduling
**node-cron ^3.0.x** — Confidence: High
- Rationale: Simple cron-style scheduling for the ~30s monitoring loop. Declarative, no extra infra.
- Alternative: setInterval works but node-cron gives better control over overlapping runs
- Why not BullMQ/queue: overkill for single-user, adds Redis dependency

### Web Server + API
**Fastify ^4.x** — Confidence: High
- Rationale: Fastest Node.js HTTP framework, TypeScript-first, schema validation built-in. Serves dashboard API + SSE for live updates.
- Why not Express: slower, no built-in schema validation, dated
- Why not Hono: good but less ecosystem for SSE/websockets

**Server-Sent Events (SSE)** for dashboard live updates — Confidence: High
- Rationale: One-way push from server to browser. Perfect for live score/signal updates. No WebSocket complexity.
- Fastify supports SSE natively via response streams

### Frontend Dashboard
**Vanilla HTML + HTMX ^1.9.x + Alpine.js ^3.x** — Confidence: High
- Rationale: Personal tool — no need for React/Next.js build pipeline. HTMX handles live updates via SSE out of the box. Alpine handles small interactive state. Charts via Chart.js ^4.x.
- Why not Next.js: massive overkill for a personal dashboard with 2-3 views
- Why not plain fetch polling: SSE gives push without polling overhead

### Telegram Bot
**grammy ^1.21.x** — Confidence: High
- Rationale: Modern TypeScript-first Telegram bot framework. Handles long polling and webhooks. Active maintenance, excellent types.
- Why not node-telegram-bot-api: older API, worse TypeScript support
- Why not Telegraf: grammy is the modern successor, better TypeScript

### Bundle/Scam Detection
**No dedicated library** — implement detection rules directly
- Rationale: No mature npm library for Solana bundle detection. Rules-based approach using on-chain data patterns (timing, address clustering, transaction structure).
- Key data source: Helius enhanced transactions already include instruction-level data needed for detection

### Rate Limiting / Queue
**p-queue ^8.x** — Confidence: High
- Rationale: Promise-based concurrency control. Wrap all Helius/DexScreener calls through a queue with configurable concurrency. Prevents rate limit breaches (Helius 300 req/min free tier).
- Why not custom implementation: p-queue is battle-tested, handles backpressure

### Retry Logic
**p-retry ^6.x** — Confidence: High
- Rationale: Exponential backoff for API calls. Simple wrapper, no framework needed.

## What NOT to Use
- **WebSockets**: ~30s polling doesn't justify the complexity
- **Redis**: adds infra, SQLite covers caching needs at this scale
- **React/Vue/Next.js**: personal dashboard, HTMX is sufficient
- **GraphQL**: REST + SSE is simpler for this use case
- **Kubernetes/Docker Compose**: run directly on Node.js, deploy to single VPS

## Summary
Extend existing stack with: better-sqlite3 + drizzle-orm (persistence), node-cron (polling), Fastify (API/SSE), HTMX + Alpine (dashboard), grammy (Telegram), p-queue + p-retry (rate limiting + resilience).
