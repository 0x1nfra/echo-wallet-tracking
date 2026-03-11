import { Command } from 'commander';
import { desc, eq } from 'drizzle-orm';
import Table from 'cli-table3';
import chalk from 'chalk';
import { db } from '../db/index.js';
import { wallets } from '../db/schema.js';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function createWalletCommand(): Command {
  const wallet = new Command('wallet').description('Manage tracked wallets');

  wallet
    .command('add <address>')
    .description('Add a wallet to track')
    .option('--label <label>', 'Optional label for the wallet')
    .action((address: string, options: { label?: string }) => {
      try {
        db.insert(wallets)
          .values({ address, label: options.label ?? null })
          .run();
        console.log(
          'Wallet ' +
            address +
            ' added' +
            (options.label ? ' (' + options.label + ')' : '') +
            '.',
        );
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
        .where(eq(wallets.status, 'tracked'))
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
        table.push([
          truncateAddress(row.address),
          row.label ?? chalk.gray('(no label)'),
          chalk.green('tracked'),
          new Date(row.added_at).toLocaleDateString(),
        ]);
      }

      console.log(table.toString());
    });

  return wallet;
}
