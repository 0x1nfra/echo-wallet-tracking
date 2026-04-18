# Phase 15: Coin Sourcing + Observability - Research

**Researched:** 2026-04-14
**Domain:** GMGN API integration, polling scheduler, DB schema extension, Fastify admin route, Telegram bot expansion
**Confidence:** MEDIUM (GMGN is an undocumented API; endpoint structure confirmed via community repos + reverse engineering; rate limits unconfirmed)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Token sourcing source**: GMGN only. DexScreener dropped.
- **Primary endpoint**: `/v1/market/rank` (polling for trending tokens) — interpreted as `https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/{time_period}`
- **Pre-filters before seeding into Echo**:
  - Holder count minimum (researcher defines exact value)
  - Dev concentration skip (researcher defines threshold)
  - Wash trading flag — drop tokens GMGN already flags
  - Age floor/ceiling — filter too-new and too-old tokens; researcher determines exact window
  - Existing $10k liquidity floor from SEED-01 still applies
- **Polling interval**: Claude's discretion pending GMGN rate limit research
- **Already-tracked tokens**: skip and log
- **Daily cap hit** (default 20/day): keep polling, skip seeding, log continues
- **Total ceiling hit** (default 200): dashboard + one-time Telegram alert when first reached
- **Cap env vars**: `AUTO_SOURCE_DAILY_CAP` (default 20), `AUTO_SOURCE_TOTAL_CAP` (default 200)
- **Auto-resume**: if wallet count drops below ceiling, sourcing resumes automatically
- **Dashboard**: New /admin page (separate route from main dashboard)
- **AutoSourcer stats on /admin**: tokens fetched vs seeded today, daily additions vs cap, total wallets vs ceiling, last sourcing run timestamp, sourcing status (active/paused/ceiling)
- **Recent errors**: Claude's discretion on display format
- **Provider status**: Claude's discretion on detail level
- **Telegram /status command**: full system health — monitoring loop + AutoSourcer + provider health

### Claude's Discretion

- Polling interval for AutoSourcer (pending GMGN rate limit findings)
- Age filter exact window (pending GMGN field availability)
- Holder count and dev concentration exact thresholds
- Recent errors display format on /admin page
- Provider status detail level on /admin page
- Stall detection threshold for /status
- Telegram /status message format

### Deferred Ideas (OUT OF SCOPE)

- Multi-stage token tracking (scan across multiple polls before seeding)
- `/v1/token/info` deep dive (rug ratio, entrapment ratio, KOL presence, social duplicates)
- Journaling/backtesting (price snapshots post-alert)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEED-01 | Periodic fetch from GMGN `/v1/market/rank` | GMGN endpoint confirmed via community reverse engineering; Cloudflare handling required |
| SEED-02 | Filter by $10k liquidity before running discovery | `liquidity` field present in GMGN rank response; filter applied in AutoSourcer before calling runDiscovery |
| SEED-03 | Auto-sourced discovery runs direct-buyers-only mode (no graph traversal) | runDiscovery already accepts optional deps that control fetchCoTradersFn — pass a no-op to disable graph phase |
| SEED-04 | Configurable daily wallet add cap (default 20/day) via env var | Track count in-memory or via new DB table; env var `AUTO_SOURCE_DAILY_CAP` |
| SEED-05 | Configurable total wallet ceiling (default 200) with circuit breaker | DB query for count of status='tracked' wallets; env var `AUTO_SOURCE_TOTAL_CAP` |
| SEED-06 | Manual CA seeding via CLI in Railway deployed environment | CLI already works locally; Railway exec confirmed via `railway run` shell; no code change needed, verify operational |
| OBS-01 | Dashboard /admin page: cycle health, provider status, error log, credit exhaustion | New Fastify route + EJS view; source data from in-memory state singleton |
| OBS-02 | `/status` Telegram command returns full system health summary | Expand existing `/status` handler in commands.ts with monitor loop + AutoSourcer + provider state |
</phase_requirements>

---

## Summary

Phase 15 implements two parallel tracks: **AutoSourcer** (automated GMGN-driven token discovery) and **Observability** (admin dashboard page + enhanced Telegram /status). Both are additive — they do not modify Echo's detection, scoring, or signal logic.

