# Phase 1: Data Foundation - Research

**Researched:** 2026-03-11
**Domain:** drizzle-orm + better-sqlite3, Commander.js subcommands, cli-table3 rendering
**Confidence:** HIGH

## Summary

Phase 1 installs a new SQLite persistence layer (drizzle-orm + better-sqlite3) onto a project that currently has no database packages installed. The project uses `"type": "module"` (ESM) and TypeScript with ES2022 target — both are fully compatible with drizzle-orm and better-sqlite3, but require attention to one pitfall: better-sqlite3 is a native C addon that ships CommonJS and must be imported in ESM via the standard `import Database from 'better-sqlite3'` syntax (which Node.js handles via its CJS-interop layer). No workarounds needed.

The schema decision is all five tables defined upfront. drizzle-orm's `sqliteTable` helper covers every required column type, and WAL mode is enabled at connection time via `sqlite.pragma('journal_mode = WAL')` — not in a migration file. Migrations are generated with `drizzle-kit generate` and applied programmatically via `migrate(db, { migrationsFolder })` called once at startup before any CLI action runs.

Commander.js (already installed, v11) supports nested subcommands via `new Command()` + `.addCommand()`. The `echo wallet` parent command with `add`, `remove`, and `list` children is built in a single TypeScript file. cli-table3 and chalk are already installed and are the correct tools for the `list` table output.

**Primary recommendation:** Install `drizzle-orm better-sqlite3` as runtime deps and `drizzle-kit @types/better-sqlite3` as dev deps. Define schema in `src/db/schema.ts`, run migrations at startup from `src/db/index.ts`, register `echo wallet` via `addCommand()` in `src/cli.ts`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CLI command structure**
- Subcommand namespace: `echo wallet add <address>`, `echo wallet remove <address>`, `echo wallet list`
- Wallet label via `--label` flag only — no interactive prompts
- `echo wallet add` on an already-tracked address errors with a clear message and non-zero exit ("Wallet <addr> is already tracked.")
- `echo wallet remove` accepts address only (not label) as the identifier

**Wallet list display**
- Address displayed as truncated: first 8 chars + `...` + last 4 chars (e.g., `9WzDXwBb...3mF4`)
- Phase 1 columns: ADDRESS, LABEL, STATUS, ADDED — score/detection/last-active omitted until Phase 4+ populates them
- Unlabeled wallets show `(no label)` in the LABEL column
- Sort order: score descending when score exists, fallback to added date newest-first for unscored wallets (Phase 1 = all unscored, so newest first)
- Empty state: "No wallets tracked yet.\n\nGet started: echo wallet add <address>"

**Database file location**
- Default path: `data/echo.db` (relative to project root)
- Override via `.env`: `DATABASE_URL=./data/echo.db` — no CLI flag needed
- Auto-created on first run: if `data/echo.db` doesn't exist, create it automatically (no init command required)

**Schema design — all 5 tables, fully defined in Phase 1**
- **wallets**: `id`, `address` (UNIQUE NOT NULL), `label`, `status` DEFAULT 'tracked', `score` (null until Phase 4), `detection_status` (null until Phase 3), `added_at`, `last_checked_at` (null until Phase 5), `history_complete` DEFAULT 0 (Phase 2)
- **swaps**: `wallet_address`, `tx_signature`, `dex`, `token_mint`, `side` (buy/sell), `token_amount`, `sol_amount`, `timestamp`, `slot`, `fee_sol`, `cost_basis_sol`, `realized_pnl_sol`
- **wallet_metrics**: full Phase 4 schema defined now
- **token_signals**: full Phase 6 schema defined now
- **removal_log**: full Phase 5 schema defined now
- **Inactivity threshold**: global config via `.env` (`INACTIVITY_DAYS=30`), not per-wallet column

