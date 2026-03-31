# Project Research Summary

**Project:** Echo Wallet Tracker v1.1 — Forward Testing and Deployment
**Domain:** Solana memecoin signal tool — outcome tracking, automated coin sourcing, Railway deployment
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

Echo v1.0 shipped the full monitoring pipeline: wallet tracking, bundle detection, signal scoring, Telegram alerts, and a 1h/4h/24h outcome resolver. The research for v1.1 reveals that the existing forward-testing dataset is structurally incomplete in two ways: (1) the 1h window is too coarse for the Solana memecoin lifecycle — competitor tools like gmgn.ai and Photon default to a 30m primary window because most tokens peak within 15-45 minutes of a smart wallet signal; (2) the current outcome resolver cannot distinguish a rugged token from a DexScreener infrastructure failure, creating survivorship bias in accuracy stats. These are the two fixes that must ship before forward-testing data is meaningful. Everything else in v1.1 adds to an already-functional foundation.

The recommended v1.1 approach works in three distinct phases: first, harden the deployment to Railway with persistent volume and WAL integrity guarantees so data is not silently wiped on redeploy; second, extend signal outcome tracking with peak price, 30m window, rug/failure distinction, and the AutoSourcer module for automated coin sourcing; third, extend the ProviderRouter to cover `getTransaction` so bundler and wash-trader detection do not silently degrade when Helius is rate-limited. The stack is already locked — better-sqlite3, drizzle-orm, Fastify, grammy, HTMX, p-queue — nothing new is needed for v1.1 beyond a DexScreener boost endpoint method on the existing fetcher.

The principal risks are data integrity risks, not implementation risks. Losing the forward-testing dataset to a Railway volume misconfiguration would require restarting accumulation from zero. Rugged tokens counted as `failed` rather than worst-case outcomes inflates reported accuracy in ways that compound over time. Both risks are preventable with startup assertions and a one-column schema change, and both must be addressed before any forward-testing data is collected under Railway deployment.

---

## Key Findings

### Recommended Stack

The v1.0 stack is complete and carries forward unchanged. No new dependencies are needed for v1.1. All additions are within the existing package surface: a new fetch method on `DexScreenerFetcher` for the boost endpoints, an extension to the `RpcProvider` interface and `ShyftProvider` for `getTransactionDetails`, and new drizzle-orm migrations for the schema changes.

**Core technologies (all already installed):**
- `better-sqlite3` + `drizzle-orm`: persistence — single-file SQLite is the correct model for Railway single-replica scale; type-safe migrations handle v1.1 schema additions
- `node-cron`: MonitorLoop scheduling — the 30s cycle is where peak price polling, outcome resolution, and the new AutoSourcer hook all run
- `grammy`: Telegram bot — existing `/status`, `/accuracy`, `/top` commands extended with cycle health metrics and stall detection
- `p-queue` + `p-retry`: rate limiting — AutoSourcer must use the same queue; critical for staying within DexScreener 60 req/min and Helius 300 req/min limits
- `Fastify` + HTMX: API and dashboard — accuracy UI extended with return distribution; no new pages needed

Do not add: Redis, WebSockets, React, or any additional infrastructure. Full stack rationale: `.planning/research/STACK.md`

### Expected Features

**Must have for v1.1 launch (forward-testing dataset is incomplete without these):**
- Peak price capture — rolling `Math.max(currentPrice, storedPeak)` per active signal event, tracked every 30s cycle for 24h after signal fires; new `peak_price` and `peak_price_at` columns on `signal_events`
- 30-minute outcome window — most actionable window for Solana memecoins; new `outcome_30m_price`, `outcome_30m_pct`, `outcome_30m_status` columns; new resolution pass in `outcome-resolver.ts`
- Time-to-peak storage — derived from `peak_price_at - fired_at` at resolution; stored as `time_to_peak_min`; enables hold duration analysis once sample sizes are sufficient
- Automated coin sourcing via DexScreener boost list — new `AutoSourcer` module calling `/token-boosts/latest/v1` on 5-minute cadence; gates on `liquidity.usd >= $10k`; max 3 discovery runs/hour; `coin_sources` dedup table

