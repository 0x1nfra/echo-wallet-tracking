---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 08-wallet-discovery plan 02 — fetchEarlySwapsForMint on HeliusFetcher, fetchEarlyBuyers with TDD, 6 tests, 173 total green
last_updated: "2026-03-16T15:30:07.653Z"
last_activity: 2026-03-15 — Phase 06 plan 01 complete; signal_tier + coordinated_wallet_count columns added, 153 tests passing
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 28
  completed_plans: 26
  percent: 100
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 06-token-signal-engine plan 02 — pure signal scorer, 14 TDD tests, 153 total tests green
last_updated: "2026-03-15T15:58:06.063Z"
last_activity: 2026-03-12 — Phase 03 plan 04 complete; detection engine (DETC-05, DETC-06), wallet review/clear-flag/flag commands, 67 tests passing
progress:
  [██████████] 100%
  completed_phases: 5
  total_plans: 21
  completed_plans: 20
  percent: 100
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 03-bundle-scam-detection plan 04 — detection engine, CLI commands, Phase 3 complete
last_updated: "2026-03-12T13:38:52Z"
last_activity: 2026-03-12 — Phase 03 plan 04 complete; detection engine (DETC-05, DETC-06), wallet review/clear-flag/flag commands, 67 tests passing
progress:
  [██████████] 100%
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Know what smart money is doing before the crowd — with noise (bots, bundlers, dev wallets) already filtered out
**Current focus:** Phase 2 — Transaction Parsing (complete)

## Current Position

Phase: 6 of 8 (Token Signal Engine) — IN PROGRESS
Plan: 2 of 3 in current phase (plan 01 and 02 complete)
Status: Phase 6 plans 01 and 02 complete — token_signals schema extended; pure signal scorer with TDD tests
Last activity: 2026-03-15 — Phase 06 plan 01 complete; signal_tier + coordinated_wallet_count columns added, 153 tests passing