### Claude's Discretion
- drizzle-orm schema definition style (e.g., `sqliteTable` helper vs raw SQL)
- Exact column types and constraints within the decided schema
- Migration file naming and directory structure
- WAL mode pragma application (at connection time vs migration)
- How the existing `Wallet` type in `src/types/wallet.ts` is reconciled with the new DB schema (extend, replace, or separate DB-layer types)
- Whether the existing `score` command in `src/cli.ts` is preserved as-is or stubbed differently

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | System persists wallet registry, swap history, metrics, signals, and removal log to SQLite | drizzle-orm + better-sqlite3 installation; all 5 tables in schema.ts |
| DATA-02 | Database uses WAL mode to allow concurrent reads during monitoring loop writes | `sqlite.pragma('journal_mode = WAL')` at connection time in `src/db/index.ts` |
| DATA-03 | User can add a wallet to the tracker by address with optional label | `echo wallet add <address> [--label]` via Commander.js `addCommand()` |
| DATA-04 | User can remove a wallet from the tracker | `echo wallet remove <address>` via Commander.js `addCommand()` |
| DATA-05 | User can view all tracked wallets with current score and status | `echo wallet list` with cli-table3 table; phase 1 shows ADDRESS/LABEL/STATUS/ADDED |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 | TypeScript ORM — schema definition, query builder, migrator | Type-safe, lightweight, first-class SQLite support, no separate migration state table beyond a simple `__drizzle_migrations` row |
| better-sqlite3 | ^12.6.2 | Synchronous SQLite driver | Fastest sync Node.js SQLite driver; drizzle-orm's recommended SQLite adapter |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-kit | ^0.30.x (latest stable matching drizzle-orm) | CLI migration generator | Dev-time only: `drizzle-kit generate` produces SQL files; not a runtime dep |
| @types/better-sqlite3 | ^7.6.x | TypeScript types for better-sqlite3 | Required; types not bundled in better-sqlite3 itself |

### Already Installed (No Action)
| Library | Version | Purpose |
|---------|---------|---------|
| commander | ^11.1.0 | CLI subcommands |
| cli-table3 | ^0.6.3 | Table output for `wallet list` |
| chalk | ^5.3.0 | Color output for status column |
| dotenv | ^16.3.1 | DATABASE_URL, INACTIVITY_DAYS env vars |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | node:sqlite (Node 22.5+ built-in) | Node 22 not required by project (>=18); built-in lacks ecosystem tooling |
| better-sqlite3 | @electric-sql/pglite | Postgres-in-process; heavier, unnecessary for this use case |
| drizzle-orm | Prisma | Prisma adds a Rust engine process, heavier for a CLI tool |
| Jest (current) | Vitest | Vitest has native ESM; migration is valid but out of this phase's scope |

**Installation:**
```bash
pnpm add drizzle-orm better-sqlite3
pnpm add -D drizzle-kit @types/better-sqlite3
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── index.ts         # Connection singleton: open DB, enable WAL, run migrations, export db
│   ├── schema.ts        # All 5 sqliteTable definitions — single source of truth
│   └── migrations/      # Generated SQL files (via drizzle-kit generate)
├── commands/
│   └── wallet.ts        # wallet Command with add/remove/list subcommands
├── cli.ts               # Existing Commander program — add wallet via addCommand()
drizzle.config.ts        # drizzle-kit configuration (project root)
data/
└── echo.db              # Created automatically at runtime (gitignored)
```

### Pattern 1: Database Connection Singleton
**What:** Open better-sqlite3, enable WAL pragma, run pending migrations, export the drizzle `db` object — all in one module. Imported by command handlers.
**When to use:** Every time a CLI command needs database access.

```typescript
// src/db/index.ts
// Source: https://orm.drizzle.team/docs/get-started/sqlite-new
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL ?? 'data/echo.db';
const dbPath = path.resolve(process.cwd(), dbUrl);

// Auto-create parent directory if missing
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

// WAL mode: set at connection time, not in a migration
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Run pending migrations synchronously (better-sqlite3 is sync)
migrate(db, {
  migrationsFolder: path.join(__dirname, 'migrations'),
});
```

### Pattern 2: Schema Definition with sqliteTable
**What:** Define all 5 tables using drizzle-orm's `sqliteTable` helper with typed columns. Nullable columns for future phases are declared now but remain null until those phases populate them.
**When to use:** This is the single authoritative schema file.

```typescript
// src/db/schema.ts
// Source: https://orm.drizzle.team/docs/column-types/sqlite
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const wallets = sqliteTable('wallets', {
  id:               integer().primaryKey({ autoIncrement: true }),
  address:          text().notNull().unique(),
  label:            text(),                                          // nullable
  status:           text({ enum: ['tracked', 'removed'] }).notNull().default('tracked'),
  score:            real(),                                          // null until Phase 4
  detection_status: text({ enum: ['pending', 'passing', 'suspected', 'review', 'confirmed'] }),
  added_at:         integer({ mode: 'timestamp_ms' }).notNull()
                      .default(sql`(unixepoch('now') * 1000)`),
  last_checked_at:  integer({ mode: 'timestamp_ms' }),               // null until Phase 5
  history_complete: integer({ mode: 'boolean' }).notNull().default(false),
});

// swaps, wallet_metrics, token_signals, removal_log defined similarly
```