**Should have (add after P1 features are stable):**
- Per-tier return distribution in accuracy stats — extend `getAccuracyStats()` with p50/p75 per window; `avg_return` columns already exist
- Monitor cycle health metrics in `/status` — cycle counter, last cycle duration, stall detection via `MAX(token_signals.updated_at)` age check; in-memory only, no DB changes
- Sell signal data collection — new `signal_event_holders` table capturing smart wallet holder addresses at signal fire; exit tracking populated by existing swap monitoring; enables future sell signal engine in v1.2

**Defer to v1.2+:**
- Per-tier hold duration distribution reporting (needs 100+ resolved events per tier for statistical validity)
- Sell signal rules engine (requires the v1.1 holder dataset — do not build before data exists)
- DexScreener trending search endpoint as additional source (evaluate after boost sourcing is live)

Full feature analysis with dependency graph: `.planning/research/FEATURES.md`

### Architecture Approach

v1.0 architecture is a single-process Node.js service: node-cron MonitorLoop driving a Fetch → Parse → Detect → Score pipeline, writing to SQLite, with Fastify serving the dashboard API and grammy handling Telegram. v1.1 adds hooks into the existing MonitorLoop rather than new services. AutoSourcer runs on a 5-minute cadence inside the MonitorLoop. Peak price polling and 30m outcome resolution run as additional passes in the existing `resolveOutcomes()` call. The ProviderRouter extension adds one new method to an existing interface — no new modules, just extending what is there.

**Major components with v1.1 changes:**
1. MonitorLoop (`src/monitor/loop.ts`) — add AutoSourcer hook on 5-min cadence; add cycle counter and duration tracking to in-memory state
2. Outcome Resolver (`src/signals/outcome-resolver.ts`) — add 30m resolution pass; add peak price update per active event each cycle; add `rug` vs `failed` status discrimination
3. DexScreenerFetcher (`src/fetchers/dexscreener.ts`) — add `getLatestBoostedTokens()` method targeting `https://api.dexscreener.com/token-boosts/latest/v1` (different base URL from existing `/latest` price endpoints)
4. ProviderRouter (`src/fetchers/providers/router.ts`) — extend `RpcProvider` interface with `getTransactionDetails(signature)`; implement in both HeliusProvider and ShyftProvider; ShyftProvider requires native transfer action type audit before shipping
5. Signal Accuracy (`src/signals/accuracy.ts`) — extend `getAccuracyStats()` with p50/p75 return percentiles; include `rug` count in accuracy denominators to prevent survivorship bias
6. Telegram Bot (`src/api/bot/commands.ts`) — extend `/status` with cycle health metrics and stall-age warning

Full architecture: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **Volume not mounted — forward-testing data wiped silently on every Railway deploy** — Add a startup check for a `.volume-marker` file at the Railway volume path. If `DATABASE_URL` resolves outside the volume mount, log error and exit. Deployment runbook: Railway volume → `/data`, `DATABASE_URL=/data/echo.db`. Verify by deploying twice and checking wallet count. Phase: Railway Deployment.

2. **WAL mode + Railway volume — corruption if service ever scales to >1 replica** — Keep WAL mode enabled (Railway volumes are locally attached per service instance for single-replica deployments). Add startup assertion: if `RAILWAY_REPLICA_ID` is present and replicas > 1, refuse to start. Document that this service must never be scaled horizontally. Phase: Railway Deployment.

3. **Outcome resolver classifies rugged coins as `failed` — inflates hit rate via survivorship bias** — Add `rug` status to the outcome enum. Distinguish rug by retrying the price fetch 3+ times over several minutes; if consistently null after the window has elapsed, mark `rug`. Count `rug` rows in hit-rate denominators as 0-return outcomes. Phase: Signal Outcome Tracking.

4. **DexScreener 429 permanently seals outcome windows as unretriable** — The IS NULL idempotency guard correctly prevents double-writes but also prevents retry after a transient 429. Add `outcome_Xh_error` column. Only write a final outcome when price is confirmed non-null. If price is null due to 429, leave IS NULL open so the next cycle retries. Phase: Signal Outcome Tracking.

5. **Bundler/wash-trader detection silently produces empty results during Helius rate limiting** — The ProviderRouter explicitly excludes `getTransaction` (confirmed by `types.ts` comment). Detection calls Helius directly with no fallback. When extending the router: implement `getTransactionDetails` on ShyftProvider via Shyft `/sol/v1/transaction`; audit all Shyft action type names for SOL transfers before plugging into bundler detection. Phase: ProviderRouter Extension.

