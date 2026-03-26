# Phase 10: Tech Debt Cleanup - Research

**Researched:** 2026-03-26
**Domain:** TypeScript type system cleanup, dead code removal, Drizzle schema enum expansion
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 'manual' detector enum fix
- Add 'manual' to the Drizzle schema enum in schema.ts AND to the DetectorId union type / const — it becomes a proper first-class value everywhere
- No database migration needed — SQLite does not enforce Drizzle enum CHECK constraints at the DB level (consistent with Phase 2 enum expansion precedent)
- 'manual' is a user-only value — detectors never emit it. Whether to exclude it from detector iteration is Claude's Discretion.
- Production code as-any casts removed; test files left as-is (no test updates for this item)

#### getEligibleWallets() removal
- Remove the function entirely — no wiring to a callsite
- Delete its tests too — dead function, dead tests, clean removal of the whole unit
- Audit all import sites before deleting (even apparently unused imports) to avoid breaking compilation

#### scoreWallet() stub removal
- Remove the stub from src/index.ts
- Whether to leave the file minimal or delete it if empty is Claude's Discretion
- Whether to add a real re-export in its place is Claude's Discretion

#### Cleanup scope
- Fix the 3 listed items first; if tsc reveals other errors in files already being touched, fix those too
- Errors in untouched files are out of scope — document and stop, do not expand
- Lint fixes (ESLint / no-unused-vars) are in scope for files already touched in this pass
- Phase is done when: tsc compiles cleanly AND full test suite passes (`pnpm test`)

### Claude's Discretion
- Whether 'manual' is excluded from detector iteration loops or just ignored
- Disposition of src/index.ts if it becomes empty after stub removal (leave minimal or delete)
- Whether to re-export any real scoring function from src/index.ts in place of the stub

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 10 is a precision cleanup of three concrete type-system violations and dead code items. The codebase currently compiles cleanly (`tsc --noEmit` exits 0) and all 184 tests pass, meaning this phase introduces no regressions — it only resolves latent inconsistencies that create false impressions of system behavior.

The three items are fully independent and can be planned as separate waves. Item 1 (`manual` enum) touches `src/db/schema.ts`, `src/detection/types.ts`, and `src/commands/wallet.ts`. Item 2 (`getEligibleWallets()` dead export) is confined to `src/detection/engine.ts` with no test to delete (no tests exist for it). Item 3 (`scoreWallet()` stub) is confined to `src/index.ts`. The only cross-cutting concern is: after all edits, `tsc --noEmit` and `pnpm test` must both pass.

The trickiest part is Item 1: once `manual` is added to `DetectorId`, the `SEVERITY_ORDER.includes(f.detector as any)` cast in `engine.ts` can be removed, but the logic must remain correct — `manual` is intentionally NOT in `SEVERITY_ORDER` and must continue to be handled by the out-of-band path. The `as any` on that line exists precisely because `DetectorId` currently lacks `manual`, causing `f.detector` to never be `manual` from the type system's perspective. After the fix, `f.detector` will be typed as `DetectorId | 'manual'` (or just `DetectorId` with `manual` included), and the `.includes()` call becomes type-safe.

**Primary recommendation:** Execute the three items in dependency order — schema/type fix first, dead function removal second, stub removal third — then run `pnpm type-check && pnpm test` as the phase gate.

---

## Affected Files (Audited)

### Item 1: Add 'manual' to DetectorId and schema enum

| File | Change | Confidence |
|------|--------|------------|
| `src/db/schema.ts` line 99-101 | Add `'manual'` to `wallet_flags.detector` enum tuple | HIGH |
| `src/detection/types.ts` line 13 | Extend `DetectorId` union to include `'manual'` | HIGH |
| `src/detection/engine.ts` line 18 | Remove `as any` from `SEVERITY_ORDER.includes(f.detector as any)` — becomes type-safe after `manual` is in `DetectorId` | HIGH |
| `src/commands/wallet.ts` lines 261, 262, 317, 331, 332 | Remove `as any` from `f.detector as any` and `options.detector as any` — these exist because `DetectorId` lacks `manual` | HIGH |

**No database migration needed.** SQLite with Drizzle's `sqlite-core` `text({ enum: [...] })` generates a CHECK constraint in DDL but does NOT enforce it at runtime. Existing rows with `detector='manual'` are unaffected. This is confirmed by reading the `wallet_flags` table definition and matching the Phase 2 precedent described in CONTEXT.md.

