# Pitfalls: Solana Memecoin Wallet Tracking

**Domain:** Smart money tracking, bundle detection, signal generation
**Date:** 2026-03-11

## Critical Pitfalls

### 1. False-Positive Bundle Detection
**Risk**: Legitimate traders flagged as bundlers → smart wallet list gets hollowed out
**Warning signs**: Wallet list shrinks rapidly after detection runs; users report known good wallets removed
**Why it happens**: Multiple unrelated traders buying a token in the same block is normal at launch; naive slot-clustering flags them all
**Prevention**:
- Require multiple correlated signals before flagging (not just same-block buys)
- Bundle = same block AND same token AND wallets share funding source (same wallet funded them) OR coordinated across many tokens
- Use confidence threshold — flag as "suspected" before "confirmed"; confirmed triggers removal
- Phase: Bundle Detection phase — build in tiered confidence (suspected → review → confirmed)

### 2. Win Rate Gaming by Ruggers
**Risk**: Dev/bundler wallet shows 90%+ win rate because they control token price during their trades
**Warning signs**: Wallet has very high win rate but trades extremely early on every token (sniper pattern), short hold durations, high SOL profit from tokens that later went to zero
**Prevention**:
- Risk-adjusted return (Sharpe-like) as primary score component — not win rate
- Penalize wallets with >80% trades in first 5 blocks of token launch
- Check: did this wallet hold while token dumped, or exit before dump (exit timing analysis)
- Phase: Scoring phase — weight risk-adjusted return at 40%+ of score

### 3. Helius Rate Limit Exhaustion
**Risk**: Polling 100+ wallets every 30s blows through 300 req/min free tier → API returns 429 → monitoring stops
**Warning signs**: Log shows increasing 429 errors; monitoring loop taking >30s; gaps in swap history
**Math**: 100 wallets × 1 Helius call each = 100 req per cycle. At 30s cycles = 200 req/min. Add discovery/scoring calls and you exceed 300/min.
**Prevention**:
- p-queue concurrency limiting (max 4-5 concurrent Helius calls)
- Exponential backoff on 429 with p-retry
- Incremental fetching: only fetch txs since `last_checked_at`, not full history
- Prioritize active wallets (recently traded) over inactive ones in queue
- Phase: Monitoring Loop phase — build rate limit management from day 1

### 4. Stale Position Tracking (PnL Miscalculation)
**Risk**: Incomplete transaction history causes wrong PnL — missed buys mean sells look like 100% profit; missed sells mean positions look open
**Warning signs**: Wallets show unrealistically high win rates or open positions that are clearly old
**Why it happens**: Helius pagination limits, filtering by date range misses earlier buys for tokens still held
**Prevention**:
- On first wallet import: fetch full history (no date filter), paginate completely
- Only incremental fetch on subsequent cycles
- Track "history_complete" flag per wallet — don't calculate metrics until full history imported
- Phase: Transaction Parsing phase — handle full history import separately from incremental

### 5. Token Signal False Positives (Coordinated Manipulation)
**Risk**: Multiple wallets that appear independent are actually coordinated (funded by same source, share operator) → signal fires but it's artificial
**Warning signs**: Tokens showing high scores but wallets behind them all funded from same originating wallet
**Prevention**:
- Check wallet funding source — wallets funded by same address are likely coordinated
- Discount signal score when clustered wallets drive it (reduce effective unique wallet count)
- Bundle detection should catch most of this if detection runs before scoring
- Phase: Signal Engine phase — add wallet independence check to signal score

### 6. DEX Parsing Fragility
**Risk**: Helius API response format changes, or a new DEX gains market share — swaps silently fail to parse → missing data
**Warning signs**: Swap count drops suddenly; wallets show less activity than expected; "unknown DEX" errors in logs
**Prevention**:
- Log unrecognized DEX instruction types — don't silently drop
- Track parse failure rate — alert if >5% of transactions fail to parse
- Separate DEX parsers per DEX (not one giant function) — isolate breakage
- Phase: Transaction Parsing phase — defensive parsing with logging from the start

### 7. Auto-Removal Too Aggressive
**Risk**: Good wallets get auto-removed during a market downturn when all wallets temporarily underperform
**Warning signs**: Many wallets removed in same time window; correlates with broad market dip
**Prevention**:
- Use rolling window for score evaluation (30-day window), not spot score
- Require score to be low for N consecutive cycles before triggering removal
- Market-relative threshold: if >50% of all tracked wallets drop score simultaneously, pause auto-removal
- Phase: Auto-Removal phase — build in cooling-off period and market context check

### 8. Discovery Pollution
**Risk**: Auto-discovery pulls in low-quality wallets that dilute signal quality
**Warning signs**: Average wallet score drops after discovery runs; signal accuracy decreases
**Prevention**:
- Set high bar for discovery: candidate must score >70 from historical data before adding
- Run bundle/scam detection on candidates before adding to tracker
- Add newly discovered wallets as "probation" status — don't include in signals until 7 days of tracked activity
- Phase: Wallet Discovery phase — probation period is critical

## Lower Priority Pitfalls

### Alert Fatigue
- Telegram alerts too frequent → user ignores them
- Prevention: Rate limit alerts per token (max 1 per token per 2h), threshold tuning

### Memory Leaks in Long-Running Process
- Monitoring loop runs 24/7 — in-memory accumulation of swap data
- Prevention: Rely on SQLite, don't cache swap arrays in memory between cycles

### SQLite Write Contention
- Monitoring loop writing while API reads
- Prevention: WAL mode (`PRAGMA journal_mode=WAL`) — enables concurrent reads during writes
