# Phase 10: Tech Debt Cleanup - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove schema type violations, dead exports, and leftover scaffolding that create false impressions of system behavior. Three concrete items: add 'manual' to detector enum, resolve getEligibleWallets() dead export, remove scoreWallet() stub from src/index.ts. Nothing new is added — only broken or misleading things are corrected.

</domain>

<decisions>
## Implementation Decisions

### 'manual' detector enum fix
- Add 'manual' to the Drizzle schema enum in schema.ts AND to the DetectorId union type / const — it becomes a proper first-class value everywhere
- No database migration needed — SQLite does not enforce Drizzle enum CHECK constraints at the DB level (consistent with Phase 2 enum expansion precedent)
- 'manual' is a user-only value — detectors never emit it. Whether to exclude it from detector iteration is Claude's Discretion.
- Production code as-any casts removed; test files left as-is (no test updates for this item)

### getEligibleWallets() removal
- Remove the function entirely — no wiring to a callsite
- Delete its tests too — dead function, dead tests, clean removal of the whole unit
- Audit all import sites before deleting (even apparently unused imports) to avoid breaking compilation

### scoreWallet() stub removal
- Remove the stub from src/index.ts
- Whether to leave the file minimal or delete it if empty is Claude's Discretion
- Whether to add a real re-export in its place is Claude's Discretion

### Cleanup scope
- Fix the 3 listed items first; if tsc reveals other errors in files already being touched, fix those too
- Errors in untouched files are out of scope — document and stop, do not expand
- Lint fixes (ESLint / no-unused-vars) are in scope for files already touched in this pass
- Phase is done when: tsc compiles cleanly AND full test suite passes (`pnpm test`)

### Claude's Discretion
- Whether 'manual' is excluded from detector iteration loops or just ignored
- Disposition of src/index.ts if it becomes empty after stub removal (leave minimal or delete)
- Whether to re-export any real scoring function from src/index.ts in place of the stub

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for type cleanup and dead code removal.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-tech-debt-cleanup*
*Context gathered: 2026-03-26*
