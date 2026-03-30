---
phase: 02-transaction-parsing
plan: 02
subsystem: parsing
tags: [helius, swap-parser, fifo, cost-basis, pnl, tdd]

# Dependency graph
requires:
  - phase: 02-01
    provides: DEX_PROGRAM_IDS_MAP, HeliusTransaction types, SwapRow interface
provides:
  - parseSwaps function — transforms HeliusTransaction arrays into SwapRow objects for all 5 supported DEXes
  - applyFifo function — FIFO cost basis calculation producing realized_pnl_sol on sell rows
  - src/parsers/swap.ts — complete implementation ready for orchestrator import
affects: [02-03, 03-filtering, any phase importing parsers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DEX identification via DEX_PROGRAM_IDS_MAP iteration (first matching programId wins)
    - FIFO lot tracking with Map<tokenMint, lot[]> and epsilon 1e-9 for float drift
    - events.swap normalization: always Array.isArray-coerce to array before accessing [0]

key-files:
  created:
    - src/parsers/swap.ts
  modified:
    - tests/unit/parsers.test.ts

key-decisions:
  - "fee_sol computed as tx.fee / 1e9 — Helius API returns fee in lamports, not SOL"
  - "applyFifo returns new array (does not mutate input) — callers can safely pass same array twice"
  - "Partial orphan (lots exhaust mid-sell) and full orphan both set cost_basis_sol=null, realized_pnl_sol=null"

patterns-established:
  - "Swap parser: skip silently on unknown DEX, wrong type, token-to-token — never produce error result"
  - "FIFO: sort by timestamp ASC before processing, then apply lot queue per token_mint"

requirements-completed: [PARS-01, PARS-03]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 02 Plan 02: Swap Parser and FIFO Cost Basis Summary

**parseSwaps + applyFifo in src/parsers/swap.ts: SOL-swap extraction from Helius events with FIFO cost basis and realized PnL for all 5 DEXes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T14:04:04Z
- **Completed:** 2026-03-11T14:09:00Z
- **Tasks:** 2 (RED phase + GREEN phase)
- **Files modified:** 2

## Accomplishments

- parseSwaps correctly filters SWAP-type transactions, identifies DEX via DEX_PROGRAM_IDS_MAP, skips unknown programIds silently, skips token-to-token swaps, normalizes events.swap as object or array
- applyFifo applies FIFO lot queues per token_mint with epsilon 1e-9 guard; full match sets cost_basis_sol and realized_pnl_sol; partial and full orphans return both as null
- All 13 parser tests pass; full 29-test suite passes with zero TypeScript errors and no regressions

## Task Commits

Each task was committed atomically:

1. **RED phase: update parsers.test.ts with locked design tests** - `b96fd05` (test) — committed in prior session
2. **GREEN phase: implement src/parsers/swap.ts** - `5a4b778` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD plan — RED commit pre-existed from prior session; GREEN commit is this session._

## Files Created/Modified

- `src/parsers/swap.ts` — parseSwaps and applyFifo implementation (218 lines)
- `tests/unit/parsers.test.ts` — 13 tests covering buy/sell parsing, all 5 DEXes, skip cases, FIFO scenarios

## Decisions Made

- fee_sol computed as `tx.fee / 1e9` — confirmed Helius returns fee in lamports, not SOL
- applyFifo returns a new array (spread copy per row) and does not mutate input
- Partial orphan (lots run out mid-sell) treated identically to full orphan: both fields null

## Deviations from Plan

None - plan executed exactly as written. Implementation was pre-staged (RED phase committed prior session, GREEN phase committed this session).

## Issues Encountered

None — implementation was already complete and correct when this session started; GREEN phase commit was the only outstanding work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- parseSwaps and applyFifo are ready for the import orchestrator in Plan 03
- Both functions are exported from src/parsers/swap.ts with correct ESM .js import path
- SwapRow shape matches schema.ts swaps table — direct DB insertion ready