6. **Automated coin sourcing triggers compounding discovery loops** — Disable graph traversal for auto-sourced CAs (direct buyers only). Cap `MAX_DAILY_ADDS` at 20 new wallets/day. Enforce total wallet ceiling (200 max). Apply 24h cooldown per CA. Phase: Coin Sourcing Automation.

7. **Helius credit exhaustion looks identical to rate limiting** — Credit exhaustion 429 has body `max_usage_reached`; rate-limit 429 does not. Parse the error body. On credit exhaustion: pause MonitorLoop and send Telegram alert. Do not silently fall back to Shyft indefinitely. Phase: Railway Deployment + ProviderRouter Extension.

Full pitfall analysis with recovery strategies: `.planning/research/PITFALLS.md`

---

## Implications for Roadmap

Based on the dependency graph revealed by research, v1.1 decomposes into four phases with a clear blocking order. The order is driven by data integrity requirements, not arbitrary preference.

### Phase 1: Railway Deployment
**Rationale:** Data integrity is a prerequisite for everything else. Forward-testing data collected before the volume persistence guard is in place may be wiped silently on the first redeployment, requiring a restart from zero. This phase has no dependencies on new features — it is purely hardening the deployment substrate.
**Delivers:** Persistent Railway deployment with volume-presence startup check, WAL single-replica assertion, Helius credit exhaustion alert, Railway secret variable configuration, deployment runbook.
**Addresses:** API key security (Railway secret variables, not plain env vars), `DATABASE_URL` validation, DexScreener boost endpoint base URL difference (`api.dexscreener.com` vs existing `/latest` prefix).
**Avoids:** Volume not mounted — ephemeral data loss (Pitfall 2), WAL corruption from concurrent access (Pitfall 1), credit exhaustion silent Shyft fallback (Pitfall 6 — alert portion).
**Research flag:** No deeper research needed. Railway volume attachment and SQLite WAL are well-documented with official sources.

### Phase 2: Signal Outcome Tracking
**Rationale:** This is the primary v1.1 deliverable. The 30m window and peak price capture make the forward-testing dataset meaningful. Must run after Phase 1 so new schema migrations are written to persistent storage from day one. The rug/failure distinction must also ship in this phase — collecting 30 days of data with the survivorship bias baked in produces a corrupted accuracy baseline that cannot be corrected retroactively.
**Delivers:** New `signal_events` columns (`peak_price`, `peak_price_at`, `time_to_peak_min`, `outcome_30m_price/pct/status`), updated `outcome-resolver.ts` with 30m pass and rug/failure discrimination, `outcome_Xh_error` column for retry-safe 429 handling, extended `getAccuracyStats()` with p50/p75 return percentiles and rug-inclusive denominators.
**Addresses:** Peak price capture (P1), 30m outcome window (P1), time-to-peak storage (P1), per-tier return distribution (P2), rug vs failed status (critical data integrity fix).
**Avoids:** Outcome resolver rug/failure conflation (Pitfall 3), DexScreener 429 permanently sealing windows (Pitfall 4), survivorship bias compounding over the forward-testing period.
**Research flag:** No deeper research needed. All changes are within known codebase boundaries. DexScreener `getTokenPrice()` behavior for rugged tokens (empty `pairs[]` vs HTTP 429) is verified in official docs.

