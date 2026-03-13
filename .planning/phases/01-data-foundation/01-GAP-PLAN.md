---
phase: 01-data-foundation
plan: GAP
type: execute
wave: 1
depends_on: []
files_modified:
  - src/detection/sniper.ts
autonomous: true
gap_closure: true
requirements:
  - DETC-03
must_haves:
  truths:
    - "pnpm score wallet add exits with code 0 after printing the success message"
    - "No SqliteError is thrown during detection after wallet import"
  artifacts:
    - path: "src/detection/sniper.ts"
      provides: "getDefaultDb() that correctly executes drizzle sql template objects via db.$client"
  key_links:
    - from: "sniper.ts getDefaultDb()"
      to: "db.$client (better-sqlite3 Database)"
      via: "sqlObj.toQuery() then stmt.all(params)"
      pattern: "db\\$client\\.prepare"
---

<objective>
Fix the broken `getDefaultDb()` adapter in `src/detection/sniper.ts` so that raw drizzle
`sql` template objects are correctly executed instead of crashing with a SQLite syntax error.

Purpose: The production `getDefaultDb()` calls `sqlObj.toSQL()` which does not exist on
drizzle's `SQL` class. The ternary falls through to `String(sqlObj)` = `"[object Object]"`,
producing `SqliteError: near "[object Object]": syntax error`. This crashes `pnpm score
wallet add` with exit code 1 after the success message prints.

Output: A corrected `getDefaultDb()` that uses `sqlObj.toQuery({ escapeName, escapeParam })`
to build the raw SQL string and params, then executes them via `db.$client.prepare().all()`.
All existing sniper tests pass (they inject the mock db and never reach the production adapter).
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

<interfaces>
From node_modules/drizzle-orm/sql/sql.d.ts:

```typescript
export interface BuildQueryConfig {
  escapeName(name: string): string;
  escapeParam(num: number, value: unknown): string;
}

// SQL class — returned by the sql template tag from drizzle-orm
// .toSQL() does NOT exist. The correct method is:
class SQL {
  toQuery(config: BuildQueryConfig): { sql: string; params: unknown[] };
}
```

From node_modules/drizzle-orm/better-sqlite3/driver.d.ts:

```typescript
// drizzle() returns BetterSQLite3Database & { $client: Database }
// $client is the raw better-sqlite3 Database instance
// Database.prepare(sql: string): Statement
// Statement.all(...params: unknown[]): unknown[]
```

SQLite-specific BuildQueryConfig values:
- escapeName: wrap identifier in double-quotes, e.g. (n) => `"${n}"`
- escapeParam: always return "?" for positional placeholders, e.g. () => "?"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace hand-rolled toSQL() adapter with toQuery() plus db.$client.prepare().all()</name>
  <files>src/detection/sniper.ts</files>
  <action>
    Replace only the `getDefaultDb()` function body at the bottom of the file. The function
    currently tries `sqlObj.toSQL()` (which does not exist) and falls back to
    `String(sqlObj)` = "[object Object]", causing the SqliteError crash.

    The corrected implementation:

    ```typescript
    async function getDefaultDb(): Promise<SniperDb> {
      const { db } = await import('../db/index.js');
      return {
        all: async (sqlObj: any, _params: unknown) => {
          const built = (sqlObj as any).toQuery({
            escapeName: (n: string) => `"${n}"`,
            escapeParam: () => '?',
          });
          return (db as any).$client.prepare(built.sql).all(...built.params);
        },
      };
    }
    ```

    Key points:
    - `toQuery({ escapeName, escapeParam })` is the correct drizzle API for materialising
      a sql template tag object into a `{ sql: string, params: unknown[] }` pair.
    - `db.$client` is the underlying `better-sqlite3` Database instance exposed by drizzle.
    - `prepare(built.sql).all(...built.params)` is the synchronous better-sqlite3 API for
      executing a SELECT and returning all rows.
    - The `_params` second argument from the call site (`[]`) is intentionally ignored;
      params come from `toQuery` since the sql template tag embeds them.
    - Do NOT change the `SniperDb` interface, `SniperDeps`, the `detectSniper` function,
      or any test file. Only `getDefaultDb()` changes.
  </action>
  <verify>
    <automated>cd /Users/irfanmurad/Developer/vessl/echo-wallet-tracking && pnpm test -- --testPathPattern=sniper</automated>
  </verify>
  <done>
    All sniper detector tests pass. No `.toSQL` reference remains in sniper.ts.
    File compiles without TypeScript errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify full test suite remains green</name>
  <files></files>
  <action>
    Run the full test suite to confirm no regressions were introduced by the sniper fix.
    No code changes in this task — verification only.

    If any previously-passing test now fails, investigate and fix before marking done.
  </action>
  <verify>
    <automated>cd /Users/irfanmurad/Developer/vessl/echo-wallet-tracking && pnpm test</automated>
  </verify>
  <done>
    All tests pass (67 or more passing, 0 failing). Exit code 0.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. `pnpm test` exits 0 with all tests passing.
2. `grep -n "toSQL" src/detection/sniper.ts` returns no matches.
3. `grep -n "toQuery" src/detection/sniper.ts` returns exactly one match inside `getDefaultDb()`.
4. `pnpm tsc --noEmit` exits 0 (no TypeScript errors).
</verification>

<success_criteria>
- `getDefaultDb()` uses `sqlObj.toQuery()` and `db.$client.prepare().all()` — no `.toSQL()` call remains.
- Full test suite passes (67+ tests, 0 failures).
- The UAT gap is closed: `pnpm score wallet add` no longer throws SqliteError and exits 0.
</success_criteria>

<output>
After completion, create `.planning/phases/01-data-foundation/01-GAP-SUMMARY.md` documenting:
- The bug: `.toSQL()` does not exist on drizzle SQL class; fallback String(sqlObj) = "[object Object]" crashed better-sqlite3
- The fix: `toQuery({ escapeName, escapeParam })` produces correct sql+params; `$client.prepare().all()` executes it
- Test results: all N tests passing
</output>
