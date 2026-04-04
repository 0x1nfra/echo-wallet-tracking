# Feature Research

**Domain:** Signal outcome tracking, automated coin sourcing, observability — Echo Wallet Tracker v1.1
**Researched:** 2026-03-31
**Confidence:** HIGH — based on direct codebase inspection plus verified API documentation

---

## Context: What Already Exists (Do Not Rebuild)

v1.0 shipped all of the following. They are **out of scope** for v1.1 research:

| Existing Component | Relevant to v1.1 |
|--------------------|------------------|
| `signal_events` table — fires logged with `entry_price`, `outcome_1h/4h/24h_price/pct/status`, `is_fully_resolved` | Foundation — v1.1 extends this |
| `outcome-resolver.ts` — resolves 1h/4h/24h windows per cycle using DexScreener current price | Built — not the same as peak price |
| `accuracy.ts` — `getAccuracyStats()` returning per-tier hit rates with MIN_SAMPLE=20 gate | Built — v1.1 adds richer aggregations |
| HTMX accuracy section + `/api/accuracy` route | Built — v1.1 extends the UI |
| `/accuracy` Telegram command | Built |
| DexScreenerFetcher — `getTokenPrice()`, `getTokenPairs()`, rate-limited batch | Built — v1.1 adds boost/trending fetch |
| Discovery module — CA → early buyers → graph traversal → 70+ score gate | Built — v1.1 adds automated sourcing trigger |
| 30s MonitorLoop with post-cycle signal engine and outcome resolver hooks | Built — v1.1 adds coin-source cycle hook |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that signal tracking tools universally provide. Missing these makes v1.1 feel incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Peak price capture per signal event | Without peak price you cannot measure maximum possible gain; every signal backtesting tool tracks this | MEDIUM | Requires a polling job that runs for 24h after signal fires, tracking highest price seen per token. New `peak_price` and `peak_price_at` columns on `signal_events`. DexScreener current price sampled each cycle; store max seen. |
| Time-to-peak (minutes from signal fire to peak price) | Standard metric in any forward-testing dataset — tells you the optimal hold window | LOW | Derived from `peak_price_at - fired_at`. Computed and stored when `is_fully_resolved` is set. No extra API calls. |
| Per-tier outcome return distribution | Hit rate alone is insufficient — average return AND return distribution (p25/p50/p75) reveal whether strong signals produce 2x or 50x | MEDIUM | Extend `getAccuracyStats()` with percentile queries. SQLite supports `GROUP_CONCAT` for manual percentiles; or store raw returns and compute in TypeScript. |
| Signal event count gate before reporting | Reporting hit rate from 3 signals is misleading; MIN_SAMPLE=20 is already in place | NONE | Already built at `MIN_SAMPLE = 20`. Do not reduce this. |
| Automated token discovery from DexScreener boosted/trending | Tool currently requires manual CA input; users expect some degree of self-feeding | MEDIUM | DexScreener exposes `GET /token-boosts/latest/v1` and `GET /token-boosts/top/v1` (60 req/min rate limit). Returns token profiles including chainId and tokenAddress. Fetch on a slower cadence (every 5 min), filter for `chainId: 'solana'`, deduplicate against already-tracked tokens, run `wallet discover` pipeline on qualifying CAs. |
| Bot health heartbeat | Any long-running Telegram bot is expected to have a health-check mechanism so operators know when it's stalled | LOW | `/status` command already shows last cycle time. Add a last-cycle-age warning: if `token_signals.updated_at` max is > 5 min ago, flag as stalled in the status response. |

### Differentiators (Competitive Advantage)

