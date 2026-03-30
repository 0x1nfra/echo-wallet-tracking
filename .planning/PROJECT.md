# Echo Wallet Tracker

## What This Is

A personal Solana memecoin intelligence tool that automatically discovers profitable on-chain traders, monitors their activity in near-real-time, and generates token buy/sell signals based on smart money behavior. It filters out bots, bundlers, dev wallets, and wash traders before scoring — so signals reflect genuine alpha. Delivers a live web dashboard and Telegram alerts with per-tier accuracy tracking to calibrate signal weight over time.

## Core Value

Know what smart money is doing before the crowd does — and trust the signals because the noise (bots, bundlers, dev wallets) has already been filtered out.

## Requirements

### Validated

- ✓ SQLite persistent data layer with WAL mode — v1.0
- ✓ CLI wallet registry (add/remove/list) — v1.0
- ✓ Helius enhanced transaction normalization for 5 DEXes (Pump.fun, Raydium, Jupiter, Orca, Meteora) — v1.0
- ✓ FIFO cost basis and realized PnL calculation — v1.0
- ✓ Bundle/scam detection engine: bundler, dev wallet, sniper bot, wash trader (tiered confidence: suspected→review→confirmed) — v1.0
- ✓ Detection as prerequisite scoring gate (confirmed_passing only) — v1.0
- ✓ 0-100 wallet score weighted on risk-adjusted return, win rate, consistency, activity health — v1.0
- ✓ 30-second monitoring loop with incremental fetching and p-queue rate limiting — v1.0
- ✓ Auto-removal policies: score degradation, scam confirmation, inactivity — v1.0
- ✓ Auditable removal log (reversible) — v1.0
- ✓ Per-token 0-100 signal engine with coordination discounting — v1.0
- ✓ Fastify REST+SSE API with HTMX live dashboard — v1.0
- ✓ grammY Telegram bot with threshold alerts, 2-hour dedup, /status /top /wallet /signal commands — v1.0
- ✓ Wallet discovery: CA → early buyers → 70+ score gate → 7-day probation → graph traversal — v1.0
- ✓ Helius ProviderRouter with Shyft fallback for 429 resilience — v1.0
- ✓ Signal accuracy logging: signal_events, per-tier hit rates, MIN_SAMPLE=20 gate — v1.0 (v2 req delivered early)

### Active

- [ ] Multi-user Telegram bot (COMM-01): support multiple subscribers with individual alert thresholds
- [ ] User management (COMM-02): add/remove Telegram subscribers
- [ ] Signal weight calibration UI (QUAL-03): manual calibration based on historical accuracy data

### Out of Scope

| Feature | Reason |
|---------|---------|
| Copy-trade execution | Signals only — user executes manually |
| SaaS web platform with auth | Validate logic first; Telegram bot is the simpler commercial path |
| Backtesting UI | Not needed to validate signal quality |
| Social graph visualization | Nice to have, not signal-critical |
| MEV / sandwich detection | Complex, out of scope for memecoin signal use case |
| NFT wallet tracking | Memecoin focus only |
| WebSocket streaming | ~30s polling is sufficient; avoids Helius WS API costs |
| Multi-user web dashboard | Personal tool in v1; Telegram handles multi-user delivery |

## Context

**Shipped v1.0** — 2026-03-30

~14,500 LOC TypeScript across 12 phases, 38 plans. 240 git commits.

Tech stack: Node.js + TypeScript, SQLite + Drizzle ORM, Fastify + HTMX + Alpine.js, grammY (Telegram), Helius API (primary) + Shyft (fallback), DexScreener (prices).

Key architecture:
- `src/db/` — schema, migrations, singleton connection
- `src/parsers/` — DEX-specific swap normalizers
- `src/detection/` — bundler/dev/sniper/wash-trader engines
- `src/scoring/` — metrics calculator + 0-100 score composer
- `src/monitoring/` — MonitorLoop with ProviderRouter
- `src/signals/` — token signal engine + accuracy resolver
- `src/api/` — Fastify routes + SSE emitter
- `src/views/` — EJS templates (dashboard + wallet detail + accuracy)
- `src/telegram/` — grammY bot + alert dispatcher

Known tech debt (medium priority):
- bundler.ts and wash-trader.ts use createHeliusFetcher() directly (no Shyft fallback for these detectors)
- ShyftProvider field name mapping is MEDIUM confidence (defensive ?? fallbacks in place)
- Telegram bot commands, discovery CLI, and accuracy section require live environment testing

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Score wallets on risk-adjusted returns, not win rate alone | Win rate gameable by bundlers/ruggers; risk-adj catches this | ✓ Good — detection gate + score weighting together make poisoned wallets unscorable |
| Bundle detection as prerequisite gate (not just a flag) | Keeps signal quality high; prevents poisoned smart money list | ✓ Good — confirmed_passing gate working end-to-end in v1.0 |
| ~30s polling vs WebSocket streaming | Simpler to build, still actionable for most memecoin plays | ✓ Good — adequate for use case, avoids Helius WS costs |
| Web dashboard + Telegram (both) | Dashboard for browsing alpha; Telegram for time-sensitive alerts | ✓ Good — both delivered, SSE keeps dashboard live |
| Personal tool (no auth/multi-user) | Reduces scope massively; can add later if needed | ✓ Good — v1 validated; multi-user path is Telegram subscribers (COMM-01) |
| FIFO cost basis for PnL | Matches accounting convention; simpler than LIFO | ✓ Good — producing correct realized PnL across all DEXes |
| Drizzle ORM + SQLite | Type-safe queries, WAL mode, zero deployment overhead | ✓ Good — migrations, unit test isolation via in-memory DB all work well |
| p-queue (max 5 concurrent) for Helius | Helius free tier is 300 req/min — parallel without limit would 429 immediately | ✓ Good — no rate limit exhaustion in practice |
| ProviderRouter with Shyft fallback | Helius 429 during discovery is a real risk at scale | ✓ Good — 5 callsites migrated; bundler/wash-trader remain Helius-only (getTransaction not on RpcProvider interface) |
| Timestamp normalization: ms/1000 at query call site | swaps.timestamp = Unix seconds; last_checked_at = Date.now() ms — mismatch caused detection to skip all incremental cycles | ✓ Good — regression tests prevent recurrence; convention documented |
| Signal accuracy logging in v1 (was v2) | Decided to deliver QUAL-01/02/03 as Phase 12 — data needed to calibrate weights | ✓ Good — signal_events table enables future weight calibration without schema changes |

## Constraints

- **Tech Stack**: TypeScript + Node.js — continue existing stack, no rewrites
- **APIs**: Helius (primary), Shyft (fallback), DexScreener (prices)
- **Latency**: ~30s refresh cycle for monitoring (near-real-time, not WebSocket)
- **Solo use**: No auth, no multi-tenancy in v1 (Telegram multi-user is v2)
- **Budget**: Helius free tier (300 req/min) — ProviderRouter manages this

---
*Last updated: 2026-03-30 after v1.0 milestone*
