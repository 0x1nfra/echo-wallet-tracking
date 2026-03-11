-- Phase 3: Add wallet_flags table for detection evidence storage.
-- wallets.detection_status enum updated (ORM level only — SQLite does not enforce CHECK constraints).
-- New values: confirmed_passing, confirmed_suspicious (replaces old: passing, confirmed).

CREATE TABLE IF NOT EXISTS wallet_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  detector TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence_summary TEXT NOT NULL,
  evidence_detail TEXT,
  cleared INTEGER NOT NULL DEFAULT 0,
  cleared_at INTEGER,
  cleared_by TEXT,
  threshold_multiplier REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);
