ALTER TABLE `wallets` ADD COLUMN `probation_until` integer;
--> statement-breakpoint
CREATE TABLE `discovery_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token_mint` text NOT NULL,
  `started_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
  `completed_at` integer,
  `total_candidates` integer DEFAULT 0 NOT NULL,
  `added_count` integer DEFAULT 0 NOT NULL,
  `rejected_count` integer DEFAULT 0 NOT NULL,
  `dry_run` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discovery_candidates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `address` text NOT NULL,
  `source` text NOT NULL,
  `score` real,
  `result` text NOT NULL,
  `evaluated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
