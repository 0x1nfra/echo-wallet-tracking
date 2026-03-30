# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Runner:**
- Jest 29.7.0
- Config: Not yet created (no `jest.config.js` or `jest.config.ts` present)
- TypeScript support: ts-jest 29.1.1

**Assertion Library:**
- Jest built-in expect API (standard with Jest)

**Run Commands:**
```bash
pnpm test              # Run all tests (configured in package.json)
pnpm test:watch       # Watch mode
pnpm test:scoring     # Run specific scoring integration test
```

## Test File Organization

**Location:**
- Tests in `/tests/` directory at project root (separate from source code, not co-located)
- Structure: `/tests/unit/` and `/tests/integration/` subdirectories
- Currently: `/tests/unit/` and `/tests/integration/` directories exist but are empty
- Active test file: `/tests/test-fetchers.ts` (manual test script, not Jest-based)

**Naming:**
- Manual test scripts: descriptive names. Example: `test-fetchers.ts`
- Pattern: `{name}.ts` for test files (no `.test.ts` or `.spec.ts` suffix yet in actual tests)

**Structure:**
```
tests/
├── test-fetchers.ts       # Manual API fetcher tests
├── unit/                  # (empty - for unit tests)
└── integration/           # (empty - for integration tests)
```

## Test Structure

**Suite Organization:**

Current manual test pattern in `tests/test-fetchers.ts`:
```typescript
// Async test functions grouped by feature
async function testHelius() {
  console.log(chalk.blue('\n📡 Testing Helius Fetcher...\n'));
  try {
    // Test setup
    const helius = createHeliusFetcher();
    // Test execution
    const connected = await helius.testConnection();
    // Assertions (via console output)
    if (!connected) {
      console.log(chalk.red('✗ Connection failed'));
      return;
    }
    console.log(chalk.green('✓ Connection successful\n'));
  } catch (error) {
    console.error(chalk.red('✗ Helius test failed:'), error);
  }
}

// Main test runner
async function main() {
  await testHelius();
  await testDexScreener();
}

main().catch(console.error);
```

**Patterns:**
- Setup: Factory pattern used to create clients. Example in `tests/test-fetchers.ts` line 19: `const helius = createHeliusFetcher();`
- Execution: Direct async method calls. Example line 37: `const transactions = await helius.getTransactions(TEST_WALLET, 1);`
- Assertions: Manual via console output with colored status indicators:
  - Green (pass): `console.log(chalk.green('✓ Connection successful'))`
  - Red (fail): `console.log(chalk.red('✗ Connection failed'))`
  - Yellow (warning): `console.log(chalk.yellow('⚠ Something'))`
- Teardown: Try-catch blocks handle error cleanup. Example lines 57-59: catches and logs errors

## Mocking

**Framework:** None yet integrated (Jest mocks not yet configured)

**Patterns:**
- No mocking library configuration present
- Manual test approach: uses real API calls to test fetchers
- Environment-based configuration: API keys from environment variables (`HELIUS_API_KEY`, etc.)

**What to Mock (When Jest Framework is Implemented):**
- External API calls (Helius, DexScreener) using Jest.mock() or manual test doubles
- axios instances to test error handling
- Date/time functions if deterministic time-based testing needed

**What NOT to Mock:**
- Internal factory functions (should test real creation)
- Type definitions and interfaces
- Transaction parsing logic (use real test data)

## Fixtures and Factories

**Test Data:**

Factory functions used for client creation:
```typescript
// In src/fetchers/helius.ts (line 150)
export function createHeliusFetcher(): HeliusFetcher {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error('HELIUS_API_KEY not found in environment variables');
  }
  return new HeliusFetcher(apiKey);
}
```

Test constants defined at top of test files:
```typescript
// In tests/test-fetchers.ts (line 12)
const TEST_WALLET = 'Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN';

// Test tokens array (line 78)
const testTokens = [
  { name: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { name: 'WIF', address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
];
```

