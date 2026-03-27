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
- A signal is "correct" if price rises by a tiered threshold within the outcome window: Strong signals (≥65) require a higher % gain than Moderate signals (≥35) — exact thresholds are Claude's discretion during planning but must be explicit and documented
- Suggested targets: Strong ≥ +50% gain, Moderate ≥ +25% gain (within the outcome window)
- Track false positives too: log when a Strong/Moderate signal fires and price drops significantly — enables false positive rate calculation alongside hit rate

### Baseline / control group
- Weak signals (<35) ARE logged but excluded from primary accuracy display — kept for tier differentiation validation (proving Strong > Moderate > Weak validates the scoring system)
- Control group sampling of random new token launches (not triggered by tracked wallets): Claude's discretion on feasibility

### Entry price definition
- "Entry price" = token price at moment the tier transition is logged — not wallet entry price, not token launch price
- Outcome % calculated as: `(price_at_window - entry_price) / entry_price`
- Rationale: measures whether the *signal* was timely, not whether the wallets got good entries

### Signal fire timestamp precision
- Log EVERY tier transition as a separate event — if a token goes Weak → Strong → Weak → Strong, each transition is a separate log entry
- Outcome windows (1h, 4h, 24h) measured from each individual transition timestamp
- This captures both "early correct calls" and "late/repeated signals" for analysis

### Outcome capture timing
- Check price at three windows after signal fires: 1h, 4h, and 24h — all three captured per signal event
- Outcome capture is automatic (background job) — system schedules checks itself, no manual CLI step required
- Price data comes from an external price feed (e.g. Jupiter, Birdeye, or DexScreener) — not Helius, not derived from swaps

### Rug / dead token handling
- No liquidity at outcome check time = mark outcome as `failed` (not inconclusive)
- Rationale: rugs are real losses — excluding them would hide false positives and inflate hit rate
- Outcomes are locked at check time — no retroactive updates if a token recovers liquidity later

### What gets logged
- Full snapshot captured at tier transition moment: `signal_score`, `tier`, `smart_wallet_count`, `buy_velocity`, `holder_score`, `holder_count`, `coordinated_wallet_count`, `entry_price`, `token_mint`, `timestamp`
- All tier transitions logged (including Weak) — tier differentiation analysis requires the full distribution

### Claude's Discretion (logging)
- Price capture at signal time: determine whether to fetch immediately or reconstruct from nearest swap
- Retention policy: determine appropriate retention window (30 days, 90 days, or indefinite)
- Control group feasibility: whether to sample random token launches as a baseline comparison

### Minimum sample size
- Accuracy stats displayed only after N=20 signals per tier
- Below threshold: show "Insufficient data (X/20)" instead of percentages
- Applies to both dashboard and Telegram accuracy surfaces

### How accuracy is surfaced
- **Dashboard:** New section showing aggregate accuracy stats (hit rate by tier, average return by window) at top, plus a table of recent signal events with their outcomes below (all three windows as columns)
- **Telegram:** `/accuracy` command available — timing/frequency is Claude's discretion (daily digest, weekly, or on-demand)
- Primary metrics displayed: hit rate by tier (e.g. "Strong: 68% hit rate") AND average return per window (e.g. "Strong 24h avg: +34%")
- No CLI accuracy command — dashboard and Telegram cover the surface area

</decisions>

<specifics>
## Specific Ideas

- Suggested accuracy thresholds: Strong ≥ +50%, Moderate ≥ +25% — exact values are Claude's discretion but must be explicitly documented in the plan
- Snapshot schema fields: `signal_score`, `tier`, `smart_wallet_count`, `buy_velocity`, `holder_score`, `holder_count`, `coordinated_wallet_count`, `entry_price`, `token_mint`, `timestamp` — confirm whether this schema exists or needs to be designed in planning
- The 1h/4h/24h outcome windows are all captured per event — the recent signal events table in the dashboard should show all three as columns

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-signal-accuracy-logging*
*Context gathered: 2026-03-27*