### Pattern 3: Commander.js Nested Subcommand (addCommand)
**What:** Create a parent `wallet` Command, create child Commands, wire them with `addCommand()`, add the parent to the existing program.
**When to use:** All `echo wallet *` commands.

```typescript
// src/commands/wallet.ts
// Source: https://betterstack.com/community/guides/scaling-nodejs/commander-explained/
import { Command } from 'commander';
import { db } from '@/db/index.js';
import { wallets } from '@/db/schema.js';
import { eq } from 'drizzle-orm';

export function createWalletCommand(): Command {
  const wallet = new Command('wallet').description('Manage tracked wallets');

  wallet
    .addCommand(
      new Command('add')
        .argument('<address>', 'Solana wallet address')
        .option('--label <label>', 'Human-readable label')
        .action(async (address: string, options) => {
          // insert or error on duplicate
        })
    )
    .addCommand(
      new Command('remove')
        .argument('<address>', 'Solana wallet address')
        .action(async (address: string) => { /* ... */ })
    )
    .addCommand(
      new Command('list')
        .action(async () => { /* cli-table3 render */ })
    );

  return wallet;
}
```

```typescript
// src/cli.ts — add one line after existing score command
import { createWalletCommand } from '@/commands/wallet.js';
program.addCommand(createWalletCommand());
```

### Pattern 4: cli-table3 List Rendering
**What:** Render the wallet list as a fixed-width table. Phase 1 columns: ADDRESS, LABEL, STATUS, ADDED.

```typescript
// Source: https://github.com/cli-table/cli-table3
import Table from 'cli-table3';
import chalk from 'chalk';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

const table = new Table({
  head: ['ADDRESS', 'LABEL', 'STATUS', 'ADDED'],
  style: { head: ['cyan'] },
});

for (const wallet of rows) {
  table.push([
    truncateAddress(wallet.address),
    wallet.label ?? chalk.gray('(no label)'),
    wallet.status === 'tracked' ? chalk.green('tracked') : chalk.red('removed'),
    new Date(wallet.added_at).toLocaleDateString(),
  ]);
}

console.log(table.toString());
```

### Pattern 5: drizzle-kit Configuration
**What:** Config file at project root that points drizzle-kit to your schema and migrations directory.

```typescript
// drizzle.config.ts (project root)
// Source: https://orm.drizzle.team/docs/kit-overview
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  out: './src/db/migrations',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'data/echo.db',
  },
});
```

**Generate migrations:**
```bash
pnpm drizzle-kit generate
```

### Anti-Patterns to Avoid
- **WAL pragma in migration SQL:** Pragmas in migration files do not always execute as expected through better-sqlite3's `.prepare().run()` path (which rejects multi-statement strings). Apply `sqlite.pragma()` directly on the connection object.
- **Async transactions with better-sqlite3:** better-sqlite3 is synchronous by design. Do not use `await db.transaction(async ...)` — use the synchronous form `db.transaction(fn)`.
- **Drizzle `push` instead of `generate`/`migrate`:** `drizzle-kit push` skips migration files and directly mutates the schema. Use `generate` + `migrate()` for a project that needs reproducible, auditable migrations.
- **Importing `db` at module top level without init guard:** If `src/db/index.ts` is imported in any module, it will run migrations immediately. This is intentional — but do not import it in modules that run during `tsc` type checking or test file imports without a real database present.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL migration tracking | Custom migration version table | `drizzle-kit generate` + `migrate()` | drizzle tracks applied migrations in `__drizzle_migrations` table automatically |
| SQLite file creation | `fs.writeFileSync` + schema SQL | `new Database(path)` (creates file) + `migrate()` | better-sqlite3 creates the file on first open; migrations apply tables |
| Address uniqueness check | `SELECT count(*) WHERE address=?` before insert | drizzle `unique()` constraint + catch error on insert | DB-level unique constraint is atomic; manual check has TOCTOU race |
| Table formatting | Custom `padEnd` column renderer | `cli-table3` | Already installed; handles column widths, borders, head styling |
| Status coloring | ANSI escape codes | `chalk` | Already installed |

