import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const wallets = sqliteTable('wallets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  address: text('address').notNull().unique(),
  label: text('label'),
  status: text('status', { enum: ['tracked', 'removed', 'importing'] }).notNull().default('tracked'),
  score: real('score'),
  detection_status: text('detection_status', {
    enum: ['pending', 'suspected', 'review', 'confirmed_suspicious', 'confirmed_passing'],
  }),
  added_at: integer('added_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  last_checked_at: integer('last_checked_at', { mode: 'number' }),
  history_complete: integer('history_complete', { mode: 'boolean' }).notNull().default(false),
  low_score_streak: integer('low_score_streak').notNull().default(0),
  last_trade_at: integer('last_trade_at', { mode: 'number' }),
  probation_until: integer('probation_until', { mode: 'number' }),
});

export const swaps = sqliteTable('swaps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wallet_address: text('wallet_address').notNull(),
  tx_signature: text('tx_signature').notNull().unique(),
  dex: text('dex').notNull(),
  token_mint: text('token_mint').notNull(),
  side: text('side', { enum: ['buy', 'sell'] }).notNull(),
  token_amount: real('token_amount').notNull(),
  sol_amount: real('sol_amount').notNull(),
  timestamp: integer('timestamp', { mode: 'number' }).notNull(),
  slot: integer('slot').notNull(),
  fee_sol: real('fee_sol'),
  cost_basis_sol: real('cost_basis_sol'),
  realized_pnl_sol: real('realized_pnl_sol'),
});

export const wallet_metrics = sqliteTable('wallet_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wallet_address: text('wallet_address').notNull().unique(),
  win_rate: real('win_rate'),
  realized_pnl_sol: real('realized_pnl_sol'),
  sharpe_ratio: real('sharpe_ratio'),
  max_drawdown: real('max_drawdown'),
  recency_score: real('recency_score'),
  calculated_at: integer('calculated_at', { mode: 'number' }),
  score_total: real('score_total'),
  score_risk_adjusted: real('score_risk_adjusted'),
  score_win_rate: real('score_win_rate'),
  score_consistency_recency: real('score_consistency_recency'),
  score_activity_health: real('score_activity_health'),
  trade_count: integer('trade_count'),
  recent_trade_count: integer('recent_trade_count'),
});

export const token_signals = sqliteTable('token_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_mint: text('token_mint').notNull().unique(),
  signal_score: real('signal_score'),
  smart_wallet_count: integer('smart_wallet_count'),
  buy_velocity_1h: real('buy_velocity_1h'),
  exit_pressure: real('exit_pressure'),
  pnl_weighted_holder_score: real('pnl_weighted_holder_score'),
  coordination_discount: real('coordination_discount'),
  signal_tier: text('signal_tier'),
  coordinated_wallet_count: integer('coordinated_wallet_count'),
  updated_at: integer('updated_at', { mode: 'number' }),
});

