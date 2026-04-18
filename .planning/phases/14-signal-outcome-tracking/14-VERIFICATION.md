---
phase: 14-signal-outcome-tracking
verified: 2026-04-05T00:00:00Z
status: passed
score: 24/24 must-haves verified
re_verification: false
---

# Phase 14: Signal Outcome Tracking — Verification Report

**Phase Goal:** Signal outcomes produce a forward-testing dataset that accurately reflects real on-chain performance — including fast movers, peak prices, and rugged tokens
**Verified:** 2026-04-05
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                              | Status     | Evidence                                                                                          |
|----|---------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------------|
| 1  | signal_events table has 30m outcome columns                                                        | VERIFIED   | schema.ts lines 189-191; migration 0010_stiff_morg.sql has 3 ADD statements for outcome_30m_*    |
| 2  | signal_events table has peak_price and peak_price_at columns                                      | VERIFIED   | schema.ts lines 193-194; migration adds both columns                                              |
| 3  | signal_events table has is_rug boolean column (default false)                                     | VERIFIED   | schema.ts line 196; migration `ADD is_rug integer DEFAULT false NOT NULL`                         |
| 4  | signal_events table has hit_50/at, hit_100/at, hit_300/at milestone columns                      | VERIFIED   | schema.ts lines 198-203; all 6 columns in migration                                               |
| 5  | signal_events table has signal_market_cap column                                                  | VERIFIED   | schema.ts line 205; migration adds column                                                         |
| 6  | outcome_alert_log table exists with unique constraint on (signal_event_id, event_type)            | VERIFIED   | schema.ts lines 212-220; migration has CREATE TABLE + CREATE UNIQUE INDEX                         |
| 7  | resolveOutcomes() processes 30m window before 1h/4h/24h                                          | VERIFIED   | outcome-resolver.ts lines 178-218 — 30m loop is first, above 1h/4h/24h loops                    |
| 8  | Peak price updated as running max after every window resolution                                   | VERIFIED   | updatePeakPrice() helper called after all four window loops (lines 214, 257, 323, 385)           |
| 9  | Rug detection fires at 4h window: ratio >= 0.3 AND drop >= 90%, all four statuses set to 'rug'   | VERIFIED   | outcome-resolver.ts lines 289-327; all four outcome_*_status set to 'rug' in single UPDATE       |
| 10 | 24h loop excludes already-rugged tokens via eq(is_rug, false)                                    | VERIFIED   | outcome-resolver.ts line 360: `eq(signal_events.is_rug, false)` in 24h WHERE clause             |
| 11 | Milestone flags written when pct crosses 50/100/300 thresholds                                   | VERIFIED   | updateMilestones() helper, MILESTONE_COLUMNS map, called from all window loops                   |
| 12 | is_fully_resolved requires all FOUR window statuses non-null (30m+1h+4h+24h)                    | VERIFIED   | outcome-resolver.ts lines 396-404: isNotNull(outcome_30m_status) + 3 sql IS NOT NULL checks      |
| 13 | getAccuracyStats() returns 4-window stats with rug exclusion                                     | VERIFIED   | accuracy.ts lines 45-62: hits_30m, avg_return_30m in SELECT; is_rug exclusion in WHERE          |
| 14 | TierAccuracy interface has hits_30m, hit_rate_30m, avg_return_30m                                | VERIFIED   | accuracy.ts lines 21-29: all three fields present in exported interface                          |
| 15 | Dashboard accuracy partial renders 4-column table (30m/1h/4h/24h)                               | VERIFIED   | accuracy_stats.ejs lines 12-19: thead has 30m Hit%, 1h Return, 4h Return, 24h Hit%               |
| 16 | Dashboard partial shows time-to-peak in minutes derived from (peak_price_at - fired_at)/60000    | VERIFIED   | accuracy_stats.ejs lines 47-55: avgPeakMinutes computed and conditionally rendered               |
| 17 | Rug outcomes excluded note visible in partial                                                     | VERIFIED   | accuracy_stats.ejs line 46: `<p>Rug outcomes excluded from all stats.</p>`                       |
| 18 | /api/accuracy/partial passes stats + recentEvents to accuracy_stats.ejs                          | VERIFIED   | accuracy.ts line 24: `reply.view('partials/accuracy_stats', { stats, recentEvents, MIN_SAMPLE })` |
| 19 | DexScreenerFetcher has getTokenPriceAndMarketCap() returning price + marketCap                   | VERIFIED   | dexscreener.ts lines 80-104: method exists, returns {price, marketCap} from best Solana pair     |
| 20 | engine.ts captures signal_market_cap at signal creation                                           | VERIFIED   | engine.ts lines 216-227: getTokenPriceAndMarketCap() called, signal_market_cap inserted          |
| 21 | outcome-alerts.ts exports runOutcomeAlertCycle() firing threshold + milestone alerts             | VERIFIED   | outcome-alerts.ts line 41: exported function; threshold alert block lines 82-130; milestones 133-160 |
| 22 | outcome_alert_log dedup prevents re-fires (INSERT OR IGNORE pattern)                             | VERIFIED   | outcome-alerts.ts lines 87-93 and 120-124: dedup check + onConflictDoNothing() insert           |
| 23 | runOutcomeAlertCycle wired to cycleEmitter in bot/index.ts                                       | VERIFIED   | bot/index.ts lines 4, 30-33: import + second cycleEmitter.on('cycle') listener                  |
| 24 | All new behavior covered by tests (outcome-resolver.test.ts, accuracy.test.ts)                   | VERIFIED   | 6 describe blocks for 30m/peak/rug/24h-guard/milestones/4-window-guard; accuracy rug exclusion tests |

