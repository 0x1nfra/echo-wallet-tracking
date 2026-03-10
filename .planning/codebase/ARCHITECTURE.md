# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Layered/Modular Architecture with Domain-Driven Design

**Key Characteristics:**
- Separation of concerns with dedicated modules for data fetching, parsing, calculation, categorization, and export
- Type-first approach using TypeScript interfaces defining domain models
- CLI-driven entry point with programmatic API available via index.ts
- Data flow based on wallet analysis pipeline: Fetch → Parse → Calculate → Categorize → Score → Export

## Layers

**Entry Point / CLI Layer:**
- Purpose: Command-line interface for user interaction and orchestration
- Location: `src/cli.ts`, `src/index.ts`
- Contains: Commander.js CLI definitions and high-level scoring functions
- Depends on: All downstream layers (fetchers, calculators, exporters)
- Used by: npm/pnpm CLI scripts

**Data Fetching Layer:**
- Purpose: Retrieve transaction and pricing data from external APIs
- Location: `src/fetchers/helius.ts`, `src/fetchers/dexscreener.ts`
- Contains: API client classes (HeliusFetcher, DexScreenerFetcher) with pagination and error handling
- Depends on: axios for HTTP, environment variables for API keys
- Used by: Parsers to feed transaction data downstream

**Domain Model / Types Layer:**
- Purpose: Define all data structures and interfaces for wallet, transaction, metrics, and configuration
- Location: `src/types/` directory containing wallet.ts, transaction.ts, config.ts, export.ts, index.ts (barrel export)
- Contains: TypeScript interfaces (Wallet, WalletAnalysis, Transaction, Swap, Config, Metrics)
- Depends on: Nothing - pure type definitions
- Used by: Every other layer - all business logic is typed against these interfaces

**Parsing & Transformation Layer:**
- Purpose: Convert raw API responses into normalized domain models
- Location: `src/parsers/` (directory exists but empty - placeholder for implementation)
- Contains: Will contain transaction parsers that convert Helius responses to Swap objects
- Depends on: Fetchers (for raw data), Types (for interfaces)
- Used by: Calculation layer

**Calculation & Metrics Layer:**
- Purpose: Compute wallet metrics (P&L, win rate, Sharpe ratio, drawdown, etc.)
- Location: `src/metrics/`, `src/calculators/` (directories exist but empty - placeholders)
- Contains: Will contain metric calculators and PnL calculation logic
- Depends on: Parsers (for swap data), Types
- Used by: Categorization and scoring layers

**Categorization Layer:**
- Purpose: Classify wallets into categories (smart money, whale, sniper, emerging, degen, kol)
- Location: `src/categorization/` (directory exists but empty - placeholder)
- Contains: Will contain categorization rules and criteria matching
- Depends on: Metrics (for wallet metrics), Types, Configuration
- Used by: Scoring layer

**Scoring Layer:**
- Purpose: Generate wallet scores (0-100) based on metrics and category
- Location: `src/scoring/` (directory exists but empty - placeholder)
- Contains: Will contain scoring algorithm and weighting logic
- Depends on: Metrics, Categorization, Configuration
- Used by: Export layer and CLI output

**Export Layer:**
- Purpose: Format scored wallets for external tools (Axiom, CSV, JSON)
- Location: `src/exporters/` (directory exists but empty - placeholder)
- Contains: Will contain exporters for different formats (Axiom JSON, CSV, raw JSON)
- Depends on: Types (for data structures)
- Used by: CLI for final output

**Configuration Layer:**
- Purpose: Centralize configuration management
- Location: `config/` directory (empty), environment variables via dotenv
- Contains: Will contain config files with API endpoints, calculation settings, categorization criteria
- Depends on: dotenv for environment variable loading
- Used by: All layers that need configuration

## Data Flow

**Wallet Scoring Pipeline:**

1. **Input:** User provides wallet address(es) via CLI
2. **Fetch:** HeliusFetcher.getTransactions() retrieves raw transaction history from Helius API
3. **Fetch:** DexScreenerFetcher.getTokenPrice() fetches current/historical prices for tokens
4. **Parse:** Parser converts Helius transactions to Swap objects, normalizing DEX types (Raydium, Jupiter, Pump.fun, Orca)
5. **Calculate:** Metrics engine computes all wallet metrics:
   - ProfitabilityMetrics (P&L, ROI, win rate, profit factor)
   - ActivityMetrics (trades, frequency, hold duration)
   - RiskMetrics (drawdown, Sharpe ratio, volatility)
   - TimingMetrics (entry speed, launch participation)
   - TimePeriodMetrics (performance over time windows)