Features that meaningfully separate Echo from generic signal bots.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sell signal data collection (dump timing, smart wallet exit correlation) | Most tools only show entry signals; tracking when smart wallets exit a token is the dataset for a future sell signal engine | HIGH | Requires a new `signal_outcomes` or extension to `signal_events`: capture `smart_wallet_exit_pct` (% of original holders that sold by each window), `exit_velocity` (sell rate in first 1h vs 4h). This data drives future exit timing heuristics. |
| Decay curve logging (price at 30m, 2h, 6h, 48h) | Standard 1h/4h/24h windows miss the compressed memecoin lifecycle; 30m is often peak, 6h is often dead | MEDIUM | Add `outcome_30m_price`, `outcome_30m_pct`, `outcome_30m_status` columns. 30m is the most actionable window for memecoins — the existing 1h window is often too late. Requires a new resolution pass in `outcome-resolver.ts`. |
| Per-tier hold duration distribution | Knowing that strong signals peak at median 47 minutes lets users set realistic exit targets | MEDIUM | Requires `time_to_peak_min` stored per resolved event. Aggregate median and p75 by tier. Feeds the `/accuracy` Telegram command and dashboard. |
| DexScreener boost filtering with liquidity gate | Raw boost list contains many low-liquidity tokens; filtering by minimum liquidity prevents wasted discovery cycles | LOW | When fetching boost list, call `getTokenPairs()` to check liquidity. Only run discovery for CAs with >= $10k liquidity on Solana. The DexScreener `liquidity.usd` field is already parsed in the existing `DexScreenerPair` type. |
| Monitor cycle health metrics in bot status | Show cycle count, last cycle duration, stall detection, total signals resolved this session | LOW | Add a cycle counter and last cycle duration to MonitorLoop state. Surface in `/status` command response. No new DB table needed. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Historical price lookups for missed windows | "If the bot was offline for 3 hours, fill in missing outcome prices retroactively from a price history API" | DexScreener does not provide historical price lookup — only current price. Building around a price history API (Birdeye, etc.) adds a new paid API dependency, rate-limit complexity, and version lock. Reliability of retroactive fills is lower than live captures. | Accept null outcomes for missed windows. Mark them `status: 'failed'` (already supported by `classifyOutcome`). Live capture with 90-day retention is the correct model for a forward-testing tool. |
| Backtesting mode (replay historical signals against past prices) | Seems like it validates signal quality before going live | Backtesting memecoins is unreliable — liquidity, slippage, and insider timing in historical data are not reproducible. Forward-testing is the only meaningful validation approach for this domain. | Keep forward-testing as the primary mechanism. Accumulate 90 days of live signal_events before drawing conclusions. |
| Real-time price streaming per token | "Update peak price every second for precision" | DexScreener API rate limit is 60 req/min for the relevant endpoints. With 20+ active signals, per-second polling is impossible without a paid WebSocket feed. | Sample at 30s cycle cadence (already the monitoring interval). This is sufficient for memecoin time-to-peak resolution at the minute level. |
| Complex sell signal rules engine | Auto-generate sell alerts based on tracked outcomes | Requires a statistically valid sample of sell patterns first. Building the rules engine before the dataset is the wrong order. | Collect sell signal data (exit timing, smart wallet exit correlation) in v1.1. Build the rules engine in v1.2 once data shapes are understood. |
| Multi-outcome success criteria (e.g., hit if 2x within 30m OR 1.5x within 4h) | More nuanced success definition | Increases reporting complexity and makes hit rates incomparable across time periods. The current per-tier single threshold is correct for this stage. | Stick with per-tier single thresholds (strong: +50% at 24h, moderate: +25% at 24h, weak: directional). |

---

## Feature Dependencies

```
Peak price capture (30s cycle polling)
    └──requires──> signal_events.entry_price (exists, already stored at signal fire)
    └──requires──> DexScreenerFetcher.getTokenPrice() (exists)
    └──produces──> signal_events.peak_price, peak_price_at (new columns)

Time-to-peak derived metric
    └──requires──> peak_price_at (from above)
    └──produces──> time_to_peak_min (computed at resolution, stored or derived)

30m outcome window
    └──requires──> signal_events.entry_price (exists)
    └──requires──> New outcome_resolver.ts pass for 30m window
    └──produces──> outcome_30m_price, outcome_30m_pct, outcome_30m_status (new columns)

Per-tier return distribution
    └──requires──> is_fully_resolved = true rows with sufficient sample
    └──produces──> Percentile aggregations in getAccuracyStats()

Sell signal data collection
    └──requires──> signal_events rows with smart wallet holders at fire time
    └──requires──> Polling smart wallet sell activity per token for 24h after signal
    └──produces──> smart_wallet_exit_pct, exit_velocity (new columns or table)

Automated coin sourcing
    └──requires──> DexScreener /token-boosts/latest/v1 endpoint (new fetch method)
    └──requires──> Existing discovery pipeline (wallet discover <CA>) (exists)
    └──depends on──> Liquidity gate using getTokenPairs() (exists)

Monitor cycle health metrics
    └──requires──> MonitorLoop state (exists, extend in-memory only)
    └──independent──> No DB changes needed
```

### Dependency Notes

