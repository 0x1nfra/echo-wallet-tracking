# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**Missing Core Functionality - Critical:**
- Issue: Multiple critical modules are defined in types but not implemented (parsers, calculators, metrics, categorization, scoring, exporters)
- Files: `src/parsers/`, `src/calculators/`, `src/metrics/`, `src/categorization/`, `src/scoring/`, `src/exporters/` (all empty directories)
- Impact: Core application features outlined in README cannot run. All wallet scoring, categorization, metrics calculation, and export functionality is missing
- Fix approach: Implement parsers to parse Helius transaction data into standardized format, implement calculators for PnL and metrics, implement categorization logic for wallet types, implement scoring algorithm, implement exporters for JSON/CSV/Axiom formats

**Missing Retry Logic - High:**
- Issue: API calls to Helius and DexScreener lack automatic retry with exponential backoff
- Files: `src/fetchers/helius.ts` (lines 83, 117), `src/fetchers/dexscreener.ts` (lines 62, 114)
- Impact: Rate limiting and transient network failures will cause immediate failures. API calls are not resilient
- Fix approach: Implement exponential backoff retry strategy with configurable max attempts for both fetchers

**Sequential Token Price Fetching - Performance:**
- Issue: `getTokenPrices()` in DexScreener fetcher uses sequential requests instead of Promise.all() to avoid rate limits
- Files: `src/fetchers/dexscreener.ts` (lines 84-92)
- Impact: Fetching prices for many tokens is slow (200ms delay per token). A 100-token batch takes 20+ seconds
- Fix approach: Implement batch fetching with configurable concurrency and smarter rate limit detection to use Promise.all safely

**Incomplete CLI Implementation:**
- Issue: CLI interface in `src/cli.ts` is a stub that logs "Coming soon..." without actual functionality
- Files: `src/cli.ts` (lines 20-24)
- Impact: Users cannot use the `score` command described in README. All CLI commands are non-functional
- Fix approach: Wire CLI to fetchers and implement actual scoring workflow

**Empty Main Entry Point:**
- Issue: `src/index.ts` contains only TODO comment for wallet scoring
- Files: `src/index.ts` (line 5)
- Impact: No programmatic API for wallet scoring is available
- Fix approach: Implement exported functions for scoring wallets

## Known Bugs

**Date Format Not Localized - Low:**
- Symptoms: Date formatting uses hardcoded UTC format instead of local timezone
- Files: `tests/test-fetchers.ts` (line 45)
- Trigger: Running test script with samples shows UTC timestamp regardless of user's timezone
- Workaround: None - users see times in UTC
- Note: FIXME comment already in code

**Unnecessary Field in Transaction Responses - Low:**
- Symptoms: Code checks for `first.success` field which may not always be present
- Files: `tests/test-fetchers.ts` (line 46, commented FIXME)
- Trigger: Accessing success field when it's undefined could cause errors
- Workaround: Field access is commented out currently
- Note: Needs clarification on whether Helius API response includes this field

## Security Considerations

**API Key Exposure Risk:**
- Risk: HELIUS_API_KEY is required in .env file and used as query parameter in API calls
- Files: `src/fetchers/helius.ts` (lines 12, 42, 107, 151)
- Current mitigation: .env file is in .gitignore, key passed as query param
- Recommendations: Consider using HTTP Authorization header instead of query params for Helius API calls if supported; add checks to prevent logging API keys in error messages

**Unvalidated Wallet Address Input:**
- Risk: Wallet addresses are used directly in API requests without validation
- Files: `src/fetchers/helius.ts` (line 40), `src/fetchers/dexscreener.ts` (line 25)
- Current mitigation: None - addresses could be malformed
- Recommendations: Add Solana address validation using base58 checks before making API calls

**Missing Environment Configuration Validation:**
- Risk: Missing HELIUS_API_KEY throws error only at runtime when createHeliusFetcher() is called
- Files: `src/fetchers/helius.ts` (lines 151-154)
- Current mitigation: Error is thrown with clear message
- Recommendations: Add startup validation that checks all required env vars before app runs

