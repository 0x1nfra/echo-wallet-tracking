CREATE TABLE `alert_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token_mint` text NOT NULL UNIQUE,
  `last_alerted_at` integer,
  `last_holder_count` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `token_metadata` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `token_mint` text NOT NULL UNIQUE,
  `name` text,
  `symbol` text,
  `fetched_at` integer
);
