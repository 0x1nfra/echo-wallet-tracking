#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { createWalletCommand, monitorLoop } from '@/commands/wallet.js';
import { createSignalCommand } from '@/commands/signal.js';
import { resumeImportingWallets } from '@/importers/history.js';
import { buildServer } from './api/server.js';
import { startBot } from './api/bot/index.js';

const program = new Command();

program
  .name('echo')
  .description('Solana wallet scoring system')
  .version('0.1.0');

program.addCommand(createWalletCommand());
program.addCommand(createSignalCommand());

program
  .command('serve')
  .description('Start the monitoring loop, API dashboard, and Telegram bot')
  .action(async () => {
    // Start server first — if it fails, abort rather than running a monitor with no dashboard
    try {
      const server = await buildServer();
      await server.listen({ port: 3000, host: '127.0.0.1' });
      console.log('[api] dashboard running at http://localhost:3000');
    } catch (err) {
      console.error('[api] server failed to start:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
    startBot();
    // Resume imports and start monitor loop after server is up
    resumeImportingWallets()
      .catch(() => {})
      .then(() => monitorLoop.start());
  });

program.parse();
