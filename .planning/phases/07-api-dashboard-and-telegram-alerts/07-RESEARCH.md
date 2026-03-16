# Phase 7: API, Dashboard, and Telegram Alerts - Research

**Researched:** 2026-03-16
**Domain:** Fastify REST+SSE API / HTMX+Alpine.js dashboard / grammY Telegram bot
**Confidence:** HIGH (stack verified against official docs and npm; codebase fully read)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Token signal feed**
- Default sort: signal score descending (highest first)
- Columns per row: token mint/name, score, tier badge, smart holder count, last updated
- Live update behavior: highlight changed rows with a brief yellow fade when a new SSE cycle event arrives
- Filtering: tier filter chip bar (Strong / Moderate / Weak / All) — no other filters in v1

**Wallet detail view**
- Entry points: (1) clicking a row in the wallet table on the dashboard, (2) clicking the smart holder count in the signal feed row
- Layout: score card at the top, trade history table below — both equally prominent
- Score section: display sub-scores (win rate, Sharpe, PnL, recency) and the overall 0–100 score with weights
- Detection section: current status badge + which detectors fired and at what confidence level (e.g., bundler: suspected, sniper: clean)
- Trade history: recent swaps table with token, direction (buy/sell), SOL amount, realized PnL
- Current open positions: Claude's discretion — include if it adds meaningful signal without cluttering

**Alert thresholds & dedup**
- Threshold configuration: Claude's discretion — keep it simple (env var or config file), no in-bot config command needed
- Dedup window: 2-hour dedup per token — no repeated alerts within 2h of the last alert
- Dedup override: if smart holder count increases by +3 or more within the dedup window, send a follow-up "accumulation" alert
- Alert message contents: token mint, score, tier, smart holder count, top 2–3 wallet addresses holding it

**Telegram bot commands**
- `/status` — system health: last cycle timestamp, tracked wallet count, active signal count
- `/top` — top 5 tokens by signal score; each entry: token mint, score, tier, top holder wallet address
- `/wallet <address>` — score, detection status, score breakdown, last 3–5 trades
- `/signal <token_mint>` — look up a specific token's current signal score, tier, holder count, and top holder
- Alert configuration commands: not needed — threshold lives in env/config

### Claude's Discretion
- Whether to show current open positions on the wallet detail page
- Exact depth of `/wallet <address>` response (within the "score + detection + recent trades" frame)
- Alert threshold value and config mechanism (env var vs config file)
- HTMX vs full-page reload for tier filter interactions
- SSE event schema and reconnect behavior

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Web dashboard showing live token signal feed with SSE updates | `@fastify/sse` async iterator pattern + HTMX `hx-ext="sse"` + `sse-swap` for live row injection; Alpine.js for yellow fade via CSS transition |
| DASH-02 | Wallet list view with score, detection status, last active time | REST GET `/api/wallets` querying `wallets` + `wallet_metrics` joined; HTML table served by `@fastify/view` (EJS) |
| DASH-03 | Wallet detail view with score breakdown, detections, trade history | REST GET `/api/wallets/:address` joining `wallet_metrics`, `wallet_flags`, `swaps`; modal or separate page served as HTML partial |
| DASH-04 | Tier filter chip bar (Strong/Moderate/Weak/All) | Alpine.js `x-data` reactive filter state — pure client-side filter on pre-rendered rows, no server round-trip needed |
| TGRM-01 | Telegram alerts when token signal crosses threshold (with dedup) | grammY `bot.api.sendMessage(chatId, ...)` called from post-cycle hook; dedup stored in new `alert_log` table (token_mint, last_alerted_at, last_holder_count) |
| TGRM-02 | Telegram bot /status, /top, /wallet, /signal commands | `bot.command('status', ...)` etc. with long polling via `bot.start()` in a background process alongside MonitorLoop |
| TGRM-03 | Alert accumulation override (+3 smart holders within dedup window) | Dedup query compares `smart_wallet_count` from `token_signals` against stored `last_holder_count` in `alert_log`; if delta >= 3, bypass dedup and send accumulation alert |
</phase_requirements>

