# Echo Wallet Tracker

## What This Is

A personal Solana memecoin intelligence tool that automatically discovers profitable traders on-chain, monitors their activity in near-real-time, and generates token buy/sell scores based on smart money behavior. It surfaces actionable trading signals via a web dashboard and Telegram alerts — helping the user catch high-conviction plays before they pump.

## Core Value

Know what smart money is doing before the crowd does — and trust the signals because the noise (bots, bundlers, dev wallets) has already been filtered out.

## Requirements

### Validated

- ✓ Helius API integration for Solana transaction fetching — existing
- ✓ DexScreener API integration for token price data — existing
- ✓ TypeScript type definitions for wallet, transaction, swap, metrics, scoring — existing
- ✓ Project structure with layered architecture (fetchers, parsers, calculators, scoring, exporters) — existing

### Active

- [ ] Transaction parsing — convert Helius raw transactions to normalized Swap objects
- [ ] Metrics calculation — PnL, win rate, ROI, Sharpe ratio, drawdown per wallet
- [ ] Wallet discovery — extract top traders from a token address (on-chain graph traversal + KOL list seeding)
- [ ] Bundle/scam detection — identify bundlers, dev wallets, wash traders, sniper bots and flag/exclude them
- [ ] Wallet scoring system — 0-100 score based on risk-adjusted returns (not just win rate)
- [ ] Auto wallet removal — remove wallets that drop below quality thresholds OR are flagged as scam/bundle
- [ ] Token signal engine — per-token buy/sell score based on smart wallet accumulation, exit patterns, velocity, PnL weighting
- [ ] Near-real-time monitoring — poll wallet activity every ~30s and update scores
- [ ] Web dashboard — live token signal list, wallet table, drill-down per wallet/token
- [ ] Telegram bot — push alerts when high-conviction signals fire

### Out of Scope

- OAuth / multi-user auth — personal tool, single-user only
- Mobile app — web-first
- Historical backtesting UI — out of v1 scope
- Social graph visualization — interesting but not core to signal generation

## Context

Existing codebase has the full architecture scaffolded: fetchers (Helius + DexScreener), type system, CLI stub, and directory structure for parsers/calculators/metrics/categorization/scoring/exporters. All core layers are empty placeholders — nothing from the pipeline is implemented yet.

Key concerns from codebase audit:
- No retry logic on API calls (rate limit fragility)
- DexScreener price fetching is sequential (slow at scale)
- No caching layer — every run re-fetches everything
- Wallet addresses not validated before API calls
- All "core" modules are stubs — nothing produces output yet

The scoring must go beyond win rate because high win rate can be achieved by bundling + rugging. Bundle/scam detection must be a prerequisite gate — wallets that pass detection are the only ones scored.

## Constraints

- **Tech Stack**: TypeScript + Node.js — continue existing stack, no rewrites
- **APIs**: Helius (transactions), DexScreener (prices) — already integrated, extend not replace
- **Latency**: ~30s refresh cycle for monitoring (near-real-time, not WebSocket)
- **Solo use**: No auth, no multi-tenancy needed in v1
- **Budget**: Helius free tier (300 req/min) — rate limiting is a real constraint

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Score wallets on risk-adjusted returns, not win rate alone | Win rate gameable by bundlers/ruggers; risk-adj catches this | — Pending |
| Bundle detection as prerequisite gate (not just a flag) | Keeps signal quality high; prevents poisoned smart money list | — Pending |
| ~30s polling vs WebSocket streaming | Simpler to build, still actionable for most memecoin plays | — Pending |
| Web dashboard + Telegram (both) | Dashboard for browsing alpha; Telegram for time-sensitive alerts | — Pending |
| Personal tool (no auth/multi-user) | Reduces scope massively; can add later if needed | — Pending |

---
*Last updated: 2026-03-10 after initialization*
