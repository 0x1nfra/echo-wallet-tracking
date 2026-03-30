# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-30

### Added

#### Data Layer
- SQLite database with WAL mode via `better-sqlite3` and Drizzle ORM
- Schema with 5 core tables: `wallets`, `swaps`, `wallet_metrics`, `token_signals`, `removal_log`
- Auto-running migrations on startup via `drizzle-kit`
- In-memory SQLite test helper (`createTestDb`) for isolated unit tests

#### CLI
- `wallet add <address> [--label]` — add a wallet to the tracker
- `wallet remove <address>` — remove a tracked wallet
- `wallet list` — display all wallets with score, status, and last active time
- `wallet score <address>` — show detailed score breakdown for a wallet
- `wallet monitor start/stop/pause` — control the monitoring loop
- `wallet removals list/restore` — audit and reverse auto-removals
- `wallet review/clear-flag/flag` — manually manage detection flags
- `wallet discover <CA>` — discover profitable early traders from a token contract address
- `signal list` — list current token signals sorted by score
- `serve` — start the web dashboard and Telegram bot

#### Transaction Parsing
- Helius enhanced transaction normalizer supporting 5 DEXes: Pump.fun, Raydium, Jupiter, Orca, and Meteora
- Full transaction history import on first wallet add with pagination and crash recovery (`resumeImportingWallets`)
- Incremental fetching after initial import (only transactions since `last_checked_at`)
- FIFO cost basis calculation for realized PnL per closed position
- `p-queue` (max 5 concurrent) + `p-retry` (exponential backoff on 429) for Helius rate limiting
- `parse_errors` table for logging failed transaction parsing without crashing the pipeline

#### Bundle/Scam Detection
- Bundler detector: same-block coordinated buys from wallets sharing a funding source
- Dev wallet detector: wallet received tokens directly from the token deployer address
- Sniper bot detector: wallet consistently buys in the first 2–3 blocks of launches
- Wash trader detector: circular buy→transfer→sell chains between related wallets
- Tiered confidence progression: `suspected` → `review` → `confirmed` with threshold multiplier escalation on user clear
- `confirmed_passing` gate: only wallets that pass detection are eligible for scoring
- Detection triggered at import and on each subsequent monitoring cycle via `runDetectionIfNeeded`

#### Wallet Scoring
- Metric calculators: win rate, realized PnL (SOL), Sharpe-like risk-adjusted return, max drawdown, recency score
- 0–100 composite wallet score: risk-adjusted return (40%), win rate (20%), consistency + recency (20%), activity health (20%)
- Confidence dampener on Sharpe ratio: scales with `min(1.0, tradeCount / 50)` to penalise thin trade history
- Eligibility gate: wallets without complete history or confirmed-passing detection status are skipped silently

#### Monitoring Loop
- 30-second polling cycle via `MonitorLoop` processing all tracked wallets through fetch → parse → detect → score
- PID file IPC for cross-process `monitor stop` — works even when the monitor runs in a separate shell
- Idempotency guard (`SIGTERM` + PID check) prevents double-start
- `checkRemovalPolicies` runs only after a successful pipeline cycle — fetch errors never increment streak counters

#### Auto-Removal
- Policy 1: score falls below threshold for N consecutive cycles over a 30-day rolling window
- Policy 2: bundle/scam detection reaches `confirmed` confidence
- Policy 3: no trades within configurable inactivity window
- All removals written to `removal_log` with reason, timestamp, and detection details — reversible via CLI

#### Token Signal Engine
- Per-token 0–100 signal score: PnL-weighted holder quality (40%), buy velocity in last 1h (35%), smart wallet count (25%)
- Coordination discount applied as final multiplier when holders share a common funding source
- All-coordinated suppression: signal score forced to 0 if every current holder is coordinated
- Signal tiers: `strong` (≥65), `moderate` (≥35), `weak` (<35), `inactive`
- Signals updated after each monitoring cycle via `MonitorLoop` post-cycle hook
- `signal_tier` and `coordinated_wallet_count` columns added to `token_signals` table

#### Web Dashboard
- Fastify REST + SSE API
- HTMX + Alpine.js dashboard with live token signal feed (updates without page refresh via SSE)
- Tier filter (All / Strong / Moderate / Weak) that survives SSE updates
- Wallet list with current score, detection status, and last active time
- Wallet detail page with recent trades, score breakdown, and detection flags
- Active / Probationary wallet split in both dashboard and API (`/api/wallets` returns `{ active, probationary }`)
- Signal accuracy section with per-tier hit rates (rendered via HTMX auto-refresh)