---

## Summary

Phase 7 delivers the user-facing delivery layer on top of the fully operational Phases 1–6 pipeline. The stack is Fastify (REST + SSE) for the backend, HTMX + Alpine.js for the dashboard frontend (no build step, no SPA framework), and grammY for the Telegram bot. All three components are read-only consumers of the existing SQLite database — they never write to detection, scoring, or signal tables (except a new `alert_log` table owned by this phase).

The most critical integration point is the SSE cycle event: after each `MonitorLoop.runCycle()` completes, the API must broadcast a named SSE event so the dashboard can re-fetch and re-render updated signal rows. This means the existing `MonitorLoop` needs a lightweight event emitter hook (an `EventEmitter` or callback) that the API layer subscribes to — no database polling needed on the API side.

The dedup logic is the second critical integration point. A new `alert_log` table tracks the last alert timestamp and holder count per token, and the alert dispatcher (called post-cycle alongside signal computation) applies the 2-hour window and +3 accumulation override before calling `bot.api.sendMessage`.

**Primary recommendation:** Co-locate the Fastify API, dashboard routes, and grammY bot in a single new `src/api/` module. The bot runs `bot.start()` (long polling) in a background async call; the Fastify server runs separately. Both share the same `db` singleton.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.x (latest) | HTTP server for REST + SSE endpoints | Fastest Node.js framework; built-in TypeScript generics; used throughout Node.js ecosystem |
| @fastify/sse | ^0.4.0 | SSE endpoint support (async iterator API) | Official Fastify org package; maintained; async generator support is idiomatic |
| @fastify/static | ^8.x | Serve CSS/JS assets from `public/` | Official Fastify org package |
| @fastify/view | ^9.x | Server-side HTML rendering (EJS) | Official Fastify org package; EJS is familiar and trivial to set up |
| grammy | ^1.x | Telegram bot framework | TypeScript-first; best documented; runs on Node.js with long polling out of the box |
| htmx.org | 2.x (CDN) | Dynamic partial HTML swaps via SSE | No build step; 14 KB; pairs with EJS server rendering |
| alpinejs | 3.x (CDN) | Client-side reactivity for tier filter + row fade | No build step; 15 KB; handles local state HTMX cannot |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ejs | ^3.x | Template engine for `@fastify/view` | HTML page rendering; layouts; partial includes |
| drizzle-orm | (already installed) | DB queries for API routes | Re-use existing db singleton — no new DB library needed |
| better-sqlite3 | (already installed) | Underlying SQLite access | WAL mode must be enabled for concurrent API reads while MonitorLoop writes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/sse | fastify-sse-v2 | fastify-sse-v2 is not actively maintained (last release 1+ year ago); `@fastify/sse` is the official package |
| EJS + @fastify/view | Handlebars | EJS is simpler for inline JS expressions; Handlebars has no real advantage here |
| grammY | node-telegram-bot-api | grammY is TypeScript-native, actively maintained, better documented for 2025+ |
| Alpine.js (client filter) | HTMX request to `/api/signals?tier=strong` | Alpine client filter avoids a server round-trip and matches the "no other filters in v1" simplicity requirement |

**Installation:**
```bash
pnpm add fastify @fastify/sse @fastify/static @fastify/view ejs grammy
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── api/
│   ├── server.ts          # Fastify instance creation, plugin registration, route mounting
│   ├── routes/
│   │   ├── signals.ts     # GET /api/signals, GET /api/signals/:mint, SSE /events/cycle
│   │   ├── wallets.ts     # GET /api/wallets, GET /api/wallets/:address
│   │   └── status.ts      # GET /api/status (system health)
│   ├── views/
│   │   ├── layout.ejs     # HTML shell with HTMX + Alpine CDN includes
│   │   ├── dashboard.ejs  # Signal feed + wallet list split view
│   │   └── wallet.ejs     # Wallet detail page (or modal partial)
│   ├── public/
│   │   └── styles.css     # Minimal custom CSS (tier badge colors, yellow fade keyframe)
│   └── bot/
│       ├── index.ts       # grammY Bot init, command registration, bot.start()
│       ├── commands.ts    # Handler functions for /status, /top, /wallet, /signal
│       └── alerts.ts      # Alert dispatcher: threshold check + dedup logic
└── db/
    └── schema.ts          # Add alert_log table (new in this phase)
```

