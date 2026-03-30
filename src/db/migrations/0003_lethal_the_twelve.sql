-- Phase 4: Add score_history table and sub-score columns to wallet_metrics.
-- score_history: append-only per-wallet score log for rolling-window queries (Phase 5)
-- wallet_metrics additions: sub-score breakdown for Phase 7 display + trade count columns

CREATE TABLE `score_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`score` real NOT NULL,
	`scored_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `score_history_wallet_scored` ON `score_history` (`wallet_address`,`scored_at` DESC);
--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD `score_total` real;--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD `score_risk_adjusted` real;--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD `score_win_rate` real;--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD `score_consistency_recency` real;--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD `score_activity_health` real;--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD `trade_count` integer;--> statement-breakpoint
ALTER TABLE `wallet_metrics` ADD `recent_trade_count` integer;
