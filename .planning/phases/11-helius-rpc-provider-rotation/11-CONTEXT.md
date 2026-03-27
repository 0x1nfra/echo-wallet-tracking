# Phase 11: Helius RPC Provider Rotation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a provider abstraction layer so all Helius API calls rotate to a fallback RPC provider when Helius fails persistently. Callers (MonitorLoop, discovery orchestrator) never see provider-level failures — they always get either data or a clean skip signal. Adding new provider UIs, metrics dashboards, or alert history are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Provider configuration
- Support Helius + one alternative provider (Claude selects whichever has best Solana enhanced transaction support and closest API shape to Helius — QuickNode is the likely choice)
- Providers configured via config file (.env or JSON) — pick the approach consistent with existing config patterns
- Fallback provider is optional but the system warns at startup if none is configured; it still starts and runs with Helius-only behavior

### Rotation trigger
- Rotate on **any persistent failure** after retries are exhausted: 429, 5xx, network timeouts, connection errors — not just rate limits
- Rotation is transparent to callers; they receive either data or a skip signal, never a provider error

### Rotation strategy
- **Claude's Discretion:** Choose rotation order (priority/failover vs round-robin) and per-call vs per-cycle granularity based on what is simplest to implement correctly with the existing p-queue/p-retry architecture
- **Claude's Discretion:** Choose whether failed providers have a cooldown period before retry — base decision on typical 429 window duration relative to the 30s cycle

### Graceful degradation
- **Claude's Discretion:** When all providers are exhausted for a wallet, decide whether to skip just that wallet or the full cycle — prefer isolating failure to minimize cycle disruption
- Send a Telegram alert when all providers are exhausted — user needs to know to check API keys / rate limits
- **Claude's Discretion:** Decide whether to surface provider health in CLI, dashboard, or logs only — pick the simplest surface that gives useful operational visibility
- **Claude's Discretion:** Decide whether provider rotation events are persisted to DB or log-only — be consistent with how removal_log and other system events are handled

### Provider normalization
- **Claude's Discretion:** Decide whether normalization lives inside the provider class or a separate adapter — keep provider-specific types from leaking to callers
- **Claude's Discretion:** Decide whether the alternative provider must implement all three methods (fetchTransactions, fetchEarlySwapsForMint, fetchEarlyBuyers) or can implement a subset — base on what the chosen provider's API actually supports
- **Claude's Discretion:** Decide whether to reuse existing HeliusTransaction types or introduce provider-agnostic types — minimize churn in existing codebase
- **Claude's Discretion:** Decide whether to wrap HeliusFetcher or refactor it into a provider class — minimize regression risk on the 184 passing tests

</decisions>

<specifics>
## Specific Ideas

- The existing p-queue + p-retry pattern for rate limiting is already in place — the provider abstraction should integrate with or sit above this, not replace it
- The 184 currently passing tests must remain green after the refactor — test safety is a hard constraint on how invasive the HeliusFetcher change can be

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-helius-rpc-provider-rotation*
*Context gathered: 2026-03-26*
