# Phase 5: Monitoring Loop and Auto-Removal - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

A background process that drives the full pipeline (fetch → parse → detect → score) on a 30-second cycle for all tracked wallets, plus a policy-based auto-removal system that removes wallets that persistently degrade. Monitoring UI, Telegram alerts, and signal generation are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Auto-removal policy
- **10 consecutive low-score cycles** triggers auto-removal (not a rolling window — consecutive streak)
- Score threshold: Claude's Discretion (pick a sensible cutoff — 30 is a reasonable anchor)
- Score recovery counter reset behavior: Claude's Discretion (full reset on any above-threshold cycle is simplest)
- Confirmed-scam wallets (detection status = confirmed): Claude's Discretion — immediate removal on next cycle is the natural behavior given they're ineligible for scoring anyway

### Failure handling
- Single wallet fetch failure (non-429): Claude's Discretion — skip + log + retry next cycle is the right default; don't retry within the same cycle to avoid stalling other wallets
- Global 429 rate-limit scenario: Claude's Discretion — p-queue with exponential backoff already in place; drain in-flight, pause before next cycle dispatch
- Persistent fetch failures vs auto-removal counter: Claude's Discretion — fetch errors are infrastructure, not wallet quality; don't accumulate toward removal counter
- Loop crash recovery: Claude's Discretion — auto-restart with delay (catch top-level errors, wait ~30s, restart cycle)

### Loop startup and control
- **Loop auto-starts when the process launches** AND supports explicit CLI control (`wallet monitor start` / `wallet monitor pause` / `wallet monitor stop`)
- Startup dispatch strategy: Claude's Discretion — stagger wallet fetches to avoid burst traffic on startup
- Mid-import recovery on restart: Claude's Discretion — resume incomplete imports (history_complete = false) before entering steady-state cycle
- Pause behavior when user runs pause: Claude's Discretion — graceful finish of current in-flight cycle before pausing is cleanest

### Removal review UX
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

</decisions>

<specifics>
## Specific Ideas

- The 10-cycle streak is the only hard user preference — everything else is delegated to Claude
- Loop control follows the "auto-start with CLI override" pattern: process running = loop running by default, but user can pause/stop without killing the process

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-monitoring-loop-and-auto-removal*
*Context gathered: 2026-03-14*
