# Phase 15: Coin Sourcing + Observability - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Automate token discovery by polling GMGN's trending endpoint and seeding tokens into Echo's existing discovery pipeline (direct-buyers-only mode, no graph traversal). Add wallet addition caps with env-var configuration. Add an /admin dashboard page and a Telegram /status command showing full system health.

Creating or modifying Echo's detection gate, scoring, or signal logic is out of scope — AutoSourcer feeds the existing pipeline.

</domain>

<decisions>
## Implementation Decisions

### Token sourcing source
- **GMGN only — DexScreener is dropped entirely**
- Inspiration: @shanesimpson513's system (3,200 tokens → 107 passed, 82.9% win rate) using GMGN's `/v1/market/rank` endpoint
- DexScreener boost API surfaces paid promotions, not organic signal — wrong fit for precision goal
- GMGN is Solana-native with smart money activity built into its ranking signals

### GMGN endpoint and pre-filters
- Primary endpoint: `/v1/market/rank` (polling for trending tokens)
- `/v1/token/info` noted but not used in Phase 15 (deeper enrichment — future phase)
- Pre-filters applied at AutoSourcer level before seeding into Echo:
  - **Holder count** — minimum threshold (researcher defines exact value)
  - **Dev concentration** — skip tokens with outsized dev wallet share (researcher defines threshold)
  - **Wash trading flag** — drop tokens GMGN already flags as wash-traded
  - **Age floor/ceiling** — filter too-new (rug risk) and too-old (missed the move) tokens; researcher determines exact window based on GMGN field availability
- The existing $10k liquidity floor from SEED-01 still applies on top of GMGN pre-filters

### Polling interval
- Claude's discretion — researcher checks GMGN rate limits and planner sets a sensible interval
- Context: the tweet system polls every 30 seconds, but Echo is seeding discovery (not real-time alerting) so a longer interval is likely appropriate

### Already-tracked tokens
- If a GMGN-surfaced token is already in Echo's pipeline: **skip and log**
- Log enables visibility into how much GMGN overlaps with tokens Echo already knew about

### Cap & limit behavior
- Daily cap hit (default 20/day): **keep polling GMGN, skip seeding** — logs continue, no wasted discovery but sourcing is paused
- Total ceiling hit (default 200): **both dashboard + one-time Telegram alert** fires when ceiling is first reached
- Caps are **env-var configurable**: `AUTO_SOURCE_DAILY_CAP` (default 20), `AUTO_SOURCE_TOTAL_CAP` (default 200)
- **Auto-resume**: if wallet count drops below ceiling (e.g. via auto-removal), sourcing resumes automatically — no manual intervention needed

### Dashboard admin section
- **New /admin page** — separate route, keeps main dashboard clean
- AutoSourcer stats to show:
  - Tokens fetched vs tokens seeded today (pass-through rate)
  - Daily additions vs cap (e.g. "14/20 today")
  - Total wallets vs ceiling (e.g. "87/200 total")
  - Last sourcing run timestamp
  - Sourcing status: active / paused (daily cap hit) / ceiling hit
- Recent errors: Claude's discretion on display format (last N or time window)
- Provider status: Claude's discretion on detail level — at minimum active/degraded/exhausted state + last error message per provider

### Telegram /status command
- Scope: **full system health** — monitoring loop + AutoSourcer + provider health in one command
- Monitoring: cycle count, last cycle duration, stall status
- Sourcing: last GMGN poll timestamp, sourcing status (active/paused/ceiling)
- Providers: Helius and Shyft status (active/degraded/exhausted)
- Stall detection threshold: Claude's discretion (likely 2× normal cycle interval or a fixed 5-minute threshold)
- Response format: Claude's discretion — structured with bold section headers is preferred for readability

### Claude's Discretion
- Polling interval for AutoSourcer (pending researcher's GMGN rate limit findings)
- Age filter exact window (pending researcher's verification of GMGN field names)
- Holder count and dev concentration exact thresholds
- Recent errors display format on /admin page
- Provider status detail level on /admin page
- Stall detection threshold for /status
- Telegram /status message format

</decisions>

<specifics>
## Specific Ideas

- Reference system: @shanesimpson513 on X — uses `/v1/market/rank` polling, multi-stage filtering (trending data → multi-scan tracking → `/v1/token/info` deep dive), 3,200 tokens → 107 passed, 82.9% win rate, 2.58x avg return
- "Speed is a commodity. Filtering is the moat." — precision over coverage is the explicit goal
- GMGN endpoint reference: https://gmgn.ai/ai?ref=scgalpha
- The multi-stage approach (rank → track across multiple scans → info deep dive) is noted as a future enhancement — Phase 15 is single-stage discovery only

</specifics>

<deferred>
## Deferred Ideas

- Multi-stage token tracking: polling a token across multiple scans to watch holder growth, liquidity stability, buy/sell pressure, bundler rate, bot rate before seeding — more sophisticated than single-stage discovery, own phase
- `/v1/token/info` deep dive: rug ratio, entrapment ratio, KOL presence, social duplicates — available on GMGN but out of scope for Phase 15
- Journaling/backtesting: snapshot price/mcap/liquidity/holders/bot rate every 30 seconds post-alert for backtest data — separate initiative

</deferred>

---

*Phase: 15-coin-sourcing-observability*
*Context gathered: 2026-04-14*
