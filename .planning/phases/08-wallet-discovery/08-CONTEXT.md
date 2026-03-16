# Phase 8: Wallet Discovery - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatically grow the tracked wallet list by discovering profitable early traders from a token contract address (CA). Includes a scoring gate, 7-day probation, and graph traversal to find co-traders of discovered smart money wallets. Manual wallet management and existing monitoring are separate phases — this phase is discovery-only.

</domain>

<decisions>
## Implementation Decisions

### Discovery Command UX
- Command structure: Claude's discretion — fit within existing `wallet` subcommand pattern consistent with `wallet add`, `wallet list`, etc.
- Progress output: Streaming log lines while running (e.g. "Fetching early buyers... Found 23 candidates... Scoring... Added 5 wallets")
- Final output format: Claude's discretion — show what's most operationally useful to a user who wants to know what happened
- Dry-run flag: Claude's discretion — weigh simplicity vs utility of a `--dry-run` preview mode

### Scoring Gate & Rejection
- Score threshold: Default 70 (from roadmap), but user can override per-run with `--min-score` flag
- Rejected wallets: Claude's discretion — decide whether to persist rejections for auditability or discard them
- Already-tracked wallets: Skip silently — no output when a discovered wallet is already being tracked
- "Early buyer" definition: Claude's discretion — define early entry in whatever way is most meaningful as a signal of smart money (time window, first N buyers, or both)

### Graph Traversal Scope
- Traversal trigger: Automatic after direct discovery — one command does both (extract early buyers + traverse graph)
- Traversal depth: Claude's discretion — choose practical default depth for Helius free-tier (300 req/min); consider exposing `--depth` flag if deeper traversal is useful
- Co-trader definition: Claude's discretion — define in whatever way best reflects smart money clustering (same token + time window vs stronger on-chain proximity)
- Traversal gate: Claude's discretion — decide whether graph-found wallets use the same threshold as direct-found wallets or a stricter one to reflect lower initial trust

### Probation Visibility
- CLI wallet list: Two-section display — active wallets + probationary wallets shown separately
- Dashboard: Probationary wallets visible in their own section or tab (separate from active wallets)
- Probation graduation: Claude's discretion — decide whether auto-promotion is silent or triggers a Telegram notification
- Manual promotion: Claude's discretion — decide whether `wallet promote <address>` is worth the complexity vs enforcing the 7-day window consistently

### Claude's Discretion
- Command placement (wallet discover vs discover top-level)
- Final output format (all candidates vs added-only table)
- Dry-run flag decision
- Rejected wallet persistence
- Early buyer definition (time window vs first-N vs both)
- Graph traversal depth default and whether `--depth` flag is exposed
- Co-trader relationship definition
- Traversal scoring gate (same as direct vs stricter)
- Probation graduation notification
- Manual promotion command

</decisions>

<specifics>
## Specific Ideas

- STATE.md blocker: "Phase 8: Graph traversal at scale against Helius free-tier limits (300 req/min) needs validation during planning" — researcher should investigate how many API calls a typical discovery run costs and what batch strategies keep it within limits

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-wallet-discovery*
*Context gathered: 2026-03-16*