The GMGN ranking API is an undocumented, Cloudflare-protected endpoint. Community reverse engineering confirms the endpoint structure `https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/{time_period}` returns tokens with `liquidity`, `holder_count`, `open_timestamp`, `is_honeypot`, and smart money fields. No wash-trading-specific flag was found in public documentation — the closest is `is_honeypot`. Dev wallet concentration is not a direct response field; it must be approximated via `bluechip_owner_percentage` inversion or skipped until `/v1/token/info` is added in a future phase. Cloudflare protection requires browser-like headers (User-Agent, Referer) and potentially `cf_clearance` cookie rotation — this is a real implementation risk that must be managed defensively with retry and fallback logging.

The observability track is straightforward given the existing Fastify + EJS + HTMX stack. A new `/admin` route and view follow the same pattern as the main dashboard. The enhanced `/status` Telegram command expands the existing handler in `commands.ts` with data from a new shared state singleton.

**Primary recommendation:** Build AutoSourcer as a standalone module (`src/sourcing/auto-sourcer.ts`) with an in-memory state object for observability. Wire it into the `serve` command startup. Treat GMGN as an unreliable external dependency — always fail-soft (log and skip) on HTTP errors.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `axios` | already in use (^1.6.2) | HTTP calls to GMGN | Already installed, handles timeouts and retries via p-retry |
| `p-retry` | already in use (^7.1.1) | Retry failed GMGN fetches | Already installed, same pattern as Helius fetcher |
| `drizzle-orm` | already in use (^0.45.1) | DB schema extensions for sourcing log | Already installed |
| `grammy` | already in use (^1.41.1) | Telegram /status expansion | Already installed |
| `ejs` | already in use (^5.0.1) | /admin dashboard view | Already installed |
| `fastify` | already in use (^5.8.2) | /admin route registration | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `setInterval` | built-in | AutoSourcer polling loop | Simple interval is sufficient — no external scheduler needed |
| In-memory state object | N/A | AutoSourcer stats for /admin and /status | Avoid DB round-trips for dashboard metrics; restart clears state (acceptable) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory state for sourcer stats | Persist stats to new DB table | DB adds durability (survives restarts) but adds complexity; in-memory is sufficient since Railway restarts are infrequent and stats reset gracefully |
| `setInterval` for polling | `node-cron` | Cron adds human-readable scheduling but is overkill for a simple fixed interval; setInterval matches MonitorLoop's existing pattern |
| axios for GMGN | node-fetch or got | No advantage — axios is already used everywhere in this codebase |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── sourcing/
│   ├── auto-sourcer.ts        # AutoSourcer class (polling loop, pre-filters, cap logic)
│   └── gmgn-fetcher.ts        # GMGN API client (fetch trending tokens)
├── api/
│   ├── routes/
│   │   └── admin.ts           # GET /admin route handler
│   └── views/
│       └── admin.ejs          # Admin dashboard view
└── db/
    ├── schema.ts              # Add sourcing_log table
    └── migrations/
        └── 0011_sourcing_log.sql
```

### Pattern 1: AutoSourcer as Self-Contained Class

**What:** AutoSourcer is a class with `start()`, `stop()`, and exported `getStats()` — mirrors MonitorLoop's interface exactly.

**When to use:** Always — consistency with existing MonitorLoop pattern makes wiring into `cli.ts serve` trivial.

**Example:**
```typescript
// src/sourcing/auto-sourcer.ts
export class AutoSourcer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stats: AutoSourcerStats = { /* initial state */ };

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.runPoll().catch(err =>
      console.error('[auto-sourcer] poll error:', err)
    ), POLL_INTERVAL_MS);
    // Run immediately on start too
    this.runPoll().catch(err => console.error('[auto-sourcer] initial poll error:', err));
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  getStats(): AutoSourcerStats { return { ...this.stats }; }

  private async runPoll(): Promise<void> { /* GMGN fetch → pre-filter → cap check → runDiscovery */ }
}

