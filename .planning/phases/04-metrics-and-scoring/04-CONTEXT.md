# Phase 4: Metrics and Scoring - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Calculate WalletMetrics from clean wallet swap history and produce a 0-100 quality score. This phase produces the score — it does not display it (Phase 7) or act on it (Phase 5 auto-removal). Wallets without `history_complete=true` or without `confirmed_passing` detection status are silently skipped.

</domain>

<decisions>
## Implementation Decisions

### Score Normalization
- Score is bounded to soft range 5-95 — no wallet is perfectly trustworthy or completely worthless from metrics alone
- Calibration of what "50" means (fixed thresholds vs population-relative): **Claude's Discretion**
- The risk-adjusted return component (40% weight) must produce meaningful separation between volatile high-win-rate wallets (bundler profile) and consistent risk-adjusted performers — the exact penalty magnitude is **Claude's Discretion**
- Score storage format (total only vs total + sub-scores): **Claude's Discretion** — consider Phase 7 dashboard needs (score breakdown per wallet is valuable for user transparency)

### Recency Weighting
- The meaningful activity window is **180 days** — trades older than 180 days are considered stale
- Decay model within the window (gradual vs hard cutoff): **Claude's Discretion**
- Whether recency affects only the recency component (20% weight) or also discounts other metric calculations: **Claude's Discretion**
- Whether dormant wallets (zero trades in 180 days) receive a score at all: **Claude's Discretion** — consider downstream signal quality (stale wallets in token signals reduce signal reliability)

### Minimum Activity Floor
- Minimum **20 trades** required before a wallet earns a score — fewer than 20 trades = no score produced
- How to handle wallets with large total history but thin recent activity (e.g., 50 total trades, 2 in last 180 days): **Claude's Discretion**
- Activity health component definition (frequency, diversity, or both): **Claude's Discretion**
- Whether to cap maximum trade count used for metrics: **Claude's Discretion**

### Score Update Triggers
- Whether scoring runs every monitoring cycle or only on new transactions: **Claude's Discretion** — optimize for correctness over efficiency
- Whether a manual CLI trigger (`wallet score`) is needed in Phase 4: **Claude's Discretion** — useful for threshold tuning but Phase 5 may be sufficient
- Whether detection status changes trigger immediate rescoring: **Claude's Discretion**
- Score history (overwrite vs append with timestamp): **Claude's Discretion** — consider Phase 5 auto-removal needs (score trend over time is needed for "N consecutive cycles below threshold" logic)

### Claude's Discretion
- Score normalization calibration (what "50" means)
- Risk-adjusted return penalty magnitude to separate bundler-profile vs genuine trader
- Score storage format (consider Phase 7 breakdown display needs)
- Recency decay model and dormancy handling
- Activity health formula (frequency, diversity, or composite)
- Maximum trade count cap
- Score update triggers (cycle vs new-transactions, status-change rescoring)
- Score history storage strategy — NOTE: Phase 5 requires score trend data for consecutive-cycle auto-removal, so some history tracking is likely necessary

</decisions>

<specifics>
## Specific Ideas

- Phase 5 auto-removal criterion: "score falls below threshold for N consecutive cycles over a 30-day rolling window" — this implies score history with timestamps is needed, not just the current score. Claude should factor this into the storage design.
- The bundler/genuine-trader separation example from the roadmap success criteria: "bundler at high win rate but volatile returns scores materially lower" — the Sharpe-like calculation is the primary differentiator here.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-metrics-and-scoring*
*Context gathered: 2026-03-13*