- **Peak price capture requires no new API:** DexScreener `getTokenPrice()` is called every cycle anyway for outcome resolution. Peak price tracking is just `Math.max(currentPrice, storedPeak)` per cycle.
- **30m window unlocks the most important memecoin insight:** Most Pump.fun tokens peak within 15-45 minutes of a smart wallet accumulation signal. The 1h window is already capturing many tokens after the peak. The 30m window costs one additional migration and one additional DB pass per cycle.
- **Sell signal data collection depends on a persistent per-token holder snapshot at signal fire time:** Store which wallet addresses held the token when the signal fired. Then track their sells over 24h. This is new infrastructure — no equivalent exists in v1.0.
- **Automated coin sourcing must throttle discovery runs:** Running `wallet discover` on 20 new CAs per hour generates significant Helius API load. Gate: maximum 3 auto-sourced discovery runs per hour. Manual discovery always takes priority.

---

## MVP Definition

### Launch With (v1.1 core — must ship for forward-testing to be meaningful)

- [x] Peak price capture — rolling max price tracked per active signal event across cycles for 24h after signal fires
- [x] Time-to-peak storage — `time_to_peak_min` computed when `is_fully_resolved` is set
- [x] 30-minute outcome window — `outcome_30m_price/pct/status` columns, new resolution pass, 30m is the critical memecoin window
- [x] Per-tier return distribution in accuracy stats — extend `getAccuracyStats()` with avg return per window already exists; add p50/p75
- [x] Automated coin sourcing via DexScreener boost list — new `AutoSourcer` module, runs on 5-minute cadence inside or alongside MonitorLoop, gates on liquidity

### Add After Validation (v1.1 extended, once core is stable)

- [ ] Sell signal data collection — `signal_events` extension: smart wallet holder list at fire, exit tracking over 24h — add after 30+ resolved signal events exist
- [ ] Monitor cycle health metrics in `/status` — cycle counter, last duration, stall warning — add once auto-sourcing is live and operator load increases

### Future Consideration (v1.2+)

- [ ] Per-tier hold duration distribution (median/p75 time to peak by tier) — needs 100+ resolved events per tier for statistical validity; report once sample is large enough
- [ ] Sell signal rules engine — requires sell signal dataset from v1.1 extended; do not build before the dataset exists
- [ ] DexScreener trending search endpoint as additional source — `GET /latest/dex/search` can surface tokens by keyword/volume but has less signal-to-noise than boost list; evaluate after boost sourcing is live

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Peak price capture | HIGH — makes forward-testing dataset meaningful | LOW — extend existing outcome resolver loop | P1 |
| 30m outcome window | HIGH — most relevant window for memecoins | MEDIUM — new migration + resolver pass | P1 |
| Automated coin sourcing (boost list) | HIGH — removes manual CA input bottleneck | MEDIUM — new fetch method + throttled discovery trigger | P1 |
| Time-to-peak storage | MEDIUM — enables hold duration analysis | LOW — derived from peak_price_at, computed at resolution | P1 |
| Per-tier return distribution | MEDIUM — better than hit rate alone | LOW — extend existing getAccuracyStats() | P2 |
| Monitor cycle health in /status | MEDIUM — operator confidence for long-running bot | LOW — in-memory state only | P2 |
| Sell signal data collection | HIGH (long-term) — enables future sell signal engine | HIGH — new persistent holder snapshot + exit polling | P2 |
| Hold duration distribution reporting | LOW now, HIGH at 100+ samples | LOW — SQL aggregation only | P3 |

**Priority key:**
- P1: Must have for v1.1 launch — forward-testing dataset is incomplete without these
- P2: Should have — add once P1 features are stable
- P3: Nice to have — defer until sample size justifies it

---

## Competitor Feature Analysis

Signal tracking tools in the memecoin space (gmgn.ai, Photon, Cielo Finance, Birdeye):

| Feature | gmgn.ai / Photon | Cielo Finance | Echo v1.1 Approach |
|---------|-----------------|---------------|---------------------|
| Outcome windows | 1h, 4h, 24h standard | 1h, 24h | Add 30m as primary; keep 1h/4h/24h |
| Peak price tracking | Yes — shows "max gain since signal" | Yes — ATH from entry | Track rolling max per active event across cycles |
| Auto coin discovery | Yes — trending feed auto-ingested | Yes — watchlists + trending | DexScreener boost list with liquidity gate |
| Sell signal data | Proprietary smart money exit alerts | Exit timing alerts | Collect raw exit data in v1.1; rules engine in v1.2 |
| Health monitoring | SaaS — always-on infra | SaaS — always-on infra | Lightweight cycle-age stall detection in /status |

