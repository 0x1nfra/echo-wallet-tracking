import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { desc, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { token_signals } from '../db/schema.js';

export function createSignalCommand(): Command {
  const signal = new Command('signal').description('View token signals');

  signal
    .command('list')
    .description('List top tokens by signal score')
    .option('--limit <n>', 'Number of tokens to show', '20')
    .action((options: { limit: string }) => {
      const limit = parseInt(options.limit, 10);
      const rows = db.select()
        .from(token_signals)
        .where(gt(token_signals.signal_score, 0))
        .orderBy(desc(token_signals.signal_score))
        .limit(limit)
        .all();

      if (rows.length === 0) {
        console.log('No active token signals. Run the monitor loop first.');
        return;
      }

      const table = new Table({
        head: ['Token', 'Score', 'Tier', 'Wallets', 'Buy Vel (1h)', 'Exit Pressure', 'Updated'],
        colWidths: [46, 8, 12, 10, 14, 15, 22],
      });

      for (const row of rows) {
        const tier = row.signal_tier ?? 'unknown';
        const tierColored =
          tier === 'strong' ? chalk.green(tier) :
          tier === 'moderate' ? chalk.yellow(tier) :
          chalk.red(tier);

        const updatedAt = row.updated_at
          ? new Date(row.updated_at * 1000).toLocaleString()
          : 'never';

        table.push([
          row.token_mint,
          String(row.signal_score ?? 0),
          tierColored,
          String(row.smart_wallet_count ?? 0),
          String(row.buy_velocity_1h ?? 0),
          String(row.exit_pressure != null ? row.exit_pressure.toFixed(2) : '0.00'),
          updatedAt,
        ]);
      }

      console.log(table.toString());
    });

  return signal;
}
