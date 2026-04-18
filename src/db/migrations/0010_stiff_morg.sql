-- Phase 14: Signal Outcome Tracking schema additions
-- Adds 13 new columns to signal_events and creates outcome_alert_log dedup table

-- OUTCOME-01: 30m window columns
ALTER TABLE `signal_events` ADD `outcome_30m_price` real;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `outcome_30m_pct` real;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `outcome_30m_status` text;--> statement-breakpoint

-- OUTCOME-02: peak price tracking (time_to_peak_minutes derived at query time as (peak_price_at - fired_at) / 60000)
ALTER TABLE `signal_events` ADD `peak_price` real;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `peak_price_at` integer;--> statement-breakpoint

-- OUTCOME-03: rug classification
ALTER TABLE `signal_events` ADD `is_rug` integer DEFAULT false NOT NULL;--> statement-breakpoint

-- OUTCOME-04: milestone flags + timestamps
ALTER TABLE `signal_events` ADD `hit_50` integer;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `hit_50_at` integer;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `hit_100` integer;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `hit_100_at` integer;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `hit_300` integer;--> statement-breakpoint
ALTER TABLE `signal_events` ADD `hit_300_at` integer;--> statement-breakpoint

-- OUTCOME-05: market cap at signal creation time
ALTER TABLE `signal_events` ADD `signal_market_cap` real;--> statement-breakpoint

-- Dedup table for outcome alerts — prevents double-firing alerts for the same signal/event type
CREATE TABLE `outcome_alert_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_event_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`fired_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `outcome_alert_log_unique` ON `outcome_alert_log` (`signal_event_id`,`event_type`);
