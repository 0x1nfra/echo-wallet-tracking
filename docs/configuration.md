# Echo - Configuration Guide

Complete guide to configuring Echo.

## Environment Variables

Create `.env` file in project root:

```bash
# Required: Helius API Key
HELIUS_API_KEY=your_helius_key_here

# Optional: Custom Solana RPC endpoint
SOLANA_RPC=https://api.mainnet-beta.solana.com

# Optional: Output directory
OUTPUT_DIR=./exports

# Optional: Cache directory
CACHE_DIR=./data/cache

# Optional: Log level (debug, info, warn, error)
LOG_LEVEL=info
```

### Getting API Keys

**Helius:**

1. Go to https://helius.dev
2. Sign up for free account
3. Create new project
4. Copy API key

**Free tier limits:**

- 100 requests/minute
- Should be enough for testing
- Upgrade if scoring 100+ wallets daily

---

## Configuration File

Default config: `config/default.ts`

```typescript
import Joi from "joi";

export interface Config {
  api: {
    helius: {
      key: string;
      endpoint: string;
      rateLimit: number; // requests per minute
    };
    dexscreener: {
      endpoint: string;
      rateLimit: number;
    };
    solana: {
      rpc: string;
      commitment: "processed" | "confirmed" | "finalized";
    };
  };
  calculation: {
    accountingMethod: "fifo" | "lifo";
    minTradesForMetrics: number;
    lookbackDays: number;
    riskFreeRate: number;
  };
  filters: {
    minTrades: number;
    minAccountAgeDays: number;
    excludeSuspectedWashTrading: boolean;
    excludeFailedTokens: boolean;
  };
  categories: {
    smartMoney: CategoryCriteria;
    whale: CategoryCriteria;
    sniper: CategoryCriteria;
    emerging: CategoryCriteria;
    degen: CategoryCriteria;
    kol: CategoryCriteria;
  };
  scoring: {
    weights: {
      profitability: number; // 0-100
      consistency: number;
      activity: number;
      recentPerformance: number;
    };
  };
  export: {
    outputDir: string;
    format: "axiom_json" | "csv" | "json";
    includeMetadata: boolean;
    includeTransactionHistory: boolean;
  };
  cache: {
    enabled: boolean;
    ttlMinutes: number;
    directory: string;
  };
}
```

---

## Default Values

### API Configuration

```typescript
api: {
  helius: {
    key: process.env.HELIUS_API_KEY,
    endpoint: 'https://api.helius.xyz/v0',
    rateLimit: 100 // free tier
  },
  dexscreener: {
    endpoint: 'https://api.dexscreener.com/latest',
    rateLimit: 300 // no key needed, generous limits
  },
  solana: {
    rpc: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed'
  }
}
```

---

### Calculation Settings

```typescript
calculation: {
  accountingMethod: 'fifo', // First In First Out
  minTradesForMetrics: 5, // Need 5+ trades for reliable metrics
  lookbackDays: 90, // Default analysis period
  riskFreeRate: 0.05 // 5% annual (for Sharpe ratio)
}
```

**When to change:**

- `accountingMethod`: Use 'lifo' if you want Last In First Out (rare)
- `minTradesForMetrics`: Lower to 3 if analyzing newer wallets
- `lookbackDays`: Use 30 for recent performance, 180 for longer view
- `riskFreeRate`: Adjust based on current market conditions

---

### Filter Settings

```typescript
filters: {
  minTrades: 10, // Minimum trades to score wallet
  minAccountAgeDays: 7, // Skip brand new wallets
  excludeSuspectedWashTrading: true, // Filter fake volume
  excludeFailedTokens: true // Ignore wallets trading mostly rugs
}
```

**When to change:**

- `minTrades`: Lower to 5 for emerging traders
- `minAccountAgeDays`: Set to 0 to include all wallets
- `excludeSuspectedWashTrading`: Keep enabled unless testing
- `excludeFailedTokens`: Disable if researching rug patterns

---

### Category Criteria

#### Smart Money

```typescript
smartMoney: {
  minWinRate: 65,
  minPositiveMonths: 3,
  minSharpeRatio: 1.5,
  maxDrawdown: 25,
  minTrades: 30
}
```

#### Whale

```typescript
whale: {
  minAvgTradeSol: 50,
  minTotalPnl: 500,
  minBalance: 100,
  minAgeDays: 180
}
```

#### Sniper/Bot

