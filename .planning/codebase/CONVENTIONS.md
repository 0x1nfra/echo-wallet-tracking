# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- Classes: PascalCase with `.ts` extension. Example: `HeliusFetcher` in `src/fetchers/helius.ts`
- Functions and exports: camelCase. Example: `createHeliusFetcher()`, `getTransactions()`
- Types: PascalCase (interfaces and types). Example: `WalletAnalysis`, `HeliusTransaction`
- Constants: camelCase or lowercase. Example: `endpoint`, `apiKey`
- Directory names: lowercase with hyphens for multi-word (e.g., `src/fetchers/`, `src/types/`)

**Functions:**
- Async functions use `async/await`. Example in `src/fetchers/helius.ts` line 26: `async getTransactions(address: string, days: number = 30): Promise<HeliusTransaction[]>`
- Factory functions prefixed with `create`. Example: `createHeliusFetcher()` in `src/fetchers/helius.ts` line 150
- Getter methods: no `get` prefix in function names. Example: `getTransactions()`, `getTokenPrice()`
- Test functions: descriptive names describing behavior. Example in `tests/test-fetchers.ts` line 15: `async function testHelius()`

**Variables:**
- camelCase for all variables. Example: `beforeTimestamp`, `allTransactions`, `priceMap` (in `src/fetchers/helius.ts`)
- Private class properties: `private` keyword. Example: `private client: AxiosInstance;` (in `src/fetchers/helius.ts` line 9)
- Unused parameters prefixed with underscore to pass eslint rules. Example in `.eslintrc.cjs` line 20: `argsIgnorePattern: '^_'`

**Types:**
- Interfaces prefixed with `I` optional; commonly omitted. Example: `Wallet`, `AccountInfo`, `WalletCategory` (not `IWallet`)
- Type unions for discriminated types. Example in `src/types/wallet.ts` line 19: `export type WalletCategory = 'smart_money' | 'whale' | ...`
- Generic type parameters: `T`, `K`, `V` convention. Example in `src/fetchers/dexscreener.ts` line 25: `get<DexScreenerResponse>`
- Metrics interfaces: suffixed with `Metrics`. Example: `ProfitabilityMetrics`, `ActivityMetrics` (in `src/types/wallet.ts`)

## Code Style

**Formatting:**
- Tool: Prettier 3.1.1
- Config file: `.prettierrc`
- Settings:
  - Semi-colons: required (`"semi": true`)
  - Single quotes: enforced (`"singleQuote": true`)
  - Trailing commas: ES5 style (`"trailingComma": "es5"`)
  - Line width: 100 characters (`"printWidth": 100`)
  - Tab width: 2 spaces (`"tabWidth": 2`)
  - Arrow parentheses: always (`"arrowParens": "always"`)
  - Line endings: LF (`"endOfLine": "lf"`)

**Linting:**
- Tool: ESLint 8.56.0 with TypeScript support
- Config file: `.eslintrc.cjs`
- Parser: `@typescript-eslint/parser`
- Extends: `eslint:recommended` and `plugin:@typescript-eslint/recommended`
- Key rules:
  - `@typescript-eslint/no-explicit-any`: warn (allow `any` with warning)
  - `@typescript-eslint/explicit-function-return-type`: off (return types inferred)
  - `@typescript-eslint/no-unused-vars`: error (with underscore exception for unused params)
  - `@typescript-eslint/no-non-null-assertion`: warn (allow non-null assertion with warning)
  - `no-console`: off (required for CLI tool)

## Import Organization

**Order:**
1. External dependencies (npm packages). Example line 5 in `src/fetchers/helius.ts`: `import axios, { AxiosInstance } from 'axios';`
2. Local type imports using `type` keyword. Example line 6: `import type { HeliusTransaction } from '../types/index.js';`
3. Relative imports from same module
4. Named imports before default imports

**Path Aliases:**
- Configured in `tsconfig.json` lines 19-30:
  - `@/*`: `src/*` (general utilities and main source)
  - `@types/*`: `src/types/*` (type definitions)
  - `@fetchers/*`: `src/fetchers/*` (API fetchers)
  - `@parsers/*`: `src/parsers/*` (transaction parsers)
  - `@calculators/*`: `src/calculators/*` (metric calculators)
  - `@metrics/*`: `src/metrics/*` (metric implementations)
  - `@categorization/*`: `src/categorization/*` (wallet categorization)
  - `@scoring/*`: `src/scoring/*` (scoring logic)
  - `@exporters/*`: `src/exporters/*` (export formatters)
  - `@utils/*`: `src/utils/*` (shared utilities)
  - `@config/*`: `config/*` (configuration files)

