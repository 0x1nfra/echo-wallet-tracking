# Phase 5: Monitoring Loop and Auto-Removal - Research

**Researched:** 2026-03-14
**Domain:** Background loop orchestration (Node.js), p-queue/p-retry rate limiting, consecutive-cycle policy enforcement, SQLite state tracking, Commander.js CLI extension
**Confidence:** HIGH — all findings derived from installed package readmes (p-queue 9.1.0, p-retry 7.1.1) and direct codebase inspection; no training-data-only claims

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auto-removal policy**
- **10 consecutive low-score cycles** triggers auto-removal (not a rolling window — consecutive streak)
- Score threshold: Claude's Discretion (pick a sensible cutoff — 30 is a reasonable anchor)
- Score recovery counter reset behavior: Claude's Discretion (full reset on any above-threshold cycle is simplest)
- Confirmed-scam wallets (detection status = confirmed): Claude's Discretion — immediate removal on next cycle is the natural behavior given they're ineligible for scoring anyway

**Failure handling**
- Single wallet fetch failure (non-429): Claude's Discretion — skip + log + retry next cycle is the right default; don't retry within the same cycle to avoid stalling other wallets
- Global 429 rate-limit scenario: Claude's Discretion — p-queue with exponential backoff already in place; drain in-flight, pause before next cycle dispatch
- Persistent fetch failures vs auto-removal counter: Claude's Discretion — fetch errors are infrastructure, not wallet quality; don't accumulate toward removal counter
- Loop crash recovery: Claude's Discretion — auto-restart with delay (catch top-level errors, wait ~30s, restart cycle)

**Loop startup and control**
- **Loop auto-starts when the process launches** AND supports explicit CLI control (`wallet monitor start` / `wallet monitor pause` / `wallet monitor stop`)
- Startup dispatch strategy: Claude's Discretion — stagger wallet fetches to avoid burst traffic on startup
- Mid-import recovery on restart: Claude's Discretion — resume incomplete imports (history_complete = false) before entering steady-state cycle
- Pause behavior when user runs pause: Claude's Discretion — graceful finish of current in-flight cycle before pausing is cleanest

**Removal review UX**
- Command pattern: Claude's Discretion — `wallet removals list` as a dedicated subcommand is cleaner than a flag on `wallet list`
- Info shown per removal: Claude's Discretion — show address, label, score at time of removal, detection status, reason, and timestamp (full context for informed decisions)
- Restore behavior: Claude's Discretion — re-add wallet and keep existing swap data; only trigger fresh incremental fetch (not full re-import) since history is already there
- Removal notifications: Claude's Discretion — log to stdout during the cycle it happens; removal is a significant event worth surfacing

### Claude's Discretion
- Exact score threshold for removal trigger (30 is a reasonable baseline)
- Counter reset behavior on score recovery
- Confirmed-scam immediate removal logic
- Single-wallet fetch failure handling within/across cycles
- 429 global backoff strategy
- Fetch failure vs removal counter relationship
- Loop crash recovery mechanism
- Startup stagger implementation
- Mid-import resume logic
- Pause/stop graceful shutdown
- CLI command naming under `wallet removals`
- Exact removal log output columns
- Restore mechanism (incremental vs full re-import)
- Removal event stdout format

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MNTR-01 | System polls all tracked wallets on a ~30-second cycle | Implemented via a `setInterval`-style async loop with a top-level `catch` + restart. A dedicated `MonitorLoop` class holding loop state is the clean encapsulation boundary. |
| MNTR-02 | System uses incremental fetching per wallet (only transactions since last_checked_at) after first import | `wallets.last_checked_at` column already exists. `importerHistory.ts` already sets it. In steady state, pass `last_checked_at` as `afterTimestamp` to `fetchSwapHistory`. Wallets with `history_complete = false` are resumed first (startup path) then excluded from cycle until complete. |
| MNTR-03 | System rate-limits all Helius API calls (max 5 concurrent, exponential backoff on 429 responses) | p-queue 9.1.0 is installed. Current `heliusQueue` is module-level with `{ interval: 1000, intervalCap: 2 }` — free-tier config. For Phase 5 the queue must be reconfigured/accessible for `concurrency: 5`. 429 backoff: p-retry 7.1.1's `onFailedAttempt` + `shouldRetry` already used in `fetchSwapHistory`; needs explicit 429 detection and exponential wait. |
| RMVL-01 | Auto-removes wallet when score falls below threshold for N consecutive cycles | Requires a `low_score_streak` counter on the `wallets` table (new column via migration). Score threshold = 30. Counter increments when score < 30, resets to 0 when score >= 30 or score is null (dormant). At 10 consecutive cycles: remove wallet. Fetch failures must NOT increment this counter. |
| RMVL-02 | Auto-removes wallet when bundle/scam detection reaches "confirmed" confidence level | `detection_status` column already exists on `wallets`. Maps to `confirmed_suspicious` (existing enum value). Loop checks this after each `runDetection` call; immediate removal if `confirmed_suspicious`. No N-cycle delay needed. |
| RMVL-03 | Auto-removes wallet after configurable days of inactivity (no trades) | Requires a `last_trade_at` column on `wallets` (new column via migration). Set to the most recent swap timestamp during import and after each incremental fetch. Configurable inactivity window (default 30 days). Checked per cycle. |
| RMVL-04 | System logs all removals with reason, timestamp, and detection details — removals are auditable and reversible | `removal_log` table already exists in schema. Missing columns: `label` (wallet label at time of removal) and `score_at_removal` (snapshot of score). Need migration. Restore via `wallet removals restore <address>`: re-set `status = 'tracked'`, update `restored_at` in removal_log, trigger incremental fetch (not full re-import). |
</phase_requirements>