```typescript
sniper: {
  maxEntrySpeedSeconds: 10,
  minLaunchEntries: 20,
  minTradesPerDay: 5,
  maxMedianHoldHours: 2
}
```

#### Emerging Trader

```typescript
emerging: {
  maxAgeDays: 90,
  minWinRate: 70,
  minTrades: 15,
  requirePositive30d: true
}
```

#### Degen

```typescript
degen: {
  minTradesPerMonth: 100,
  maxAvgHoldHours: 24,
  minVolatility: 50
}
```

#### KOL

```typescript
kol: {
  minBalance: 100,
  minTradesPerMonth: 10,
  minWinRate: 50,
  maxWinRate: 70,
  minAvgTradeSol: 20
}
```

**Tuning tips:**

- Lower thresholds = more wallets qualify (less selective)
- Higher thresholds = fewer wallets qualify (more elite)
- Adjust after testing with real wallets

---

### Scoring Weights

```typescript
scoring: {
  weights: {
    profitability: 40, // 40% of total score
    consistency: 30,   // 30% of total score
    activity: 20,      // 20% of total score
    recentPerformance: 10 // 10% of total score
  }
}
```

**Total must equal 100**

**When to adjust:**

- Prioritize consistency: `{profitability: 30, consistency: 40, activity: 20, recent: 10}`
- Prioritize recent performance: `{profitability: 35, consistency: 25, activity: 20, recent: 20}`
- Prioritize activity: `{profitability: 35, consistency: 25, activity: 30, recent: 10}`

---

### Export Settings

```typescript
export: {
  outputDir: './exports',
  format: 'axiom_json', // 'axiom_json' | 'csv' | 'json'
  includeMetadata: true, // Add timestamp, config info
  includeTransactionHistory: false // Usually too large
}
```

---

### Cache Settings

```typescript
cache: {
  enabled: true,
  ttlMinutes: 60, // Cache for 1 hour
  directory: './data/cache'
}
```

**Cache strategy:**

