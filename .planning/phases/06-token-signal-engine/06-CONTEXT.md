# Phase 6: Token Signal Engine - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce a per-token 0-100 signal score after each monitoring cycle, reflecting genuine smart money activity. Inputs are smart wallet count, buy velocity, exit pressure, and coordination state. The signal is stored in token_signals and consumed by Phase 7's API/dashboard. No user-facing API, dashboard, or Telegram alerts are in scope — those are Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Exit pressure
- Exit pressure is a **separate indicator** stored alongside the signal score — it does NOT reduce the 0-100 score
- Store as a float field (e.g., `exit_pressure: 0.0–1.0`) on the token_signals record
- The buy signal score reflects buy-side smart money conviction; exit pressure lets Phase 7 show a directional overlay without polluting the score

### Signal tier label
- Store a human-readable tier alongside the 0-100 score (e.g., `strong` / `moderate` / `weak`)
- Tier boundaries are Claude's discretion — enables easy filtering in Phase 7 without recalculating thresholds

### Claude's Discretion
- **Score formula weights** — Claude picks a balanced weighting across smart wallet count, buy velocity, PnL-weighted holder score. Suggested: PnL-weighted holder quality ~40%, buy velocity (1hr) ~35%, smart wallet count ~25%.
- **Buy velocity window** — Claude picks between strict 1hr or decaying multi-window (1hr primary, 6hr/24hr at reduced weight). Prefer whichever better distinguishes genuine signals from one-off noise.
- **Holder inclusion** — Claude decides whether to count only current holders or all recent buyers. Lean toward current holders for conviction signal, but note wallets that exited.
- **Minimum wallet floor** — Claude sets the minimum smart wallet count needed to emit a signal. Suggest 2 to filter single-wallet noise without being too restrictive.
- **Wallet score gate** — Claude decides if low-scoring wallets are weighted-by-score or excluded below a threshold. Prefer weighting over hard exclusion to preserve nuance.
- **Token eligibility filter** — Claude applies a minimal sanity filter (e.g., tokens with only 1 swap ever or no DEX pair are excluded). Avoid complex filtering; keep it simple.
- **Coordination detection** — Claude picks the approach: reuse existing bundler wallet flags first (no new infrastructure), fall back to funding-source clustering only if needed.
- **Discount mechanism** — Claude picks how coordination is applied (multiplier, cap, or exclusion). Prefer a continuous multiplier over hard cap for smoother scoring.
- **Coordination metadata** — Claude decides whether to store coordination details (e.g., `coordinated_wallet_count`) on the record. Lean toward storing it for Phase 7 explainability.
- **All-coordinated suppression** — Claude decides whether a fully-coordinated token emits a signal. Lean toward suppressing (no signal) when all holders are flagged as coordinated.
- **Signal lifecycle** — Claude decides what happens when a token has no smart wallet holders. Lean toward keeping the record with a stale/inactive marker rather than deleting (useful for Phase 7 history).
- **Computation placement** — Claude decides whether signal computation runs inside the 30s MonitorLoop cycle or as a decoupled post-cycle step. Prefer a post-cycle step for testability.
- **CLI exposure** — Claude decides whether a basic `signal list` CLI command is added. Lean toward adding a minimal one (top tokens by signal) so the engine can be manually verified before Phase 7.
- **History vs upsert** — Claude decides if token_signals is upsert-per-token or time-series. Lean toward latest-only upsert for Phase 6 simplicity; Phase 7 can add history if needed.

</decisions>

<specifics>
## Specific Ideas

No specific references or "I want it like X" moments — open to standard approaches for all Claude's Discretion items above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-token-signal-engine*
*Context gathered: 2026-03-15*