export const autoSourcer = new AutoSourcer();
```

### Pattern 2: Shared In-Memory State for Observability

**What:** AutoSourcer exposes a `getStats()` method returning a plain object. The `/admin` route and `commands.ts` `/status` handler both import from the singleton.

**When to use:** This avoids DB writes for ephemeral operational counters. Restart clears counters — acceptable since Railway restarts are rare and the stats are operational, not historical.

**Example:**
```typescript
export interface AutoSourcerStats {
  status: 'active' | 'paused_daily_cap' | 'ceiling_hit';
  totalFetchedToday: number;
  totalSeededToday: number;
  totalWallets: number;
  dailyCap: number;
  totalCap: number;
  lastPollAt: number | null;
  lastPollDurationMs: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  recentErrors: Array<{ message: string; at: number }>;
}
```

### Pattern 3: Direct-Buyers-Only Mode via `runDiscovery` Options

**What:** `runDiscovery` already has a `_deps` injection point. Pass a no-op `fetchCoTradersFn` to disable graph traversal for auto-sourced tokens.

**When to use:** For all AutoSourcer-triggered discovery calls.

**Example:**
```typescript
await runDiscovery(mint, {
  minScore: 70,
  dryRun: false,
  _deps: {
    ...defaultDeps,
    fetchCoTradersFn: async (_known: string[]) => [], // graph traversal disabled
  },
});
```

**Note:** This approach requires that the default deps object is extractable. The current `runDiscovery` builds deps inline — AutoSourcer should construct the deps object explicitly rather than relying on the default path.

### Pattern 4: Cap Enforcement Logic

**What:** Check both daily cap and total ceiling before calling runDiscovery for each token.

**When to use:** Every poll cycle, per token.

```typescript
private async checkCaps(): Promise<'ok' | 'daily_cap' | 'ceiling'> {
  const totalCap = parseInt(process.env.AUTO_SOURCE_TOTAL_CAP ?? '200', 10);
  const dailyCap = parseInt(process.env.AUTO_SOURCE_DAILY_CAP ?? '20', 10);
  const currentTotal = db.select({ count: count() }).from(wallets)
    .where(eq(wallets.status, 'tracked')).get()!.count;
  if (currentTotal >= totalCap) return 'ceiling';
  if (this.stats.seededToday >= dailyCap) return 'daily_cap';
  return 'ok';
}
```

**Daily counter reset:** Reset `seededToday` counter at midnight UTC using a date comparison on each poll cycle (compare `new Date().toDateString()` to stored date string).

**Auto-resume from ceiling:** On each poll cycle, re-check current wallet count. If it dropped below ceiling (due to auto-removal), `status` reverts from `ceiling_hit` to `active`. One-time ceiling alert fires only on first transition to `ceiling_hit`.

### Pattern 5: GMGN API Fetcher

**What:** Isolated fetcher class using axios with browser-like headers.

```typescript
// src/sourcing/gmgn-fetcher.ts
export class GmgnFetcher {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://gmgn.ai/defi/quotation',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://gmgn.ai/',
        'Origin': 'https://gmgn.ai',
      },
    });
  }

  async fetchTrendingTokens(timePeriod: '1h' | '6h' | '24h' = '1h'): Promise<GmgnToken[]> {
    const response = await pRetry(
      () => this.client.get(`/v1/rank/sol/swaps/${timePeriod}`, {
        params: { orderby: 'swaps', direction: 'desc', filters: ['not_honeypot'] }
      }),
      { retries: 3, minTimeout: 2000 }
    );
    return response.data?.data?.rank ?? [];
  }
}

