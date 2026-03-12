---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 03-bundle-scam-detection plan 03 — detectSniper and detectWashTrader with TDD
last_updated: "2026-03-12T13:25:10.135Z"
last_activity: 2026-03-12 — Phase 03 plan 03 complete; detectSniper (DETC-03), detectWashTrader (DETC-04), 38 tests passing
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 9
  completed_plans: 8
  percent: 89
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Know what smart money is doing before the crowd — with noise (bots, bundlers, dev wallets) already filtered out
**Current focus:** Phase 2 — Transaction Parsing (complete)

## Current Position

Phase: 3 of 8 (Bundle Scam Detection)
Plan: 3 of 4 in current phase (complete)
Status: Phase 3 in progress
Last activity: 2026-03-12 — Phase 03 plan 03 complete; detectSniper (DETC-03), detectWashTrader (DETC-04), 38 tests passing

Progress: [█████████░] 89%

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3: Bundle detection thresholds are initial hypotheses — false-positive risk is high, needs tuning against real transaction data
- Phase 8: Graph traversal at scale against Helius free-tier limits (300 req/min) needs validation during planning

## Session Continuity

Last session: 2026-03-12T13:25:10.133Z
Stopped at: Completed 03-bundle-scam-detection plan 03 — detectSniper and detectWashTrader with TDD
Resume file: None