**Error Messages May Leak Implementation Details:**
- Risk: Error messages in catch blocks show raw API responses which could contain sensitive info
- Files: `src/fetchers/helius.ts` (line 91), `src/fetchers/dexscreener.ts` (line 69, 116)
- Current mitigation: Only in catch blocks
- Recommendations: Sanitize error messages before returning to user; log full errors server-side only

## Performance Bottlenecks

**Helius Pagination Without Rate Limiting:**
- Problem: Transaction fetching uses while loop with no rate limiting between requests
- Files: `src/fetchers/helius.ts` (lines 39-78)
- Cause: Loop makes back-to-back API calls which can hit rate limits (300/min for free tier)
- Improvement path: Add configurable rate limit delays, track request count, implement backoff when rate limit errors occur

**Large Dataset Handling Unknown:**
- Problem: No pagination or limits defined for large wallet histories (old wallets could have thousands of transactions)
- Files: `src/fetchers/helius.ts` (line 44 sets limit: 100)
- Cause: Memory could be exhausted if a wallet has very old transaction history
- Improvement path: Implement streaming or chunked processing; add memory usage monitoring

**DexScreener API Calls for Each Token Price:**
- Problem: Token price lookup makes separate API call per token (no batch endpoint available)
- Files: `src/fetchers/dexscreener.ts` (lines 80-95)
- Cause: DexScreener API design - no bulk price endpoint available
- Improvement path: Consider caching token prices with TTL; implement local price cache; batch price queries when possible

**Type Conversions in Hot Paths:**
- Problem: `parseFloat()` called on every token price check; no error handling for edge cases
- Files: `src/fetchers/dexscreener.ts` (lines 54-58)
- Cause: Multiple validation checks and conversions happen in sequence for each price
- Improvement path: Pre-process prices at fetch time; cache converted values

## Fragile Areas

**Helius API Response Parsing:**
- Files: `src/fetchers/helius.ts` (lines 48, 110)
- Why fragile: Code assumes response.data structure is correct without defensive checks; no schema validation
- Safe modification: Add runtime validation of HeliusTransaction type; use JSON schema validator before parsing
- Test coverage: Only basic connection test exists; no tests for actual transaction parsing logic

**DexScreener Price Extraction:**
- Files: `src/fetchers/dexscreener.ts` (lines 27-60)
- Why fragile: Multiple null checks and string validations make code brittle; changing API response could break multiple places
- Safe modification: Create separate validation layer; add comprehensive error cases to tests
- Test coverage: No unit tests for price extraction logic; only manual integration test exists

**Transaction Timestamp Filtering:**
- Files: `src/fetchers/helius.ts` (lines 56-58)
- Why fragile: Compares timestamp fields without timezone awareness; could miss or duplicate transactions at boundaries
- Safe modification: Add comprehensive tests for boundary conditions (midnight UTC, DST transitions, etc.)
- Test coverage: No test coverage for edge cases

**Dependency on External APIs:**
- Files: All of `src/fetchers/`
- Why fragile: Code tightly coupled to Helius and DexScreener API response formats; no adapter pattern for alternative providers
- Safe modification: Extract API response parsing to separate modules; define internal interface that adapters implement
- Test coverage: Manual tests only; no mocked tests for API failures or alternative providers

## Scaling Limits

**Sequential Processing:**
- Current capacity: One wallet scored at a time
- Limit: Processing 1000 wallets takes 30+ minutes (if each takes ~2 seconds)
- Scaling path: Implement concurrent wallet processing with configurable worker count; add queue system for batch jobs

**Memory Usage for Transaction History:**
- Current capacity: All transactions loaded into memory for a single wallet
- Limit: Wallets with 10,000+ transactions could exceed available memory
- Scaling path: Implement streaming transaction processor; write to disk; implement pagination at application layer

**API Rate Limits Not Tracked:**
- Current capacity: Helius free tier: 300 requests/minute
- Limit: Scoring batch of 100 wallets could quickly exceed rate limit (each wallet needs multiple requests)
- Scaling path: Implement global rate limiter; add queue with intelligent batching; support multiple API keys

**No Caching Layer:**
- Current capacity: Every score request fetches fresh data from APIs
- Limit: Same wallet scored twice = duplicate API calls and latency
- Scaling path: Implement caching with TTL config; add cache invalidation strategy; consider Redis for distributed systems