### Phase 3: Coin Sourcing Automation
**Rationale:** Automated token sourcing removes the manual CA bottleneck but must follow the outcome tracking schema (AutoSourcer generates new signal events that need the Phase 2 columns from their first insertion). This phase also adds the Telegram observability improvements that become necessary once auto-sourcing increases operator monitoring load.
**Delivers:** `AutoSourcer` module calling `/token-boosts/latest/v1` on 5-minute cadence, `coin_sources` dedup table with `source: 'dexscreener_boost'` auditability, liquidity gate (`>= $10k`), `MAX_DAILY_ADDS=20` cap, total wallet ceiling (200), 24h per-CA cooldown, graph traversal disabled for auto-sourced CAs, extended `/status` command with cycle counter/duration/stall detection. Also: `signal_event_holders` table creation as passive data capture for future sell signal engine (add the table now so it has 30+ days of data by v1.2 — deferred to Phase 3 rather than Phase 2 to keep Phase 2 focused on outcome tracking).
**Addresses:** Automated coin sourcing (P1 feature), monitor cycle health in `/status` (P2 feature), sell signal data collection infrastructure (P2 — table creation only, not exit tracking queries).
**Avoids:** Infinite discovery loops (Pitfall 6), Helius credit spike from unthrottled history imports (performance trap), stall detection gap in Telegram observability.
**Research flag:** Needs a brief targeted research pass on the DexScreener boost endpoint live response shape. The rate limit (60 req/min) and endpoint path are documented, but the exact JSON field names (`chainId`, `tokenAddress`, `boostAmount`) should be verified against a live API call before building the AutoSourcer filter logic. If field names differ from docs, the Solana filter silently passes all tokens or none.

### Phase 4: ProviderRouter Extension
**Rationale:** This phase completes production hardening by ensuring detection engines do not silently degrade during Helius rate limiting. It comes last because it requires the most surgical change (new method on the `RpcProvider` interface), carries the highest regression risk in the detection pipeline, and is the least user-visible phase. Having auto-sourcing live from Phase 3 provides a higher-throughput test scenario to validate that detection continues working correctly under the new router paths.
**Delivers:** `getTransactionDetails(signature)` on `RpcProvider` interface, HeliusProvider and ShyftProvider implementations, Shyft action type audit for native transfer normalization (covers `SOL_TRANSFER`, `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER`), test fixture with Shyft-normalized bundled transaction, Helius credit exhaustion error body discrimination completing Pitfall 6.
**Addresses:** Bundler/wash-trader detection fallback (production safety), credit exhaustion Telegram alert (operational safety).
**Avoids:** Bundler detection silently starving during Helius 429 (Pitfall 5), ShyftProvider nativeTransfers missing funder data producing false-clean detection results (Pitfall 8), credit exhaustion permanently falling back to Shyft without alerting (Pitfall 6 — error discrimination portion).
**Research flag:** Needs a targeted research pass on Shyft `/sol/v1/transaction` response shape for a known bundled transaction. The native transfer normalization gap (Pitfall 8) is the highest regression risk in v1.1 and cannot be resolved by inference — it requires a real Shyft response fixture.

### Phase Ordering Rationale

- Phase 1 before Phase 2: Railway volume persistence must be confirmed before any new schema migrations are deployed. Writing 30m window and peak price data to ephemeral storage that disappears on redeployment means restarting the forward-testing dataset from zero.
- Phase 2 before Phase 3: AutoSourcer generates new signal events. Those events need the Phase 2 schema columns (`peak_price`, `outcome_30m_*`) present from their first insertion — retrofitting existing rows is error-prone and breaks IS NULL idempotency guards.
- Phase 3 before Phase 4: ProviderRouter extension changes the `RpcProvider` interface used by all detection. Having auto-sourcing live first creates a realistic throughput scenario to confirm detection continues working under the new router paths before shipping.
- `signal_event_holders` table (sell signal infrastructure) belongs in Phase 3, not deferred to v1.2. The table costs one extra insert per signal fire. It needs 30+ days of data before the v1.2 exit-tracking analysis is meaningful. Create the schema now; build the exit-tracking queries when sample size justifies it.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Coin Sourcing Automation):** DexScreener boost endpoint live response shape should be verified against a real API call before building the AutoSourcer filter logic. 30-minute effort, prevents a silent filter failure.
- **Phase 4 (ProviderRouter Extension):** Shyft `/sol/v1/transaction` response for a known bundled transaction must be verified before implementing `extractNativeTransfers` coverage. This is not optional — building against inferred field names risks silent bundler detection failures in production.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Railway Deployment):** Railway volume attachment, SQLite WAL, and Railway environment variable secrets are all well-documented with official sources. No research uncertainty.
- **Phase 2 (Signal Outcome Tracking):** All changes are within the existing `outcome-resolver.ts` and `accuracy.ts` codebase. No new external integrations. No research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | v1.0 stack is live and running. No new dependencies for v1.1. All additions are within existing package surface. |
| Features | HIGH | Based on direct codebase inspection of `schema.ts`, `outcome-resolver.ts`, `accuracy.ts`, `dexscreener.ts`, `loop.ts`, and `commands.ts`. What exists and what is missing is verified, not inferred. |
| Architecture | HIGH | v1.0 architecture is running in production. v1.1 changes are additive hooks into existing components. ARCHITECTURE.md is dated 2026-03-11 (v1.0 research) — valid as foundation; v1.1 additions are documented in FEATURES.md and PITFALLS.md. |
| Pitfalls | HIGH | Verified against live codebase. ProviderRouter `getTransaction` exclusion confirmed by `types.ts` comment. WAL + Railway volume behavior confirmed by official SQLite and Railway docs. DexScreener null price vs 429 distinction confirmed by API reference. Helius credit exhaustion 429 body confirmed by Helius billing docs. |

