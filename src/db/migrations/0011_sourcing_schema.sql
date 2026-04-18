-- Add source column to wallets table
ALTER TABLE wallets ADD COLUMN source TEXT;

-- Create sourcing_log table
CREATE TABLE IF NOT EXISTS sourcing_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  polled_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  tokens_fetched INTEGER NOT NULL DEFAULT 0,
  tokens_seeded INTEGER NOT NULL DEFAULT 0,
  tokens_skipped INTEGER NOT NULL DEFAULT 0,
  tokens_filtered INTEGER NOT NULL DEFAULT 0,
  wallets_added INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT
);