export interface GmgnToken {
  address: string;
  symbol: string;
  holder_count: number;
  liquidity: number;         // USD
  open_timestamp: number;    // Unix seconds — token listing date
  is_honeypot: number;       // 0=safe, 1=honeypot
  market_cap: number;
  // Partial list — actual response may have more fields
}
```

### Anti-Patterns to Avoid

- **Throwing on GMGN failure:** GMGN is an unofficial, Cloudflare-protected API. Always catch errors, log, and skip — never block the serve process.
- **Blocking serve startup on AutoSourcer:** Wire AutoSourcer after MonitorLoop starts, same fire-and-forget pattern as `resumeImportingWallets`.
- **Querying wallet count in every pre-filter check:** Cache the cap check result at the start of each poll cycle, not per-token.
- **Sharing MonitorLoop's cycle timing:** AutoSourcer runs on its own interval independent of MonitorLoop's 30s cycle.
- **Running graph traversal for auto-sourced tokens:** Must be explicitly disabled via `_deps` override.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retries with backoff | Custom retry loop | `p-retry` (already installed) | Handles exponential backoff, jitter, abort signals |
| Polling interval | Custom setTimeout loop with restart logic | `setInterval` + error catch | Simple interval with error catch is sufficient — MonitorLoop's tick() pattern |
| DB migrations | Raw SQL in startup code | drizzle-kit generate + migrate at boot | Already wired in `db/index.ts` — runs on startup automatically |
| Cap counter persistence across restarts | Complex state serialization | Accept in-memory reset on restart | Restart resets daily counter (acceptable — Railway restarts are rare) |

**Key insight:** This phase is almost entirely glue code between existing modules — GMGN fetcher → pre-filter → existing `runDiscovery`. Don't over-engineer the sourcer.

---

## GMGN API: Confirmed Fields and Uncertainty

### Confirmed Response Fields (MEDIUM confidence — community repos)

The endpoint `https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/{time_period}` returns `data.rank[]` array with:

| Field | Type | Description | Pre-filter Use |
|-------|------|-------------|----------------|
| `address` | string | Token mint address | Seed target |
| `symbol` | string | Token symbol | Logging |
| `holder_count` | integer | Number of holders | Min holder filter |
| `liquidity` | float | USD liquidity | $10k floor (SEED-02) |
| `open_timestamp` | integer | Unix seconds — token listing time | Age floor/ceiling |
| `is_honeypot` | integer | 0=safe, 1=honeypot | Drop flagged tokens |
| `market_cap` | float | Market cap in USD | Logging |
| `smart_buy_24h` | integer | Smart wallet buy count | Signal quality hint |
| `smart_sell_24h` | integer | Smart wallet sell count | Signal quality hint |
| `bluechip_owner_percentage` | float | % of holders who own blue chip tokens | Dev concentration proxy |

### Missing / Unconfirmed Fields (LOW confidence)

- **Wash trading flag**: No field named `wash_traded` or equivalent was found in any community source. The closest available field is `is_honeypot`. Wash trading detection is not available at the rank endpoint level — it would require `/v1/token/info` (Phase 15 deferred).
- **Dev wallet concentration**: No direct field. `bluechip_owner_percentage` can serve as a rough proxy — high bluechip ownership implies distributed, organic holders; low bluechip ownership with high concentration may indicate dev dominance. This is a proxy, not a direct measure.

### Recommended Pre-Filter Values

Based on research into Solana memecoin filtering practices and the GMGN response schema:

| Filter | Recommended Threshold | Rationale |
|--------|-----------------------|-----------|
| Holder count minimum | **≥ 100 holders** | Below 100 suggests very early/risky, likely to rug before Echo's wallets generate signal; @shanesimpson513's system implies similar floor |
| Dev concentration proxy | **Drop if `bluechip_owner_percentage` < 1%** | Very low bluechip ownership may indicate dev/insider-dominated distribution |
| Wash trading flag | **Drop if `is_honeypot` == 1** | Direct flag available; true wash_traded flag not found at this endpoint |
| Age floor | **≥ 1 hour old** (`open_timestamp` ≤ now - 3600s) | Tokens < 1h are extremely volatile, discovery wallets won't have established track records on them |
| Age ceiling | **≤ 72 hours old** (`open_timestamp` ≥ now - 259200s) | Tokens > 72h have typically either mooned or died — late discovery |
| Liquidity floor | **≥ $10,000 USD** | Locked by SEED-02 decision |

**Note:** These thresholds are researcher recommendations. The planner should surface these values as named constants in AutoSourcer so they can be tuned without code changes (or promoted to env vars if needed).

### GMGN Endpoint Clarification

The context document refers to `/v1/market/rank`. Research did not find a URL path literally named `/v1/market/rank`. The correct confirmed path is:

```
https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/1h
```

This is the canonical endpoint used in all community repos for Solana trending tokens by swap count. The `v1/market/rank` reference in context is likely a shorthand for the same endpoint. The planner should use the full URL above.

### GMGN Rate Limits and Access

| Finding | Confidence | Notes |
|---------|-----------|-------|
| Official Trade API rate limit: 1 call / 5 seconds | HIGH | Official docs (requires API key approval via Google Form) |
| Data crawling IP whitelist rate limit: 2 req/sec | MEDIUM | Official docs for IP whitelist path |
| No auth required for rank endpoint | MEDIUM | Community repos access without API key using browser headers |
| Cloudflare protection present | HIGH | Multiple sources confirm; `cf_clearance` cookie may be needed if Cloudflare challenges fire |

**Recommended polling interval: 5 minutes (300 seconds)**

Rationale:
- Echo is seeding discovery (not real-time trading) — a 5-minute interval is safe and operationally appropriate
- GMGN's trending rank doesn't change meaningfully in under a minute for our use case
- Generous spacing avoids Cloudflare rate triggers without explicit IP whitelist access
- Contrast: tweet system polls every 30s for real-time signals; AutoSourcer needs much less frequency

### Cloudflare Handling Strategy

GMGN's API is Cloudflare-protected. Community approaches:
1. **Browser-like headers** (User-Agent, Referer, Accept-Language, Origin) — works initially for most requests
2. **Cookie rotation** (`cf_clearance` cookie from browser session) — needed if Cloudflare challenge pages fire
3. **Fail-soft fallback** — on 403/challenge response, log error, skip the poll cycle, retry next interval

**Recommendation for Phase 15:** Start with browser-like headers only. If 403s are encountered in production, add `cf_clearance` cookie support as a follow-up (stored as env var `GMGN_CF_CLEARANCE`). Do NOT block Phase 15 planning on solving Cloudflare perfectly — fail-soft logging handles it.

---

## Observability Implementation Details

### /admin Page Architecture

Follows same pattern as main dashboard (`/` route in `server.ts`):

```typescript
// src/api/routes/admin.ts
export default async function adminRoutes(app: FastifyInstance) {
  app.get('/admin', async (_req, reply) => {
    const { autoSourcer } = await import('../../sourcing/auto-sourcer.js');
    const { getProviderStatus } = await import('../../fetchers/providers/index.js');
    // ... build data for template
    return reply.view('admin', { sourcerStats, providerStatus, recentErrors });
  });
}
```

**Register in `server.ts`:**
```typescript
await app.register(import('./routes/admin.js'));
```

### Provider Status Exposure

The existing `ProviderRouter` in `router.ts` has `cooldownUntil` as a private Map. To expose provider health to the /admin page and /status command, two options:
1. **Add `getStatus()` method to ProviderRouter** — returns array of `{ name, onCooldown, cooldownUntilMs }` per provider
2. **Track health in the createProviderRouter factory** — expose a module-level status object

Option 1 is cleaner. The `ProviderRouter` already has the data — just needs a public getter.

**Recommended provider status detail level for /admin:**
```typescript
interface ProviderStatus {
  name: string;              // 'helius' | 'shyft'
  state: 'active' | 'cooldown' | 'exhausted';
  cooldownUntil: number | null;
  lastError: string | null;
}
```

### Stall Detection for /status

MonitorLoop runs cycles every 30s. A stall is detected when the last successful cycle is older than expected.

**Recommended threshold: 5 minutes (10× normal cycle)**

Implementation: Track `lastCycleCompletedAt` on MonitorLoop (add a public getter). In `/status`, compare to `Date.now()`:

```typescript
const stalled = lastCycleAt && (Date.now() - lastCycleAt) > 5 * 60 * 1000;
```

### Cycle Counter on MonitorLoop

MonitorLoop currently does not track a cycle count. Add:
- `cycleCount: number` — increment each completed cycle
- `lastCycleDurationMs: number | null` — duration of last cycle
- `lastCycleCompletedAt: number | null` — timestamp of last cycle completion

These are public getters on MonitorLoop exposed for /status and /admin.

### /status Telegram Command Format

Expand existing `/status` handler in `commands.ts`:

```
<b>Echo System Status</b>

