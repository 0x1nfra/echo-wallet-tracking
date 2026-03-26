PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `discovery_candidates_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL REFERENCES `discovery_runs`(`id`) ON DELETE CASCADE,
  `address` text NOT NULL,
  `source` text NOT NULL,
  `score` real,
  `result` text NOT NULL,
  `evaluated_at` integer DEFAULT (unixepoch('now') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `discovery_candidates_new` SELECT * FROM `discovery_candidates`;
--> statement-breakpoint
DROP TABLE `discovery_candidates`;
--> statement-breakpoint
ALTER TABLE `discovery_candidates_new` RENAME TO `discovery_candidates`;
--> statement-breakpoint
PRAGMA foreign_keys = ON;
