-- SQLite does not support ALTER COLUMN — the enum change is enforced only at the ORM level, not SQL level. No SQL migration needed for the status enum expansion.

CREATE TABLE IF NOT EXISTS parse_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_signature TEXT NOT NULL,
  dex TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
