---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Forward Testing & Deployment
status: executing
last_updated: "2026-04-20T02:15:00.000Z"
last_activity: 2026-04-20 -- Phase 16 Plan 02 complete
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31 after v1.1 milestone started)

**Core value:** Know what smart money is doing before the crowd does — and trust the signals because the noise (bots, bundlers, dev wallets) has already been filtered out.
**Current focus:** Phase 13 complete — all 4 plans executed (including gap closure plan 04)

## Current Position

Phase: 16 — ProviderRouter Extension (Complete — 2/2 plans complete)
Plan: 02 complete — bundler.ts and wash-trader.ts getDefaultFetcher() rewired to sharedProviderRouter; both detectors gain Shyft fallback and throw-on-exhaustion (API-01, API-03 satisfied)
Status: Complete
Last activity: 2026-04-20 -- Phase 16 Plan 02 complete

```
v1.1 Progress: [██████████] 100% (16/16 plans complete)
```

## Milestone History

- ✅ v1.0 MVP — shipped 2026-03-30 — 12 phases, 38 plans, ~14,500 LOC TypeScript

## Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 13 - Railway Deployment | Persistent Railway deployment with data integrity safeguards | DEPLOY-01–04 | Complete |
| 14 - Signal Outcome Tracking | Accurate forward-testing dataset: 30m window, peak price, rug classification | OUTCOME-01–06 | Complete (4/4 plans) |
| 15 - Coin Sourcing + Observability | Automated discovery via DexScreener with caps and dashboard health | SEED-01–06, OBS-01–02 | Complete (5/5 plans) |
| 16 - ProviderRouter Extension | Bundler/wash-trader detection with full Shyft fallback | API-01–03 | In progress (1/2 plans) |
| 17 - GMGN Agent API Integration | Replace public endpoint scrape with official GMGN Agent API for robust token data ingestion | TBD | Not started |

## Accumulated Context

### Carried from v1.0

- Full pipeline live: Helius → DEX parsing → detection gate → scoring → signals → dashboard + Telegram
- Known tech debt: bundler.ts + wash-trader.ts bypass ProviderRouter (Helius-only, no Shyft fallback) — addressed in Phase 16
- signal_events table exists from Phase 12 — tracks signal fires but no 30m window, peak price, or rug status yet
- Discovery is CA-seeded manually only — no automated coin sourcing exists yet

### v1.1 Decisions

- Phase ordering is data-integrity driven: 13 (deployment substrate) → 14 (schema migrations) → 15 (auto-sourcing needs Phase 14 columns) → 16 (router extension, highest regression risk, benefits from Phase 15 throughput as test load)
- Telegram admin error/crash alerting is explicitly out of scope for v1.1 (signal channel reserved for signals only; operational info goes to dashboard and /status command)
- signal_event_holders table (sell signal infrastructure) to be created in Phase 15 as passive data capture for v1.2 — costs one extra insert per signal fire, needs 30+ days of data before v1.2 exit-tracking analysis is meaningful

### Phase 13 Plan 04 Decisions (2026-04-02)

- DEPLOY-03 requirement text updated to warning-only: RAILWAY_REPLICA_ID is present on all Railway deployments (including single-replica); hard-fail on its presence is not feasible and was never the correct behaviour
- Phase 13 progress table row corrected: v1.1 milestone column added, plan count updated to 4/4
- docs/railway-deployment.md now includes operator-facing explanation of advisory warning and why it fires on all Railway deployments

### Phase 13 Plan 03 Decisions (2026-04-01)

- Substring match on 'max_usage_reached' used for credit exhaustion detection (resilient to Helius body format variations vs exact JSON parse)
- monitorLoop imported lazily via dynamic import() in providers/index.ts to avoid circular dependency at module load time
- HeliusCreditExhaustedError re-thrown after monitorLoop.pause() so ProviderRouter can still fall back to Shyft for the current request cycle
- ESM test pattern: simulate onFailedAttempt logic directly without jest.mock (jest.mock incompatible with NODE_OPTIONS=--experimental-vm-modules)

