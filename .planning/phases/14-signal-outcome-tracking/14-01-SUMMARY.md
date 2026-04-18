---
plan: 14-01
phase: 14-signal-outcome-tracking
status: complete
completed: 2026-04-09
---

# Summary: Schema Migration — Phase 14 Columns

## What Was Built

Extended `signal_events` table with 13 new columns supporting all Phase 14 outcome tracking requirements, and created `outcome_alert_log` table for alert deduplication.

## Key Files

### Created
- `src/db/migrations/0010_stiff_morg.sql` — SQLite migration adding all new columns and outcome_alert_log table

### Modified
- `src/db/schema.ts` — Extended signal_events with outcome_30m_price/pct/status, peak_price, peak_price_at, is_rug, hit_50/100/300 + _at columns, signal_market_cap; added outcome_alert_log table with unique constraint on (signal_event_id, event_type)

## Decisions

- `is_rug` defaults to `false` (not NULL) — simplifies WHERE guards in resolver
- `time_to_peak_minutes` is derived at query time as `(peak_price_at - fired_at) / 60000` — not stored as a column
- `outcome_alert_log` uses a unique index on `(signal_event_id, event_type)` to enable INSERT OR IGNORE dedup pattern

## Self-Check: PASSED

All must_haves verified:
- ✓ outcome_30m_price, outcome_30m_pct, outcome_30m_status columns present
- ✓ peak_price and peak_price_at columns present
- ✓ is_rug boolean column present (default false)
- ✓ hit_50/hit_50_at, hit_100/hit_100_at, hit_300/hit_300_at columns present
- ✓ signal_market_cap column present
- ✓ outcome_alert_log table exists with unique constraint on (signal_event_id, event_type)
- ✓ Migration file generated at src/db/migrations/0010_stiff_morg.sql
- ✓ time_to_peak_minutes is derived, not stored
