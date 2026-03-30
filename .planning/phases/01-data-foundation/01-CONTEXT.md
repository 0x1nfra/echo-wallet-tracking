# Phase 1: Data Foundation - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Set up the complete SQLite schema (all 5 tables) with drizzle-orm migrations and WAL mode, and implement CLI wallet management (add/remove/list). Downstream phases (parsing, detection, scoring, signals) all write into tables defined here — no future schema additions needed for wallets, swaps, wallet_metrics, token_signals, or removal_log.

</domain>

<decisions>
## Implementation Decisions

### CLI command structure
- Subcommand namespace: `echo wallet add <address>`, `echo wallet remove <address>`, `echo wallet list`
- Wallet label via `--label` flag only — no interactive prompts
- `echo wallet add` on an already-tracked address errors with a clear message and non-zero exit ("Wallet <addr> is already tracked.")
- `echo wallet remove` accepts address only (not label) as the identifier

### Wallet list display
- Address displayed as truncated: first 8 chars + `...` + last 4 chars (e.g., `9WzDXwBb...3mF4`)
- Phase 1 columns: ADDRESS, LABEL, STATUS, ADDED — score/detection/last-active omitted until Phase 4+ populates them
- Unlabeled wallets show `(no label)` in the LABEL column
- Sort order: score descending when score exists, fallback to added date newest-first for unscored wallets (Phase 1 = all unscored, so newest first)
- Empty state: "No wallets tracked yet.\n\nGet started: echo wallet add <address>"

### Database file location
- Default path: `data/echo.db` (relative to project root)
- Override via `.env`: `DATABASE_URL=./data/echo.db` — no CLI flag needed
- Auto-created on first run: if `data/echo.db` doesn't exist, create it automatically (no init command required)

### Schema design — all 5 tables, fully defined in Phase 1
- **wallets**: all columns defined now, future-phase columns nullable
  - `id`, `address` (UNIQUE NOT NULL), `label`, `status` DEFAULT 'tracked', `score` (null until Phase 4), `detection_status` (null until Phase 3), `added_at`, `last_checked_at` (null until Phase 5), `history_complete` DEFAULT 0 (Phase 2)
- **swaps**: full Phase 2 schema defined now — `wallet_address`, `tx_signature`, `dex`, `token_mint`, `side` (buy/sell), `token_amount`, `sol_amount`, `timestamp`, `slot`, `fee_sol`, `cost_basis_sol`, `realized_pnl_sol`
- **wallet_metrics**: full schema defined now for Phase 4 columns
- **token_signals**: full schema defined now for Phase 6 columns
- **removal_log**: full schema defined now for Phase 5 columns
- **Inactivity threshold**: global config via `.env` (`INACTIVITY_DAYS=30`), not per-wallet column

### Claude's Discretion
- drizzle-orm schema definition style (e.g., `sqliteTable` helper vs raw SQL)
- Exact column types and constraints within the decided schema
- Migration file naming and directory structure
- WAL mode pragma application (at connection time vs migration)
- How the existing `Wallet` type in `src/types/wallet.ts` is reconciled with the new DB schema (extend, replace, or separate DB-layer types)
- Whether the existing `score` command in `src/cli.ts` is preserved as-is or stubbed differently

</decisions>

<specifics>
## Specific Ideas

- The `echo wallet list` preview showed columns: ADDRESS, LABEL, STATUS, LAST ACTIVE, SCORE — this is the target final state. Phase 1 shows ADDRESS, LABEL, STATUS, ADDED as a subset.
- cli-table3 is already installed — use it for table rendering.
- chalk is installed — use for status coloring if appropriate.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli.ts`: Commander.js program already configured with `echo` name and version. Add `echo wallet` subcommand here.
- `cli-table3` + `chalk` + `ora`: All installed, use for list table rendering, coloring, and any async spinners.
- `dotenv` (16.3.1): Already wired. Add `DATABASE_URL` and `INACTIVITY_DAYS` to `.env.example`.
- `src/types/wallet.ts`: Existing `Wallet` interface has `address`, `label`, `manualTag`. The DB schema `wallets` table covers these — new drizzle schema types can coexist or replace.

### Established Patterns
- Environment config via `.env` + dotenv is the existing pattern — follow it for `DATABASE_URL`.
- TypeScript strict mode, ES2022 target, ESNext modules — all new code must match.
- Path aliases configured: `@/*` maps to `src/*` — use `@/db/schema` style imports for database modules.
- Files: kebab-case modules (e.g., `src/db/schema.ts`, `src/db/migrations/`).

### Integration Points
- All downstream phases (2–8) depend on the schema being defined here — swaps, wallet_metrics, token_signals, removal_log must be complete.
- The monitoring loop (Phase 5) uses `last_checked_at` and `history_complete` from the wallets table.
- Detection (Phase 3) writes `detection_status` to wallets.
- Scoring (Phase 4) writes `score` to wallets.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-03-11*
