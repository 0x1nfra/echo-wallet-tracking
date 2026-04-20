# Phase 16: ProviderRouter Extension - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 16-providerrouter-extension
**Areas discussed:** Exhaustion behavior scope, Shyft action type verification, Fetcher dep wiring

---

## Exhaustion behavior scope

| Option | Description | Selected |
|--------|-------------|----------|
| Only getTransactionDetails throws | Safest — existing callers handle [] gracefully, no test changes needed | ✓ |
| Unify all methods to throw | Consistent across router, but requires updating MonitorLoop + discovery callers | |

**User's choice:** Only `getTransactionDetails` throws on exhaustion
**Notes:** Existing methods keep [] behavior to avoid regression risk in MonitorLoop and discovery callers.

---

## Shyft action type verification

| Option | Description | Selected |
|--------|-------------|----------|
| Mandatory research step in plan | Fetch real Shyft tx for known bundled CA, log raw action types before writing normalization code | ✓ |
| Implement defensively + live test | Implement with all 3 known variants now, validate via live environment after deploy | |

**User's choice:** Mandatory research step in plan
**Notes:** STATE.md already flagged this as a research risk — confirmed that plan must verify live Shyft response before implementing normalization.

---

## Fetcher dep wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Keep custom interfaces, update getDefaultFetcher() only | Zero change to test harnesses — only production singleton path changes | ✓ |
| Replace with Pick<RpcProvider, 'getTransactionDetails'> | Cleaner long-term, but requires touching test files | |

**User's choice:** Keep `BundlerFetcher`/`WashTraderFetcher` custom interfaces unchanged
**Notes:** 184 existing tests remain green — only `getDefaultFetcher()` production path changes to return the shared ProviderRouter instance.

---

## Claude's Discretion

- Return type of `getTransactionDetails` on `RpcProvider` (ProviderTransaction or minimal TransactionDetail)
- Whether `HeliusProvider` wraps `HeliusFetcher.getTransaction` directly or re-implements
- Rotation strategy within `tryCallGetTransactionDetails`

## Deferred Ideas

None.
