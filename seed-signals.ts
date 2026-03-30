import { db } from './src/db/index.js';
const sqlite = db.$client;
sqlite.prepare(`INSERT OR REPLACE INTO token_signals (token_mint, signal_score, signal_tier, buy_velocity_1h, exit_pressure, smart_wallet_count, coordinated_wallet_count, coordination_discount, updated_at) VALUES ('So11111111111111111111111111111111111111112', 72, 'strong', 3.5, 0.1, 4, 0, 1.0, unixepoch())`).run();
console.log('Seeded 1 row');
