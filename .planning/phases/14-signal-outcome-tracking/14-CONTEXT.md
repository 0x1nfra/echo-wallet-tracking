# Phase 14: Signal Outcome Tracking - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the outcome resolver to record a forward-testing dataset per signal event: 30m outcome window (in addition to 1h/4h/24h), peak price and time-to-peak over 24h, rug classification, fixed % milestone storage (50%/100%/300%), user-configured Telegram alerts on threshold and milestone hits, and an accuracy section in the dashboard. Creating signals and the monitoring loop itself are separate — this phase only enriches what happens after a signal fires.

</domain>

<decisions>
## Implementation Decisions

### Rug Classification
- Criterion: bundler flag was high at signal time (threshold delegated to Claude based on existing bundler score output) AND price dropped >90% within 4h of signal
- Rug is an informational flag only — it does NOT penalize accuracy metrics
- Accuracy is computed on non-rug outcomes only; rugged tokens are excluded from accuracy denominators
- Modern rug patterns (rapid bundle-and-dump via tools like RapidLaunch) mean a steep price drop alone is not sufficient — bundler data already captured at signal time is the stronger signal
- Note: tokens can get CTO'd and revived after initial dump; rug label reflects the dump event, not a permanent verdict on the token

### Telegram Alerts
- Alert fires twice per token per outcome cycle:
  1. **First alert** (when user-configured threshold is first crossed): full info — CA, ticker, market cap at signal time, number of tracked wallets that bought this token
  2. **Milestone alerts** (each time 50%/100%/300% milestone is crossed, if above configured threshold): lean — ticker, CA, wallet count, milestone reached
- Global vs per-token threshold: Claude's Discretion
- Duplicate suppression: alert fires once per threshold crossing and once per milestone crossing — never re-fires for the same event

### Dashboard Accuracy View
- Layout and structure: Claude's Discretion (table + distribution is a reasonable baseline)
- "Hit" definition: user-configurable — a signal is a "hit" if it reaches the user-defined % return at a given time window
- Accuracy computed on non-rug outcomes only
- Sparse data handling: Claude's Discretion

### % Milestone Storage
- Fixed milestones: 50%, 100%, 300% — configurable via env/config (not hardcoded)
- Storage format: both flags AND timestamps per milestone — `hit_50`, `hit_50_at`, `hit_100`, `hit_100_at`, `hit_300`, `hit_300_at` (null if not reached)
- Dashboard visibility of milestones: Claude's Discretion

### Claude's Discretion
- Bundler score threshold for rug classification (what counts as "high")
- Global vs per-token alert threshold design
- Dashboard accuracy section layout and sparse data handling
- Whether milestone hit rates appear in the dashboard accuracy view or are stored for future analysis

</decisions>

<specifics>
## Specific Ideas

- Rug context: scammers now use bundle-and-dump via tools like RapidLaunch — LP removal is no longer the primary rug signal; bundler presence + fast deep price drop is more accurate
- Tokens can recover after a dump (CTO / community narrative revival) — rug label should not permanently disqualify a token from future tracking
- First Telegram alert should carry enough context to immediately act on (CA to check, market cap to gauge, how many tracked wallets confirm the buy)
- Milestone alerts should be minimal — just enough to know what happened at a glance without needing to check the dashboard

</specifics>

<deferred>
## Deferred Ideas

- **Wallet reputation scoring** — if tracked wallets frequently appear in rugged/bundled tokens, their signals should be weighted lower or flagged differently. Valuable future phase for improving signal quality upstream.
- **Buy-after-offload strategy** — tokens with a strong narrative or CTO potential could be candidates to scoop after bundler wallets dump. Requires Phase 14 data as foundation; belongs in a future analysis/strategy phase.

</deferred>

---

*Phase: 14-signal-outcome-tracking*
*Context gathered: 2026-04-05*
