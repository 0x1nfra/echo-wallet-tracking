# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- TypeScript 5.3.3 - All application code, strict mode enabled

## Runtime

**Environment:**
- Node.js >= 18.0.0

**Package Manager:**
- pnpm >= 8.0.0
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks & Core Libraries

**Web3 & Blockchain:**
- @solana/web3.js 1.87.6 - Solana blockchain interactions and wallet operations

**HTTP Client:**
- axios 1.6.2 - API requests to external services (Helius, DexScreener)

**CLI & User Interaction:**
- commander 11.1.0 - Command-line interface framework
- inquirer 9.2.12 - Interactive CLI prompts
- ora 8.0.1 - Elegant terminal spinners and progress indicators
- chalk 5.3.0 - Terminal color and styling
- cli-table3 0.6.3 - Formatted table output

**Data Processing:**
- lodash 4.17.21 - Utility functions for data manipulation
- bignumber.js 9.1.2 - Arbitrary-precision decimal arithmetic for financial calculations
- dayjs 1.11.10 - Date/time parsing and formatting
- joi 17.11.0 - Data validation schema builder

**Configuration & Environment:**
- dotenv 16.3.1 - Environment variable management from `.env` files

## Build & Development Tools

**Compilation:**
- TypeScript 5.3.3 - TypeScript compiler with ES2022 target

**Runtime Execution:**
- tsx 4.7.0 - TypeScript/JSX execution without build step (dev scripts)

**Testing:**
- jest 29.7.0 - Test framework and runner
- ts-jest 29.1.1 - TypeScript support for Jest
- @types/jest 29.5.11 - Jest type definitions

**Linting & Formatting:**
- eslint 8.56.0 - Code quality analysis
- @typescript-eslint/eslint-plugin 6.17.0 - TypeScript-specific ESLint rules
- @typescript-eslint/parser 6.17.0 - TypeScript parser for ESLint
- prettier 3.1.1 - Code formatter
- Configuration: `.eslintrc.cjs` (ESLint), `.prettierrc` (Prettier)

**Type Definitions:**
- @types/node 20.10.6 - Node.js type definitions
- @types/lodash 4.14.202 - Lodash type definitions
- @types/inquirer 9.0.7 - Inquirer type definitions

## Configuration Files

**TypeScript:**
- `tsconfig.json` - Compiler options with ES2022 target, ESNext modules, path aliases for `@/*`, `@types/*`, `@fetchers/*`, `@parsers/*`, `@calculators/*`, `@metrics/*`, `@categorization/*`, `@scoring/*`, `@exporters/*`, `@utils/*`, `@config/*`

**Environment:**
- `.env` - Runtime configuration (secrets and API keys - not in version control)
- `.env.example` - Template for required environment variables

**Code Quality:**
- `.eslintrc.cjs` - ESLint configuration extending recommended rules with TypeScript support
- `.prettierrc` - Prettier config: 100 char line width, 2-space indent, trailing commas, semicolons

## Entry Points

**CLI:**
- `src/cli.ts` - Command-line interface entry point

**Main Application:**
- `src/index.ts` - Library entry point with `scoreWallet()` function

**Build Output:**
- `dist/index.js` - Compiled JavaScript (as specified in package.json main field)

## Platform Requirements

**Development:**
- Node.js 18.0.0 or higher
- pnpm 8.0.0 or higher

**Production:**
- Node.js 18.0.0 or higher
- Compiled to ES2022 JavaScript (ECMAScript modules)

---

*Stack analysis: 2026-03-10*