**Key insight:** drizzle-kit + better-sqlite3 together handle file creation, schema migrations, and query type-safety. The only custom code needed is the schema definition and the connection setup.

---

## Common Pitfalls

### Pitfall 1: ESM `.js` Extensions Required at Runtime
**What goes wrong:** TypeScript files import other TypeScript files with `.ts` extension. When compiled (or run via tsx), Node.js ESM resolver requires `.js` extensions in import paths.
**Why it happens:** `"type": "module"` in package.json makes Node.js treat all `.js` as ESM. TypeScript does not rewrite extensions.
**How to avoid:** Use `.js` extension in all relative imports: `import { db } from './index.js'` not `'./index'` or `'./index.ts'`. tsx handles this at runtime, but tsc needs it too.
**Warning signs:** `ERR_MODULE_NOT_FOUND` at runtime.

### Pitfall 2: WAL Pragma in Migration File Does Not Persist
**What goes wrong:** Developer puts `PRAGMA journal_mode = WAL;` in a migration SQL file. better-sqlite3 throws "The supplied SQL string contains more than one statement" when the migration file has multiple statements.
**Why it happens:** `better-sqlite3` uses `.prepare(sql).run()` internally for individual statements — which rejects multiple statements. The `.exec()` path handles multi-statement but does not return results.
**How to avoid:** Apply WAL at connection time via `sqlite.pragma('journal_mode = WAL')` — this is the official recommended pattern. Never put WAL in a migration.
**Warning signs:** `Error: The supplied SQL string contains more than one statement` during migration run.

### Pitfall 3: better-sqlite3 Requires Build on Install
**What goes wrong:** `pnpm install` fails or takes very long; native addon compilation errors on CI or WSL.
**Why it happens:** better-sqlite3 is a native addon (C++ binding) that compiles against Node.js headers on install. Requires `python`, `make`, `g++`.
**How to avoid:** On WSL/Ubuntu: `sudo apt-get install -y python3 make g++` if needed. Use `pnpm install --ignore-scripts` only as a diagnostic step — the native build is required for normal use. Most Node.js 18+ environments on Linux have the toolchain.
**Warning signs:** `gyp ERR! build error` or `node-pre-gyp` errors during install.

### Pitfall 4: Path Resolution for Migrations Folder
**What goes wrong:** `migrate(db, { migrationsFolder: './src/db/migrations' })` works when run from project root via tsx but fails when the compiled binary runs from a different cwd.
**Why it happens:** Relative paths are resolved from `process.cwd()`, not from `__dirname` of the file.
**How to avoid:** Resolve the migrations path relative to the current file using `import.meta.url`:
```typescript
import { fileURLToPath } from 'node:url';
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations'
);
```
**Warning signs:** `MigrationError: no such table` after deploying or running from a different directory.

### Pitfall 5: Duplicate Address Insert Error Handling
**What goes wrong:** Inserting a wallet with an existing address throws a raw SQLite constraint error ("UNIQUE constraint failed: wallets.address") instead of the user-facing message.
**Why it happens:** drizzle re-throws better-sqlite3's underlying error without wrapping it.
**How to avoid:** Wrap the insert in try/catch and check for the constraint violation message to produce the required error: "Wallet <addr> is already tracked."
**Warning signs:** Uncaught `SqliteError: UNIQUE constraint failed` reaching the user.

### Pitfall 6: Jest + ESM Incompatibility (existing test setup)
**What goes wrong:** The project has Jest + ts-jest configured in package.json but no `jest.config.*` file. Running `pnpm test` against new database modules may fail with ESM interop errors.
**Why it happens:** Jest's ESM support requires `--experimental-vm-modules` and a `jest.config.cjs` with specific ts-jest ESM preset. This project has no jest config file at all.
**How to avoid:** Phase 1 tests should use the existing pattern (see Validation Architecture below). If Jest/ESM proves difficult for database unit tests, Vitest is a drop-in alternative with native ESM support — but switching test runners is a separate decision flagged as Claude's discretion.

---

## Code Examples

Verified patterns from official sources:

### Create drizzle connection with WAL mode
```typescript
// Source: https://orm.drizzle.team/docs/get-started/sqlite-new
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database('data/echo.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
```