**Score:** 24/24 truths verified

---

### Required Artifacts

| Artifact                                              | Provided                                                       | Status     | Details                                                                              |
|------------------------------------------------------|----------------------------------------------------------------|------------|--------------------------------------------------------------------------------------|
| `src/db/schema.ts`                                   | Extended signal_events + outcome_alert_log                     | VERIFIED   | 13 new columns, uniqueIndex on outcome_alert_log                                     |
| `src/db/migrations/0010_stiff_morg.sql`              | SQLite migration for all schema changes                        | VERIFIED   | 13 ADD COLUMN statements + CREATE TABLE + CREATE UNIQUE INDEX (note: auto-named by drizzle-kit, not 0010_signal_outcome_v2.sql — functionally identical) |
| `src/signals/outcome-resolver.ts`                    | Extended resolveOutcomes() with 30m, peak, rug, milestones    | VERIFIED   | Contains outcome_30m_price, peak_price, is_rug, hit_50, updatePeakPrice, updateMilestones |
| `src/signals/__tests__/outcome-resolver.test.ts`     | Tests for all new resolver behavior                            | VERIFIED   | 13 new assertions across 6 describe blocks                                           |
| `src/signals/accuracy.ts`                            | 4-window TierAccuracy with rug exclusion                       | VERIFIED   | hits_30m, hit_rate_30m, avg_return_30m, is_rug WHERE filter                         |
| `src/signals/__tests__/accuracy.test.ts`             | Tests for rug exclusion and 30m accuracy                       | VERIFIED   | rug exclusion x3 tests, 30m window x5 tests                                         |
| `src/api/views/partials/accuracy_stats.ejs`          | 4-column table + time-to-peak + rug note                       | VERIFIED   | 4-window table, avgPeakMinutes derived, rug exclusion note present                  |
| `src/api/bot/outcome-alerts.ts`                      | runOutcomeAlertCycle() — threshold + milestone alerts          | VERIFIED   | Exported, queries candidates, threshold + milestone logic, dedup                    |
| `src/api/bot/index.ts`                               | runOutcomeAlertCycle wired to cycleEmitter                     | VERIFIED   | Import on line 4, second cycleEmitter.on('cycle') on lines 30-33                   |
| `src/signals/engine.ts`                              | signal_market_cap captured at signal creation                  | VERIFIED   | getTokenPriceAndMarketCap() call, signal_market_cap in insert                       |
| `src/fetchers/dexscreener.ts`                        | getTokenPriceAndMarketCap() method                             | VERIFIED   | Lines 80-104: full implementation returning {price, marketCap}                      |