**`SEVERITY_ORDER` does NOT need `manual` added.** The out-of-band path in `computeOverallStatus()` is designed to handle detectors not in `SEVERITY_ORDER`. `manual` must remain absent from `SEVERITY_ORDER`. After adding `manual` to `DetectorId`, the `as any` on line 18 is removed by making the call `SEVERITY_ORDER.includes(f.detector as (typeof SEVERITY_ORDER)[number])` — or more cleanly, by narrowing: since `SEVERITY_ORDER` is `readonly ('bundler' | 'dev_wallet' | 'wash_trader' | 'sniper')[]`, TypeScript will not accept a `DetectorId` (which now includes `'manual'`) directly. Use `(SEVERITY_ORDER as readonly string[]).includes(f.detector)` or cast `f.detector` to the severity array element type.

**Iteration loop (Claude's Discretion):** `runDetection()` in `engine.ts` hardcodes calls to the four detector functions — there is no loop over `DetectorId` values. `SEVERITY_ORDER` is iterated in `computeOverallStatus()` for status resolution, not to invoke detectors. Therefore, adding `manual` to `DetectorId` has zero impact on iteration. Recommendation: no exclusion guard needed; `manual` will simply never appear in a `DetectorResult` returned by the four detectors.

### Item 2: Remove getEligibleWallets()

| File | Change | Confidence |
|------|--------|------------|
| `src/detection/engine.ts` lines 122-127 | Delete the function body and export declaration | HIGH |
| No test files to delete | Confirmed: no test anywhere imports or calls `getEligibleWallets` | HIGH |

**Import audit result:** `getEligibleWallets` is only defined in `src/detection/engine.ts`. It is exported (`export function getEligibleWallets`) but has zero import sites in `src/` or `tests/`. The `dist/detection/engine.d.ts` declaration file will be regenerated on next build. No other file will break.

### Item 3: Remove scoreWallet() stub from src/index.ts

| File | Current state | Change | Confidence |
|------|--------------|--------|------------|
| `src/index.ts` | 14-line file: `import 'dotenv/config'`, stub `scoreWallet()`, direct-execution block | Remove stub + direct-execution block | HIGH |

**`scoreWallet` name collision:** `src/scoring/engine.ts` exports a real `scoreWallet(walletAddress, nowMs)` function (line 106). The stub in `src/index.ts` is a different function with the same name that only `console.log`s. No other file imports from `src/index.ts` — confirmed by grep. The real `scoreWallet` from `scoring/engine.ts` is imported directly by `src/commands/wallet.ts` (line 389) and is unaffected.

**Disposition of src/index.ts (Claude's Discretion):** After removing the stub and the direct-execution block, the file contains only `import 'dotenv/config';`. Options:
1. **Keep minimal** — leave `import 'dotenv/config';` as a module entrypoint placeholder
2. **Delete the file** — it has no importers, no role in the built artifact that matters
3. **Add real re-export** — e.g., `export { scoreWallet } from './scoring/engine.js'` to give the file purpose

Recommendation: **Delete the file.** It has no importers, the `import.meta.url` direct-execution pattern is a development scaffold that was never wired to any real workflow, and keeping an empty-ish file creates confusion. If `src/index.ts` is ever needed as a public API entrypoint, it can be recreated with intent.

---

## Architecture Patterns

### Pattern 1: Drizzle enum expansion without migration (SQLite)

**What:** Add a new value to a `text({ enum: [...] })` column in `schema.ts` without running a migration.
**When to use:** When SQLite is the target (not Postgres) and the column has no CHECK constraint enforced by the DB engine.
**How Drizzle handles it:** `drizzle-orm/sqlite-core`'s `text({ enum: [...] })` is a TypeScript-level constraint only — it generates CHECK constraints in migration DDL but those constraints are advisory for codegen, not enforced at query time by better-sqlite3.

```typescript
// Before (src/db/schema.ts, line 99-101)
detector: text('detector', {
  enum: ['bundler', 'dev_wallet', 'sniper', 'wash_trader'],
}).notNull(),

// After
detector: text('detector', {
  enum: ['bundler', 'dev_wallet', 'sniper', 'wash_trader', 'manual'],
}).notNull(),
```

```typescript
// Before (src/detection/types.ts, line 13)
export type DetectorId = 'bundler' | 'dev_wallet' | 'sniper' | 'wash_trader';

// After
export type DetectorId = 'bundler' | 'dev_wallet' | 'sniper' | 'wash_trader' | 'manual';
```

### Pattern 2: Removing as-any casts after type widening

Once `DetectorId` includes `'manual'`, the Drizzle inferred type for `wallet_flags.detector` becomes `'bundler' | 'dev_wallet' | 'sniper' | 'wash_trader' | 'manual'` — which matches `DetectorId`. The casts in `wallet.ts` become unnecessary and can be deleted.

For `engine.ts` line 18, the issue is that `SEVERITY_ORDER` (typed as `readonly ('bundler' | 'dev_wallet' | 'wash_trader' | 'sniper')[]`) does not accept the wider `DetectorId`. The cleanest fix:

```typescript
// Before
const outOfBandFlags = unclearedFlags.filter(f => !SEVERITY_ORDER.includes(f.detector as any));

// After — widen SEVERITY_ORDER type for the includes call
const outOfBandFlags = unclearedFlags.filter(
  f => !(SEVERITY_ORDER as readonly DetectorId[]).includes(f.detector)
);
```

This is type-safe: we are asserting that the comparison is valid for any `DetectorId` value. `manual` will return `false` from `.includes()`, routing it to `outOfBandFlags` as intended.

### Anti-Patterns to Avoid
- **Expanding SEVERITY_ORDER:** Do not add `'manual'` to `SEVERITY_ORDER` in `thresholds.ts` — the entire out-of-band logic in `computeOverallStatus()` is designed for detectors (like `manual`) that are not in the severity order.
- **Deleting `computeOverallStatus` tests:** The `engine.test.ts` file uses `detector: detector as any` in its helper. This is a test file — leave it unchanged per locked decision.
- **Running migrations:** Do not run `drizzle-kit generate` or `drizzle-kit migrate` for this change. Schema file edit only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Enum type expansion | Custom runtime validator | TypeScript union type + Drizzle enum tuple | tsc catches violations at compile time; Drizzle handles DB-level typing |
| Dead export detection | Manual grep | `tsc --noEmit` + grep for import sites | Compiler will catch import errors if you miss a callsite |

**Key insight:** This phase's entire value is in making the type system accurate — not in adding runtime guards. The as-any casts are dangerous because they suppress type errors that tsc would otherwise catch. The fix is to make the types correct, not to add runtime validation.

---

## Common Pitfalls

### Pitfall 1: Forgetting the SEVERITY_ORDER includes() cast after widening DetectorId
**What goes wrong:** After adding `manual` to `DetectorId`, `SEVERITY_ORDER.includes(f.detector)` fails with a TS error because `SEVERITY_ORDER` is typed as `readonly ('bundler' | 'dev_wallet' | 'wash_trader' | 'sniper')[]` and `f.detector` is now `DetectorId` which includes `'manual'`. TypeScript correctly reports this.
**Why it happens:** `Array.prototype.includes` in TypeScript requires the argument to be assignable to the array element type.
**How to avoid:** Use `(SEVERITY_ORDER as readonly DetectorId[]).includes(f.detector)` — the widening cast is intentional since `manual` is a valid `DetectorId` that we want to test against the severity array.
**Warning signs:** TS error: `Argument of type 'DetectorId' is not assignable to parameter of type '"bundler" | "dev_wallet" | "wash_trader" | "sniper"'`

### Pitfall 2: Missing import sites for getEligibleWallets
**What goes wrong:** Deleting the function leaves a dangling import elsewhere, causing a compile error.
**Why it doesn't apply here:** Grep confirms `getEligibleWallets` has zero import sites in the entire codebase (only defined, never imported). Safe to delete.
**Warning signs:** After deletion, `tsc --noEmit` would report "Module has no exported member 'getEligibleWallets'" — run it to confirm.

### Pitfall 3: scoreWallet name conflict confusion
**What goes wrong:** Developer sees `scoreWallet` exists in `src/scoring/engine.ts` and thinks removing it from `src/index.ts` would affect callers.
**Why it doesn't apply here:** The stub in `src/index.ts` is a separate function. `src/commands/wallet.ts` imports `scoreWallet` directly from `../scoring/engine.js` (line 389), not from index. No file imports from `src/index.ts`.
**Warning signs:** If any file had `import { scoreWallet } from '../index.js'`, removing the stub would cause a compile error.

### Pitfall 4: Lint errors surfacing in touched files
**What goes wrong:** After removing the stub and direct-execution block from `src/index.ts`, ESLint may flag the remaining `import 'dotenv/config'` as unused if the file is deleted — or raise `no-unused-vars` for the import if kept empty.
**How to avoid:** If deleting `src/index.ts`, no lint issue. If keeping it with only the import, `import 'dotenv/config'` is a side-effect import — ESLint's `no-unused-vars` does not flag side-effect imports.

---

## Code Examples

### Correct DetectorId type after fix
```typescript
// src/detection/types.ts — after fix
export type DetectorId = 'bundler' | 'dev_wallet' | 'sniper' | 'wash_trader' | 'manual';
```

### Correct schema enum after fix
```typescript
// src/db/schema.ts — wallet_flags.detector after fix
detector: text('detector', {
  enum: ['bundler', 'dev_wallet', 'sniper', 'wash_trader', 'manual'],
}).notNull(),
```

### Correct includes() call after fix
```typescript
// src/detection/engine.ts — after fix, removes the as any
const outOfBandFlags = unclearedFlags.filter(
  f => !(SEVERITY_ORDER as readonly DetectorId[]).includes(f.detector)
);
```

### wallet.ts casts that become safe to remove
```typescript
// Before (wallet.ts lines 260-265)
const newStatus = computeOverallStatus(remainingFlags.map(f => ({
  detector: f.detector as any,   // <-- remove this cast
  confidence: f.confidence as any, // <-- remove this cast
  cleared: false,
  threshold_multiplier: f.threshold_multiplier,
})));

// After — types now match DetectorId and DetectionTier
const newStatus = computeOverallStatus(remainingFlags.map(f => ({
  detector: f.detector,
  confidence: f.confidence,
  cleared: false,
  threshold_multiplier: f.threshold_multiplier,
})));
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest 29.1.1 (ESM mode) |
| Config file | `jest.config.cjs` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |
| Type check command | `pnpm type-check` (alias: `./node_modules/.bin/tsc --noEmit`) |

### Phase Gate
| Check | Command | Expected result |
|-------|---------|----------------|
| Type check | `pnpm type-check` | Exit 0, no output |
| Full test suite | `pnpm test` | 184+ tests pass (0 failures) |

### Current Baseline (pre-phase)
- `tsc --noEmit`: Clean (exit 0, no errors)
- `pnpm test`: 184 tests pass across 19 suites
- No test file exists for `getEligibleWallets()` — confirmed

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. No new test files needed. The phase removes dead code; tests for surviving functionality already exist in `src/detection/__tests__/engine.test.ts` (computeOverallStatus with manual flags), `tests/unit/commands/`, etc.

---

## Current State Inventory

| Item | Location | Current State | Target State |
|------|----------|--------------|--------------|
| `DetectorId` union | `src/detection/types.ts:13` | 4 values, missing `manual` | 5 values incl. `manual` |
| `wallet_flags.detector` enum | `src/db/schema.ts:99-101` | 4 values, missing `manual` | 5 values incl. `manual` |
| `as any` in `commands/wallet.ts` | lines 261, 262, 317, 331, 332 | 5 production `as any` casts | 0 casts |
| `as any` in `engine.ts` | line 18 | 1 `as any` in includes() call | 0 casts (replaced with type-safe cast) |
| `getEligibleWallets()` | `src/detection/engine.ts:122-127` | Exported dead function | Deleted |
| `getEligibleWallets` tests | Anywhere | None exist | N/A (nothing to delete) |
| `scoreWallet()` stub | `src/index.ts:3-6` | Exported stub + CLI scaffold | Deleted (file disposition: Claude's Discretion) |

---

## Open Questions

1. **SEVERITY_ORDER includes() fix — exact cast style**
   - What we know: `(SEVERITY_ORDER as readonly DetectorId[]).includes(f.detector)` is type-safe and preserves the intent
   - What's unclear: Whether a narrower cast like `(SEVERITY_ORDER as readonly string[]).includes(f.detector)` is preferable stylistically
   - Recommendation: Use `(SEVERITY_ORDER as readonly DetectorId[])` — more precise, self-documenting

2. **src/index.ts disposition**
   - What we know: No file imports from `src/index.ts`; after stub removal it would contain only `import 'dotenv/config'`
   - What's unclear: Whether a future API entrypoint was intended here
   - Recommendation: Delete the file. Re-creating it intentionally is cheaper than maintaining a misleading scaffold.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/detection/engine.ts`, `src/detection/types.ts`, `src/db/schema.ts`, `src/commands/wallet.ts`, `src/index.ts` — all read in full
- `tsc --noEmit` output (exit 0, no errors) — confirmed clean baseline
- `pnpm test` output — 184 tests, 19 suites, all passing
- Grep audit of all import sites for `getEligibleWallets` and `scoreWallet`

### Secondary (MEDIUM confidence)
- Drizzle ORM SQLite CHECK constraint behavior: SQLite does not enforce CHECK constraints added via Drizzle schema by default in better-sqlite3 runtime — consistent with CONTEXT.md's "Phase 2 enum expansion precedent" note

---

## Metadata

**Confidence breakdown:**
- Affected files: HIGH — all files read directly, exact line numbers confirmed
- Migration-free claim: HIGH — confirmed by CONTEXT.md precedent and SQLite behavior knowledge
- Test deletion scope: HIGH — confirmed zero test files reference `getEligibleWallets`
- src/index.ts callers: HIGH — grep confirms zero import sites

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable codebase, no external dependencies changing)