<b>Monitoring</b>
Cycles: 1,247 | Last: 28s ago | Duration: 4.2s
Status: RUNNING ✓

<b>AutoSourcer</b>
Status: ACTIVE | GMGN last poll: 3m ago
Today: 12/20 seeded | Total: 87/200 wallets

<b>Providers</b>
Helius: ACTIVE | Shyft: ACTIVE

<b>Signals</b>
Active: 14
```

If stalled:
```
<b>Monitoring</b>
Status: STALLED ⚠️ (last cycle 8m ago)
```

If ceiling hit:
```
<b>AutoSourcer</b>
Status: CEILING HIT | Total: 200/200 wallets
```

---

## DB Schema Changes

### New Table: `sourcing_log`

Track each AutoSourcer poll cycle for audit and dashboard display:

```typescript
export const sourcing_log = sqliteTable('sourcing_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  polled_at: integer('polled_at', { mode: 'number' }).notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  tokens_fetched: integer('tokens_fetched').notNull().default(0),
  tokens_passed_filters: integer('tokens_passed_filters').notNull().default(0),
  tokens_seeded: integer('tokens_seeded').notNull().default(0),
  tokens_already_tracked: integer('tokens_already_tracked').notNull().default(0),
  tokens_skipped_cap: integer('tokens_skipped_cap').notNull().default(0),
  error: text('error'),  // null if successful, error message if failed
});
```

**Why this table?** The /admin page's "tokens fetched vs seeded today" stat requires persistent storage — in-memory state resets on restart and can't reconstruct today's pass-through rate. The log also enables future backtesting of sourcing effectiveness.

**Migration:** New drizzle migration `0011_sourcing_log.sql` generated via `drizzle-kit generate`.

### New Column on `wallets` table: `source`

Track whether a wallet was added manually or via AutoSourcer:

```typescript
source: text('source', { enum: ['manual', 'auto'] }).notNull().default('manual'),
```

**Why:** Enables filtering /admin stats by source, and provides audit trail for auto-added wallets vs manually curated ones.

---

## SEED-06: Manual CA Seeding in Railway

The existing `echo wallet discover <mint>` CLI command works locally. In Railway deployed environment, the same command runs via Railway Shell:

```bash
railway run node dist/cli.js wallet discover <mint>
```

Or via Railway's interactive shell in the project dashboard. No code changes are required — this is an operational verification task. The planner should include a verification step: confirm `railway run` works, and document the command in a brief README note or /admin page help text.

---

## Common Pitfalls

### Pitfall 1: GMGN Cloudflare 403 Blocks
**What goes wrong:** GMGN returns 403 Forbidden or Cloudflare challenge HTML instead of JSON. The AutoSourcer poll fails, and if unhandled, crashes the poll loop.
**Why it happens:** GMGN uses Cloudflare protection; Node.js's default User-Agent (`node-fetch`, `axios/...`) is easily blocked.
**How to avoid:** Set browser-like headers on every request. Wrap all GMGN calls in try/catch that logs error and returns empty array (fail-soft). Parse response to check for HTML before treating as JSON.
**Warning signs:** `response.data` is a string starting with `<!DOCTYPE html>` — check content-type header.

### Pitfall 2: runDiscovery Without Graph Disable
**What goes wrong:** AutoSourcer calls `runDiscovery(mint)` without disabling graph traversal. Graph traversal fetches co-traders for ALL tracked wallets on every auto-sourced token — massively expensive in Helius credits.
**Why it happens:** `runDiscovery` does graph traversal by default.
**How to avoid:** Always pass `_deps` with a no-op `fetchCoTradersFn: async () => []` for auto-sourced runs. Add an explicit `graphDisabled: true` flag option to `runDiscovery` if cleaner.
**Warning signs:** Helius credit burn dramatically accelerates after AutoSourcer launches.

### Pitfall 3: Daily Counter Not Resetting
**What goes wrong:** `seededToday` counter doesn't reset at midnight UTC. After 24 hours, AutoSourcer stops seeding permanently until restart.
**Why it happens:** Simple in-memory counter without date tracking.
**How to avoid:** Store the current date as `currentDay: string` (e.g., `new Date().toISOString().slice(0,10)`) alongside the counter. At start of each poll, compare current date to stored date. If different, reset `seededToday = 0` and update `currentDay`.
**Warning signs:** AutoSourcer status shows `paused_daily_cap` indefinitely past midnight.

### Pitfall 4: Total Ceiling One-Time Alert Fires Multiple Times
**What goes wrong:** Ceiling alert Telegram message fires every poll cycle once ceiling is hit, flooding the chat.
**Why it happens:** No dedup guard on the ceiling alert.
**How to avoid:** Track `ceilingAlertFired: boolean` on AutoSourcer state. Set to true on first fire. Reset to false if wallet count drops below ceiling (auto-resume).
**Warning signs:** Multiple identical "ceiling hit" Telegram messages.

### Pitfall 5: /admin Route Circular Import
**What goes wrong:** `admin.ts` imports `auto-sourcer.ts` which imports `db/index.ts` which might re-trigger initialization — depending on module load order.
**Why it happens:** Node.js ESM circular imports can cause partially-initialized modules.
**How to avoid:** Use dynamic `import()` in the route handler (same pattern as existing `/` route in `server.ts` which uses `await import('../db/index.js')` inside the handler). Auto-sourcer singleton is already initialized by the time any request hits /admin.
**Warning signs:** `autoSourcer.getStats()` returns undefined or throws at request time.

### Pitfall 6: GMGN Field Names Unstable
**What goes wrong:** GMGN's unofficial API changes field names (e.g., `holder_count` renamed to `holderCount`). Pre-filters silently pass all tokens.
**Why it happens:** GMGN's documentation explicitly warns "API fields may be modified or removed periodically."
**How to avoid:** Add null-safety and range checks on all pre-filter fields. Log a warning if expected fields are missing. Example: `if (typeof token.holder_count !== 'number') { log.warn('GMGN response missing holder_count — skipping token'); continue; }`.
**Warning signs:** All tokens pass pre-filters even though some should be filtered.

---

## Code Examples

### GMGN Fetch with Browser Headers
```typescript
// Source: community repos (github.com/bigdata5911/gmgnai-scraping, github.com/imcrazysteven/GMGN-API)
const response = await axios.get('https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/1h', {
  params: {
    orderby: 'swaps',
    direction: 'desc',
    filters: ['not_honeypot'],
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://gmgn.ai/',
    'Origin': 'https://gmgn.ai',
  },
  timeout: 15000,
});
const tokens: GmgnToken[] = response.data?.data?.rank ?? [];
```

### Age Filter Using open_timestamp
```typescript
const nowSeconds = Math.floor(Date.now() / 1000);
const AGE_FLOOR_SECONDS = 60 * 60;       // 1 hour minimum
const AGE_CEILING_SECONDS = 72 * 60 * 60; // 72 hours maximum