---

### Key Link Verification

| From                                    | To                                    | Via                                                     | Status  | Details                                                                                  |
|-----------------------------------------|---------------------------------------|---------------------------------------------------------|---------|------------------------------------------------------------------------------------------|
| `src/db/schema.ts`                      | `src/db/migrations/`                  | pnpm drizzle-kit generate                               | WIRED   | Migration 0010_stiff_morg.sql generated and matches schema columns                      |
| `src/signals/outcome-resolver.ts`       | `src/db/schema.ts`                    | Drizzle column refs (outcome_30m_price, is_rug, hit_50) | WIRED   | All new columns referenced by name in resolver SELECT/UPDATE statements                  |
| `src/signals/outcome-resolver.ts`       | `src/fetchers/dexscreener.ts`         | fetcher.getTokenPrice() per window                      | WIRED   | getTokenPrice() called in all four window loops                                         |
| `src/api/views/partials/accuracy_stats.ejs` | `src/api/routes/accuracy.ts`     | /api/accuracy/partial HTMX route                        | WIRED   | reply.view('partials/accuracy_stats', ...) on accuracy.ts line 24                      |
| `src/signals/accuracy.ts`               | `src/db/schema.ts`                    | is_rug in WHERE, outcome_30m columns in SELECT          | WIRED   | signal_events.is_rug referenced in WHERE; outcome_30m_status/pct in SELECT              |
| `src/api/bot/outcome-alerts.ts`         | `src/db/schema.ts (outcome_alert_log)`| INSERT OR IGNORE dedup before each alert                | WIRED   | outcome_alert_log imported and used in dedup check + insert on every alert path         |
| `src/api/bot/outcome-alerts.ts`         | `grammy bot.api.sendMessage()`        | HTML parse mode Telegram message                        | WIRED   | bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' }) on lines 119 and 149          |
| `src/signals/engine.ts`                 | `src/fetchers/dexscreener.ts`         | getTokenPriceAndMarketCap() at tier transition          | WIRED   | engine.ts line 216 calls dexFetcher.getTokenPriceAndMarketCap(tokenMint)                |
| `src/api/bot/index.ts`                  | `src/api/bot/outcome-alerts.ts`       | cycleEmitter.on('cycle') listener                       | WIRED   | Imported line 4; wired on lines 30-33 inside chatId guard                              |
| `dashboard.ejs`                         | `/api/accuracy/partial`               | hx-get + hx-trigger="sse:cycle"                         | WIRED   | dashboard.ejs line 5-6: hx-get="/api/accuracy/partial" hx-trigger="sse:cycle"          |

---

### Requirements Coverage

| Requirement  | Source Plans          | Description                                                                                              | Status       | Evidence                                                                                              |
|--------------|-----------------------|----------------------------------------------------------------------------------------------------------|--------------|-------------------------------------------------------------------------------------------------------|
| OUTCOME-01   | 14-01, 14-02          | Signal events tracked at 30m window (memecoins peak before 1h)                                         | SATISFIED    | outcome_30m_price/pct/status in schema + migration; 30m window loop first in resolveOutcomes()        |
| OUTCOME-02   | 14-01, 14-02          | Peak price and time-to-peak tracked per signal                                                          | SATISFIED    | peak_price/peak_price_at columns; updatePeakPrice() running max; (peak_price_at-fired_at)/60000 in EJS |
| OUTCOME-03   | 14-01, 14-02, 14-03   | Rugged tokens classified as 'rug' (not 'failed') — fixes survivorship bias                              | SATISFIED    | is_rug column + rug detection at 4h overwrites all four statuses; accuracy.ts excludes is_rug=true    |
| OUTCOME-04   | 14-01, 14-02          | Fixed % tier milestones (50%/100%/300%) stored per resolved outcome                                    | SATISFIED    | hit_50/100/300 + _at columns; updateMilestones() reads OUTCOME_MILESTONES env, writes flags           |
| OUTCOME-05   | 14-01, 14-04          | Configurable % threshold Telegram alert when tracked signal token hits milestone                        | SATISFIED    | runOutcomeAlertCycle() fires threshold + milestone alerts with dedup via outcome_alert_log            |
| OUTCOME-06   | 14-03                 | Multi-timeframe accuracy display on dashboard (30m/1h/4h/24h per tier with return distribution)       | SATISFIED    | accuracy_stats.ejs 4-column table; getAccuracyStats() returns 4-window TierAccuracy objects          |

