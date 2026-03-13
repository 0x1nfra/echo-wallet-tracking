ALTER TABLE wallets ADD COLUMN low_score_streak INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE wallets ADD COLUMN last_trade_at INTEGER;
--> statement-breakpoint
ALTER TABLE removal_log ADD COLUMN label TEXT;
--> statement-breakpoint
ALTER TABLE removal_log ADD COLUMN score_at_removal REAL;
--> statement-breakpoint
UPDATE wallets
SET last_trade_at = (
  SELECT MAX(s.timestamp * 1000)
  FROM swaps s
  WHERE s.wallet_address = wallets.address
)
WHERE EXISTS (
  SELECT 1 FROM swaps s WHERE s.wallet_address = wallets.address
);