const ageSeconds = nowSeconds - token.open_timestamp;
if (ageSeconds < AGE_FLOOR_SECONDS) continue;  // too new
if (ageSeconds > AGE_CEILING_SECONDS) continue; // too old
```

### Pre-Filter Pipeline
```typescript
function passesPreFilters(token: GmgnToken): boolean {
  if (token.is_honeypot === 1) return false;
  if (typeof token.holder_count === 'number' && token.holder_count < 100) return false;
  if (typeof token.liquidity === 'number' && token.liquidity < 10_000) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof token.open_timestamp === 'number') {
    const ageSeconds = nowSeconds - token.open_timestamp;
    if (ageSeconds < 3600) return false;   // < 1 hour
    if (ageSeconds > 259200) return false; // > 72 hours
  }
  // Dev concentration proxy (LOW confidence — field may not always be present)
  if (typeof token.bluechip_owner_percentage === 'number' &&
      token.bluechip_owner_percentage < 1) return false;
  return true;
}
```

### Expanding /status Telegram Command
```typescript
// Expand existing handler in src/api/bot/commands.ts
bot.command('status', async (ctx) => {
  const { autoSourcer } = await import('../../sourcing/auto-sourcer.js');
  const { monitorLoop } = await import('../../commands/wallet.js');
  const { getProviderStatuses } = await import('../../fetchers/providers/index.js');

  const loop = monitorLoop.getStats();  // new method added to MonitorLoop
  const sourcer = autoSourcer.getStats();
  const providers = getProviderStatuses();

  const stalledStr = loop.isStalled ? ' ⚠️ STALLED' : '';
  const lastCycleAgo = loop.lastCycleAt
    ? `${Math.round((Date.now() - loop.lastCycleAt) / 1000)}s ago`
    : 'never';

  await ctx.reply(
    `<b>Echo System Status</b>\n\n` +
    `<b>Monitoring</b>\n` +
    `Cycles: ${loop.cycleCount} | Last: ${lastCycleAgo}${stalledStr}\n` +
    `Duration: ${loop.lastCycleDurationMs ? (loop.lastCycleDurationMs / 1000).toFixed(1) + 's' : '—'}\n\n` +
    `<b>AutoSourcer</b>\n` +
    `Status: ${sourcer.status.toUpperCase()}\n` +
    `Today: ${sourcer.totalSeededToday}/${sourcer.dailyCap} seeded | ` +
    `Total: ${sourcer.totalWallets}/${sourcer.totalCap}\n\n` +
    `<b>Providers</b>\n` +
    providers.map(p => `${p.name}: ${p.state.toUpperCase()}`).join(' | '),
    { parse_mode: 'HTML' }
  );
});
```

### /admin Route Registration
```typescript
// In src/api/server.ts — add alongside existing route registrations
await app.register(import('./routes/admin.js'));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual CA seeding only | AutoSourcer + manual | Phase 15 | Discovery runs without human intervention |
| /status shows only wallet/signal count | /status shows full system health | Phase 15 | Operational visibility from Telegram |
| No admin page | /admin page | Phase 15 | Monitoring and cap visibility without SSH |

