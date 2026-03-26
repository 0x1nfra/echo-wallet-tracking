---
phase: 08-wallet-discovery
verified: 2026-03-17T06:00:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Run 'wallet discover <CA> --dry-run' against a real token contract address"
    expected: "Streaming progress output printed to console; summary table shows Total evaluated, Added (0 for dry-run), Rejected, Already tracked; [DRY RUN] notice printed at end"
    why_human: "Requires a live Helius API key and a real Solana CA; can't mock end-to-end in automated checks"
  - test: "Open http://localhost:3000 with at least one wallet in probation (set probation_until = now+7d in DB directly)"
    expected: "Dashboard shows 'Active Wallets' section and 'Probationary Wallets (excluded from signals)' section; probationary wallet appears only in the second section with Probation Until date"
    why_human: "Visual rendering in browser cannot be asserted programmatically; HTMX re-render on SSE cycle also needs eye-check"
  - test: "Run 'wallet list' with at least one wallet in probation"
    expected: "Probationary Wallets table section rendered below active/flagged sections; probationary wallet absent from the active sections"
    why_human: "Requires live DB state with a probation_until record; behaviour conditional on row data"
---

# Phase 8: Wallet Discovery Verification Report

**Phase Goal:** Wire the wallet discovery system (built in plans 08-01 through 08-03) into the CLI and dashboard so users can discover profitable traders via `wallet discover <CA>` and see probationary wallets in both `wallet list` and the HTMX dashboard.
**Verified:** 2026-03-17T06:00:00Z
**Status:** human_needed (all automated checks passed; 3 items need live-environment testing)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths derive from the PLAN frontmatter `must_haves.truths` (08-04-PLAN.md) and the ROADMAP success criteria.

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can run `wallet discover <CA>` and see streaming progress output | VERIFIED | `wallet.command('discover <mint>')` exists at line 435 of `src/commands/wallet.ts`; calls `runDiscovery` via dynamic import; prints cli-table3 summary with totals and dry-run notice |
| 2 | Discovery command respects `--min-score` and `--dry-run` flags | VERIFIED | Options declared: `--min-score <number>` (default `'70'`, parsed via `parseFloat`) and `--dry-run` (boolean); both forwarded to `runDiscovery(mint, { minScore, dryRun })` |
| 3 | After discovery, `wallet list` shows a separate Probationary Wallets section | VERIFIED | Lines 71-142 of `wallet.ts`: separate DB query for `probation_until IS NOT NULL AND > nowMs`; probationary addresses excluded from active sets; distinct cli-table3 section printed if rows exist |
| 4 | Dashboard wallet list shows probationary wallets in a distinct section from active wallets | VERIFIED | `dashboard.ejs` lines 34-89: "Active Wallets" section renders `active` array; "Probationary Wallets (excluded from signals)" section renders `probationary` array; old flat `wallets` variable fully replaced |
| 5 | Discovery summary shows: candidates evaluated, added, rejected, and dry-run notice if applicable | VERIFIED | `wallet.ts` lines 447-459: summary table pushes `totalCandidates`, `added`, `rejected`, `alreadyTracked`; dry-run notice printed conditionally on `result.dryRun` |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Level 1: Exists | Level 2: Substantive | Level 3: Wired | Status |
|----------|----------|----------------|---------------------|----------------|--------|
| `src/commands/wallet.ts` | `wallet discover` subcommand + probationary section in `wallet list` | Yes | Yes — 591 lines; `discover` subcommand at line 435; probationary query + table at lines 71-142 | Yes — registered in `createWalletCommand()`, consumed via CLI entrypoint | VERIFIED |
| `src/api/routes/wallets.ts` | Probation wallets in `/api/wallets` JSON response | Yes | Yes — two separate queries (active/probationary) at lines 13-20; `probation_until` included in `mapRow` | Yes — registered in `buildServer()` via `app.register(import('./routes/wallets.js'))` | VERIFIED |
| `src/api/server.ts` | Active/probationary split passed to dashboard template | Yes | Yes — lines 64-75: two drizzle queries with `isNull`/`lt` and `isNotNull`/`gt` predicates; `reply.view('dashboard', { rows, active, probationary })` | Yes — renders dashboard on GET `/` | VERIFIED |
| `src/api/views/dashboard.ejs` | Probationary Wallets section in wallet list view | Yes | Yes — 89 lines; "Active Wallets" section (`active.forEach`) at lines 34-62; "Probationary Wallets" section (`probationary.forEach`) at lines 64-89 | Yes — template data passed from `server.ts`; both `active` and `probationary` arrays consumed | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `src/commands/wallet.ts` wallet discover action | `src/discovery/index.ts` `runDiscovery` | Dynamic import: `const { runDiscovery } = await import('../discovery/index.js')` | WIRED | Line 441 of `wallet.ts`; `runDiscovery` exported at line 205 of `discovery/index.ts` |
| `src/api/routes/wallets.ts` | `src/db/schema.ts` `wallets.probation_until` | Drizzle query with `isNotNull(wallets.probation_until)` and `gt(wallets.probation_until, nowMs)` | WIRED | Lines 18-20 of `routes/wallets.ts`; `probation_until` column confirmed in `schema.ts` line 20 |
| `src/api/server.ts` | `src/api/views/dashboard.ejs` | `reply.view('dashboard', { ..., active: activeWalletRows, probationary: probationaryWalletRows })` | WIRED | Line 75 of `server.ts` passes both arrays; template consumes both at lines 47 and 76 of `dashboard.ejs` |
| `src/api/views/dashboard.ejs` | Template variables `active` / `probationary` | Renders `active.forEach` and `probationary.forEach` loops with probation_until formatted as UTC string | WIRED | Lines 47 and 76-82 of `dashboard.ejs`; `new Date(w.probation_until).toUTCString()` at line 81 |