### Phase 13 Plan 02 Decisions (2026-04-01)

- Used dependency injection (VolumeCheckOptions) for fs/setTimeout testability — @jest/globals not installed, project avoids module mocking
- validateVolumeMount uses dynamic import in serve action to ensure volume check runs before db static-import side-effects (db/index.ts creates dir + opens db on import)
- Replica warning is advisory (console.warn), not a hard fail — Railway blocks volumes+replicas at infra level; warning helps operators diagnose config issues
- Telegram bot hard-fail only when TELEGRAM_BOT_TOKEN is configured — no token means bot is intentionally absent

### Phase 13 Plan 01 Decisions (2026-04-01)

- Used node:20-slim (Debian/glibc) not Alpine — better-sqlite3 native module requires glibc; Alpine's MUSL libc causes build failures
- No USER switch in Dockerfile — Railway volumes mount as root; non-root user breaks volume read/write permissions
- healthcheckTimeout = 300s — allows 5 minutes for volume validation retry loop plus app startup
- Checked in railway.toml — deployment configuration reproducible from git without manual Railway dashboard steps

### Phase 14 Plan 04 Decisions (2026-04-09)

- maxPct stored as decimal fraction (1.0 = 100%) — ALERT_THRESHOLD_PCT default 100 means +100% return threshold
- Ticker fallback uses first+last 4 chars of token_mint — signal_events has no ticker column
- outcome_alert_log onConflictDoNothing() dedup before each alert fire — prevents re-fires across restarts
- Two independent cycleEmitter listeners for runAlertCycle and runOutcomeAlertCycle — each handles errors independently

### Phase 14 Plan 03 Decisions (2026-04-09)

- Rug exclusion uses or(is_rug=false, is_rug IS NULL) to handle rows predating the is_rug column (which default to NULL)
- hits_1h and hits_4h intentionally omitted — only 30m and 24h define hits; 1h/4h expose avg returns which are more useful for those windows
- Time-to-peak derived inline in EJS from recentEvents rather than adding route-level aggregation, keeping accuracy route unchanged
- Sparse data consistently shows "Insufficient data (N/20)" for both 30m and 24h hit rate columns

### Phase 14 Plan 02 Decisions (2026-04-09)

- MILESTONE_COLUMNS map keyed by integer threshold (50/100/300) for clean extensibility if OUTCOME_MILESTONES adds new thresholds
- updatePeakPrice reads current peak_price first (one SELECT) then conditionally writes — avoids unconditional UPDATE on every resolution cycle
- Rug detection uses continue statement after rug write to skip normal 4h write path — keeps rug/non-rug paths clearly separated
- 24h loop uses WHERE eq(signal_events.is_rug, false) to prevent re-fetching price for already-rugged tokens
- MAX_PER_CYCLE cap test updated from resolved=20 to resolved=40 (30m and 1h windows each process 20 of 25 due rows); timeout extended to 15s for 40 * 200ms mock delays

### Phase 15 Plan 01 Decisions (2026-04-18)

- sourcing_log uses one row per poll cycle with aggregate counts (not per token) — simpler audit trail, sufficient for dashboard observability needs
- updateSharedProviderStatus() called unconditionally after every cycle (not only on onAllExhausted) — ensures /admin and /status always show current provider health during normal operation
- Shared provider status stored as module-level variable in providers/index.ts — avoids passing router references through layers or creating circular dependencies

### Phase 15 Plan 02 Decisions (2026-04-18)

- Source tagging (wallets.source='gmgn') deferred to Plan 03 — runDiscovery() will accept source in DiscoveryOptions for clean propagation vs unsound type cast approximation
- ceilingAlertFired resets when wallet count drops below ceiling — enables re-alert on future ceiling re-hit after wallet removal
- Null bluechip_owner_percentage fails pre-filter (conservative skip-to-be-safe) — avoids auto-seeding tokens with unknown bluechip ownership