**Key insight:** The market standard is 30m as the primary memecoin signal window, not 1h. gmgn.ai and Photon both default to 30m outcome display for Solana memecoins. Echo's existing 1h/4h/24h windows miss the most actionable window for this asset class.

---

## Signal Outcome Tracking: What's Already Built vs What's Needed

### What v1.0 Already Has (HIGH confidence — direct codebase inspection)

| Capability | Location | Status |
|------------|----------|--------|
| `signal_events` table with entry_price, outcome_1h/4h/24h columns | `src/db/schema.ts` | EXISTS |
| Outcome resolver filling 1h/4h/24h windows with DexScreener current price | `src/signals/outcome-resolver.ts` | EXISTS |
| Tier-based hit classification (strong: +50%, moderate: +25%, weak: directional) | `outcome-resolver.ts: classifyOutcome()` | EXISTS |
| Per-tier hit rate aggregation with MIN_SAMPLE=20 gate | `src/signals/accuracy.ts` | EXISTS |
| Average return per window (avg_return_1h, avg_return_4h, avg_return_24h) | `accuracy.ts: getAccuracyStats()` | EXISTS |
| 90-day retention cleanup | `outcome-resolver.ts` | EXISTS |
| Idempotent window resolution (IS NULL guard) | `outcome-resolver.ts` | EXISTS |
| HTMX accuracy partial with recent 50 events | `src/api/routes/accuracy.ts` | EXISTS |

### What v1.1 Must Add (gaps confirmed by schema inspection)

| Capability | Depends On | Schema Change |
|------------|------------|---------------|
| Peak price capture (rolling max across cycles) | DexScreenerFetcher (exists) | `signal_events.peak_price REAL`, `signal_events.peak_price_at INTEGER` |
| Time-to-peak derivation | peak_price_at | `signal_events.time_to_peak_min REAL` (stored at resolution) |
| 30-minute outcome window | outcome resolver extension | `signal_events.outcome_30m_price REAL`, `outcome_30m_pct REAL`, `outcome_30m_status TEXT` |
| Automated coin sourcing | DexScreener boost endpoint | New `AutoSourcer` module + `coin_sources` table for dedup |
| `is_fully_resolved` now includes 30m window check | outcome resolver change | Logic change, no new column |

### What v1.1 Should NOT Add (scope guard)

- Historical price retroactive fill (requires paid API, unreliable for forward-testing)
- Backtesting replay mode (not meaningful for memecoins)
- Multi-threshold success criteria (complexity without value at current sample sizes)
- Sell signal rules engine (collect data first, build engine after)

---

## Automated Coin Sourcing: DexScreener Boost Endpoints

### Available Endpoints (MEDIUM confidence — verified via official docs)

| Endpoint | What It Returns | Rate Limit | Use Case |
|----------|----------------|------------|---------|
| `GET /token-boosts/latest/v1` | Most recently boosted token profiles (chainId, tokenAddress, boostAmount) | 60 req/min | Continuous feed of newly boosted tokens |
| `GET /token-boosts/top/v1` | Tokens sorted by total active boost count | 60 req/min | Weekly digest of most promoted tokens |
| `GET /token-profiles/latest/v1` | Latest token profiles (broader, not just boosted) | 60 req/min | Alternative source if boost list is too thin |

**Base URL for these endpoints:** `https://api.dexscreener.com` (not `/latest` — the existing DexScreenerFetcher uses `/latest` for price endpoints)

### Filtering Strategy

1. Filter response for `chainId === 'solana'`
2. Deduplicate against already-tracked tokens and `discovery_runs` table
3. Gate on liquidity: call `getTokenPairs(tokenAddress)` and check `liquidity.usd >= 10000` — prevents running discovery on ghost tokens
4. Rate-limit auto-discovery: max 3 `wallet discover` runs per hour triggered by auto-sourcer
5. Store sourced CAs in a `coin_sources` table with `source: 'dexscreener_boost'` for auditability

### Why Boost List Over Trending Search

`GET /latest/dex/search` is a keyword search — not useful for automated discovery. The boost list is a ranked signal that someone paid to promote this token, which correlates with a launch event. Tokens paying for boosts are more likely to have genuine wallet activity. This is a pragmatic heuristic, not a quality guarantee.