## Dependencies at Risk

**Helius API Dependency:**
- Risk: Critical dependency for transaction data; if Helius API changes or goes down, application stops working
- Impact: No fallback provider; entire wallet scoring depends on Helius
- Migration plan: Add RPC node fallback (using @solana/web3.js) for transaction fetching; implement adapter pattern to support multiple providers

**Axios Version:**
- Risk: axios@1.6.2 is relatively old; potential security vulnerabilities in HTTP client
- Impact: Could be exploited if serving user requests over network
- Migration plan: Update to latest axios@1.x; audit for security advisories regularly

**Missing Major Frameworks:**
- Risk: Critical modules (calculators, scoring, categorization) not yet implemented - framework/library choices for these not yet made
- Impact: Could lead to inconsistent patterns if not chosen carefully
- Migration plan: Evaluate libraries for PnL calculation (bignumber.js already included), consider Joi for schema validation (already in deps), choose consistent patterns

## Test Coverage Gaps

**No Unit Tests for Fetchers - High Priority:**
- What's not tested: Error handling, rate limit detection, timestamp filtering, price validation
- Files: `src/fetchers/helius.ts`, `src/fetchers/dexscreener.ts`
- Risk: Changes to error handling could break silently; rate limiting bugs go undetected
- Priority: High - these are critical paths that touch external APIs

**No Tests for Core Logic - Critical:**
- What's not tested: Transaction parsing (not yet implemented), PnL calculation (not yet implemented), metrics calculation (not yet implemented), scoring algorithm (not yet implemented), categorization (not yet implemented)
- Files: All directories under `src/parsers/`, `src/calculators/`, `src/metrics/`, `src/categorization/`, `src/scoring/`
- Risk: Core business logic will have unknown bugs; incomplete refactoring undetected
- Priority: Critical - these are the main features of the application

**No Integration Tests:**
- What's not tested: Full wallet scoring workflow end-to-end
- Files: Test file mentioned in package.json (`tests/integration/scoring.test.ts`) does not exist
- Risk: Components work in isolation but fail when integrated
- Priority: High - critical for confidence in releases

**No Mocked API Tests:**
- What's not tested: Fetcher behavior with mock responses; error paths; rate limiting
- Files: `src/fetchers/helius.ts`, `src/fetchers/dexscreener.ts`
- Risk: Integration tests depend on live APIs; flakey and slow
- Priority: High - enables fast feedback loop

**No Type Validation Tests:**
- What's not tested: Whether API responses actually match TypeScript types
- Files: All fetchers and parsers
- Risk: Type safety is false confidence if runtime data doesn't match types
- Priority: Medium - good practice for external API integrations

## Missing Critical Features

**Transaction Parsing - Blocker:**
- Problem: No implementation to parse Helius transaction data into standardized Swap format
- Blocks: Cannot calculate metrics, cannot score wallets, cannot export results
- Priority: Critical - first step in scoring pipeline

**Metrics Calculation - Blocker:**
- Problem: No implementation for P&L, win rate, ROI, Sharpe ratio, max drawdown calculations
- Blocks: Cannot categorize wallets, cannot score wallets
- Priority: Critical - core feature

**Wallet Categorization - Blocker:**
- Problem: No implementation to classify wallets into Smart Money, Whale, Sniper, Emerging, Degen, KOL categories
- Blocks: Cannot provide wallet classifications, cannot export results
- Priority: Critical - core feature

**Scoring Algorithm - Blocker:**
- Problem: No implementation to combine metrics and produce 0-100 score
- Blocks: Cannot provide main feature (wallet scores)
- Priority: Critical - core feature

**Export Functionality - Blocker:**
- Problem: No implementation to export results to JSON/CSV/Axiom formats
- Blocks: Cannot fulfill README promise of "Export to Axiom" feature
- Priority: Critical - core feature

**Error Recovery - Important:**
- Problem: No retry, no circuit breaker, no graceful degradation
- Blocks: Single API error terminates entire job
- Priority: High - affects reliability

---

*Concerns audit: 2026-03-10*