- Transaction data: 60 min (wallets don't trade every minute)
- Token prices: 5 min (prices change frequently)
- Account info: 30 min

**When to disable:**

- Testing new parsers (want fresh data)
- Debugging issues
- First run (no cache yet anyway)

---

## Validation Schema (Joi)

```typescript
import Joi from "joi";

export const configSchema = Joi.object({
  api: Joi.object({
    helius: Joi.object({
      key: Joi.string().required(),
      endpoint: Joi.string().uri().required(),
      rateLimit: Joi.number().positive().required(),
    }).required(),
    dexscreener: Joi.object({
      endpoint: Joi.string().uri().required(),
      rateLimit: Joi.number().positive().required(),
    }).required(),
    solana: Joi.object({
      rpc: Joi.string().uri().required(),
      commitment: Joi.string()
        .valid("processed", "confirmed", "finalized")
        .required(),
    }).required(),
  }).required(),

  calculation: Joi.object({
    accountingMethod: Joi.string().valid("fifo", "lifo").required(),
    minTradesForMetrics: Joi.number().positive().required(),
    lookbackDays: Joi.number().positive().required(),
    riskFreeRate: Joi.number().min(0).max(1).required(),
  }).required(),

  filters: Joi.object({
    minTrades: Joi.number().min(0).required(),
    minAccountAgeDays: Joi.number().min(0).required(),
    excludeSuspectedWashTrading: Joi.boolean().required(),
    excludeFailedTokens: Joi.boolean().required(),
  }).required(),

  categories: Joi.object({
    smartMoney: Joi.object({
      minWinRate: Joi.number().min(0).max(100).required(),
      minPositiveMonths: Joi.number().positive().required(),
      minSharpeRatio: Joi.number().positive().required(),
      maxDrawdown: Joi.number().positive().required(),
      minTrades: Joi.number().positive().required(),
    }).required(),
    whale: Joi.object({
      minAvgTradeSol: Joi.number().positive().required(),
      minTotalPnl: Joi.number().positive().required(),
      minBalance: Joi.number().positive().required(),
      minAgeDays: Joi.number().positive().required(),
    }).required(),
    sniper: Joi.object({
      maxEntrySpeedSeconds: Joi.number().positive().required(),
      minLaunchEntries: Joi.number().positive().required(),
      minTradesPerDay: Joi.number().positive().required(),
      maxMedianHoldHours: Joi.number().positive().required(),
    }).required(),
    emerging: Joi.object({
      maxAgeDays: Joi.number().positive().required(),
      minWinRate: Joi.number().min(0).max(100).required(),
      minTrades: Joi.number().positive().required(),
      requirePositive30d: Joi.boolean().required(),
    }).required(),
    degen: Joi.object({
      minTradesPerMonth: Joi.number().positive().required(),
      maxAvgHoldHours: Joi.number().positive().required(),
      minVolatility: Joi.number().positive().required(),
    }).required(),
    kol: Joi.object({
      minBalance: Joi.number().positive().required(),
      minTradesPerMonth: Joi.number().positive().required(),
      minWinRate: Joi.number().min(0).max(100).required(),
      maxWinRate: Joi.number().min(0).max(100).required(),
      minAvgTradeSol: Joi.number().positive().required(),
    }).required(),
  }).required(),

  scoring: Joi.object({
    weights: Joi.object({
      profitability: Joi.number().min(0).max(100).required(),
      consistency: Joi.number().min(0).max(100).required(),
      activity: Joi.number().min(0).max(100).required(),
      recentPerformance: Joi.number().min(0).max(100).required(),
    })
      .required()
      .custom((value, helpers) => {
        const sum = Object.values(value).reduce(
          (a: number, b: number) => a + b,
          0
        );
        if (sum !== 100) {
          return helpers.error("weights.sum", { sum });
        }
        return value;
      }),
  }).required(),

  export: Joi.object({
    outputDir: Joi.string().required(),
    format: Joi.string().valid("axiom_json", "csv", "json").required(),
    includeMetadata: Joi.boolean().required(),
    includeTransactionHistory: Joi.boolean().required(),
  }).required(),

  cache: Joi.object({
    enabled: Joi.boolean().required(),
    ttlMinutes: Joi.number().positive().required(),
    directory: Joi.string().required(),
  }).required(),
}).messages({
  "weights.sum": "Scoring weights must sum to 100, got {{#sum}}",
});

// Validation helper
export function validateConfig(config: unknown): Config {
  const { error, value } = configSchema.validate(config, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const details = error.details.map((d) => d.message).join(", ");
    throw new Error(`Config validation failed: ${details}`);
  }

  return value as Config;
}
```

---

## Custom Configuration

### Create Custom Config

```typescript
// config/custom.ts
import { Config } from "./default";

export const customConfig: Partial<Config> = {
  calculation: {
    accountingMethod: "fifo",
    minTradesForMetrics: 3, // Lower threshold
    lookbackDays: 30, // Recent performance only
    riskFreeRate: 0.05,
  },

  categories: {
    smartMoney: {
      minWinRate: 70, // More strict
      minPositiveMonths: 2,
      minSharpeRatio: 2.0,
      maxDrawdown: 20,
      minTrades: 20,
    },
  },

  scoring: {
    weights: {
      profitability: 35,
      consistency: 35, // Emphasize consistency
      activity: 20,
      recentPerformance: 10,
    },
  },
};
```

### Use Custom Config

```bash
pnpm run score --config ./config/custom.ts --wallet <address>
```

---

## Configuration Tips

### For Finding Elite Traders

```typescript
filters: {
  minTrades: 30, // More data
  minAccountAgeDays: 90 // Proven track record
}

categories: {
  smartMoney: {
    minWinRate: 70, // Higher bar
    minSharpeRatio: 2.0
  }
}
```

### For Finding Emerging Talent

```typescript
filters: {
  minTrades: 10, // Lower threshold
  minAccountAgeDays: 7 // Include newer wallets
}

categories: {
  emerging: {
    maxAgeDays: 60, // Very new
    minWinRate: 75 // But must be crushing it
  }
}
```

### For Finding Bots/Snipers

```typescript
categories: {
  sniper: {
    maxEntrySpeedSeconds: 5, // Very fast
    minLaunchEntries: 30 // Consistent pattern
  }
}
```

---

## Troubleshooting Config

### Config Validation Failed

```
Error: Config validation failed: "categories.smartMoney.minWinRate" must be less than or equal to 100
```

**Solution:** Check your values are within valid ranges

### Weights Don't Sum to 100

```
Error: Scoring weights must sum to 100, got 95
```

**Solution:** Adjust weights so they total exactly 100

### Missing Required Field

```
Error: "api.helius.key" is required
```

**Solution:** Set `HELIUS_API_KEY` in `.env` file

---

## Next Steps

- See [cli.md](cli.md) for usage examples
- See [development.md](development.md) for setup
- See [categories.md](categories.md) for category details