export const parse_errors = sqliteTable('parse_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tx_signature: text('tx_signature').notNull(),
  dex: text('dex').notNull(),
  wallet_address: text('wallet_address').notNull(),
  error_message: text('error_message').notNull(),
  created_at: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

export const removal_log = sqliteTable('removal_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wallet_address: text('wallet_address').notNull(),
  reason: text('reason').notNull(),
  detection_details: text('detection_details'),
  removed_at: integer('removed_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  removed_by: text('removed_by').notNull().default('auto'),
  label: text('label'),
  score_at_removal: real('score_at_removal'),
  restored_at: integer('restored_at', { mode: 'number' }),
});

export const wallet_flags = sqliteTable('wallet_flags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wallet_address: text('wallet_address').notNull(),
  detector: text('detector', {
    enum: ['bundler', 'dev_wallet', 'sniper', 'wash_trader', 'manual'],
  }).notNull(),
  confidence: text('confidence', {
    enum: ['suspected', 'review', 'confirmed_suspicious'],
  }).notNull(),
  evidence_summary: text('evidence_summary').notNull(), // JSON string: key facts for CLI display
  evidence_detail: text('evidence_detail'),             // JSON string: full evidence for Phase 7 dashboard
  cleared: integer('cleared', { mode: 'boolean' }).notNull().default(false),
  cleared_at: integer('cleared_at', { mode: 'number' }),
  cleared_by: text('cleared_by'),                       // 'user' | 'auto'
  threshold_multiplier: real('threshold_multiplier').notNull().default(1.0),
  created_at: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  updated_at: integer('updated_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

export const score_history = sqliteTable('score_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wallet_address: text('wallet_address').notNull(),
  score: real('score').notNull(),
  scored_at: integer('scored_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

export const alert_log = sqliteTable('alert_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_mint: text('token_mint').notNull().unique(),
  last_alerted_at: integer('last_alerted_at', { mode: 'number' }),
  last_holder_count: integer('last_holder_count').notNull().default(0),
});

export const token_metadata = sqliteTable('token_metadata', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_mint: text('token_mint').notNull().unique(),
  name: text('name'),
  symbol: text('symbol'),
  fetched_at: integer('fetched_at', { mode: 'number' }),
});

// Tracks each wallet discover <CA> invocation
export const discoveryRuns = sqliteTable('discovery_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_mint: text('token_mint').notNull(),
  started_at: integer('started_at', { mode: 'number' }).notNull().default(sql`(unixepoch('now') * 1000)`),
  completed_at: integer('completed_at', { mode: 'number' }),
  total_candidates: integer('total_candidates').notNull().default(0),
  added_count: integer('added_count').notNull().default(0),
  rejected_count: integer('rejected_count').notNull().default(0),
  dry_run: integer('dry_run', { mode: 'boolean' }).notNull().default(false),
});

// One row per evaluated candidate address per run — audit log
export const discoveryCandidates = sqliteTable('discovery_candidates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  run_id: integer('run_id').notNull().references(() => discoveryRuns.id, { onDelete: 'cascade' }),
  address: text('address').notNull(),
  source: text('source', { enum: ['direct', 'graph'] }).notNull(),
  score: real('score'),
  result: text('result', { enum: ['added', 'rejected', 'already_tracked', 'dry_run'] }).notNull(),
  evaluated_at: integer('evaluated_at', { mode: 'number' }).notNull().default(sql`(unixepoch('now') * 1000)`),
});

// Append-only audit log for tier transition events — Phase 12 Signal Accuracy Logging
export const signal_events = sqliteTable('signal_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token_mint: text('token_mint').notNull(),
  fired_at: integer('fired_at', { mode: 'number' }).notNull(),
  tier: text('tier', { enum: ['strong', 'moderate', 'weak'] }).notNull(),
  signal_score: real('signal_score').notNull(),
  smart_wallet_count: integer('smart_wallet_count').notNull(),
  buy_velocity: real('buy_velocity').notNull(),
  holder_score: real('holder_score').notNull(),
  coordinated_wallet_count: integer('coordinated_wallet_count').notNull(),
  entry_price: real('entry_price'),
  outcome_1h_price: real('outcome_1h_price'),
  outcome_1h_pct: real('outcome_1h_pct'),
  outcome_1h_status: text('outcome_1h_status', { enum: ['hit', 'miss', 'failed'] }),
  outcome_4h_price: real('outcome_4h_price'),
  outcome_4h_pct: real('outcome_4h_pct'),
  outcome_4h_status: text('outcome_4h_status', { enum: ['hit', 'miss', 'failed'] }),
  outcome_24h_price: real('outcome_24h_price'),
  outcome_24h_pct: real('outcome_24h_pct'),
  outcome_24h_status: text('outcome_24h_status', { enum: ['hit', 'miss', 'failed'] }),
  is_fully_resolved: integer('is_fully_resolved', { mode: 'boolean' }).notNull().default(false),
  created_at: integer('created_at', { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});