---

## Summary

Phase 5 wires together all prior phases into a continuously running pipeline. The monitoring loop drives: incremental fetch → parse → detect → score for every tracked wallet every 30 seconds, plus enforces three auto-removal policies. The good news: nearly all the building blocks exist. The loop itself is the new net addition; the per-wallet pipeline (fetch, parse, detect, score) is fully implemented and just needs to be called in sequence per wallet per cycle.

The most important architectural decision is the shape of the loop: a `MonitorLoop` class that holds pause state, the p-queue reference, and the cycle timer. This is cleaner than a bare `setInterval` because it gives the CLI commands (`wallet monitor start/pause/stop`) a handle to mutate loop state. The loop runs as a fire-and-forget background process that starts automatically when `cli.ts` loads, analogous to how `resumeImportingWallets()` already runs at startup.

Three schema additions are required: `wallets.low_score_streak` (integer, default 0), `wallets.last_trade_at` (integer, nullable), and two columns on `removal_log` (`label` text nullable, `score_at_removal` real nullable). All require a new Drizzle migration. The `heliusQueue` in `helius.ts` needs to be promoted from a free-tier 2-req/s config to a proper 5-concurrent config for Phase 5, or the loop should instantiate its own queue instance with the right parameters.

**Primary recommendation:** Build `src/monitor/loop.ts` as the core engine (a `MonitorLoop` class with `start/pause/stop` methods and an internal cycle method), `src/monitor/removal.ts` for the three removal policy checks, and extend the `wallet` Commander command with a `monitor` subcommand and a `removals` subcommand. Two schema migrations: one adding the new columns, one adding indexes for streak and last_trade_at lookups.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-queue | 9.1.0 (installed) | Concurrency-limited queue for Helius API calls | Already used in `helius.ts`; supports `pause()`, `start()`, `onIdle()`, `onPendingZero()` — all needed for graceful shutdown |
| p-retry | 7.1.1 (installed) | Exponential backoff on 429 responses | Already wraps `fetchSwapHistory`; `onFailedAttempt` callback + `shouldRetry` covers 429 detection cleanly |
| drizzle-orm | ^0.45.1 (installed) | Schema migration + DB writes for new columns and removal_log entries | Already the project ORM; synchronous better-sqlite3 driver, no async needed for DB writes in cycle |
| commander | ^11.1.0 (installed) | `wallet monitor` and `wallet removals` subcommands | Already used for all CLI commands |
| chalk | ^5.3.0 (installed) | Cycle log output, removal event formatting | Already used throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-kit | ^0.31.9 (installed) | Generate migration SQL for new columns | Run after schema.ts changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue for concurrency | Custom semaphore | p-queue already installed, battle-tested, has exactly the pause/resume API needed |
| setInterval-style loop | node-cron | setInterval is sufficient for a 30s cycle; node-cron adds a dependency for no gain here |
| In-memory streak counter | Redis | SQLite column is simpler and survives process restart |

