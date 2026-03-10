# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Helius API:**
- Service: Helius RPC and Enhanced API for Solana transaction history
- What it's used for: Fetch wallet transaction history with parsed data (token transfers, native transfers, swap data)
- SDK/Client: `axios` with custom wrapper class `HeliusFetcher`
- Location: `src/fetchers/helius.ts`
- Auth: `HELIUS_API_KEY` environment variable
- Endpoints:
  - `GET /addresses/{address}/transactions` - Fetch transactions for a wallet (pagination with `before-signature`)
  - `POST /v0/transactions` - Get parsed details for specific transaction signatures
  - Rate limit: 30 requests per minute (default, configurable)
  - Timeout: 30 seconds
- Features:
  - Pagination support via `before-signature` parameter (limit: 100 per request)
  - Automatic timestamp filtering for date range queries
  - Token transfer and native transfer parsing
  - Connection testing via `testConnection()` method
  - Rate limit error handling (HTTP 429) and authentication error handling (HTTP 401)
  - TODO: Implement automatic retry with exponential backoff

**DexScreener API:**
- Service: Decentralized exchange aggregator for Solana token prices and pair data
- What it's used for: Fetch real-time and historical token prices, DEX pair information (liquidity, volumes, price changes)
- SDK/Client: `axios` with custom wrapper class `DexScreenerFetcher`
- Location: `src/fetchers/dexscreener.ts`
- Auth: No authentication required (public API)
- Endpoints:
  - `GET /dex/tokens/{tokenAddress}` - Get price and pair data for a token
  - Base URL: `https://api.dexscreener.com/latest`
  - Rate limit: 300 requests per minute (5 per second), enforced via 200ms delay in batch calls
  - Timeout: 10 seconds
- Features:
  - Token price lookup with USD conversion
  - Multiple pair support (returns highest liquidity Solana pair)
  - Batch token price fetching with sequential requests and rate limit delays
  - Pair filtering by `chainId: 'solana'`
  - Token pair details including volume, liquidity, and price changes (5m, 1h, 6h, 24h)
  - Connection testing via `testConnection()` method
  - Graceful error handling (returns null for failed price fetches)
  - TODO: Implement automatic retry with exponential backoff
  - TODO: Add market cap metrics

**Solana RPC:**
- Service: Solana blockchain RPC endpoint
- What it's used for: Direct blockchain data access (used via SDK, not directly by fetchers currently)
- Connection: `SOLANA_RPC` environment variable
- Default: `https://api.mainnet-beta.solana.com`
- Commitment level: Configurable (`processed`, `confirmed`, `finalized`)
- Client: `@solana/web3.js` SDK

## Data Storage

**Databases:**
- Not detected - Application is stateless

**File Storage:**
- Local filesystem only
- Export directory: `OUTPUT_DIR` environment variable (default: `./exports`)
- Cache directory: `CACHE_DIR` environment variable (default: `./data/cache`)
- Supported export formats: `axiom_json`, `csv`, `json`

**Caching:**
- Local file-based caching (configurable)
- Configuration: `CacheConfig` interface in `src/types/config.ts`
  - `enabled`: boolean
  - `ttlMinutes`: Cache time-to-live in minutes
  - `directory`: Cache file location (default: `./data/cache`)

## Authentication & Identity

**Auth Provider:**
- Custom implementation via API keys
- Helius API: API key-based authentication (`HELIUS_API_KEY`)
- DexScreener: Public API (no authentication)
- Solana RPC: Public endpoints (optional custom RPC configuration)

## Monitoring & Observability

**Error Tracking:**
- Not detected

**Logs:**
- Console-based logging (stdout)
- Log level: Configurable via `LOG_LEVEL` environment variable (`debug`, `info`, `warn`, `error`, default: `info`)
- Logging occurs in:
  - `src/fetchers/helius.ts`: Transaction fetch progress and error messages
  - `src/fetchers/dexscreener.ts`: Price fetch warnings and error messages
  - Console output is allowed by ESLint config (`no-console: 'off'`)

## CI/CD & Deployment

**Hosting:**
- Not configured - Application is a standalone CLI tool

**CI Pipeline:**
- Not detected

**Deployment:**
- Standalone Node.js application
- Compiled to `dist/index.js` (ES2022 ECMAScript modules)
- Can be executed via `npm start` or `tsx` during development

## Environment Configuration

**Required env vars:**
- `HELIUS_API_KEY` - Helius RPC API key (required, obtained from https://helius.dev)

**Optional env vars:**
- `SOLANA_RPC` - Solana RPC endpoint (default: `https://api.mainnet-beta.solana.com`)
- `OUTPUT_DIR` - Export output directory (default: `./exports`)
- `CACHE_DIR` - Cache directory (default: `./data/cache`)
- `LOG_LEVEL` - Logging verbosity (default: `info`, options: `debug`, `info`, `warn`, `error`)

**Secrets location:**
- `.env` file at project root (not committed, git-ignored)
- Template: `.env.example` provides configuration template

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## API Rate Limiting & Throttling

**Helius:**
- Rate limit: 30 requests per minute
- Enforced by API server with HTTP 429 response
- Error handling: Throws error on rate limit exceeded with user message

**DexScreener:**
- Rate limit: 300 requests per minute (5 per second)
- Client-side enforcement: 200ms delay between sequential token price requests in batch operations
- Error handling: Returns null on rate limit, gracefully degrades

## Data Types & Structures

**Helius Response Types:**
- `HeliusTransaction` - Parsed transaction from Helius API
- `HeliusTokenTransfer` - Token transfer within a transaction
- `HeliusNativeTransfer` - Native SOL transfer within a transaction
- Implementation: `src/types/transaction.ts`

**DexScreener Response Types:**
- `DexScreenerResponse` - API response wrapper
- `DexScreenerPair` - Trading pair information
- `DexScreenerToken` - Token metadata
- Implementation: `src/types/transaction.ts`

---

*Integration audit: 2026-03-10*
