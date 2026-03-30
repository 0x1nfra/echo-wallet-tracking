# Phase 7: API, Dashboard, and Telegram Alerts - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the full user-facing delivery layer: a Fastify REST+SSE API, an HTMX/Alpine.js web dashboard for monitoring signals and wallets, and a grammy Telegram bot for alerts and on-demand queries. This phase consumes data produced by Phases 1–6 — it does not modify detection, scoring, or signal logic. New discovery, auth, or social features are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Token signal feed
- Default sort: signal score descending (highest first)
- Columns per row: token mint/name, score, tier badge, smart holder count, last updated
- Live update behavior: highlight changed rows with a brief yellow fade when a new SSE cycle event arrives
- Filtering: tier filter chip bar (Strong / Moderate / Weak / All) — no other filters in v1

### Wallet detail view
- Entry points: (1) clicking a row in the wallet table on the dashboard, (2) clicking the smart holder count in the signal feed row
- Layout: score card at the top, trade history table below — both equally prominent
- Score section: display sub-scores (win rate, Sharpe, PnL, recency) and the overall 0–100 score with weights
- Detection section: current status badge + which detectors fired and at what confidence level (e.g., bundler: suspected, sniper: clean)
- Trade history: recent swaps table with token, direction (buy/sell), SOL amount, realized PnL
- Current open positions: Claude's discretion — include if it adds meaningful signal without cluttering

### Alert thresholds & dedup
- Threshold configuration: Claude's discretion — keep it simple (env var or config file), no in-bot config command needed
- Dedup window: 2-hour dedup per token — no repeated alerts within 2h of the last alert
- Dedup override: if smart holder count increases by **+3 or more** within the dedup window, send a follow-up "accumulation" alert — this signals growing conviction, not noise
- Alert message contents: token mint, score, tier, smart holder count, top 2–3 wallet addresses holding it

### Telegram bot commands
- `/status` — system health: last cycle timestamp, tracked wallet count, active signal count
- `/top` — top 5 tokens by signal score; each entry: token mint, score, tier, top holder wallet address
- `/wallet <address>` — score, detection status, score breakdown, last 3–5 trades (Claude's discretion on exact depth)
- `/signal <token_mint>` — look up a specific token's current signal score, tier, holder count, and top holder
- Alert configuration commands: not needed — threshold lives in env/config

### Claude's Discretion
- Whether to show current open positions on the wallet detail page
- Exact depth of `/wallet <address>` response (within the "score + detection + recent trades" frame)
- Alert threshold value and config mechanism (env var vs config file)
- HTMX vs full-page reload for tier filter interactions
- SSE event schema and reconnect behavior

</decisions>

<specifics>
## Specific Ideas

- Alert dedup should suppress noise but not suppress growing conviction — the +3 wallet accumulation rule is the key distinction between noise suppression and signal amplification
- /top should feel like a quick morning briefing: what are the 5 best signals right now, and who's behind them

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-api-dashboard-and-telegram-alerts*
*Context gathered: 2026-03-16*
