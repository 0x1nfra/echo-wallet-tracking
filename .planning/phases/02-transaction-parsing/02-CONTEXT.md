# Phase 2: Transaction Parsing - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert raw Helius enhanced transaction API responses into normalized `Swap` objects for Pump.fun, Raydium, Jupiter, Orca, and Meteora. Covers full history import with pagination, FIFO cost basis tracking, and realized PnL per closed position. Detection, scoring, and monitoring are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Parse error handling
- When a transaction from a known DEX fails to parse, skip it silently and write to a `parse_errors` table (signature + error message + dex + timestamp only — no raw payload storage)
- High parse-failure rate on a wallet does NOT affect wallet processing — failures are invisible to the normal flow
- No console noise from parse errors during normal operation

### History import behavior
- Default import window: **180 days** back from wallet-add time
- `--full-history` flag available at wallet-add time for wallets where complete cost basis matters — opt-in per wallet to control Helius credit spend
- Wallets with history import in progress are **visible in wallet list** with an "importing" status — not hidden until complete
- Resume/restart behavior on interruption: Claude's discretion (pick whichever is simpler to implement correctly)
- Background vs. foreground import behavior: Claude's discretion (design around monitoring loop architecture)

### FIFO cost basis
- Position identity is **token mint address** — buy on Pump.fun and sell on Raydium for the same token = same position
- FIFO only — always match oldest buy lot first; no average cost fallback
- Orphaned sells (no buy found — outside window, or received from another wallet): **exclude from PnL and win rate entirely** — incomplete data is not counted as a win or a loss
- Multi-walling pattern (receive token, sell only) produces incomplete cost basis — those sells are silently excluded from metrics

### Unknown DEX / protocol handling
- Transactions from protocols outside the 5 supported DEXes: **skip silently** — no logging, no storage
- Unknown protocol transactions don't count against parse error metrics
- Buying on Pump.fun and selling on Raydium (graduation path): same token, same position — DEX-agnostic tracking by mint address

### Claude's Discretion
- Background vs. foreground import implementation detail (design to fit monitoring loop)
- Interruption/resume strategy for history import (simplest correct implementation)
- Exact `parse_errors` table schema beyond the four required fields
- Compression/batching of Helius pagination calls to minimize credit usage

</decisions>

<specifics>
## Specific Ideas

- Helius free tier credit constraints are real — pagination strategy should minimize redundant calls; batch size and cursor handling should be efficient
- Trading bots (BullX, Bonkbot, Trojan, etc.) are just clients that route through the 5 supported DEXes — no special handling needed for "bot" transactions; Helius already surfaces the underlying DEX
- Pump.fun is the primary launchpad — most memecoins start there before graduating to Raydium; the parser must handle both phases of a token's lifecycle correctly
- Dexscreener is a charting tool, not a DEX — no parser needed for it

</specifics>

<deferred>
## Deferred Ideas

- Support for additional DEX protocols (Phoenix, Lifinity, OpenBook) — low priority, revisit if wallets show significant activity on these
- Automatic credit usage tracking / alerting when Helius free tier is near exhaustion — monitoring phase or future phase
- Multi-wallet position tracking (aggregate positions across wallets the user controls) — architectural complexity, out of scope for v1

</deferred>

---

*Phase: 02-transaction-parsing*
*Context gathered: 2026-03-11*