Progress: [██░░░░░░░░] 67% (Phase 6)

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 01-data-foundation P01 | 45 | 2 tasks | 11 files |
| Phase 01-data-foundation P02 | 30 | 2 tasks | 7 files |
| Phase 02-transaction-parsing P01 | 2 | 2 tasks | 5 files |
| Phase 02-transaction-parsing P02 | 5 | 2 tasks | 2 files |
| Phase 02-transaction-parsing P03 | 2 | 2 tasks | 5 files |
| Phase 03-bundle-scam-detection P01 | 2 | 2 tasks | 5 files |
| Phase 03-bundle-scam-detection P02 | 17 | 4 tasks | 5 files |
| Phase 03-bundle-scam-detection P03 | 4 | 4 tasks | 4 files |
| Phase 03-bundle-scam-detection P04 | 12 | 2 tasks | 3 files |
| Phase 01-data-foundation PGAP | 5 | 2 tasks | 1 files |
| Phase 03-bundle-scam-detection P05 | 2 | 1 tasks | 2 files |
| Phase 04-metrics-and-scoring P01 | 5 | 2 tasks | 3 files |
| Phase 04-metrics-and-scoring P02 | 8 | 4 tasks | 10 files |
| Phase 04-metrics-and-scoring P03 | 132 | 2 tasks | 3 files |
| Phase 05-monitoring-loop-and-auto-removal P01 | 31 | 2 tasks | 4 files |
| Phase 05-monitoring-loop-and-auto-removal P02 | 2 | 2 tasks | 3 files |
| Phase 05-monitoring-loop-and-auto-removal P03 | 2 | 2 tasks | 2 files |
| Phase 05-monitoring-loop-and-auto-removal PGAP | 15 | 3 tasks | 6 files |
| Phase 06-token-signal-engine P01 | 15 | 1 tasks | 3 files |
| Phase 06-token-signal-engine P02 | 3 | 3 tasks | 3 files |
| Phase 06-token-signal-engine P03 | 6 | 2 tasks | 5 files |
| Phase 07-api-dashboard-and-telegram-alerts P01 | 4 | 3 tasks | 7 files |
| Phase 07-api-dashboard-and-telegram-alerts P02 | 12 | 2 tasks | 9 files |
| Phase 07-api-dashboard-and-telegram-alerts P03 | 90 | 3 tasks | 10 files |
| Phase 08-wallet-discovery P01 | 2 | 2 tasks | 3 files |
| Phase 08-wallet-discovery P02 | 12 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: 8 phases derived from requirements, strictly dependency-ordered (Phases 1-4 are non-negotiable sequential prerequisites)
- Stack: better-sqlite3 + drizzle-orm for persistence, p-queue + p-retry for rate limiting, grammy for Telegram, HTMX + Alpine.js for dashboard — no Redis, no React
- [Phase 01-data-foundation]: WAL pragma applied at connection init (not in migration SQL) to ensure WAL is active for all processes sharing the db file
- [Phase 01-data-foundation]: pnpm onlyBuiltDependencies + nvm Linux node v22 required to compile better-sqlite3 native module in WSL
- [Phase 01-data-foundation]: NODE_OPTIONS=--experimental-vm-modules jest used for ESM test support — allows pnpm to pass test patterns directly to jest without double-dash issue
- [Phase 01-data-foundation]: Tests operate directly against db operations (not CLI process) to avoid process.exit() terminating Jest runner
- [Phase 01-data-foundation]: Pre-existing parsers.test.ts stub failure logged to deferred-items.md — out of scope for Plan 02
- [Phase 02-transaction-parsing]: SQLite enum expansion for wallets.status is schema.ts-only — no ALTER TABLE SQL needed (SQLite does not enforce drizzle enum CHECK constraints at SQL level)
- [Phase 02-transaction-parsing]: DEX_PROGRAM_IDS exported as flat const (test-compatible) and DEX_PROGRAM_IDS_MAP as grouped record (parser runtime) — avoids breaking existing test references
- [Phase 02-transaction-parsing]: .gitignore exemption added for src/db/migrations/**/*.json to allow drizzle meta journal tracking in git
- [Phase 02-transaction-parsing]: fee_sol computed as tx.fee / 1e9 — Helius API returns fee in lamports
- [Phase 02-transaction-parsing]: applyFifo returns new array; partial and full orphan sells both set cost_basis_sol=null, realized_pnl_sol=null
- [Phase 02-transaction-parsing]: Module-level heliusQueue (2 req/s) shared as singleton — enforces global rate limit across all HeliusFetcher instances
- [Phase 02-transaction-parsing]: Helius base URL corrected to api-mainnet.helius-rpc.com/v0 (Enhanced Transactions endpoint)
- [Phase 02-transaction-parsing]: db.transaction() uses tx callback parameter for inserts; UNIQUE constraint failures caught per-row inside loop to allow partial batch success
- [Phase 02-transaction-parsing]: resumeImportingWallets fires before program.parse() with .catch(() => {}) — interrupted imports resume silently without blocking CLI
- [Phase 03-bundle-scam-detection]: wallet_flags has no composite unique constraint — engine upsert uses WHERE conditions; multiple cleared historical rows per wallet+detector preserve escalation history
- [Phase 03-bundle-scam-detection]: DetectionTier (per-flag confidence) is distinct from DetectionStatus (wallet-level aggregate); threshold multiplier caps at 4.0 and doubles on each user clear
- [Phase 03-bundle-scam-detection]: Bundler groups swaps in application code (JS Map) rather than SQL GROUP BY for mock-injectable testability
- [Phase 03-bundle-scam-detection]: Dev wallet thresholdMultiplier intentionally ignored — one deployer transfer is always sufficient (locked aggressive bias)
- [Phase 03-bundle-scam-detection]: jest.config.cjs testMatch extended to src/**/__tests__ so detector tests at src/detection/__tests__/ are discoverable
- [Phase 03-bundle-scam-detection]: Sniper uses raw SQL GROUP BY with drizzle sql template tag; double-cast as unknown as SniperQueryRow[] needed for TypeScript acceptance of db.all() return type
- [Phase 03-bundle-scam-detection]: Wash trader independence key = (token_mint, wallet_b) — same token+wallet pair counts as 1 pattern regardless of buy count; different wallet_b on same token = separate independent pattern
- [Phase 03-bundle-scam-detection]: Wash trader buy→transfer→sell chain alone confirmed as evidence (no explicit SOL-back nativeTransfer required); sell index built upfront as Map for O(1) lookup
- [Phase 03-bundle-scam-detection]: wallet_flags SELECT-then-INSERT/UPDATE (no onConflictDoUpdate) — multiple cleared rows allowed per wallet+detector for escalation history
- [Phase 03-bundle-scam-detection]: Detection triggered synchronously after importWalletHistory sets history_complete=true; Phase 5 monitoring loop uses runDetectionIfNeeded
- [Phase 03-bundle-scam-detection]: wallet flag --detector defaults to 'manual' (not in DetectorId enum) for user-attributed flags without polluting detector namespace
- [Phase 01-data-foundation]: getDefaultDb() uses sqlObj.toQuery({ escapeName, escapeParam }) (correct drizzle API) not non-existent toSQL(); db.$client.prepare(sql).all(...params) is the correct better-sqlite3 execution pattern
- [Phase 03-bundle-scam-detection]: computeOverallStatus uses two-path resolution: out-of-band pre-pass + severity-order path; return worst across both
- [Phase 04-metrics-and-scoring]: Migration 0003 manually corrected: drizzle-kit regenerated already-applied tables due to missing meta snapshots 0001/0002 — stripped to only score_history and wallet_metrics ALTER TABLE statements
- [Phase 04-metrics-and-scoring]: score_history index (score_history_wallet_scored on wallet_address, scored_at DESC) added manually — drizzle-kit SQLite did not auto-generate it; critical for Phase 5 rolling-window queries
- [Phase 04-metrics-and-scoring]: All seven new wallet_metrics columns are nullable — consistent with existing nullable metric columns, null until first scoring run
- [Phase 04-metrics-and-scoring]: normalizeSharpeLike uses tanh(sharpe*0.5); plan comment values (76/96/24) were inconsistent with formula — actual values are 73/88/27 for sharpe=1/2/-1
- [Phase 04-metrics-and-scoring]: Confidence dampener: calculateSharpeRatio multiplies by min(1.0, tradeCount/50) before capping at 3.0
- [Phase 04-metrics-and-scoring]: scoreAllEligible() re-queries swaps per wallet — simple and correct for current scale
- [Phase 04-metrics-and-scoring]: Dynamic import used for scoring engine in CLI action — avoids circular dependency at module load time
- [Phase 05-monitoring-loop-and-auto-removal]: Migration 0004 uses statement-breakpoint markers — drizzle-kit better-sqlite3 prepares one statement at a time; multi-statement SQL file fails without breakpoints
- [Phase 05-monitoring-loop-and-auto-removal]: heliusQueue switched from interval/intervalCap (free-tier 2 req/s) to concurrency: 5 — monitoring loop needs parallel wallet fetches, not interval throttling
- [Phase 05-monitoring-loop-and-auto-removal]: pRetry retries increased from 3 to 5 with 429-specific exponential backoff (2s base, doubles per attempt) — rate limit exhaustion must not crash the monitoring loop
- [Phase 05-monitoring-loop-and-auto-removal]: checkRemovalPolicies called only after successful pipeline — fetch errors never increment low_score_streak
- [Phase 05-monitoring-loop-and-auto-removal]: last_trade_at=NULL guard skips inactivity check — wallets with no swap data treated as not-yet-tracked, not inactive
- [Phase 05-monitoring-loop-and-auto-removal]: MonitorLoop.start() uses scheduleNextCycle(0) for immediate first cycle, then CYCLE_INTERVAL_MS=30s for subsequent
- [Phase 05-monitoring-loop-and-auto-removal]: monitorLoop exported from wallet.ts as module-level singleton — consumed by cli.ts for auto-start and by wallet monitor subcommands for manual control
- [Phase 05-monitoring-loop-and-auto-removal]: MonitorLoop.start() chained in .then() after resumeImportingWallets().catch() — ensures interrupted imports drain before loop begins; program.parse() remains synchronous
- [Phase 05-monitoring-loop-and-auto-removal]: PID file stored in OS tmpdir (echo-monitor.pid) for cross-process IPC
- [Phase 05-monitoring-loop-and-auto-removal]: process.once used (not process.on) for SIGTERM handler in MonitorLoop.start() to prevent listener accumulation
- [Phase 05-monitoring-loop-and-auto-removal]: argv snapshot taken before program.parse() for isMonitorStart gate in cli.ts
- [Phase 06-token-signal-engine]: Manual migration journal when must exceed lastDbMigration.created_at — Drizzle SQLiteDialect.migrate() applies only when folderMillis > lastDbMigration[2] (learned from 0005 journal timestamp fix)
- [Phase 06-token-signal-engine]: Migration 0005 written manually per Phase 04 precedent — drizzle-kit regenerates already-applied tables when meta snapshots are incomplete
- [Phase 06-token-signal-engine]: Score formula weights locked: PnL-weighted holder quality 40%, buy velocity 35%, smart wallet count 25%
- [Phase 06-token-signal-engine]: Tier thresholds: strong >= 65, moderate >= 35, weak < 35, inactive = 0
- [Phase 06-token-signal-engine]: Coordination discount applied as final multiplier only — does NOT affect intermediate sub-score calculations
- [Phase 06-token-signal-engine]: All-coordinated suppression: if every current holder is coordinated, signalScore=0 early-exit with coordinationDiscount=0.3 for Phase 7 transparency
- [Phase 06-token-signal-engine]: computeAllTokenSignals accepts optional db parameter for in-memory SQLite testability — avoids jest.unstable_mockModule ESM limitations
- [Phase 06-token-signal-engine]: engine.ts batch pre-loads wallet_metrics and wallet_flags before per-token loop — prevents O(tokens*wallets) queries
- [Phase 07-api-dashboard-and-telegram-alerts]: grammy is TypeScript-native — no @types/grammy needed; cycleEmitter.setMaxListeners(50) supports many concurrent SSE connections
- [Phase 07-api-dashboard-and-telegram-alerts]: Migration 0006 applied via direct db.exec() then manually registered in __drizzle_migrations with correct SHA256 hash to keep drizzle tracking consistent (when=1773510000001)
- [Phase 07-api-dashboard-and-telegram-alerts]: reply.sse in @fastify/sse v0.4 is an interface object — use reply.sse.send(AsyncIterable) not reply.sse(generator)
- [Phase 07-api-dashboard-and-telegram-alerts]: Alpine x-data wrapper on outer div never replaced by HTMX swap — only tbody#signal-rows innerHTML swapped, so tier filter state survives SSE updates
- [Phase 07-api-dashboard-and-telegram-alerts]: Global @fastify/view layout option removed — breaks HTMX partials; layout now passed per full-page route call only via { layout: 'layout' } third argument
- [Phase 07-api-dashboard-and-telegram-alerts]: SSE route requires { sse: true } in Fastify route options for @fastify/sse v0.4 — missing option silently prevented reply.sse from being attached
- [Phase 07-api-dashboard-and-telegram-alerts]: cli.ts refactored to explicit 'serve' subcommand — implicit auto-start ran server on all CLI invocations including wallet/signal subcommands
- [Phase 08-wallet-discovery]: probation_until added as nullable INTEGER on wallets table (no status enum change) to preserve 11 existing eq(wallets.status, 'tracked') queries
- [Phase 08-wallet-discovery]: Migration 0007 journal when:1773510000002 (one higher than 0006's 1773510000001) required for Drizzle migrate() to apply it
- [Phase 08-wallet-discovery]: fetchEarlyBuyers accepts optional fetcher parameter (not jest.mock) — project ESM pattern prohibits jest.mock; injectable deps match Phases 3 and 6 pattern
- [Phase 08-wallet-discovery]: fetchEarlySwapsForMint uses heliusQueue+pRetry with 429 backoff — consistent rate-limit handling across all Helius fetch methods
- [Phase 08-wallet-discovery]: EARLY_WINDOW_SECONDS=1800 and MAX_EARLY_BUYERS=50 as named constants in early-buyers.ts

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3: Bundle detection thresholds are initial hypotheses — false-positive risk is high, needs tuning against real transaction data
- Phase 8: Graph traversal at scale against Helius free-tier limits (300 req/min) needs validation during planning

## Session Continuity

Last session: 2026-03-16T15:30:07.651Z
Stopped at: Completed 08-wallet-discovery plan 02 — fetchEarlySwapsForMint on HeliusFetcher, fetchEarlyBuyers with TDD, 6 tests, 173 total green
Resume file: None