### Pattern 1: SSE Cycle Broadcast via EventEmitter

**What:** After `MonitorLoop.runCycle()` completes, it emits a `cycle` event on a shared Node.js `EventEmitter`. The SSE route subscribes open connections to this emitter, fanning out an SSE event to all connected browsers.

**When to use:** When the data source (MonitorLoop) is in-process with the API server — avoids polling the DB to detect changes.

**Example:**
```typescript
// Source: Node.js built-in EventEmitter + @fastify/sse async generator pattern

// src/api/cycle-events.ts
import { EventEmitter } from 'events';
export const cycleEmitter = new EventEmitter();

// In MonitorLoop.runCycle() — after computeAllTokenSignals():
cycleEmitter.emit('cycle', { timestamp: Date.now() });

// In SSE route (src/api/routes/signals.ts):
import { cycleEmitter } from '../cycle-events.js';

fastify.get('/events/cycle', async (req, reply) => {
  reply.sse(
    (async function* () {
      while (true) {
        yield { event: 'cycle', data: JSON.stringify({ ts: Date.now() }) };
        await new Promise<void>(resolve => cycleEmitter.once('cycle', resolve));
      }
    })()
  );
});
```

### Pattern 2: HTMX SSE Live Table Update with Alpine Fade

**What:** HTMX `sse-swap` receives partial HTML from the server on each cycle event. Alpine.js adds a CSS class for 200ms to highlight changed rows.

**When to use:** For the signal feed table (DASH-01). Named SSE events (`event: cycle`) trigger an HTMX `hx-get` refresh of the signal table rows.

**Example:**
```html
<!-- Source: HTMX SSE extension docs + Alpine.js x-data pattern -->

<!-- Connect to SSE and trigger a re-fetch of the signal table on each 'cycle' event -->
<div hx-ext="sse" sse-connect="/events/cycle">
  <div id="signal-table-wrapper"
       hx-get="/api/signals/partial"
       hx-trigger="sse:cycle"
       hx-target="#signal-table-wrapper"
       hx-swap="innerHTML">
    <!-- Server renders initial signal rows here -->
  </div>
</div>

<!-- Alpine.js tier filter (client-side only, no server request) -->
<div x-data="{ activeTier: 'all' }">
  <div class="chip-bar">
    <button @click="activeTier = 'all'" :class="{ active: activeTier === 'all' }">All</button>
    <button @click="activeTier = 'strong'" :class="{ active: activeTier === 'strong' }">Strong</button>
    <button @click="activeTier = 'moderate'" :class="{ active: activeTier === 'moderate' }">Moderate</button>
    <button @click="activeTier = 'weak'" :class="{ active: activeTier === 'weak' }">Weak</button>
  </div>
  <table>
    <template x-for="row in rows">
      <tr x-show="activeTier === 'all' || row.tier === activeTier">...</tr>
    </template>
  </table>
</div>
```