#### Telegram Bot
- grammY bot with `/status`, `/top`, `/wallet <address>`, `/signal`, and `/accuracy` commands
- Alert dispatcher: fires when a token signal crosses a configured threshold
- 2-hour per-token deduplication to prevent alert spam
- Accumulation override: repeated strong signals within the dedup window re-alert if score increases significantly

#### Wallet Discovery
- `wallet discover <CA>` extracts wallets that bought early and realized profit from a token contract address
- Scoring gate: only candidates scoring above 70 are added to the tracker
- 7-day probation period for newly discovered wallets — excluded from token signal scoring during probation
- Graph traversal: identifies additional candidates that co-traded with already-known smart money wallets
- `dry_run` mode for discovery preview without writing to the database
- `discovery_runs` and `discovery_candidates` tables for auditability

#### RPC Provider Rotation
- `RpcProvider` interface abstracting all Helius API calls (`fetchSwapHistory`, `fetchEarlySwapsForMint`, `fetchOnePage`)
- `ProviderRouter`: priority failover with 60-second cooldown per provider on failure
- `HeliusProvider`: wraps existing `HeliusFetcher` with the `RpcProvider` interface
- `ShyftProvider`: independent Shyft API integration with response normalization to the shared `ProviderTransaction` type
- `createProviderRouter()` factory — drop-in replacement at all callsites; 5 callsites migrated
- Graceful degradation: logs error and skips wallet cycle if all providers are exhausted

#### Signal Accuracy Logging
- `signal_events` append-only table: captures signal score, sub-scores, entry price, and three outcome windows (1h, 4h, 24h) at the moment a signal fires
- `resolveOutcomes`: resolves price outcome windows for past signal events using DexScreener price data
- `getAccuracyStats`: per-tier hit rate aggregation with `MIN_SAMPLE=20` gate to suppress stats on thin data
- Tier transition detection: only strong/moderate tier promotions logged — inactive suppression events excluded
- `/accuracy` Telegram command delivering per-tier hit rates on demand

### Fixed

- **Incremental detection timestamp bug**: `runDetectionIfNeeded()` compared `swaps.timestamp` (Unix seconds) against `last_checked_at` (Unix milliseconds), causing detection to always exit early after initial import. Fixed with `Math.floor(last_checked_at / 1000)` at the query call site. Same normalization applied to `scoreWalletIfNeeded()`.
- **Wash trader window unit bug**: `windowMs` was computed in milliseconds but compared against Unix-second swap timestamps — effectively creating a ~19-year detection window. Renamed `windowSec` and corrected to `7 * 24 * 60 * 60`.
- **`computeOverallStatus` manual flag handling**: manual flags were silently discarded when no detector flags were present. Fixed with an out-of-band pre-pass that checks manual flags before the severity-order path.
- **Sniper detector SQLite crash**: non-existent `toSQL()` Drizzle method replaced with `toQuery({ escapeName, escapeParam })` + `db.$client.prepare().all()`.
- **`DetectorId` type gap**: `'manual'` was missing from the `DetectorId` union and `wallet_flags.detector` schema enum, requiring `as any` casts in the flag command. Added to both.
- **Dead code removal**: `getEligibleWallets()` dead export and `scoreWallet()` stub in `src/index.ts` removed — both presented false cross-phase linkage without being wired to anything.
- **Fastify SSE route**: missing `{ sse: true }` route option silently prevented `reply.sse` from being attached in `@fastify/sse` v0.4.
- **HTMX partial layout bleed**: global `@fastify/view` layout option caused HTMX partial responses to return full HTML pages. Layout now passed per full-page route only.
- **CLI server auto-start**: server was starting on every CLI invocation (including `wallet add`, `signal list`, etc.). Moved behind an explicit `serve` subcommand.
- **Drizzle migration journal drift**: missing meta snapshots `0001`/`0002` caused `drizzle-kit` to regenerate already-applied tables in migration `0003`. Corrected to only include new `ALTER TABLE` statements.

[0.1.0]: https://github.com/0x1nfra/echo-wallet-tracking/releases/tag/v1.0