### Phase 15 Plan 03 Decisions (2026-04-18)

- walletSource passed as explicit parameter to evaluateCandidate rather than closing over it — keeps function signature self-documenting
- autoSourcer singleton created in monitor/index.ts (not commands/wallet.ts) — mirrors monitorLoop export pattern, single source of truth for the instance
- SIGINT handler also calls autoSourcer.stop() — ensures clean shutdown on Ctrl+C in addition to SIGTERM

### Phase 15 Plan 04 Decisions (2026-04-18)

- Dynamic import used for monitorLoop and autoSourcer in /admin route handler — avoids circular dependency at module load time (same lazy-import pattern as other async routes)
- getSharedProviderStatus() called via dynamic import in /admin route — singleton is populated by loop.ts's updateSharedProviderStatus() on each monitor cycle; shows empty array before first cycle completes
- providerStatus objects retain the `index` field from router.getStatus() — EJS only renders name/state/lastError so no stripping needed

### Phase 15 Plan 05 Decisions (2026-04-18)

- Dynamic import used for monitorLoop, autoSourcer, getSharedProviderStatus in /status handler — avoids circular dependency at module load time (same lazy-import pattern as /admin route from Plan 04)
- Stall threshold is 5 minutes (STALL_THRESHOLD_MS) — null lastCycleCompletedAt treated as "Not started" separately from timed-out state for clear operator UX
- Provider section uses try/catch with graceful fallback — empty array returns "No provider data yet", import failure returns "Provider status unavailable"
- /status is on-demand only — not scheduled, not triggered by cycles; pure Telegram command handler

### Phase 16 Plan 01 Decisions (2026-04-20)

- AbortError used in pRetry onFailedAttempt for non-retryable errors (missing result, 401) — pRetry v7 changed onFailedAttempt signature to RetryContext object; context.error holds the original error
- SHYFT_NATIVE_TRANSFER_ACTION_TYPES contains only SOL_TRANSFER — D-03 script was committed in Plan 00 but operator did not run it; SOL_TRANSFER is the canonical documented type
- tryCallGetTransactionDetails throws on exhaustion (no ?? []) — callers need explicit failure signal; distinct from existing list methods which return empty arrays
- sharedProviderRouter exported as module-level const from providers/index.ts — instantiated once per process; Plan 02 consumes via dynamic import inside function body to avoid circular deps

### Phase 16 Plan 02 Decisions (2026-04-20)

- Explicit adapter object `{ getTransaction: sig => router.getTransactionDetails(sig) }` used instead of `as unknown as BundlerFetcher`/`WashTraderFetcher` cast — TypeScript validates method signature directly, method-name bridge is visible in code, no unsafe `unknown` hop
- Zero changes to detector interfaces (D-05) and test files (D-06) — only `getDefaultFetcher` function body modified in each of bundler.ts and wash-trader.ts
- Dynamic `await import('../fetchers/providers/index.js')` kept inside function body (not top-level) — preserves lazy-load isolation for test-time DI injection pattern

### Roadmap Evolution

- Phase 17 added: GMGN Agent API Integration — replace public trending endpoint scrape with official GMGN Agent API (https://docs.gmgn.ai/index/gmgn-agent-api) for authenticated, rate-limit-friendly token data ingestion

### Research Flags for Planning

- **Phase 15**: Before building AutoSourcer filter logic, verify DexScreener boost endpoint (`/token-boosts/latest/v1`) live JSON response field names (`chainId`, `tokenAddress`, `boostAmount`). A mismatch silently breaks the Solana token filter.
- **Phase 16**: Before implementing ShyftProvider `getTransactionDetails`, get a real Shyft response for a known bundled transaction to verify native transfer action type names. Building against inferred field names risks silent bundler detection failures.

## Blockers

None.

## Next Action

Phase 16 complete — all 2 plans executed, all 3 requirements satisfied (API-01, API-02, API-03). Run `/gsd:verify-work` for final goal-backward audit of Phase 16. Next: Phase 17 — GMGN Agent API Integration.
