# Phase 3: Bundle/Scam Detection - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Classify wallets as clean or suspicious using four detectors (bundler, dev wallet, sniper, wash trader) with tiered confidence gating. Only wallets with "confirmed passing" status are eligible for scoring. Detection runs before any metrics are calculated. Creating new CLI commands for override and review is in scope. The dashboard display of detection flags is out of scope (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Detection thresholds
- **Bias by type:** Flag more aggressively for bundlers and dev wallets (high certainty, low false-positive risk). Flag more conservatively for snipers and wash traders (circumstantial evidence, higher false-positive risk).
- **Specific thresholds:** Claude's Discretion — pick sensible defaults and document them. Thresholds are initial hypotheses expected to be tuned against real transaction data.
- **Dev wallet:** First-signal is sufficient (direct deployer transfer is very low false-positive). Implement what's reliably detectable from Helius enhanced transactions.
- **Bundler:** Require multiple independent events across separate tokens/launches before flagging.
- **Sniper:** Apply a higher bar (conservative) — flag only consistent patterns, not lucky early buyers.
- **Wash trader "related" definition:** Claude's Discretion — define relationship heuristics based on what's detectable from Helius data (shared funding source and/or direct SOL/token transfers between wallets are both reasonable signals).

### Confidence tier progression
- Tiers: `suspected` → `review` → `confirmed-suspicious` / `confirmed-passing`
- **Escalation:** Automatic (evidence accumulates) + user can manually force-promote or force-demote at any stage.
- **Confirmed passing:** Absence of flags after `history_complete=true` is sufficient — no active positive evidence required. Claude's Discretion on exact implementation.
- **Re-evaluation during monitoring:** Claude's Discretion — incremental re-evaluation (only wallets with new transactions) is preferred given the 30s loop.

### Flagged wallet visibility in CLI
- Flagged wallets (suspected/review/confirmed-suspicious) appear in a **separate section** from clean wallets in `wallet list` output.
- Status label is shown alongside each flagged wallet.

### False positive handling
- **Override command:** `wallet clear-flag <address>` — explicit CLI command to override detection.
- **Evidence before confirming:** Display the flagging reason and evidence, then prompt "Are you sure?" before clearing.
- **Re-flagging after clear:** Cleared wallets require significantly stronger evidence to be re-flagged by the same detector (not immune, but raised threshold).
- **Surfacing flagged wallets:** Dedicated `wallet review` command lists all wallets awaiting human review.

### Multi-flag behavior
- **Resolution:** Highest severity wins — the worst active flag determines the wallet's overall tier status.
- **Severity ranking (highest to lowest):** Bundler > Dev wallet > Wash trader > Sniper
- **Partial clear:** After clearing one flag with others remaining, status re-evaluates based on the highest remaining flag. Claude's Discretion on exact implementation.
- **Detection storage:** Claude's Discretion — store enough detail for the dashboard phase to display meaningful data (at minimum: flag types, evidence summary, confidence level, timestamps).

### Claude's Discretion
- Exact bundler coordination threshold (number of wallets, block window)
- Exact sniper threshold (number of launches required)
- Exact wash trader relationship definition
- Confirmed passing implementation details (absence-of-flags baseline)
- Incremental vs. full re-evaluation decision
- Tier recalculation logic after partial flag clear
- Detection record schema (what fields to store)
- Progress reporting / logging during detection runs

</decisions>

<specifics>
## Specific Ideas

- STATE.md note acknowledged: "bundle detection thresholds are initial hypotheses — false-positive risk is high, needs tuning against real transaction data." Thresholds should be constants that are easy to change, not magic numbers buried in logic.
- Dev wallet detection: most reliable signal is a direct token transfer from the deployer address in the same transaction as or immediately after deployment.
- The `wallet review` command should show each flagged wallet with its active flags, evidence summary, and tier — enough for the user to make a clear/escalate decision without needing to look elsewhere.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-bundle-scam-detection*
*Context gathered: 2026-03-11*