---

## Observability Patterns for Long-Running Bots

### What Exists

- `/status` Telegram command showing wallet count, active signal count, last cycle timestamp
- SIGTERM handler in MonitorLoop for graceful shutdown
- Crash-restart after 5s delay on unhandled cycle errors
- Console logging throughout with `[monitor]` prefix

### What's Missing (v1.1 additions)

| Gap | Impact | Simple Fix |
|-----|--------|-----------|
| No stall detection | Bot can be technically "running" but stuck — MonitorLoop.timer fires but cycle hangs on Helius 429 | Check age of `MAX(token_signals.updated_at)` in `/status`; warn if > 5 min |
| No cycle duration tracking | Cannot tell if cycles are getting slower (creeping Helius overload) | Store `last_cycle_duration_ms` in MonitorLoop in-memory state |
| No count of outcomes resolved this session | Operators cannot tell if outcome resolution is keeping up | Accumulate `outcomesResolvedTotal` counter in MonitorLoop |

**Pattern recommendation:** All three gaps are solved with in-memory state in MonitorLoop — no DB changes. Surface them in the `/status` Telegram command response. This is the right scope for v1.1; full observability (Prometheus, structured logs) is a v2 concern.

---

## Sell Signal Data Collection: What to Capture

This is the dataset that enables a future sell signal engine. Capture it during v1.1 to have a meaningful sample by v1.2.

### Data Points That Matter (MEDIUM confidence — based on memecoin trading domain analysis)

| Data Point | Why It Matters | Where It Goes |
|------------|---------------|---------------|
| Smart wallet holder addresses at signal fire time | Know who was holding when the signal fired — needed to track subsequent exits | `signal_event_holders` table: `(signal_event_id, wallet_address, held_at)` |
| Smart wallet exit timestamp per holder | Reveals the distribution of exit timing — is smart money exiting before or after peak? | `signal_event_holders.exited_at` (nullable, filled in as sells are detected) |
| % of original holders that exited by 1h/4h/24h | Distribution tells you whether the token was held or dumped quickly | Computed from `signal_event_holders` at resolution time, stored on `signal_events` as `smart_wallet_exit_1h_pct`, `exit_4h_pct`, `exit_24h_pct` |
| Exit velocity (sells per hour from smart wallets) | Rate of smart money exit is a strong dump signal | Computed from holder exit timestamps during resolution |

### Implementation Note

This requires a new `signal_event_holders` table. The holder list is available at signal fire time from the same query used to compute the signal score. Storing it costs one extra insert per signal fire. The exit tracking is handled during the normal monitoring loop — swaps already captured for smart wallets are the data source.

**Scope recommendation:** Add `signal_event_holders` table in v1.1 to start accumulating the dataset. Do not build exit-tracking queries or sell signal rules until the table has 30+ days of data.

---

## Sources

- Direct inspection of `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/db/schema.ts` — `signal_events` schema, confirmed existing columns (HIGH)
- Direct inspection of `src/signals/outcome-resolver.ts` — confirmed 1h/4h/24h resolution, classifyOutcome, idempotency guard (HIGH)
- Direct inspection of `src/signals/accuracy.ts` — confirmed `getAccuracyStats()`, MIN_SAMPLE=20 gate (HIGH)
- Direct inspection of `src/fetchers/dexscreener.ts` — confirmed available methods, base URL pattern, rate limit handling (HIGH)
- Direct inspection of `src/monitor/loop.ts` — confirmed cycle structure, crash restart, SIGTERM handler (HIGH)
- Direct inspection of `src/api/bot/commands.ts` — confirmed `/status` command current state (HIGH)
- [DexScreener API Reference](https://docs.dexscreener.com/api/reference) — confirmed `/token-boosts/latest/v1`, `/token-boosts/top/v1`, 60 req/min rate limit (MEDIUM)
- [Forward Testing in Trading](https://liquidityfinder.com/news/forward-testing-in-trading-how-to-prove-your-edge-live-29aa0) — general methodology (LOW — used for framing only)
- Memecoin trading domain: gmgn.ai, Photon market observation — 30m window as standard for Solana memecoins (MEDIUM — market observation, not documented standard)

---

*Feature research for: Echo Wallet Tracker v1.1 Forward Testing and Deployment*
*Researched: 2026-03-31*