6. **Categorize:** Categorization engine applies criteria to assign wallet to category (e.g., "smart_money" if win rate > 60% AND Sharpe > 1.0)
7. **Score:** Scoring algorithm calculates 0-100 score based on metrics breakdown and category bonus
8. **Export:** Exporter formats result for output (JSON, CSV, or Axiom import format)
9. **Output:** Display to user or write to file

**State Management:**
- Immutable data flow: Each layer outputs new data structures, no mutation of wallet state
- Transaction history stored in memory during analysis (not persisted between runs)
- Cache layer (planned): config/CacheConfig enables optional caching of API responses

## Key Abstractions

**Wallet Analysis Request:**
- Purpose: Represents a single wallet being analyzed
- Examples: `src/types/wallet.ts` (Wallet, WalletAnalysis)
- Pattern: Simple data container with address, optional label, and optional manual override

**Position Tracking:**
- Purpose: Represents a single token position with entry/exit points
- Examples: `src/types/wallet.ts` (Position, PositionEntry, PositionExit)
- Pattern: Tracks individual trades (entry/exit pairs) for P&L calculation with cost basis tracking

**Swap Abstraction:**
- Purpose: Normalized representation of a buy/sell transaction across DEXes
- Examples: `src/types/transaction.ts` (Swap, SwapType, DexType)
- Pattern: Converts API-specific transaction formats (Helius, DexScreener) into unified Swap type

**Metric Interfaces:**
- Purpose: Structured containers for calculated financial metrics
- Examples: `src/types/wallet.ts` (ProfitabilityMetrics, ActivityMetrics, RiskMetrics, TimingMetrics)
- Pattern: Separate interface per metric category, combined in WalletMetrics container

**Category Result:**
- Purpose: Encapsulates categorization with confidence and reasoning
- Examples: `src/types/wallet.ts` (CategoryResult, WalletCategory)
- Pattern: Includes primary category, confidence score 0-1, and list of reasons for transparency

**Score Breakdown:**
- Purpose: Transparent scoring with component breakdown
- Examples: `src/types/wallet.ts` (WalletScore)
- Pattern: Overall 0-100 score split into profitability (0-40), consistency (0-30), activity (0-20), recentPerformance (0-10)

## Entry Points

**CLI Entry:**
- Location: `src/cli.ts`
- Triggers: `pnpm run score` command with options like --wallet, --file, --days, --export
- Responsibilities: Parse user input, validate options, orchestrate wallet analysis, display results

**Programmatic Entry:**
- Location: `src/index.ts`
- Triggers: Import and call scoreWallet() function from other Node.js programs
- Responsibilities: Provide public API for scoreWallet(address: string) function

**Test Entry:**
- Location: `tests/test-fetchers.ts`
- Triggers: `pnpm run tsx tests/test-fetchers.ts`
- Responsibilities: Validate API fetcher functionality and connections

## Error Handling

**Strategy:** Fail-fast with specific error messages, graceful degradation for non-critical failures

**Patterns:**
- HeliusFetcher.getTransactions(): Catches axios errors, provides specific messages for 401 (invalid key), 429 (rate limit), and other errors
- DexScreenerFetcher.getTokenPrice(): Returns null instead of throwing on failures, allowing partial batch completions
- testConnection() methods on both fetchers for validation before main operations
- TODO comments indicate planned retry logic with exponential backoff (not yet implemented)

## Cross-Cutting Concerns

**Logging:**
- Approach: console.log/console.warn/console.error used throughout
- Patterns: Status messages (console.log), warnings for missing data (console.warn), critical issues (console.error)
- Enhanced with chalk library for colored output in CLI

**Validation:**
- Approach: API responses checked for presence and format (length > 0, type guards)
- Patterns: Filter transactions by timestamp, validate token prices are finite numbers
- Config validation (planned): joi library already in dependencies for schema validation

**Authentication:**
- Approach: API key passed via environment variables (process.env.HELIUS_API_KEY)
- Factory functions (createHeliusFetcher, createDexScreenerFetcher) handle credential initialization
- No explicit auth token passed to DexScreener (public API)

**Rate Limiting:**
- Approach: Hard-coded delays (200ms) in batch operations, respects API limits
- Config layer defines rateLimit in requests per minute (ApiConfig.helius.rateLimit, ApiConfig.dexscreener.rateLimit)
- TODO comments indicate need for proper rate limit queue management

---

*Architecture analysis: 2026-03-10*
