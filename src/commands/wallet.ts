import { Command } from 'commander';
import { desc, eq, inArray } from 'drizzle-orm';
import Table from 'cli-table3';
import chalk from 'chalk';
import { db } from '../db/index.js';
import { wallets } from '../db/schema.js';
import { importWalletHistory } from '../importers/history.js';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function createWalletCommand(): Command {
  const wallet = new Command('wallet').description('Manage tracked wallets');

  wallet
    .command('add <address>')
    .description('Add a wallet to track')
    .option('--label <label>', 'Optional label for the wallet')
    .option('--full-history', 'Import complete transaction history (ignores 180-day window)')
    .action(async (address: string, options: { label?: string; fullHistory?: boolean }) => {
      try {
        // Insert with status='importing'
        db.insert(wallets)
          .values({ address, label: options.label ?? null, status: 'importing' })
          .run();
        console.log(
          'Wallet ' + address + ' added' +
          (options.label ? ' (' + options.label + ')' : '') +
          '. Importing history...'
        );
        await importWalletHistory(address, { fullHistory: options.fullHistory });
        console.log('Wallet ' + address + ' import complete.');
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes('UNIQUE constraint failed')
        ) {
          console.error('Wallet ' + address + ' is already tracked.');
          process.exit(1);
        }
        throw err;
      }
    });

  wallet
    .command('remove <address>')
    .description('Remove a tracked wallet')
    .action((address: string) => {
      const result = db.delete(wallets).where(eq(wallets.address, address)).run();
      if (result.changes === 0) {
        console.error('Wallet ' + address + ' is not tracked.');
        process.exit(1);
      }
      console.log('Wallet ' + address + ' removed.');
    });

  wallet
    .command('list')
    .description('List all tracked wallets')
    .action(() => {
      const rows = db
        .select()
        .from(wallets)
        .where(inArray(wallets.status, ['tracked', 'importing']))
        .orderBy(desc(wallets.added_at))
        .all();

      if (rows.length === 0) {
        console.log(
          'No wallets tracked yet.\n\nGet started: echo wallet add <address>',
        );
        return;
      }

      const table = new Table({
        head: ['ADDRESS', 'LABEL', 'STATUS', 'ADDED'],
        style: { head: ['cyan'] },
      });

      for (const row of rows) {
        const statusDisplay = row.status === 'importing'
          ? chalk.yellow('importing')
          : chalk.green('tracked');

        table.push([
          truncateAddress(row.address),
          row.label ?? chalk.gray('(no label)'),
          statusDisplay,
          new Date(row.added_at).toLocaleDateString(),
        ]);
      }

      console.log(table.toString());
    });

  return wallet;
}