**Installation:** No new packages required. All dependencies already in project.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── monitor/
│   ├── loop.ts          # MonitorLoop class — cycle scheduling, pause/stop state
│   ├── removal.ts       # Three removal policy checks (score streak, scam, inactivity)
│   └── index.ts         # Re-exports MonitorLoop, createMonitorLoop factory
├── commands/
│   ├── wallet.ts        # Existing — add `monitor` and `removals` subcommands here
│   └── ...
└── cli.ts               # Import MonitorLoop, call loop.start() after resumeImportingWallets()
```

### Pattern 1: MonitorLoop Class

**What:** A stateful class that owns the loop timer, pause flag, and queue reference. Cycle method runs the full pipeline per wallet sequentially (fetch → parse → detect → score → policy check).

**When to use:** Any background process that needs CLI-controlled start/pause/stop with graceful drain.

```typescript
// Source: p-queue readme (queue.pause(), queue.start(), queue.onIdle())
// Source: p-queue readme (queue.onPendingZero() — drain in-flight before pausing)

export class MonitorLoop {
  private paused = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async start(): Promise<void> {
    this.paused = false;
    this.stopped = false;
    await this.runCycle(); // first cycle immediately
  }

  pause(): void {
    this.paused = true;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async runCycle(): Promise<void> {
    if (this.stopped) return;
    if (this.paused) {
      // poll for unpause
      this.timer = setTimeout(() => this.runCycle(), 5_000);
      return;
    }

    try {
      await this.processCycle();
    } catch (err) {
      console.error('[monitor] cycle crashed, restarting in 30s', err);
    }

    if (!this.stopped) {
      this.timer = setTimeout(() => this.runCycle(), 30_000);
    }
  }

  private async processCycle(): Promise<void> {
    // 1. Load all wallets with status='tracked' and history_complete=true
    // 2. For each wallet: fetch incremental → parse → detect → score → removal check
    // 3. Stagger via small delay between dispatches (e.g. 200ms per wallet)
  }
}
```

### Pattern 2: Incremental Fetch per Wallet

**What:** Use `wallets.last_checked_at` as `afterTimestamp` for `fetchSwapHistory`. After each successful fetch, update `last_checked_at = Date.now()`.

```typescript
// Derived from existing importers/history.ts pattern
// last_checked_at is already set during import; in steady state use it directly

const afterTimestamp = Math.floor((wallet.last_checked_at ?? 0) / 1000);
const newTxs = await fetcher.fetchSwapHistory(wallet.address, afterTimestamp);
// parse → detect → score
db.update(wallets).set({ last_checked_at: Date.now() }).where(eq(wallets.address, address)).run();
```

### Pattern 3: p-queue for 5-Concurrent Helius Calls

**What:** Instantiate a single shared PQueue with `concurrency: 5` (not the current `{ interval: 1000, intervalCap: 2 }` free-tier config). This replaces or complements the existing module-level `heliusQueue`.

```typescript
// Source: p-queue 9.1.0 readme
// Current heliusQueue in helius.ts uses interval-based rate limiting (2/s) — free tier
// Phase 5 requirement is concurrency: 5, not interval-based
// Decision: MonitorLoop creates its own PQueue instance and injects into fetcher,
// OR HeliusFetcher is updated to accept an external queue reference.

const monitorQueue = new PQueue({ concurrency: 5 });
```

**Note on existing heliusQueue:** The current `heliusQueue` in `helius.ts` is module-level and uses `{ interval: 1000, intervalCap: 2 }`. This is free-tier config. For Phase 5, either:
- Reconfigure it to `{ concurrency: 5 }` (keep module-level but change params), or
- Make `HeliusFetcher` accept an optional external queue (allows per-use-case config)

The simplest path: update `heliusQueue` to `new PQueue({ concurrency: 5 })` since all Helius calls project-wide should share the same concurrency budget.

### Pattern 4: 429 Global Backoff

**What:** When a 429 is returned, drain in-flight requests, then pause the queue before the next cycle dispatch. p-retry's `onFailedAttempt` already handles per-request retry with backoff. The global 429 scenario is when the queue itself gets saturated.

```typescript
// Source: p-retry 7.1.1 readme — shouldRetry + onFailedAttempt
// Existing fetchSwapHistory already uses pRetry with retries: 3
// For 429 specifically: detect status 429 in onFailedAttempt, add exponential delay

onFailedAttempt: async (context) => {
  const status = (context.error as any)?.response?.status;
  if (status === 429) {
    // Exponential backoff: 1s, 2s, 4s... capped at 30s
    const delay = Math.min(1000 * 2 ** context.attemptNumber, 30_000);
    await new Promise(r => setTimeout(r, delay));
  }
  if (status === 401) throw context.error; // abort — bad key
},
shouldRetry: ({ error }) => {
  const status = (error as any)?.response?.status;
  return status === 429 || status >= 500; // retry 429 and server errors only
}
```

### Pattern 5: Graceful Pause (drain in-flight)

**What:** When `wallet monitor pause` is called, the loop sets `paused = true`. The current in-flight cycle runs to completion before the loop goes dormant. No need to drain the p-queue explicitly because the cycle waits for `processCycle()` to resolve before scheduling the next `setTimeout`.

```typescript
// Source: p-queue readme — queue.onPendingZero()
// For hard stop (wallet monitor stop): clear timer, optionally drain queue
stop(): void {
  this.stopped = true;
  if (this.timer) clearTimeout(this.timer);
  // queue.clear() to drop any remaining queued items
}
```

### Pattern 6: Startup Stagger

**What:** Avoid bursting all wallet fetches simultaneously on startup. Add a small per-wallet delay (200-500ms) when dispatching wallets in the first cycle.

```typescript
// No external library needed — simple loop with setTimeout promise
for (let i = 0; i < wallets.length; i++) {
  await new Promise(r => setTimeout(r, i * 200)); // 200ms stagger between dispatches
  walletQueue.push(wallets[i].address);           // or inline processing
}
```

### Pattern 7: Consecutive Streak Policy

**What:** `wallets.low_score_streak` column (integer, default 0) increments each cycle a wallet's score < 30. Resets to 0 on score >= 30. At 10: auto-remove. Fetch failures do NOT touch the counter.

```typescript
// Pure DB logic — no external library
if (fetchFailed) {
  // skip: don't touch low_score_streak
} else if (score !== null && score < REMOVAL_THRESHOLD) {
  db.update(wallets).set({ low_score_streak: currentStreak + 1 }).where(...).run();
  if (currentStreak + 1 >= REMOVAL_STREAK_LIMIT) {
    await autoRemoveWallet(address, 'low_score_streak');
  }
} else {
  // score >= threshold OR null-but-not-dormant: reset
  db.update(wallets).set({ low_score_streak: 0 }).where(...).run();
}
```

### Anti-Patterns to Avoid

- **Storing streak in memory only:** Process restart would lose streak state. Use `wallets.low_score_streak` DB column.
- **Running detection on every cycle regardless:** Detection is expensive. Use `runDetectionIfNeeded` (already exists in `detection/engine.ts`) — it skips if no new swaps since last check.
- **Calling `scoreWallet` instead of `scoreWalletIfNeeded`:** `scoreWalletIfNeeded` already exists in `scoring/engine.ts` and guards against redundant recomputes. Use it.
- **Incrementing streak on dormant wallets:** Dormant wallets (no recent trades) return `score = null`. Don't count null as a low score for streak purposes — the wallet isn't actively degrading, it's inactive (covered by RMVL-03 separately).
- **Global setInterval instead of recursive setTimeout:** `setInterval` doesn't account for cycle execution time, causing overlap. Recursive `setTimeout` at end of cycle is correct.
- **Sharing heliusQueue across loop and CLI commands without coordination:** The current module-level queue is shared. This is fine — all Helius calls share a global concurrency budget.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrency limiting | Custom semaphore / counter | p-queue (installed) | Already in use; has pause/start/onIdle/onPendingZero built in |
| Exponential backoff | Custom retry loop with sleep | p-retry (installed) | Already wraps fetchSwapHistory; factor/minTimeout/maxTimeout config covers all cases |
| DB migrations | Hand-writing ALTER TABLE | drizzle-kit generate | Already the project pattern; generates correct SQL snapshots |
| Incremental fetch cursor | Custom pagination state | `wallets.last_checked_at` column | Already exists and is set by importers; just pass it as afterTimestamp |

**Key insight:** The pipeline (fetch → parse → detect → score) is fully built. Phase 5 is orchestration — calling existing functions in the right order, in a loop, with the right state management. The risk of over-engineering is high here; keep the loop simple.

---

## Common Pitfalls

### Pitfall 1: Scoring Ineligible Wallets in the Loop
**What goes wrong:** Calling `scoreWallet()` on wallets with `history_complete = false` or `detection_status != 'confirmed_passing'` — the function silently returns but wastes time.
**Why it happens:** The scoring engine has an internal eligibility gate, but querying only eligible wallets in the loop is more efficient.
**How to avoid:** Loop query should filter: `status = 'tracked' AND history_complete = true`. Detection eligibility is checked inside `scoreWallet` but costs a DB read — filter at query level.
**Warning signs:** Cycle time growing proportional to total wallet count including ineligible ones.

### Pitfall 2: `confirmed_suspicious` vs `confirmed_passing` Confusion
**What goes wrong:** The removal policy for RMVL-02 targets `confirmed_suspicious` wallets. The existing `detection_status` enum does NOT have a bare `confirmed` value — it has `confirmed_suspicious` and `confirmed_passing`. The CONTEXT.md says "confirmed-scam wallets (detection status = confirmed)" but the schema value is `confirmed_suspicious`.
**Why it happens:** CONTEXT.md uses shorthand; schema uses full enum.
**How to avoid:** Match on `detection_status = 'confirmed_suspicious'` in removal policy code.

### Pitfall 3: Streak Counter Incrementing on Fetch Failure
**What goes wrong:** A wallet that fails to fetch due to network issues accumulates streak points and gets removed despite having no evidence of score degradation.
**Why it happens:** Easy to conflate "no score update" with "bad score".
**How to avoid:** Only touch `low_score_streak` when a real score was computed (or previous score is confirmed below threshold). Fetch failures: log, skip, continue. Don't update streak.

### Pitfall 4: removal_log Missing Context Columns
**What goes wrong:** `wallet removals list` can't show label or score at time of removal because `removal_log` only stores `wallet_address`, `reason`, `detection_details`, `removed_at`, `removed_by`, `restored_at`. Label and score must be snapshotted at removal time — after removal, `wallets.status = 'removed'` so a join is possible, but label could be changed before restore.
**Why it happens:** The existing `removal_log` table was designed in Phase 0 before Phase 5 details were known.
**How to avoid:** Add `label` (text, nullable) and `score_at_removal` (real, nullable) to `removal_log` via migration. Snapshot both at auto-removal time.

### Pitfall 5: Concurrent Cycle Overlap
**What goes wrong:** If the 30s cycle takes longer than 30s (many wallets, slow API), `setInterval` fires a second cycle while the first is still running.
**Why it happens:** Fixed interval, variable execution time.
**How to avoid:** Use recursive `setTimeout` — next cycle is scheduled only after `processCycle()` resolves. The 30s gap becomes minimum-30s between cycles, not exactly 30s.

### Pitfall 6: `resumeImportingWallets` Blocks Cycle Start
**What goes wrong:** If there are many wallets with `history_complete = false` at startup, `resumeImportingWallets()` can run for minutes, delaying the first monitoring cycle.
**Why it happens:** `resumeImportingWallets` runs sequentially per wallet.
**How to avoid:** Start the monitoring loop in parallel with `resumeImportingWallets`. The loop's wallet query filters on `history_complete = true`, so importing wallets are simply not included in cycles until their import completes. No synchronization needed.

### Pitfall 7: `last_trade_at` Inactivity Check Without the Column
**What goes wrong:** RMVL-03 (inactivity removal) requires knowing when the wallet last made a trade. `wallets.last_checked_at` is when the system last checked, not when the wallet last traded — these are different.
**Why it happens:** Easy to confuse "last checked" with "last active".
**How to avoid:** Add `last_trade_at` column to `wallets`. Set it during import to `max(swap.timestamp)` for that wallet. Update it during incremental fetch if any new swaps arrive. Check `last_trade_at` (not `last_checked_at`) for inactivity policy.

---

## Code Examples

Verified patterns from official sources:

### p-queue Pause/Resume (Source: p-queue 9.1.0 readme)
```typescript
const queue = new PQueue({ concurrency: 5 });

// Pause — new tasks queue but don't execute
queue.pause();

// Drain currently running tasks before pausing
await queue.onPendingZero();
// Now safe to inspect state — all in-flight done

// Resume
queue.start();
// Returns `this` — chainable
```

### p-queue Drain on Stop (Source: p-queue 9.1.0 readme)
```typescript
// Wait for all tasks (queued + in-flight) to complete
await queue.onIdle();
// queue.size === 0 && queue.pending === 0

// Or just wait for in-flight (ignore queued):
await queue.onPendingZero();

// Drop everything not yet started:
queue.clear();
```

### p-retry with 429 Detection (Source: p-retry 7.1.1 readme)
```typescript
import pRetry, { AbortError } from 'p-retry';

const result = await pRetry(
  async () => {
    const res = await axios.get(url, { params });
    return res.data;
  },
  {
    retries: 5,
    factor: 2,
    minTimeout: 1_000,
    maxTimeout: 30_000,
    randomize: true,
    onFailedAttempt: async (context) => {
      const status = (context.error as any)?.response?.status;
      if (status === 401) throw new AbortError('Invalid API key');
      if (status === 404) throw new AbortError('Not found');
      // 429 and 5xx fall through to retry with backoff
    },
    shouldRetry: ({ error }) => {
      const status = (error as any)?.response?.status;
      if (status === 401 || status === 404) return false;
      return true;
    },
  }
);
```

### Removal Log Write (derived from existing schema)
```typescript
import { db } from '../db/index.js';
import { wallets, removal_log } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function autoRemoveWallet(
  address: string,
  reason: 'low_score_streak' | 'confirmed_scam' | 'inactivity',
  scoreAtRemoval: number | null,
): Promise<void> {
  const wallet = db.select().from(wallets).where(eq(wallets.address, address)).get();
  if (!wallet) return;

  const now = Date.now();

  // Write removal log (with snapshotted label + score)
  db.insert(removal_log).values({
    wallet_address: address,
    label: wallet.label ?? null,           // new column
    score_at_removal: scoreAtRemoval,       // new column
    reason,
    detection_details: wallet.detection_status ?? null,
    removed_at: now,
    removed_by: 'auto',
  }).run();

  // Mark wallet as removed
  db.update(wallets)
    .set({ status: 'removed', low_score_streak: 0 })
    .where(eq(wallets.address, address))
    .run();

  console.log(
    `[auto-removal] ${address} (${wallet.label ?? 'no label'}) removed — reason: ${reason}, score: ${scoreAtRemoval ?? 'null'}`
  );
}
```

### Restore Wallet (derived from schema + context decisions)
```typescript
// Restore: re-set status='tracked', mark restored_at in removal_log,
// trigger incremental fetch (NOT full re-import — history is already there)
async function restoreWallet(address: string): Promise<void> {
  const logEntry = db.select().from(removal_log)
    .where(eq(removal_log.wallet_address, address))
    .orderBy(desc(removal_log.removed_at))
    .get();

  if (!logEntry) throw new Error(`No removal record found for ${address}`);

  db.update(removal_log)
    .set({ restored_at: Date.now() })
    .where(eq(removal_log.id, logEntry.id))
    .run();

  db.update(wallets)
    .set({ status: 'tracked', low_score_streak: 0 })
    .where(eq(wallets.address, address))
    .run();

  // Incremental fetch only — last_checked_at still set from before removal
  // MonitorLoop will pick this wallet up on the next cycle automatically
}
```

---

## Schema Additions Required

### New Columns on `wallets`
```sql
-- Tracks consecutive low-score cycles for RMVL-01
ALTER TABLE wallets ADD COLUMN low_score_streak INTEGER NOT NULL DEFAULT 0;

-- Tracks last swap timestamp for RMVL-03 inactivity check
ALTER TABLE wallets ADD COLUMN last_trade_at INTEGER;
```

### New Columns on `removal_log`
```sql
-- Snapshot label + score at removal time for `wallet removals list` display
ALTER TABLE removal_log ADD COLUMN label TEXT;
ALTER TABLE removal_log ADD COLUMN score_at_removal REAL;
```

### Index for Cycle Queries
```sql
-- Speeds up: SELECT * FROM wallets WHERE status='tracked' AND history_complete=1
CREATE INDEX wallets_cycle_query ON wallets (status, history_complete);
```

All four changes go in a single new migration file generated via `drizzle-kit generate`.

---

## CLI Command Structure

### `wallet monitor` subcommand
```
wallet monitor start    # (re)start the loop — sets paused=false
wallet monitor pause    # pause after current cycle completes
wallet monitor stop     # stop loop — clears timer
wallet monitor status   # print: running/paused/stopped, cycle count, last cycle time
```

### `wallet removals` subcommand
```
wallet removals list              # tabular: address, label, score, reason, removed_at
wallet removals restore <address> # restore wallet, mark restored_at in log
```

Both subcommands are added to the existing `createWalletCommand()` in `src/commands/wallet.ts` — no new command file needed. The `MonitorLoop` singleton must be accessible from the CLI action handlers. Two options:
1. Pass the `MonitorLoop` instance into `createWalletCommand()` as a parameter.
2. Export a module-level singleton from `src/monitor/index.ts` and import it directly in the command handlers.

Option 2 is simpler and consistent with how `db` is exported from `src/db/index.ts`.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `setInterval` for background loops | Recursive `setTimeout` after async completion | Prevents cycle overlap when execution > interval |
| In-memory state for loop control | DB column (`low_score_streak`) + singleton class | Survives process restarts; CLI commands can read state |
| p-queue `{ interval: 1000, intervalCap: 2 }` | p-queue `{ concurrency: 5 }` | Switches from rate-per-second to concurrent-request model; appropriate for Phase 5 scale |

**Deprecated/outdated:**
- The existing `heliusQueue` config (`interval: 1000, intervalCap: 2`) is a free-tier config used during development. Phase 5 must update this to `{ concurrency: 5 }` per MNTR-03.

---

## Open Questions

1. **Should `heliusQueue` be a module-level singleton or injected per use?**
   - What we know: Currently module-level in `helius.ts`; works for single-caller case.
   - What's unclear: If `MonitorLoop` and CLI commands both call `HeliusFetcher`, they share the queue automatically with the singleton approach. With injection, the loop can own and pause/resume the queue independently.
   - Recommendation: Keep module-level singleton but update config to `{ concurrency: 5 }`. The loop doesn't need to pause the queue independently — it just waits for cycles to complete before scheduling the next one.

2. **Inactivity window for RMVL-03 — where is "configurable" configured?**
   - What we know: CONTEXT.md says "configurable days of inactivity" but doesn't specify where the config lives.
   - What's unclear: Env var? Constant in code? CLI flag?
   - Recommendation: Define as a named constant (`INACTIVITY_REMOVAL_DAYS = 30`) in the removal module. Making it a `.env` var adds complexity with no clear use case yet.

3. **What happens to `wallets` rows with `status = 'removed'` — are they kept or deleted?**
   - What we know: `wallets.status` enum includes `'removed'`. Current `wallet list` filters on `status IN ('tracked', 'importing')` — removed wallets are excluded from display.
   - What's unclear: Over time, removed wallets accumulate. Is there a cleanup policy?
   - Recommendation: Keep removed wallets in the table (they're needed for restore). This is already how the schema is designed. No cleanup needed in Phase 5.

---

## Sources

### Primary (HIGH confidence)
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/node_modules/p-queue/readme.md` — PQueue constructor options, `pause()`, `start()`, `onIdle()`, `onPendingZero()`, `clear()`, `size`, `pending`
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/node_modules/p-retry/readme.md` — `pRetry` options: `retries`, `factor`, `minTimeout`, `maxTimeout`, `randomize`, `onFailedAttempt`, `shouldRetry`, `AbortError`
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/db/schema.ts` — Full schema including `wallets`, `removal_log`, `score_history` tables
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/fetchers/helius.ts` — Existing queue config and `fetchSwapHistory` pagination/retry pattern
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/importers/history.ts` — `importWalletHistory`, `resumeImportingWallets`, `last_checked_at` usage
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/scoring/engine.ts` — `scoreWallet`, `scoreWalletIfNeeded`, `scoreAllEligible` — all callable from the loop
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/detection/engine.ts` — `runDetection`, `runDetectionIfNeeded` — detection entry points
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/cli.ts` — Startup pattern, `resumeImportingWallets` call, Commander setup
- `/Users/irfanmurad/Developer/vessl/echo-wallet-tracking/src/commands/wallet.ts` — Existing subcommand structure to extend

### Secondary (MEDIUM confidence)
- None required — all findings derived from installed source or codebase inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed `package.json` and `node_modules` readmes
- Architecture: HIGH — derived from existing codebase patterns; no new libraries needed
- Schema additions: HIGH — derived from requirements and existing schema inspection
- Pitfalls: HIGH — derived from existing code patterns and requirement analysis

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable libraries, internal codebase; unlikely to change)