### Run migrations synchronously at startup
```typescript
// Source: https://orm.drizzle.team/docs/migrations
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

migrate(db, { migrationsFolder: './src/db/migrations' });
// No await needed — better-sqlite3 is synchronous
```

### Insert wallet, handle duplicate
```typescript
// Source: drizzle-orm docs + better-sqlite3 error behavior
import { wallets } from '@/db/schema.js';

try {
  db.insert(wallets).values({
    address,
    label: options.label ?? null,
  }).run();
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
    console.error(`Wallet ${address} is already tracked.`);
    process.exit(1);
  }
  throw err;
}
```

### Query wallets sorted newest-first (Phase 1 — all unscored)
```typescript
// Source: https://orm.drizzle.team/docs/select
import { desc, isNull } from 'drizzle-orm';

const rows = db
  .select()
  .from(wallets)
  .where(isNull(wallets.score))   // Phase 1: all unscored
  .orderBy(desc(wallets.added_at))
  .all();
```

### drizzle.config.ts
```typescript
// Source: https://orm.drizzle.team/docs/kit-overview
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  out: './src/db/migrations',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'data/echo.db',
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `drizzle({ client: sqlite })` | `drizzle(sqlite, { schema })` OR `drizzle({ client: sqlite })` — both valid in 0.45.x | drizzle-orm 0.30+ | Either form works; prefer explicit `{ client }` object form per latest docs |
| `drizzle-kit` as peer dep of drizzle-orm | `drizzle-kit` is a fully independent CLI | ~0.20.x | Install separately; version matching is handled by drizzle-kit internally |
| `npx drizzle-kit generate:sqlite` | `npx drizzle-kit generate` (dialect inferred from config) | ~0.21.x | Old dialect-suffixed commands removed |
| manual `__drizzle_migrations` table | Auto-managed by drizzle migrator | Always | No manual management needed |

**Deprecated/outdated:**
- `drizzle-orm-sqlite` (separate package): Replaced by `drizzle-orm` with sub-path imports (`drizzle-orm/sqlite-core`, `drizzle-orm/better-sqlite3`).
- `drizzle-kit push` for production: Only use for dev prototyping; `generate` + `migrate()` is the production path.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 + ts-jest 29.1 (existing in package.json) |
| Config file | None currently — Wave 0 must create `jest.config.cjs` |
| Quick run command | `pnpm test -- --testPathPattern=tests/unit/db` |
| Full suite command | `pnpm test` |

**ESM/Jest note:** The project has `"type": "module"` which conflicts with Jest's default CJS transform mode. Wave 0 must create a `jest.config.cjs` (CJS extension bypasses ESM parsing) with the `ts-jest/presets/default-esm` preset. The `--experimental-vm-modules` flag must be added to the test script. Alternatively — and flagged as Claude's discretion — Vitest can replace Jest for this phase's tests since it has native ESM support and a Jest-compatible API.

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | wallets/swaps/wallet_metrics/token_signals/removal_log tables created after migrate() | unit (in-memory DB) | `pnpm test -- --testPathPattern=tests/unit/db/schema` | ❌ Wave 0 |
| DATA-01 | Row can be inserted and retrieved from each table | unit (in-memory DB) | same | ❌ Wave 0 |
| DATA-02 | `PRAGMA journal_mode` returns `wal` after connection init | unit | `pnpm test -- --testPathPattern=tests/unit/db/connection` | ❌ Wave 0 |
| DATA-03 | `wallet add <address>` inserts row; duplicate exits non-zero with correct message | unit | `pnpm test -- --testPathPattern=tests/unit/commands/wallet-add` | ❌ Wave 0 |
| DATA-03 | `wallet add <address> --label Foo` sets label column | unit | same | ❌ Wave 0 |
| DATA-04 | `wallet remove <address>` removes row; unknown address exits non-zero | unit | `pnpm test -- --testPathPattern=tests/unit/commands/wallet-remove` | ❌ Wave 0 |
| DATA-05 | `wallet list` prints table with correct columns; empty state message on empty DB | unit | `pnpm test -- --testPathPattern=tests/unit/commands/wallet-list` | ❌ Wave 0 |
| DATA-05 | Address displayed as truncated `XXXXXXXX...XXXX` format | unit | same | ❌ Wave 0 |

**Strategy for in-memory DB in tests:** Use `new Database(':memory:')` instead of file path. Pass to drizzle + run migrations in `beforeAll`. Clean tables in `beforeEach`. This avoids file system side effects and is faster.

```typescript
// tests/unit/db/setup.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../../src/db/schema.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.join(__dirname, '../../../src/db/migrations'),
  });
  return { db, sqlite };
}
```

### Sampling Rate
- **Per task commit:** `pnpm test -- --testPathPattern=tests/unit/db`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `jest.config.cjs` — ESM-compatible Jest configuration with ts-jest ESM preset
- [ ] `tests/unit/db/schema.test.ts` — covers DATA-01 (table creation, insert/select per table)
- [ ] `tests/unit/db/connection.test.ts` — covers DATA-02 (WAL mode pragma)
- [ ] `tests/unit/commands/wallet-add.test.ts` — covers DATA-03
- [ ] `tests/unit/commands/wallet-remove.test.ts` — covers DATA-04
- [ ] `tests/unit/commands/wallet-list.test.ts` — covers DATA-05
- [ ] `tests/unit/db/setup.ts` — shared in-memory DB fixture
- [ ] Update `package.json` test script: `"test": "node --experimental-vm-modules node_modules/.bin/jest"` (if staying with Jest)

---

## Open Questions

1. **Jest vs Vitest for ESM tests**
   - What we know: Jest 29 + ts-jest can handle ESM but requires `--experimental-vm-modules`, a `jest.config.cjs` file, and careful configuration. Vitest is simpler for ESM projects and has a Jest-compatible API.
   - What's unclear: Whether the project intends to maintain Jest long-term (it's in package.json but no config exists — suggests it was never actually used successfully).
   - Recommendation: Planner should make a call here. Vitest is the simpler path; Jest is the continuation of the existing (partial) setup. Both work. Flag as Claude's discretion.

2. **`wallet_metrics` full schema for Phase 4**
   - What we know: The context doc says "full schema defined now for Phase 4 columns" but does not enumerate the wallet_metrics columns.
   - What's unclear: The exact columns needed — win_rate, realized_pnl_sol, sharpe_ratio, max_drawdown, recency_score are mentioned in SCOR-01.
   - Recommendation: Research Phase 4 requirements (SCOR-01, SCOR-02) to enumerate wallet_metrics columns. The planner should include a task to confirm these against REQUIREMENTS.md before finalizing the schema.

3. **`token_signals` full schema for Phase 6**
   - What we know: token_signals needs columns for per-token signal score, buy velocity, exit pressure, PnL-weighted holder score (SGNL-01).
   - What's unclear: Exact column names and whether `wallet_address` is a FK or denormalized.
   - Recommendation: Same as wallet_metrics — planner should specify columns based on SGNL-01 requirements.

---

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM SQLite Quickstart](https://orm.drizzle.team/docs/get-started/sqlite-new) — installation, drizzle.config.ts, schema definition, migration commands
- [Drizzle ORM SQLite Column Types](https://orm.drizzle.team/docs/column-types/sqlite) — integer/text/real/blob options, mode flags
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations) — migrate() function, folder structure
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — version 12.6.2 confirmed current stable

### Secondary (MEDIUM confidence)
- [Drizzle better-sqlite3 WAL mode discussion](https://www.answeroverflow.com/m/1302562958580383844) — community-verified pattern: pragma at connection time
- [BetterStack Drizzle ORM guide](https://betterstack.com/community/guides/scaling-nodejs/drizzle-orm/) — full setup walkthrough cross-verified with official docs
- [BetterStack Commander.js guide](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/) — addCommand() nested subcommand pattern
- [ts-jest ESM support](https://kulshekhar.github.io/ts-jest/docs/guides/esm-support) — experimental-vm-modules config requirement

### Tertiary (LOW confidence)
- [better-sqlite3 ESM PR discussion (closed Jan 2025)](https://github.com/WiseLibs/better-sqlite3/pull/1293) — confirms better-sqlite3 remains CJS but works in ESM via Node interop

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official drizzle docs verified, versions confirmed
- Architecture: HIGH — patterns from official docs and cross-verified community guides
- Pitfalls: HIGH (WAL pragma, multi-statement migration) / MEDIUM (Jest/ESM — based on ts-jest docs + community patterns)
- Test infrastructure: MEDIUM — Jest ESM setup requires validation; in-memory DB pattern is standard

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (drizzle-orm releases frequently; check for 0.46+ before implementation)
