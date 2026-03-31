# Pitfalls Research

**Domain:** Node.js+SQLite monitoring tool — Railway deployment, DexScreener outcome tracking, ProviderRouter extension
**Researched:** 2026-03-31
**Confidence:** HIGH (verified against live codebase + official docs)

---

## Critical Pitfalls

### Pitfall 1: WAL Mode + Railway Volume = Corruption Under Concurrent Access

**What goes wrong:**
`db/index.ts` sets `journal_mode = WAL` at startup (line 17). WAL mode requires all readers and writers to share memory on the same physical host. Railway volumes are network-attached storage. If Railway ever migrates or restarts the container such that the volume is accessed from a second process simultaneously (e.g., a health-check script, a migration runner, or a rolling redeploy that briefly overlaps), WAL's shared-memory locking fails. This produces `SQLITE_IOERR` or silent database corruption, not a graceful lock error.

**Why it happens:**
The WAL mode pragma is applied unconditionally on every `db/index.ts` import. There is no environment-aware guard. The developer who wrote this assumed a single local process, which is correct locally but not guaranteed on Railway when volumes are involved.

**How to avoid:**
Set `DATABASE_URL` to a path inside the Railway volume mount (e.g., `/data/echo.db`). Keep WAL mode enabled — Railway volumes are locally attached per service instance (single-service deployments do not share the volume across replicas unless Railway's multi-replica feature is active). Confirm Railway is set to exactly 1 replica. Add a startup assertion: if the Railway `RAILWAY_REPLICA_ID` env var is present, log a warning and refuse to start in WAL mode with replicas > 1. Document that this service must never be scaled horizontally.

**Warning signs:**
- `SQLITE_IOERR_SHMSIZE` errors in Railway logs
- `SQLITE_BUSY` that never resolves (not just transient lock waits)
- Database file growing without shrinking (WAL checkpoint not completing)
- Data visible in one request is missing in the next

**Phase to address:** Railway Deployment phase (first deployment phase)

---

### Pitfall 2: Volume Not Mounted — SQLite File Written to Ephemeral Container Layer

**What goes wrong:**
Railway containers have an ephemeral writable layer that survives restarts but is wiped on every new deployment. If the Railway volume is not mounted (misconfigured path, volume not attached in Railway dashboard, or `DATABASE_URL` pointing to a path outside the volume mount), `db/index.ts` silently creates `data/echo.db` in the working directory on the container's ephemeral layer. The app runs fine. On the next deploy, all signal_events, wallet data, and outcome tracking rows disappear. Forward-testing data is lost with no error shown.

**Why it happens:**
`fs.mkdirSync` in `db/index.ts` creates the directory silently if it doesn't exist. There is no check that the path is on a persistent volume. The developer sees the app working and assumes persistence is active.

**How to avoid:**
Add a startup check that reads a known file on the volume path (e.g., a `.volume-marker` file written on first boot). If `DATABASE_URL` resolves to a container-layer path (not prefixed with the volume mount point), log an error and exit. In Railway: attach volume to `/data`, set `DATABASE_URL=/data/echo.db`. Document this in a deployment runbook.

**Warning signs:**
- `last_alerted_at` and `signal_events` rows reset to zero after a deploy
- Wallet list empty after redeployment
- SQLite file size starts at 0 bytes after every new deploy

**Phase to address:** Railway Deployment phase

---

### Pitfall 3: Bundler and Wash-Trader Detectors Bypass ProviderRouter — Silently Starve on Helius 429

**What goes wrong:**
`bundler.ts` and `wash-trader.ts` both depend on a `BundlerFetcher` / `WashTraderFetcher` interface with a `getTransaction(signature)` method. In production, these are injected with `HeliusFetcher` directly (which calls `GET /v0/transactions`). The `ProviderRouter` in `src/fetchers/providers/router.ts` only covers `fetchSwapHistory`, `fetchEarlySwapsForMint`, and `fetchOnePage` — it explicitly excludes `getTransaction` (see `types.ts` comment: "NOT included: getTransaction(signature)"). When Helius returns 429 during forward testing, the MonitorLoop's `fetchSwapHistory` calls fall back to Shyft correctly, but the detection engines' `getTransaction` calls to Helius continue failing with no fallback. Detection silently produces empty results, flags are not written, and the pipeline appears to complete successfully.

**Why it happens:**
The comment in `types.ts` explicitly calls this out as a known exclusion. The v1.0 ProviderRouter was scoped to swap-history callsites only. Extending the router to `getTransaction` requires a different interface because Shyft does not have a direct equivalent for single-transaction lookup by signature.

**How to avoid:**
For v1.1, the ProviderRouter extension must define a `getTransactionDetails` method on `RpcProvider`. The `ShyftProvider` implementation must either: (a) call Shyft's `/sol/v1/transaction` endpoint with the signature, or (b) fall back to a public Solana RPC `getTransaction` call. Both paths require normalization to the `HeliusTransaction` shape. Do not silently return `null` from the router on exhaustion — throw so the detection engine knows it failed and can skip the wallet rather than record a false "no evidence" result.

**Warning signs:**
- Bundler/wash-trader flag counts drop to zero when Helius rate limits are hit
- Detection runs but `wallet_flags` table receives no new rows
- Log shows `[provider] ALL providers exhausted` from MonitorLoop but detection continues without error

**Phase to address:** ProviderRouter Extension phase

---

### Pitfall 4: Outcome Resolver Classifies Rugged Coins as "failed" — Inflates True Failure Rate

**What goes wrong:**
`outcome-resolver.ts` calls `fetcher.getTokenPrice(row.token_mint)` for each outcome window. `DexScreenerFetcher.getTokenPrice()` returns `null` when the token has no active pairs (rugged, liquidity removed, abandoned). `classifyOutcome()` treats `outcomePrice === null` as `{ status: 'failed', pct: null }`. The `failed` status is excluded from `getAccuracyStats()` via `is_fully_resolved=true` and the `isNotNull(entry_price)` filter, but the row still counts toward `total_resolved`. This means rugged tokens (which are the worst-case outcome for signal quality) are excluded from hit-rate calculations, producing artificially inflated accuracy numbers.

**Why it happens:**
The `failed` status was designed for infrastructure failures (DexScreener unreachable), not for token-specific events (liquidity removed). The code cannot distinguish between "DexScreener was down" and "the coin rugged." Both look identical: `outcomePrice === null`.

**How to avoid:**
Add a `rug` status to the outcome status enum alongside `hit`, `miss`, `failed`. Distinguish rug: retry the price fetch 3+ times over several minutes; if consistently null after 1h has elapsed since signal, mark it `rug` and treat it as the worst possible outcome (0 return). Count `rug` rows in hit-rate denominators and as 0 pct return in avg calculations. This ensures survivor bias is not baked into the accuracy display.

**Warning signs:**
- Hit rate appears high but `failed` count is also high (>20% of resolved rows)
- Strong-tier accuracy looks good even when many coins you remember rugging show as `failed` not `miss`
- `avg_return_24h` is suspiciously positive despite visible rugs in logs

**Phase to address:** Signal Outcome Tracking phase

---

### Pitfall 5: DexScreener Rate Limit Hits During Outcome Resolution Silently Skip Windows

**What goes wrong:**
`resolveOutcomes()` caps at `MAX_PER_CYCLE = 20` tokens per window per cycle. Each token gets a 200ms delay between calls (consistent with DexScreenerFetcher). Under normal load (20 signals per cycle × 3 windows × 200ms = 12 seconds added to cycle time), this is within tolerance. But when forward-testing produces a backlog — e.g., after 24h of signals fire their 1h, 4h, and 24h windows simultaneously — the resolution queue grows faster than 20/cycle. The existing code will eventually clear the backlog over many cycles. The pitfall is that when DexScreener returns 429, `getTokenPrice()` returns `null` (graceful degradation), which is indistinguishable from a rugged coin. Resolution writes `outcome_1h_price = null, status = 'failed'` and the IS NULL idempotency guard prevents retry. The window is permanently marked as failed, not retried.

**Why it happens:**
The idempotency guard (`isNull(signal_events.outcome_1h_price)` in WHERE) is correct for preventing double-writes, but it also prevents retry on transient 429 failures. DexScreener 429s are indistinguishable from null prices at the current code level.

**How to avoid:**
Add a `outcome_1h_error` text column to `signal_events` to store the failure reason. Only write a final outcome when price is confirmed (non-null). If DexScreener returns null due to 429 (log the status code separately), do not write the outcome row at all — leave the IS NULL guard open so the next cycle retries. Retry budget: allow up to 72h of retries before marking as permanently unresolvable.

**Warning signs:**
- DexScreener 429 errors appear in logs during the same cycle as `outcomes resolved: N`
- `failed` count spikes after high-signal activity periods
- Outcome accuracy degrades after periods with many new signals

**Phase to address:** Signal Outcome Tracking phase

---

### Pitfall 6: Helius Credits Exhausted During Forward Testing — 429 Returned, Looks Like Rate Limit

**What goes wrong:**
Helius returns HTTP 429 for both rate limiting (too many requests per minute) and credit exhaustion (`429 max usage reached`). The `HeliusFetcher` error handler identifies both as 429 but they require different responses: rate limit 429 should back off and retry; credit exhaustion 429 should alert loudly and stop the monitor loop. The current `ProviderRouter` treats any 429 from HeliusProvider as a reason to mark it on cooldown (60s) and fall back to Shyft. If credits are exhausted permanently, the router will keep retrying Helius every 60s (after cooldown expires), consuming Shyft quota as the permanent fallback. Forward-testing data continues being collected via Shyft, but detection quality degrades because bundler/wash-trader detectors still bypass the router and call Helius directly.

**Why it happens:**
Forward testing with automated coin sourcing significantly increases Helius credit consumption compared to manual wallet monitoring. The credit burn rate is non-linear: adding 20 new wallets doubles the `fetchSwapHistory` call volume per cycle, and detection adds more `getTransaction` calls per new swap. Budget estimates from v1.0 (manual operation) do not extrapolate to automated forward testing.

**How to avoid:**
Add credit monitoring: periodically call the Helius account API or parse 429 error bodies to distinguish `max_usage_reached` from `rate_limit_exceeded`. On confirmed credit exhaustion: pause the MonitorLoop, send a Telegram alert with credit usage details, and log the event prominently. Document a Helius credit budget calculation: `(N wallets × cycles/day × transactions/cycle × credits/transaction)`. Pre-compute this before enabling automated coin sourcing.

**Warning signs:**
- `[provider] provider[0] on cooldown` messages appearing every 60s indefinitely
- Shyft becoming the permanent primary provider (not occasional fallback)
- Bundler/wash-trader detection stops producing new flags entirely
- 429 error bodies containing `max_usage_reached` string (vs generic rate limit body)

**Phase to address:** Railway Deployment phase (operational monitoring); ProviderRouter Extension phase (error discrimination)

---

### Pitfall 7: Coin Sourcing Automation Creates Infinite Discovery Loops

**What goes wrong:**
Adding automated coin sourcing (feeding CAs from trending token lists) to the existing `wallet discover <CA>` pipeline has a compounding problem: newly discovered wallets from CA1 may have also bought CA2, CA3, and CA4. If CA2, CA3, CA4 are also on the trending list and trigger their own discovery runs, those runs will rediscover many of the same wallets from CA1. The `discovery_candidates` table records results but `already_tracked` candidates still consume Helius credits for the scoring step (full transaction history import per new wallet). With 50 trending CAs per day and graph traversal enabled, this can trigger hundreds of concurrent history imports.

**Why it happens:**
The existing `discoveryRuns` table tracks runs per CA but does not track cross-CA deduplication of candidates during an automated batch. Manual operation naturally throttles this because the user runs `discover` explicitly. Automation removes that throttle.

**How to avoid:**
Implement a daily cap on the total number of new wallets added per day (e.g., MAX_DAILY_ADDS = 20). Apply a `last_discovery_ca` cooldown: skip CAs that were already sourced within 24h. Disable graph traversal for automated sourcing (direct buyers only) — graph traversal is for high-conviction manual discovery, not bulk automation. Add a total wallet count ceiling (e.g., 200 tracked wallets max) with a circuit breaker that stops automated adds when the ceiling is reached.

**Warning signs:**
- `added_count` in `discovery_runs` growing each day with rapidly rising total wallet count
- Helius credit usage spiking after enabling automation
- Many `already_tracked` results in `discovery_candidates` across different runs
- MonitorLoop cycle time growing beyond 30s due to more wallets per cycle

**Phase to address:** Coin Sourcing Automation phase

---

### Pitfall 8: ShyftProvider Normalization Misses Swap-Context Fields Used by Detection

**What goes wrong:**
`ShyftProvider.normalize()` sets `events: undefined` to force the `tokenTransfers` fallback path in `parseSwaps`. This works for swap parsing. However, the bundler detector's `getTransaction` call returns the raw `HeliusTransaction` and accesses `nativeTransfers` directly to find shared funders. The wash-trader detector accesses both `tokenTransfers` and `nativeTransfers`. When the ProviderRouter is extended to cover `getTransaction` using a Shyft fallback, the `ShyftProvider.normalize()` path will be used. The `extractNativeTransfers()` method only maps `SOL_TRANSFER` action types. Shyft actions for funding transactions (e.g., pre-launch SOL distribution to bundle wallets) may use different action type names (`TRANSFER`, `SYSTEM_TRANSFER`) that `extractNativeTransfers()` does not handle, producing empty `nativeTransfers` arrays and causing bundler detection to see zero shared funders.

**Why it happens:**
The ShyftProvider normalization was written and tested for swap parsing (the MonitorLoop path). Detection uses a different field access pattern (native transfers for funder analysis) that was never tested against Shyft-normalized data because detection bypassed the router.

**How to avoid:**
Before extending the router to `getTransaction`, write a test fixture with a real Shyft raw response for a known bundled transaction. Verify that `nativeTransfers` after normalization contains the expected funder. Audit all Shyft action type names that represent SOL transfers: `SOL_TRANSFER`, `TRANSFER`, `SYSTEM_PROGRAM:TRANSFER`. Map all variants in `extractNativeTransfers`. Add the same audit for `tokenTransfers` in the context of wash-trader detection.

**Warning signs:**
- Bundler detection flags drop to zero when Shyft is active
- Evidence summaries show `co_buyers: []` or `shared_funder: ''` despite known bundled wallets
- Detection tests pass with Helius mocks but fail with Shyft mocks

**Phase to address:** ProviderRouter Extension phase

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| WAL mode without replica guard | Fast local reads during dev | Silent corruption if Railway ever runs 2 replicas | Never in production — add the guard |
| `outcome_1h_price = null` means both "rug" and "API failure" | Simple code | Inflated hit rates, unretriable windows after 429s | Never for forward-testing data integrity |
| Bundler/wash-trader bypass ProviderRouter | Avoided normalizing `getTransaction` shape | Detection dark during Helius 429 with no fallback | Until ProviderRouter extended |
| Discovery without daily caps | Discovers many wallets fast | Credit exhaustion, MonitorLoop cycle time grows past 30s | Only in controlled manual runs |
| DexScreener 200ms delay between outcome polls | Avoids rate limit | Outcome backlog grows faster than it resolves under load | Acceptable until signal volume > 100/day |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Railway Volume + SQLite WAL | Assuming Railway volume behaves like local disk for WAL | Confirm single replica, document ceiling; add startup volume-presence check |
| Helius 429 | Treating credit exhaustion 429 same as rate-limit 429 | Parse error body: `max_usage_reached` vs `rate_limit` — different recovery paths |
| DexScreener price for dead coins | Interpreting null price as API failure | Track null source: if `pairs === []` (token gone) vs HTTP 429 (transient) — different status codes |
| ShyftProvider `nativeTransfers` for bundler detection | Assuming SOL_TRANSFER covers all SOL movement | Audit all Shyft action types that carry SOL; normalize before detection consumes them |
| Shyft MAX_PAGES = 3 cap on fallback | Missing swaps older than 300 transactions during fallback | For forward-testing (incremental fetches with short `afterTimestamp` windows), 3 pages is sufficient; for full history import fallback it is not — document this limit |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| resolveOutcomes adds 12s+ to cycle time | MonitorLoop cycles exceed 30s, stagger builds up | Cap MAX_PER_CYCLE at 20 (already done); monitor actual cycle duration | When > 100 active signals per day fire outcome windows simultaneously |
| Automated coin sourcing triggers full history imports | Helius credit spike; MonitorLoop cycle time grows | MAX_DAILY_ADDS cap + ceiling on total tracked wallets | Immediately when sourcing > 5 new CAs/day |
| getTransaction calls during detection are sequential per wallet | Detection adds N × getTransaction latency per wallet | Already has WASH_TRADER.MAX_HELIUS_FETCHES_PER_WALLET cap; verify bundler has same | When wallet count > 50 and detection runs on many wallets per cycle |
| DexScreener outcome resolution backlog | `outcomes resolved` counter stays at max (20) every cycle but total due rows never decreases | Add a monitoring metric: total unresolved rows age > 48h | When signals fire faster than 20/cycle resolve |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `HELIUS_API_KEY` and `SHYFT_API_KEY` in Railway env vars | Env vars visible to anyone with Railway dashboard access | Use Railway's secret variables (not plain env vars) for API keys; verify they are not logged in startup output |
| Telegram bot token in Railway env | Bot token in plain logs during startup | Confirm `BOT_TOKEN` is never logged; Railway plain env vars are visible in dashboard |
| `DATABASE_URL` path traversal | An attacker who can set env vars could redirect DB to arbitrary path | Validate that `DATABASE_URL` resolves to an expected prefix before opening the database |

---

## "Looks Done But Isn't" Checklist

- [ ] **Railway volume persistence:** Deploy, add a wallet, redeploy — verify the wallet still exists after the second deploy. Many developers test locally where data persists without volumes.
- [ ] **Outcome resolution retries on 429:** Trigger a DexScreener 429 during outcome resolution — verify the row is NOT written with `status = 'failed'`, so the next cycle retries it.
- [ ] **Rug classification vs infrastructure failure:** Remove all liquidity from a test token on devnet, run outcome resolution — verify it writes `status = 'rug'` (not `failed`), and that `failed` count in accuracy stats does not include it.
- [ ] **Bundler detection via Shyft fallback:** Disable Helius intentionally, run `runDetection()` on a known bundled wallet — verify the bundler flag is still written (not silently skipped).
- [ ] **Coin sourcing daily cap:** Add 30 CAs to the automated sourcing queue — verify `added_count` for the day does not exceed `MAX_DAILY_ADDS` and the queue stops processing gracefully.
- [ ] **Helius credit exhaustion alert:** Simulate credit exhaustion 429 body — verify Telegram sends an alert and MonitorLoop pauses (does not silently fall back to Shyft forever).
- [ ] **Accuracy survivorship:** Query `accuracy stats` after 24h of forward testing with some rugged coins — verify hit_rate_24h reflects rugs as worst-case outcomes, not exclusions.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Volume not mounted — data wiped on deploy | HIGH | Re-attach volume, restore from backup (if any); otherwise restart forward testing from scratch — all signal_events rows lost |
| WAL corruption from concurrent access | HIGH | Stop service, run `sqlite3 echo.db "PRAGMA integrity_check;"`, if corrupt restore from last backup; re-run migrations; data between last backup and crash is lost |
| Outcome windows marked `failed` due to 429 (unretriable) | MEDIUM | Add `outcome_Xh_error` column, write a one-time migration script that NULLs out `failed` statuses where `fired_at` was within a known 429 outage window so they get re-resolved |
| Helius credits exhausted mid-forward-test | MEDIUM | Purchase credits or wait for plan renewal; no data is lost — MonitorLoop resumes from last `last_checked_at`; bundler/wash-trader detection gaps during the outage are permanent |
| Discovery loop — too many wallets added | LOW | Set status=`removed` for low-scoring wallets added during the runaway period; lower `MAX_DAILY_ADDS` threshold before re-enabling automation |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WAL + Railway volume corruption | Railway Deployment | Deploy, restart 3 times, run `PRAGMA integrity_check` — no errors |
| Volume not mounted — ephemeral data loss | Railway Deployment | Deploy twice — verify wallet row count identical after second deploy |
| Bundler/wash-trader bypass ProviderRouter | ProviderRouter Extension | Disable Helius, confirm bundler flags still written via Shyft path |
| Rug/failure indistinguishable in outcome tracking | Signal Outcome Tracking | Introduce known-null token, verify `rug` status written, accuracy denominator includes it |
| DexScreener 429 marks window unretriable | Signal Outcome Tracking | Mock 429, verify IS NULL guard not written for that row, next cycle retries |
| Helius credit exhaustion detection | Railway Deployment + ProviderRouter Extension | Simulate `max_usage_reached` 429 body, verify Telegram alert fires and loop pauses |
| Coin sourcing discovery loops | Coin Sourcing Automation | Run 50-CA batch, verify daily add count does not exceed cap and total wallet ceiling holds |
| ShyftProvider missing native transfer types | ProviderRouter Extension | Test bundler detection with Shyft-normalized fixture for a known bundled transaction |

---

## Sources

- SQLite WAL + network filesystem incompatibility: [SQLite Official Docs — WAL](https://www.sqlite.org/wal.html), [SQLite Over a Network Caveats](https://sqlite.org/useovernet.html)
- Railway volume persistence behavior: [Railway Help Station — SQLite volume](https://station.railway.com/questions/how-do-i-use-volumes-to-make-a-sqlite-da-34ea0372), [Railway SQLite READONLY issue](https://station.railway.com/questions/sqlite-readonly-attempt-to-write-a-read-2e6e370a)
- Helius 429 credit exhaustion behavior: [Helius Billing FAQ](https://www.helius.dev/docs/faqs/billing) — confirmed returns 429 with `max_usage_reached` body (not 402)
- DexScreener rate limits and null pairs for dead tokens: [DexScreener API Reference](https://docs.dexscreener.com/api/reference) — 60 req/min (profile endpoints), 300 req/min (pair endpoints); empty `pairs` array for rugged/unlisted tokens
- Survivor bias in accuracy tracking: [Bookmap — Survivorship Bias in Market Data](https://bookmap.com/blog/survivorship-bias-in-market-data-what-traders-need-to-know)
- Shyft transaction structure: [Shyft Parsed Transaction Structure](https://docs.shyft.to/solana-apis/transactions/parsed-transaction-structure)
- ProviderRouter scope exclusion: `src/fetchers/providers/types.ts` comment — `getTransaction(signature)` explicitly excluded from RpcProvider interface

---
*Pitfalls research for: Echo Wallet Tracker v1.1 — Forward Testing and Railway Deployment*
*Researched: 2026-03-31*