**Location:**
- Fixtures stored in-line within test files or at test file top level
- No separate fixture directory yet
- Environment variables handled via `.env` file and `dotenv/config` import

## Coverage

**Requirements:** Not enforced
- No coverage threshold configured
- No coverage reporting setup in package.json

**View Coverage:**
```bash
# Not yet configured - would be:
pnpm test -- --coverage
```

## Test Types

**Unit Tests:**
- Scope: Individual function/class testing in isolation
- Approach: Not yet implemented (unit/ directory empty)
- Should test:
  - Class constructors and initialization
  - Individual method behavior
  - Error cases and edge conditions
  - Type validation

**Integration Tests:**
- Scope: Multiple components working together, including external APIs
- Approach: Current `tests/test-fetchers.ts` follows integration test pattern:
  - Tests real API clients (`HeliusFetcher`, `DexScreenerFetcher`)
  - Makes actual HTTP requests to Helius and DexScreener
  - Verifies end-to-end data flow
- Run with: `pnpm run tsx tests/test-fetchers.ts` (manual execution)
- Alternative: `pnpm run test:scoring` for scoring-specific integration tests (configured in package.json line 13)

**E2E Tests:**
- Framework: Not used
- Would test: Full wallet scoring workflow end-to-end

## Common Patterns

**Async Testing:**

Pattern: All test functions are async with try-catch:
```typescript
async function testHelius() {
  try {
    const helius = createHeliusFetcher();
    const transactions = await helius.getTransactions(TEST_WALLET, 1);
    console.log(chalk.green(`✓ Fetched ${transactions.length} transactions`));
  } catch (error) {
    console.error(chalk.red('✗ Helius test failed:'), error);
  }
}
```

**Error Testing:**

Pattern: Wrapped in try-catch, error messages logged:
```typescript
try {
  // Code that should error
  const connected = await dexscreener.testConnection();
  if (!connected) {
    console.log(chalk.red('✗ Connection failed'));
    return;
  }
} catch (error) {
  console.error(chalk.red('✗ DexScreener test failed:'), error);
}
```

**API Response Testing:**

Pattern: Validate response structure before use:
```typescript
// In tests/test-fetchers.ts (lines 41-56)
if (transactions.length > 0) {
  const first = transactions[0];
  console.log('\nSample transaction:');
  console.log(`  Signature: ${first.signature.slice(0, 16)}...`);
  console.log(`  Timestamp: ${new Date(first.timestamp * 1000).toLocaleString()}`);
  console.log(`  Type: ${first.type}`);
  console.log(`  Fee: ${first.fee} SOL`);

  if (first.tokenTransfers && first.tokenTransfers.length > 0) {
    console.log(`  Token transfers: ${first.tokenTransfers.length}`);
  }
}
```

## Known Testing Gaps

**Coverage Issues:**
- No unit tests for core scoring logic (not yet implemented)
- No tests for metric calculations
- No tests for wallet categorization logic
- No error recovery/retry logic tests (TODOs in code reference retry backoff not yet tested)
- No tests for edge cases (empty results, malformed data, timeout handling)

**Test Infrastructure:**
- Jest configuration not yet set up (just dependency added)
- No test fixtures or test data generators
- No mock implementations for external APIs
- Limited to manual testing via `test-fetchers.ts`

## Test Execution

**Running Tests:**

Manual test script:
```bash
pnpm run tsx tests/test-fetchers.ts
```

This:
1. Loads environment variables via `dotenv/config` import
2. Creates real fetcher instances with live API keys
3. Makes actual HTTP calls to Helius and DexScreener APIs
4. Outputs colored console logs with pass/fail status
5. Requires valid `HELIUS_API_KEY` in `.env`

**Special Test Wallets:**

Test wallet constant defined in `tests/test-fetchers.ts` line 12:
```typescript
const TEST_WALLET = 'Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN';
```

Instructions in file suggest replacing with actual wallet for full testing:
```typescript
// ⬇️ ADD YOUR TEST WALLET ADDRESS HERE ⬇️
// Example: const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
```

---

*Testing analysis: 2026-03-10*
