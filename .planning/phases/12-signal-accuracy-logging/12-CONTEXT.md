# Phase 12: Signal Accuracy Logging - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

After each monitoring cycle fires a token signal (0-100 score), the system logs what happened next — capturing price outcomes at multiple time windows so signal quality (hit rate and average return) can be measured over time. This phase covers logging, outcome resolution, and surfacing accuracy stats. It does not change how signals are calculated.

</domain>

<decisions>
## Implementation Decisions

### Accuracy definition
- A signal is "correct" if price rises by a tiered threshold within the outcome window: Strong signals (≥65) require a higher % gain than Moderate signals (≥35) — exact thresholds to be decided during planning/research
- Track accuracy for Strong and Moderate signals only — Weak signals (<35) are excluded from accuracy tracking
- Track false positives too: log when a Strong/Moderate signal fires and price drops significantly — enables false positive rate calculation alongside hit rate

### Outcome capture timing
- Check price at three windows after signal fires: 1h, 4h, and 24h — all three captured per signal event
- Outcome capture is automatic (background job) — system schedules checks itself, no manual CLI step required
- Price data comes from an external price feed (e.g. Jupiter, Birdeye, or DexScreener) — not Helius, not derived from swaps

### Claude's Discretion (timing)
- Dead/rugged token handling: if a token has no liquidity when the outcome check runs, determine whether to mark as 'failed', 'inconclusive', or apply another strategy

### What gets logged
- Full snapshot captured at signal-fire moment: signal score, tier, all sub-scores (smart wallet count, buy velocity, holder score), holder count, coordinated wallet count
- Only log on **tier changes** — when a token's tier transitions (Moderate → Strong, Strong → Moderate, etc.) — not every 30s cycle; this keeps the table lean and captures meaningful events

### Claude's Discretion (logging)
- Price capture at signal time: determine whether to fetch immediately or reconstruct from nearest swap
- Retention policy: determine appropriate retention window (30 days, 90 days, or indefinite)

### How accuracy is surfaced
- **Dashboard:** New section showing aggregate accuracy stats (hit rate by tier, average return by window) at top, plus a table of recent signal events with their outcomes below
- **Telegram:** Accuracy summary available — Telegram trigger timing/frequency is Claude's discretion (daily digest, weekly, or on-demand /accuracy command)
- Primary metrics displayed: hit rate by tier (e.g. "Strong: 68% hit rate") AND average return per window (e.g. "Strong 24h avg: +34%")
- No CLI accuracy command — dashboard and Telegram cover the surface area

</decisions>

<specifics>
## Specific Ideas

- Tiered accuracy thresholds: Strong signals should have a meaningfully higher price target than Moderate — the thresholds should reflect the score difference (Strong ≥65 vs Moderate ≥35)
- The 1h/4h/24h outcome windows are all captured per event — the table of recent signal events in the dashboard should show all three columns

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-signal-accuracy-logging*
*Context gathered: 2026-03-27*