**Note on HTMX + Alpine tier filter:** The simplest approach is HTMX re-fetches the full signal list as HTML on each SSE cycle. Alpine holds a reactive `activeTier` variable and shows/hides rows via `x-show`. No server round-trip is needed for filtering (DASH-04 is Claude's discretion: use Alpine client-side filter).

### Pattern 3: Alert Dedup with alert_log Table

**What:** A new `alert_log` table stores one row per token mint. The alert dispatcher reads this row before sending and writes it after sending. The 2-hour window check and +3 holder accumulation override are applied here.

**When to use:** Called from `src/api/bot/alerts.ts` once per cycle, after `computeAllTokenSignals()` runs.

**Example:**
```typescript
// Source: derived from dedup pattern + project's existing drizzle-orm usage

// New schema in src/db/schema.ts:
export const alert_log = sqliteTable('alert_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_mint: text('token_mint').notNull().unique(),
  last_alerted_at: integer('last_alerted_at', { mode: 'number' }),
  last_holder_count: integer('last_holder_count').notNull().default(0),
});

// Alert dispatcher logic (pseudo-code):
const ALERT_THRESHOLD = Number(process.env.ALERT_SIGNAL_THRESHOLD ?? 50);
const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const ACCUMULATION_THRESHOLD = 3;

async function runAlertCycle(db, bot, chatId) {
  const activeSignals = db.select().from(token_signals)
    .where(gte(token_signals.signal_score, ALERT_THRESHOLD)).all();

  for (const signal of activeSignals) {
    const log = db.select().from(alert_log)
      .where(eq(alert_log.token_mint, signal.token_mint))
      .get();

    const now = Date.now();
    const withinDedup = log && (now - log.last_alerted_at) < DEDUP_WINDOW_MS;
    const holderDelta = log ? (signal.smart_wallet_count - log.last_holder_count) : 0;
    const isAccumulation = withinDedup && holderDelta >= ACCUMULATION_THRESHOLD;

    if (!withinDedup || isAccumulation) {
      const msgType = isAccumulation ? 'ACCUMULATION' : 'SIGNAL';
      await bot.api.sendMessage(chatId, formatAlert(signal, msgType));
      db.insert(alert_log).values({ token_mint: signal.token_mint, last_alerted_at: now, last_holder_count: signal.smart_wallet_count })
        .onConflictDoUpdate({ target: alert_log.token_mint, set: { last_alerted_at: now, last_holder_count: signal.smart_wallet_count } })
        .run();
    }
  }
}
```

### Pattern 4: grammY Long Polling with Shared DB

**What:** grammY bot runs `bot.start()` in a co-located async call. Command handlers query the shared `db` singleton.

**When to use:** The bot and the API server live in the same Node.js process (or started together via `src/index.ts`). Long polling is simpler for a self-hosted background service — no domain/SSL needed.

**Example:**
```typescript
// Source: grammY official docs grammy.dev/guide/
import { Bot } from 'grammy';
import { db } from '../../db/index.js';

export function startBot() {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

  bot.command('status', async (ctx) => {
    const walletCount = db.select({ count: count() }).from(wallets).get()!.count;
    const signalCount = db.select({ count: count() }).from(token_signals)
      .where(gt(token_signals.signal_score, 0)).get()!.count;
    await ctx.reply(`System OK\nWallets: ${walletCount}\nActive signals: ${signalCount}`);
  });

  // bot.start() returns a promise that resolves only when stopped
  bot.start({
    onStart: (botInfo) => console.log(`[bot] @${botInfo.username} started`),
  }).catch(console.error);

  return bot; // return for alert dispatcher usage (bot.api.sendMessage)
}
```

### Anti-Patterns to Avoid

- **Polling the DB for cycle completion from the SSE route:** Don't `setInterval` query `token_signals.updated_at` to detect new cycles. Use `cycleEmitter` (EventEmitter) instead — it's in-process and zero-latency.
- **Opening a new DB connection per request:** The existing `db` singleton in `src/db/index.ts` uses `better-sqlite3`. Don't create new `Database` instances per request. Share the singleton.
- **Blocking the event loop with synchronous DB calls inside SSE generator:** `better-sqlite3` is synchronous but fast for reads. SSE generators should `await` only on the `cycleEmitter.once()` promise (non-blocking), then synchronously query the DB.
- **Running bot and Fastify in two separate processes without coordination:** Unless the system is rewritten, keeping them in one process shares the DB connection and `cycleEmitter` without IPC overhead.
- **Not enabling WAL mode on SQLite:** The MonitorLoop writes to the DB frequently. Without WAL mode, concurrent reads from the API will hit `SQLITE_BUSY` errors. Enable WAL once at startup.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE connection management | Custom HTTP chunked response + keep-alive loop | `@fastify/sse` with async generator | Handles connection cleanup, backpressure, headers correctly |
| HTML templating | String concatenation | EJS via `@fastify/view` | Layouts, partials, escaping; trivial setup |
| Telegram API calls | Raw `fetch` to `api.telegram.org` | grammY `bot.api.sendMessage()` | Rate limiting, retries, type safety, markdown parsing |
| SSE reconnect on client | `setInterval` + `fetch` | Browser's native `EventSource` (via HTMX SSE ext) | Automatic exponential backoff reconnect built into spec |
| Alert dedup in-memory | `Map<string, number>` for timestamps | `alert_log` SQLite table | Survives process restarts; queryable |

**Key insight:** The HTMX + EJS pattern means zero frontend build tooling (no webpack, no bundler). The only new npm dependencies are Fastify plugins and grammY.

---

## Common Pitfalls

### Pitfall 1: SQLite SQLITE_BUSY on Concurrent API Reads

**What goes wrong:** `better-sqlite3` throws `SQLITE_BUSY: database is locked` when the MonitorLoop is mid-write-transaction and the Fastify API runs a read.

**Why it happens:** SQLite's default journal mode (DELETE) blocks readers during writes.

**How to avoid:** Enable WAL mode once at application startup:
```typescript
db.pragma('journal_mode = WAL');
```
WAL allows concurrent reads while a write is in progress. This is idempotent — safe to call on every startup.

**Warning signs:** Intermittent 500 errors on dashboard during monitor cycles.

### Pitfall 2: HTMX SSE Extension Not Loaded

**What goes wrong:** `hx-ext="sse"` does nothing; `sse-connect` is ignored.

**Why it happens:** In htmx 2.x, SSE support was moved from core to an extension. You must include the extension script separately.

**How to avoid:**
```html
<script src="https://unpkg.com/htmx.org@2.0.3/dist/htmx.min.js"></script>
<script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js"></script>
```
The extension (`htmx-ext-sse`) is a separate npm package / CDN URL, NOT bundled in `htmx.org` core.

**Warning signs:** No SSE connection appears in the browser's Network tab.

### Pitfall 3: grammY bot.start() Blocks the Module if Not Awaited Correctly

**What goes wrong:** `await bot.start()` hangs the startup sequence, preventing the Fastify server from starting.

**Why it happens:** `bot.start()` runs indefinitely (long polling loop) and only resolves on graceful stop.

**How to avoid:** Call `bot.start()` without `await`, or in a non-blocking fire-and-forget:
```typescript
// Don't: await bot.start() — blocks the process
// Do:
bot.start({ ... }).catch(err => {
  console.error('[bot] crashed:', err);
  process.exit(1);
});
```

**Warning signs:** Fastify server never starts listening; process appears hung.

### Pitfall 4: SSE Client Connections Piling Up (Memory Leak)

**What goes wrong:** Every time a browser tab reconnects, a new async generator is created and held in the `cycleEmitter` listener list. Old generators are never cleaned up.

**Why it happens:** If the generator loop doesn't break on client disconnect, it keeps waiting for `cycleEmitter.once('cycle', ...)` forever.

**How to avoid:** `@fastify/sse` handles cleanup on connection close when the generator is properly structured. Ensure the `request.socket.on('close', ...)` or Fastify's reply lifecycle terminates the async generator. Use `AbortController` or an `isClosed` flag tied to `reply.raw.on('close', ...)`:
```typescript
fastify.get('/events/cycle', async (req, reply) => {
  let closed = false;
  reply.raw.on('close', () => { closed = true; });

  reply.sse((async function* () {
    while (!closed) {
      await new Promise<void>(resolve => cycleEmitter.once('cycle', resolve));
      if (closed) break;
      yield { event: 'cycle', data: JSON.stringify({ ts: Date.now() }) };
    }
  })());
});
```

**Warning signs:** Node.js `MaxListenersExceededWarning` on `cycleEmitter` after browser tabs open/close.

### Pitfall 5: Telegram chatId Discovery

**What goes wrong:** `bot.api.sendMessage(chatId, ...)` fails because the `chatId` is not known at deployment time.

**Why it happens:** Telegram bots learn the chatId only after a user messages the bot. The chatId is not derivable from the bot token alone.

**How to avoid:** Document the one-time setup: after deploying, the user sends `/start` to the bot. Log or store the chatId from `ctx.chat.id`. Store in env var `TELEGRAM_CHAT_ID`. Alternatively, provide a `/register` (internal) command that logs the chatId on first use.

**Warning signs:** Alerts never arrive; `chat not found` error in logs.

### Pitfall 6: Alpine.js Filter State Lost on HTMX Swap

**What goes wrong:** After HTMX re-renders the signal table (SSE cycle), Alpine's `x-data` state (activeTier, etc.) is wiped because the DOM nodes are replaced.

**Why it happens:** HTMX's default `hx-swap="innerHTML"` replaces DOM nodes, destroying Alpine's component state.

**How to avoid:** Keep the Alpine `x-data` component on a _parent_ element that HTMX never replaces. Only the inner table body (`<tbody>`) should be HTMX-swapped, not the `x-data` wrapper div. Structure:
```html
<div x-data="{ activeTier: 'all' }">         <!-- Alpine wrapper — never swapped -->
  <div class="chip-bar">...</div>
  <div id="signal-rows"
       hx-get="/api/signals/partial"
       hx-trigger="sse:cycle from:closest [hx-ext]"
       hx-swap="innerHTML">
    <!-- Only this inner div is replaced by HTMX -->
  </div>
</div>
```

**Warning signs:** Tier filter resets to "All" every 30 seconds when a cycle fires.

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### Fastify Server Bootstrap with SSE Plugin

```typescript
// Source: Fastify docs + @fastify/sse npm page pattern
import Fastify from 'fastify';
import SSEPlugin from '@fastify/sse';
import StaticPlugin from '@fastify/static';
import ViewPlugin from '@fastify/view';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildServer() {
  const app = Fastify({ logger: true });

  // Enable WAL mode immediately
  const { db } = await import('../../db/index.js');
  db.pragma('journal_mode = WAL');

  await app.register(SSEPlugin);
  await app.register(StaticPlugin, { root: path.join(__dirname, 'public'), prefix: '/public/' });
  await app.register(ViewPlugin, { engine: { ejs }, root: path.join(__dirname, 'views') });

  // Mount route modules
  await app.register(import('./routes/signals.js'));
  await app.register(import('./routes/wallets.js'));
  await app.register(import('./routes/status.js'));

  return app;
}
```

### grammY /wallet Command with DB Query

```typescript
// Source: grammY docs grammy.dev/guide/ + codebase schema analysis
bot.command('wallet', async (ctx) => {
  const address = ctx.match?.trim();
  if (!address) return ctx.reply('Usage: /wallet <address>');

  const wallet = db.select().from(wallets).where(eq(wallets.address, address)).get();
  if (!wallet) return ctx.reply('Wallet not found.');

  const metrics = db.select().from(wallet_metrics).where(eq(wallet_metrics.wallet_address, address)).get();
  const flags = db.select().from(wallet_flags)
    .where(and(eq(wallet_flags.wallet_address, address), eq(wallet_flags.cleared, false))).all();
  const recentTrades = db.select().from(swaps)
    .where(eq(swaps.wallet_address, address))
    .orderBy(desc(swaps.timestamp)).limit(5).all();

  const detectionLines = flags.length > 0
    ? flags.map(f => `  • ${f.detector}: ${f.confidence}`).join('\n')
    : '  • All detectors: clean';

  await ctx.reply(
    `<b>Wallet:</b> <code>${address}</code>\n` +
    `<b>Score:</b> ${metrics?.score_total ?? 'N/A'}/95\n` +
    `<b>Detection:</b> ${wallet.detection_status}\n${detectionLines}\n\n` +
    `<b>Recent trades (last 5):</b>\n` +
    recentTrades.map(t => `  ${t.side.toUpperCase()} ${t.sol_amount.toFixed(3)} SOL — ${t.token_mint.slice(0, 8)}...`).join('\n'),
    { parse_mode: 'HTML' }
  );
});
```

### EJS Layout Pattern for Dashboard

```ejs
<!-- src/api/views/layout.ejs -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Echo Dashboard</title>
  <link rel="stylesheet" href="/public/styles.css">
  <script src="https://unpkg.com/htmx.org@2.0.3/dist/htmx.min.js" defer></script>
  <script src="https://unpkg.com/htmx-ext-sse@2.2.2/sse.js" defer></script>
  <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
</head>
<body>
  <%- body %>
</body>
</html>
```

### CSS Yellow Fade Keyframe for Changed Rows

```css
/* src/api/public/styles.css */
@keyframes row-highlight {
  0%   { background-color: #fef9c3; }
  100% { background-color: transparent; }
}
.row-updated {
  animation: row-highlight 1.5s ease-out;
}
```

On SSE cycle, HTMX replaces the `<tbody>` with fresh HTML from the server. New/changed rows should include `class="row-updated"` in the server-rendered partial — the CSS animation plays once on mount.

---

## Discretion Recommendations

These are areas marked "Claude's Discretion" in CONTEXT.md. Recommendations based on research:

### Tier Filter: Alpine.js Client-Side (Recommended)

Use Alpine.js to filter rows on the client. When HTMX re-renders the `<tbody>`, rows include `data-tier="strong"` attributes. Alpine's `x-show` evaluates `activeTier === 'all' || $el.dataset.tier === activeTier`. This approach is simpler than an HTMX request and avoids an extra server round-trip for a UI state change.

### Alert Threshold: Single ENV Var (Recommended)

```bash
ALERT_SIGNAL_THRESHOLD=50   # send alert when signal_score >= this value
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...         # the chat to send alerts to
```

Three env vars in `.env`. No config file needed. The threshold default of 50 captures `moderate` (≥35) and `strong` (≥65) signals while ignoring `weak` (< 35). If the user wants only strong signals, they set it to 65.

### Current Open Positions on Wallet Detail: Include (Recommended)

The `swaps` table has enough data to compute net position per token (buy_amount - sell_amount > 0). This adds meaningful signal (you can see what the wallet is currently holding) with minimal clutter — one extra table below trades, labeled "Current Holdings". The query is simple and already exists in `signals/engine.ts` (reuse the net position logic).

### /wallet Command Depth: Score + Detection + Last 5 Trades (Recommended)

5 trades is the right depth: enough for a quick scan, not overwhelming in a Telegram message. Include sub-scores (4 lines) and detection flags (1 line per active flag). Total message length stays under Telegram's 4096 character limit even for wallets with many flags.

### SSE Reconnect Behavior: Browser Native + Server Retry Header (Recommended)

The browser's native `EventSource` auto-reconnects with 3s default. Set `retry: 5000` on the server's first SSE message to extend it to 5s (reduces reconnect noise during deploys). No custom reconnect logic needed on the client side — HTMX SSE extension handles reconnect transparently.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| hx-sse attribute (htmx 1.x) | `hx-ext="sse"` + separate `htmx-ext-sse` script | htmx 2.0 (2024) | Must include extension script separately; `hx-sse` no longer works |
| fastify/sse (deprecated) | @fastify/sse (official Fastify org) | 2023 | Use `@fastify/sse`, not the unmaintained `fastify/sse` |
| `@fastify/point-of-view` | `@fastify/view` | 2023 rename | Same package, new name; install `@fastify/view` |

**Deprecated/outdated:**
- `hx-sse` attribute: htmx 1.x only. In htmx 2.x this attribute is ignored. Use `hx-ext="sse"` with the SSE extension script.
- `fastify/sse` (GitHub: fastify/sse): archived/deprecated in favor of `@fastify/sse`.
- `@fastify/point-of-view`: renamed to `@fastify/view`.

---

## Open Questions

1. **Process topology: one process vs. two?**
   - What we know: MonitorLoop, Fastify server, and grammY bot can all share the same `db` singleton in one Node.js process.
   - What's unclear: Whether the project's `src/index.ts` should be extended to start all three, or whether a new entrypoint is needed.
   - Recommendation: Extend `src/index.ts` (or `src/cli.ts` monitor command) to also start the Fastify server and grammY bot when the monitor starts. Avoids managing multiple processes.

2. **Token name resolution (token mint → human name)**
   - What we know: `token_signals` stores only `token_mint` (base58 address). The signal feed column says "token mint/name."
   - What's unclear: Whether DexScreener lookups for names should be cached in a new `token_metadata` table or fetched on-demand.
   - Recommendation: Fetch from DexScreener on first dashboard load and cache in a new `token_metadata` table (token_mint, name, symbol). This is a new table introduced in this phase. Fallback to short mint address if no name found.

3. **TELEGRAM_CHAT_ID bootstrap process**
   - What we know: `bot.api.sendMessage` requires a known chatId. The user must message the bot first.
   - What's unclear: Whether to log it or store it in the DB.
   - Recommendation: Log the chatId on the first `/start` or any command, and instruct the user to add it to `.env`. Keep it simple — one chatId, one recipient.

---

## Sources

### Primary (HIGH confidence)
- https://fastify.dev/docs/latest/Reference/TypeScript/ — TypeScript generics, route typing, plugin declaration merging
- https://htmx.org/extensions/sse/ — SSE extension attributes (`hx-ext`, `sse-connect`, `sse-swap`), lifecycle events, reconnect behavior
- https://grammy.dev/guide/ — Bot init, command handlers, `bot.api.sendMessage`, `bot.start()` long polling
- https://grammy.dev/guide/deployment-types — Long polling vs webhook tradeoff; recommendation for simple background services
- `src/db/schema.ts` (codebase) — All existing tables and field types available to query
- `src/signals/scorer.ts` (codebase) — Signal tier thresholds (strong ≥65, moderate ≥35, weak <35)
- `src/scoring/composer.ts` (codebase) — Sub-score names and weights for wallet detail view
- `src/detection/types.ts` (codebase) — DetectorId, DetectionTier, DetectionStatus types

### Secondary (MEDIUM confidence)
- https://www.npmjs.com/package/@fastify/sse — Current version 0.4.0 confirmed active
- https://www.npmjs.com/package/fastify-sse-v2 — Version 4.2.1, confirmed less actively maintained
- https://github.com/fastify/point-of-view → renamed `@fastify/view` (verified via npm)
- https://sqlite.org/wal.html — WAL mode concurrent reads behavior

### Tertiary (LOW confidence — flag for validation)
- CDN URLs for htmx-ext-sse (version `2.2.2`) — confirm exact version before writing HTML templates
- Alpine.js CDN version pinning — verify `3.x.x` resolves to a stable version on unpkg

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against npm, official Fastify docs, grammY docs
- Architecture: HIGH — patterns derived from official docs + direct codebase analysis
- Pitfalls: HIGH (WAL, bot.start(), HTMX 2.x SSE) / MEDIUM (Alpine/HTMX state interaction) — based on official migration docs and community-verified patterns
- Discretion recommendations: MEDIUM — reasoned from constraints, not externally verified

**Research date:** 2026-03-16
**Valid until:** 2026-06-16 (stable stack; htmx extension versioning may drift sooner — re-verify CDN URL within 30 days if not implementing immediately)