---

### Requirements Coverage

All four requirement IDs from the ROADMAP are accounted for across plans 08-01 through 08-04.

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| DISC-01 | 08-02, 08-04 | User can trigger discovery from a token CA to extract wallets that bought early and profited | SATISFIED | `fetchEarlyBuyers` in `src/discovery/early-buyers.ts`; `wallet discover <mint>` CLI wires to `runDiscovery` which calls `fetchEarlyBuyers` |
| DISC-02 | 08-03, 08-04 | System scores each candidate and only adds those scoring above 70 | SATISFIED | `runDiscovery` applies `minScore` threshold; candidates below threshold persisted as `result='rejected'` in `discovery_candidates`; `--min-score` flag exposed on CLI |
| DISC-03 | 08-01, 08-03, 08-04 | Newly discovered wallets enter 7-day probation and are excluded from signal scoring during probation | SATISFIED | `probation_until` column in schema; signal engine excludes wallets where `probation_until > nowMs` (line 63 of `signals/engine.ts`); probationary section in CLI `wallet list` and dashboard |
| DISC-04 | 08-03 | System discovers additional candidates via graph traversal (co-traded with known smart money) | SATISFIED | `fetchCoTraders` in `src/discovery/graph-traverse.ts` line 41; imported and wired into `runDiscovery` Phase 2 at lines 254-275 of `discovery/index.ts` |

No orphaned requirements: all four DISC-* IDs declared in plan frontmatter and verified above.

---

### Anti-Patterns Found

Scanned all four modified files for: TODO/FIXME/HACK/placeholder comments, empty implementations (`return null`, `return {}`, `return []`), stub handlers.

| File | Pattern | Severity | Finding |
|------|---------|----------|---------|
| All four files | TODO/FIXME/HACK/placeholder | — | None found |
| All four files | `return null / {} / []` | — | None found |
| All four files | Stub API (`Not implemented`) | — | None found |

No anti-patterns detected.

---

### Test Suite

All 184 tests pass (`NODE_OPTIONS=--experimental-vm-modules pnpm test`):
- 19 test suites, 0 failures
- Includes discovery tests added in plans 08-02 and 08-03

---

### Commits

Both task commits verified in git history:
- `db45752` — feat(08-04): add wallet discover subcommand and probationary section to wallet list
- `69780f1` — feat(08-04): expose probationary wallets in API, server template, and dashboard

---

### Human Verification Required

The following items require a live environment (running server + seeded database or live Helius key) and cannot be asserted via static code analysis:

#### 1. End-to-end discovery CLI run

**Test:** With a real Helius API key configured, run `pnpm ts-node src/cli.ts wallet discover <CA> --dry-run` against a known Solana token contract address.
**Expected:** Console shows streaming log output ("Fetching early buyers...", "Found X candidates...", "Fetching co-traders..."), followed by a cli-table3 summary table and `[DRY RUN — no wallets were added]` notice.
**Why human:** Requires live Helius API access and a real token CA; the RPC calls cannot be exercised in automated unit tests.

#### 2. Dashboard probationary section rendering

**Test:** Manually set `probation_until = strftime('%s','now','+7 days') * 1000` for one wallet row in the SQLite DB, start the server (`pnpm ts-node src/cli.ts serve`), then open `http://localhost:3000` in a browser.
**Expected:** The dashboard shows two separate wallet sections — "Active Wallets" and "Probationary Wallets (excluded from signals)" — with the manually-probated wallet appearing only in the second section, with a "Probation Until" date ~7 days out.
**Why human:** Visual layout and HTMX SSE-triggered re-render cannot be validated without a browser; probationary data requires seeded DB state.

#### 3. `wallet list` probationary section in CLI

**Test:** With the same seeded probationary wallet as above, run `pnpm ts-node src/cli.ts wallet list`.
**Expected:** Output shows "Clean Wallets" or "Flagged Wallets" sections (if applicable) followed by a distinct "Probationary Wallets (7-day probation — excluded from signal scoring)" section; the probated wallet does NOT appear in the active/clean sections.
**Why human:** Terminal output conditional on live DB state; cannot be asserted without a seeded row.

---

### Summary

All automated verifications pass. The four artifacts exist, are substantive, and are correctly wired:

- `wallet discover <mint>` is fully implemented and routed to `runDiscovery` via dynamic import, consistent with the Phase 5 pattern.
- `/api/wallets` correctly returns `{ active, probationary }` shape with the drizzle `isNull`/`lt`/`isNotNull`/`gt` split query.
- `server.ts` passes both arrays to the dashboard template via `reply.view`.
- `dashboard.ejs` renders both "Active Wallets" and "Probationary Wallets (excluded from signals)" sections; the old flat `wallets` variable is fully replaced.
- All four requirement IDs (DISC-01 through DISC-04) are accounted for across plans 08-01 through 08-04.
- 184/184 tests pass with no regressions.

Three items are flagged for human verification because they require live API keys, a running server, or seeded DB state. The code path for each is fully implemented; the items are surfacing / behavioural checks only.

---

_Verified: 2026-03-17T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