## Error Handling

**Patterns:**
- Try-catch blocks used for async operations. Example in `src/fetchers/helius.ts` lines 27-94: wrapping axios calls in try-catch
- Specific error handling for axios errors:
  ```typescript
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded...');
    }
    if (error.response?.status === 401) {
      throw new Error('Invalid API key...');
    }
  }
  ```
- Graceful degradation: return null or empty array on non-critical failures. Example in `src/fetchers/dexscreener.ts` line 71: `return null; // Return null instead of throwing for price fetch failures`
- Descriptive error messages with context. Example: `'Helius API rate limit exceeded. Please wait a moment and try again.'`
- Console logging for errors: `console.error()` for test output (line 58, `tests/test-fetchers.ts`), `console.warn()` for warnings

## Logging

**Framework:** console object (no external logging library)

**Patterns:**
- `console.log()` for informational output. Examples throughout `src/fetchers/`
- `console.warn()` for warnings. Example in `src/fetchers/dexscreener.ts` line 29: `console.warn('No price data found...')`
- `console.error()` for errors. Example in `src/fetchers/helius.ts` line 141: `console.error('Helius connection test failed:', error);`
- Progress logging for long operations. Example in `src/fetchers/helius.ts` line 77: `console.log(\`  Fetched ${allTransactions.length} transactions so far...\`);`
- Use of chalk for colored console output in tests. Example in `tests/test-fetchers.ts` line 16: `console.log(chalk.blue('\n📡 Testing Helius Fetcher...\n'));`

## Comments

**When to Comment:**
- JSDoc comments for public functions and methods. Example in `src/fetchers/helius.ts` lines 20-25:
  ```typescript
  /**
   * Fetch all transactions for a wallet address
   * @param address - Solana wallet address
   * @param days - Number of days to look back (default: 30)
   * @returns Array of parsed transactions
   */
  ```
- Inline comments for complex logic or non-obvious behavior. Example in `src/fetchers/helius.ts` line 30: `// Calculate timestamp for lookback period`
- TODO comments for incomplete features. Examples marked throughout code:
  - `src/fetchers/helius.ts` line 83: `// TODO: Implement automatic retry with exponential backoff`
  - `src/fetchers/dexscreener.ts` line 48: `// TODO: add market cap metrics`
  - `src/index.ts` line 5: `// TODO: Implement wallet scoring`

**JSDoc/TSDoc:**
- Used for all public class methods and exported functions
- Parameters documented with `@param` tag
- Return types documented with `@returns` tag
- Example format in `src/fetchers/dexscreener.ts` lines 18-21:
  ```typescript
  /**
   * Get token price on Solana
   * @param tokenAddress - Token mint address
   * @returns Price in USD, or null if not found
   */
  ```

## Function Design

**Size:** Functions kept focused and reasonably sized (typical range 20-50 lines for main logic)
- Example: `getTransactions()` in `src/fetchers/helius.ts` is 68 lines but handles pagination loop with clear sections

**Parameters:**
- Generally 1-3 parameters per function. Example: `getTransactions(address: string, days: number = 30)`
- Use object parameter for multiple related options. Not yet observed but path alias structure suggests this pattern
- Default values used for optional parameters. Example: `days: number = 30` in `src/fetchers/helius.ts` line 26

**Return Values:**
- Async functions return `Promise<T>`. Example: `Promise<HeliusTransaction[]>` in `src/fetchers/helius.ts`
- Functions returning optional values use union type. Example: `Promise<number | null>` in `src/fetchers/dexscreener.ts` line 23
- Consistent return type declarations (no implicit `any`)

## Module Design

**Exports:**
- Named exports for utilities and types. Example in `src/types/wallet.ts`: `export interface Wallet { ... }`
- Default exports rarely used; prefer named exports for consistency
- Factory functions exported as named exports. Example: `export function createHeliusFetcher()` in `src/fetchers/helius.ts` line 150
- Type exports using `export type` syntax. Example in `src/types/index.ts` lines 6-22

**Barrel Files:**
- Central index file for type exports. Example: `src/types/index.ts` re-exports all types for convenient import
- Pattern: `export type { Type1, Type2, ... } from './module.js'`
- Simplifies imports: `import type { Wallet, WalletAnalysis } from '@types'` instead of individual files

**Class Design:**
- Used for stateful services/clients. Example: `HeliusFetcher` class in `src/fetchers/helius.ts`
- Private properties for encapsulation. Example: `private client: AxiosInstance;` and `private apiKey: string;`
- Instance created via factory functions for easy configuration. Example: `createHeliusFetcher()` passes environment config

---

*Convention analysis: 2026-03-10*