**Overall confidence:** HIGH

### Gaps to Address

- **DexScreener boost endpoint response field names (Phase 3):** The endpoint rate limit and availability are confirmed (60 req/min, docs verified). The exact JSON payload structure has not been verified against a live call. Before building the AutoSourcer filter, make a live API call and confirm `chainId`, `tokenAddress`, and `boostAmount` field names and nullability. A mismatch silently breaks the Solana filter.

- **Shyft `/sol/v1/transaction` native transfer action type names (Phase 4):** The gap between what `extractNativeTransfers()` handles (`SOL_TRANSFER`) and what Shyft actually returns for funding transactions cannot be resolved by inference. Requires a real Shyft response for a known bundled transaction signature before the Phase 4 ProviderRouter implementation ships.

- **Helius credit burn rate under automated sourcing (Phase 3 operational planning):** v1.0 credit estimates were based on manual operation. Automated sourcing is non-linear: each new wallet added doubles `fetchSwapHistory` call volume per cycle. Before enabling AutoSourcer at full cadence, compute the daily credit budget: `N wallets × cycles/day × transactions/cycle × credits/transaction`. Validate against the current Helius plan limit.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src/db/schema.ts` — confirmed `signal_events` schema, existing columns, confirmed missing peak_price/30m/time_to_peak columns
- `src/signals/outcome-resolver.ts` — confirmed 1h/4h/24h resolution, `classifyOutcome()`, IS NULL idempotency guard, 90-day retention
- `src/signals/accuracy.ts` — confirmed `getAccuracyStats()` structure, MIN_SAMPLE=20 gate, avg_return fields present
- `src/fetchers/dexscreener.ts` — confirmed available methods, base URL pattern (`/latest` prefix), rate limit handling
- `src/monitor/loop.ts` — confirmed 30s cycle structure, SIGTERM handler, crash-restart behavior, post-cycle hooks
- `src/api/bot/commands.ts` — confirmed `/status` command current output (what is and is not shown)
- `src/fetchers/providers/types.ts` — confirmed `getTransaction(signature)` explicitly excluded from `RpcProvider` interface (comment in source)
- `src/fetchers/providers/router.ts` — confirmed ProviderRouter scope covers only `fetchSwapHistory`, `fetchEarlySwapsForMint`, `fetchOnePage`

### Secondary (MEDIUM confidence — official documentation)
- [DexScreener API Reference](https://docs.dexscreener.com/api/reference) — `/token-boosts/latest/v1`, `/token-boosts/top/v1`, 60 req/min rate limit; empty `pairs[]` confirmed for rugged/unlisted tokens
- [Helius Billing FAQ](https://www.helius.dev/docs/faqs/billing) — confirmed 429 with `max_usage_reached` body (not HTTP 402)
- [SQLite WAL Official Docs](https://www.sqlite.org/wal.html) — shared-memory locking requirements for WAL mode
- [Railway Help Station — SQLite volume](https://station.railway.com/questions/how-do-i-use-volumes-to-make-a-sqlite-da-34ea0372) — volume attachment behavior, ephemeral layer behavior on redeploy
- [Shyft Parsed Transaction Structure](https://docs.shyft.to/solana-apis/transactions/parsed-transaction-structure) — action type names (basis for Pitfall 8 analysis)

### Tertiary (MEDIUM confidence — market observation)
- gmgn.ai and Photon competitor UI observation — 30m as default outcome window for Solana memecoins; confirmed by UI inspection, not documented standard

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