No orphaned requirements detected. All 6 OUTCOME-* requirements appear in REQUIREMENTS.md Phase 14 mapping and are covered by at least one plan.

---

### Anti-Patterns Found

| File                              | Line | Pattern                                       | Severity | Impact                                                         |
|-----------------------------------|------|-----------------------------------------------|----------|----------------------------------------------------------------|
| `src/fetchers/dexscreener.ts`     | 48   | `// TODO: add market cap metrics`              | Info     | Comment predates Phase 14 — getTokenPriceAndMarketCap() now exists above it; comment is stale but harmless |
| `src/fetchers/dexscreener.ts`     | 63   | `// TODO: Implement automatic retry`          | Info     | Pre-existing TODO in getTokenPrice(); not introduced by Phase 14; no impact on outcome tracking              |

No blockers. No stub implementations. No orphaned wiring. The two TODOs are pre-existing and do not affect Phase 14 deliverables.

---

### Human Verification Required

#### 1. Live Telegram Alert Firing

**Test:** Deploy to an environment with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID set. Wait for a signal to fire and reach its 30m/1h window resolution with a return >= ALERT_THRESHOLD_PCT (default 100%). Check Telegram.
**Expected:** One full threshold alert fires exactly once per signal event. No duplicate alerts on subsequent cycles.
**Why human:** Requires real Telegram credentials, a live database with resolved signal_events, and real-time cycle execution. Cannot be verified by grep or static analysis.

#### 2. Dashboard 4-Column Accuracy Table Rendering

**Test:** Open the dashboard in a browser with at least 20 fully-resolved non-rug signal_events. Check the accuracy section.
**Expected:** Table shows columns: Tier | Signals | 30m Hit% | 1h Return | 4h Return | 24h Hit%. Rug exclusion note is visible below the table. Time-to-peak section appears when peak_price_at data is available.
**Why human:** EJS rendering correctness and CSS layout require a running server and real data. "Insufficient data (N/20)" message behavior also needs visual confirmation.

#### 3. Rug Classification End-to-End

**Test:** Inject a test signal_events row with coordinated_wallet_count/smart_wallet_count ratio >= 0.3 and an entry_price set. After 4h, trigger resolveOutcomes() with a mocked or real DexScreener price showing >= 90% drop.
**Expected:** is_rug=true, all four outcome_*_status = 'rug', token excluded from accuracy stats denominator, no 24h resolution attempt.
**Why human:** While unit tests cover this path, end-to-end verification with a real database and actual timing confirms no edge cases from production DB state (e.g. pre-Phase-14 rows with NULL is_rug).

---

### Gaps Summary

No gaps. All 24 must-haves are verified. All 6 requirement IDs (OUTCOME-01 through OUTCOME-06) are satisfied with implementation evidence. All key links between components are wired. The two anti-patterns found are pre-existing stale TODOs in dexscreener.ts that do not affect Phase 14 functionality.

The migration file was auto-named `0010_stiff_morg.sql` by drizzle-kit instead of the planned `0010_signal_outcome_v2.sql` — this is a drizzle-kit naming convention (it generates hash-based names) and is correctly noted in the Plan 01 SUMMARY. The file contains exactly the expected schema changes.

---

_Verified: 2026-04-05_
_Verifier: Claude (gsd-verifier)_
