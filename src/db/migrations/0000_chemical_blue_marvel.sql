CREATE TABLE `removal_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`reason` text NOT NULL,
	`detection_details` text,
	`removed_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`removed_by` text DEFAULT 'auto' NOT NULL,
	`restored_at` integer
);
--> statement-breakpoint
CREATE TABLE `swaps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`tx_signature` text NOT NULL,
	`dex` text NOT NULL,
	`token_mint` text NOT NULL,
	`side` text NOT NULL,
	`token_amount` real NOT NULL,
	`sol_amount` real NOT NULL,
	`timestamp` integer NOT NULL,
	`slot` integer NOT NULL,
	`fee_sol` real,
	`cost_basis_sol` real,
	`realized_pnl_sol` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `swaps_tx_signature_unique` ON `swaps` (`tx_signature`);--> statement-breakpoint
CREATE TABLE `token_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_mint` text NOT NULL,
	`signal_score` real,
	`smart_wallet_count` integer,
	`buy_velocity_1h` real,
	`exit_pressure` real,
	`pnl_weighted_holder_score` real,
	`coordination_discount` real,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_signals_token_mint_unique` ON `token_signals` (`token_mint`);--> statement-breakpoint
CREATE TABLE `wallet_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`win_rate` real,
	`realized_pnl_sol` real,
	`sharpe_ratio` real,
	`max_drawdown` real,
	`recency_score` real,
	`calculated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_metrics_wallet_address_unique` ON `wallet_metrics` (`wallet_address`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`label` text,
	`status` text DEFAULT 'tracked' NOT NULL,
	`score` real,
	`detection_status` text,
	`added_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
	`last_checked_at` integer,
	`history_complete` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallets_address_unique` ON `wallets` (`address`);