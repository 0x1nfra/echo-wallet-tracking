# Milestones

## v1.0 MVP (Shipped: 2026-03-30)

**Phases completed:** 12 phases, 38 plans
**Timeline:** 97 days (2025-12-23 → 2026-03-30)
**Codebase:** ~14,500 LOC TypeScript, 412 files changed

**Key accomplishments:**
- Full Solana transaction pipeline: Helius fetching → DEX-specific parsing (Pump.fun, Raydium, Jupiter, Orca, Meteora) → FIFO cost basis → tiered scam detection gating scoring
- Bundle/scam detection engine (bundler, dev wallet, sniper bot, wash trader) with suspected→review→confirmed confidence progression and auto-removal on confirmation
- Per-token 0-100 signal engine aggregating smart wallet count, buy velocity, exit pressure, and PnL-weighted holder scores with coordination discounting
- Fastify REST+SSE API, HTMX live dashboard with SSE updates, grammY Telegram bot with threshold alerts and 2-hour deduplication
- Wallet discovery: CA → early buyer extraction → 70+ score gate → 7-day probation → graph traversal co-trader discovery
- Signal accuracy logging: signal_events table, per-tier hit rates with MIN_SAMPLE=20 gate, HTMX accuracy section, /accuracy Telegram command
- Helius ProviderRouter with Shyft fallback covering 5 callsites for 429 resilience
- Incremental detection bug fix: Math.floor(ms/1000) normalization in 3 callsites unblocks post-import scam detection (DETC-01–04, RMVL-02)

---