**Deprecated/outdated:**
- `/status` current implementation (wallet count + signal count only): Replaced by expanded multi-section health summary in Phase 15.

---

## Open Questions

1. **Does GMGN's `/v1/rank/sol/swaps/1h` endpoint require IP whitelist or accept unauthenticated browser-header requests?**
   - What we know: Community repos (bigdata5911, imcrazysteven, Malakia-sol) all access the endpoint without API keys using browser-like headers; GMGN's official IP whitelist program is separate and optional
   - What's unclear: Whether production Railway IPs will be blocked by Cloudflare (data center IPs are more likely to trigger Cloudflare challenges than residential IPs)
   - Recommendation: Implement with browser headers; add `GMGN_CF_CLEARANCE` env var support as a fallback; log 403s prominently so issue is visible immediately

2. **Is `bluechip_owner_percentage` consistently present in Solana rank responses?**
   - What we know: Confirmed in ETH rank response examples; GMGN explicitly warns fields may change
   - What's unclear: Whether the field exists for all Solana tokens or only some
   - Recommendation: Treat as optional; skip the dev-concentration filter if field is absent rather than failing

3. **Should `sourcing_log` entries be kept forever or pruned?**
   - What we know: Each poll cycle creates one row; at 5-minute polling, that's ~288 rows/day, ~8,640/month — trivial for SQLite
   - What's unclear: Long-term retention needs
   - Recommendation: No pruning in Phase 15; add pruning in a future cleanup phase if needed

