# Echo - Development Guide

## Quick Start

### Prerequisites

- Node.js v18+
- pnpm installed (`npm install -g pnpm`)
- Helius API key (free tier: https://helius.dev)

### Initial Setup

```bash
# Clone/create project
mkdir echo && cd echo

# Initialize with pnpm
pnpm init

# Install dependencies
pnpm add @solana/web3.js axios joi lodash date-fns bignumber.js
pnpm add commander inquirer ora chalk cli-table3

# Install dev dependencies
pnpm add -D typescript @types/node @types/lodash @types/inquirer
pnpm add -D tsx eslint prettier jest ts-jest @types/jest
pnpm add -D @typescript-eslint/eslint-plugin @typescript-eslint/parser

# Create project structure
mkdir -p src/{types,fetchers,parsers,calculators,metrics,categorization,scoring,exporters,utils}
mkdir -p tests/{unit,integration}
mkdir -p config data/cache exports docs
```

### Configuration Files

**package.json**

```json
{
  "name": "echo",
  "version": "0.1.0",
  "description": "Solana wallet scoring system",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:scoring": "tsx tests/integration/scoring.test.ts",
    "type-check": "tsc --noEmit",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts",
    "score": "tsx src/cli.ts"
  },
  "keywords": ["solana", "trading", "wallet", "analytics"],
  "author": "Your Name",
  "license": "MIT"
}
```

**tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**.eslintrc.js**

```javascript
module.exports = {
  parser: "@typescript-eslint/parser",
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
};
```

**.prettierrc**

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

**.env.example**

```bash
# Helius API Key (get from https://helius.dev)
HELIUS_API_KEY=your_key_here

# Optional: Custom Solana RPC
SOLANA_RPC=https://api.mainnet-beta.solana.com

# Optional: Output directory
OUTPUT_DIR=./exports
```

**.gitignore**

```
node_modules/
dist/
.env
data/cache/
exports/
*.log
.DS_Store
```

---

## Development Phases

### Week 1: Foundation

**Day 1-2: Project Setup + Fetchers**

- Set up TypeScript project
- Create types in `src/types/`
- Build Helius fetcher (`src/fetchers/helius.ts`)
- Build DexScreener fetcher (`src/fetchers/dexscreener.ts`)
- Test API connections

**Day 3-4: Transaction Parser**

- Build transaction parser (`src/parsers/transaction.ts`)
- Build swap extractor (`src/parsers/swap.ts`)
- Unit tests for parsers
- Test with real wallet data

**Day 5-7: P&L Calculator**

- Build FIFO calculator (`src/calculators/pnl.ts`)
- Build position tracker (`src/calculators/positions.ts`)
- Unit tests with mock trades
- Validate against manual calculations

### Week 2: Metrics & Categorization

**Day 8-10: Metrics Engine**

- Profitability metrics (`src/metrics/profitability.ts`)
- Activity metrics (`src/metrics/activity.ts`)
- Risk metrics (`src/metrics/risk.ts`)
- Timing metrics (`src/metrics/timing.ts`)
- Unit tests for all metrics

**Day 11-12: Categorization**

- Category rules (`src/categorization/rules.ts`)
- Categorizer logic (`src/categorization/categorizer.ts`)
- Test with known wallet types

**Day 13-14: Scoring System**

- Build scorer (`src/scoring/scorer.ts`)
- Implement weighted scoring formula
- Test score calculations

### Week 3: Testing & Refinement

**Day 15-17: Integration Testing**

- Test full pipeline with 10-20 real wallets
- Manually verify P&L accuracy
- Tune category thresholds
- Fix edge cases

**Day 18-19: Exporters & CLI**

- Build JSON exporter (`src/exporters/json.ts`)
- Build Axiom exporter (`src/exporters/axiom.ts`)
- Build CLI interface (`src/cli.ts`)
- Pretty output formatting

**Day 20-21: Polish**

- Error handling improvements
- Caching implementation
- Rate limiting
- Documentation
- Performance optimization

---

## Testing Strategy

### Unit Tests Example

```typescript
// tests/unit/pnl.test.ts
import { calculatePnL } from "@/calculators/pnl";

describe("P&L Calculator", () => {
  it("calculates profit on simple buy-sell", () => {
    const swaps = [
      {
        type: "buy",
        amountSol: 10,
        amountTokens: 1000,
        pricePerToken: 0.01,
        timestamp: 1000,
      },
      {
        type: "sell",
        amountSol: 15,
        amountTokens: 1000,
        pricePerToken: 0.015,
        timestamp: 2000,
      },
    ];

    const result = calculatePnL(swaps);
    expect(result.realizedPnlSol).toBe(5); // 15 - 10
  });

  it("handles partial sells with FIFO", () => {
    // Test partial sells...
  });
});
```

### Integration Test Example

```typescript
// tests/integration/scoring.test.ts
import { scoreWallet } from "@/index";

const TEST_WALLETS = [
  {
    address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    expectedCategory: "smart_money",
    expectedMinScore: 80,
  },
];

describe("Wallet Scoring Integration", () => {
  it("scores known smart money wallet correctly", async () => {
    const result = await scoreWallet(TEST_WALLETS[0].address);

    expect(result.category.primary).toBe("smart_money");
    expect(result.score.overall).toBeGreaterThan(80);
    expect(result.metrics.profitability.winRatePercent).toBeGreaterThan(65);
  });
});
```

---

## Common Issues & Solutions

### API Rate Limiting

**Problem:** Hitting Helius rate limits  
**Solution:** Implement caching and request queuing in `utils/rateLimit.ts`

### Transaction Parsing Errors

**Problem:** Unknown DEX formats  
**Solution:** Log unknown formats, add handlers incrementally

### Price Data Missing

**Problem:** DexScreener doesn't have price for token  
**Solution:** Fall back to transaction data or skip unrealized P&L

### Inaccurate P&L

**Problem:** Calculations don't match reality  
**Solution:** Add detailed logging, verify FIFO logic, check for missing transactions

---

## Code Style Guidelines

### Naming Conventions

- Types/Interfaces: PascalCase (`WalletMetrics`)
- Functions: camelCase (`calculatePnL`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- Files: kebab-case (`pnl-calculator.ts`)

### Error Handling

```typescript
// Always wrap API calls
try {
  const data = await helius.getTransactions(wallet);
  return parseTransactions(data);
} catch (error) {
  console.error(`Failed to fetch transactions for ${wallet}:`, error);
  throw new Error(`Transaction fetch failed: ${error.message}`);
}
```

### Logging

```typescript
// Use consistent logging
import chalk from "chalk";

console.log(chalk.blue("ℹ"), "Fetching transactions...");
console.log(chalk.green("✓"), "Successfully scored wallet");
console.log(chalk.yellow("⚠"), "Warning: Missing price data");
console.error(chalk.red("✗"), "Error: API rate limit exceeded");
```

---

## Performance Tips

1. **Parallel Processing:** Fetch data for multiple wallets in parallel
2. **Caching:** Cache transaction data (1 hour TTL) and token prices (5 min TTL)
3. **Lazy Loading:** Only fetch token prices when calculating unrealized P&L
4. **Batch Requests:** Group API requests when possible

---

## Next Steps

1. **Set up environment:** Run through quick start
2. **Build Phase 1:** Follow Week 1 plan
3. **Test continuously:** Don't wait until Week 3
4. **Document as you go:** Add JSDoc comments

## Getting Help

- Check [architecture.md](architecture.md) for system design
- Check [schemas.md](schemas.md) for type definitions
- Check [categories.md](categories.md) for classification logic

Ready to build? Start with `src/types/` and work your way down the stack!