4. **Should existing `/status` command output be replaced or extended?**
   - What we know: Current `/status` shows walletCount, signalCount, lastCycle
   - What's unclear: Whether users rely on the current format
   - Recommendation: Replace with new multi-section format (walletCount and signalCount are subsumed by the richer output)

---

## Sources

### Primary (MEDIUM-HIGH confidence)
- `src/discovery/index.ts` — runDiscovery interface, `_deps` injection, direct vs graph mode
- `src/monitor/loop.ts` — MonitorLoop pattern (setInterval-equivalent, start/stop/tick)
- `src/api/server.ts` — Fastify route registration pattern, EJS view rendering
- `src/api/bot/commands.ts` — Existing /status handler to extend
- `src/db/schema.ts` — Existing schema, migration pattern via drizzle-kit
- `src/fetchers/providers/index.ts` — Provider health, credit exhaustion handling, botInstance pattern
- Official GMGN Trade API docs (docs.gmgn.ai) — Auth requirements, rate limits for official API
- Official GMGN IP Whitelist docs (docs.gmgn.ai) — 2 req/sec rate limit for data crawling path

### Secondary (MEDIUM confidence)
- github.com/bigdata5911/gmgnai-scraping — Endpoint URL, response field list (holder_count, liquidity, open_timestamp, is_honeypot)
- github.com/imcrazysteven/GMGN-API — Response field names, Python implementation reference
- github.com/yllvar/gmgn_analyst — Python async implementation confirming endpoint structure
- dev.to/imcrazysteven — Complete developer guide, Cloudflare handling, rate limit guidance (~30 req/min)

### Tertiary (LOW confidence — needs validation)
- github.com/Malakia-sol/gmgn-api — Cookie-based Cloudflare bypass (may become needed for Railway data center IPs)
- Researcher-defined thresholds (holder ≥ 100, age 1h–72h, bluechip < 1%): Based on Solana memecoin trading community norms and the @shanesimpson513 reference system; not officially documented

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new packages needed; all existing dependencies cover requirements
- GMGN endpoint structure: MEDIUM — Confirmed via multiple community repos; URL path `/v1/rank/sol/swaps/{time}` is consistent across sources
- GMGN response fields: MEDIUM — `holder_count`, `liquidity`, `open_timestamp`, `is_honeypot` confirmed; `bluechip_owner_percentage` confirmed for ETH, assumed for SOL; `wash_traded` field not found
- Cloudflare access: LOW-MEDIUM — Browser headers work for community devs; Railway data center IPs may face stricter Cloudflare challenges
- Pre-filter thresholds: LOW — Researcher judgment based on community norms; no empirical validation
- Architecture patterns: HIGH — Follows established MonitorLoop and Fastify patterns already in codebase
- DB migration approach: HIGH — Drizzle-kit + auto-migrate at startup already proven in 10 prior migrations

**Research date:** 2026-04-14
**Valid until:** 2026-07-14 (90 days — GMGN API is unofficial and may change; re-verify endpoint before implementation)
