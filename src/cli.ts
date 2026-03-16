#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { createWalletCommand, monitorLoop } from '@/commands/wallet.js';
import { createSignalCommand } from '@/commands/signal.js';
import { resumeImportingWallets } from '@/importers/history.js';
import { buildServer } from './api/server.js';

const program = new Command();

program
  .name('echo')
  .description('Solana wallet scoring system')
  .version('0.1.0');

program.addCommand(createWalletCommand());
program.addCommand(createSignalCommand());

// Gate: skip auto-start when user is explicitly running 'wallet monitor start'
// (the action handler starts the loop itself in that case)
const isMonitorStart =
  process.argv.includes('monitor') && process.argv.includes('start');

// At startup: resume any interrupted imports, then start the monitoring loop and API server
resumeImportingWallets()
  .catch(() => {}) // silent — incomplete imports are retried on next cycle
  .then(async () => {
    if (!isMonitorStart) {
      monitorLoop.start();
      try {
        const server = await buildServer();
        await server.listen({ port: 3000, host: '0.0.0.0' });
        console.log('[api] dashboard running at http://localhost:3000');
      } catch (err) {
        console.error('[api] server failed to start:', err instanceof Error ? err.message : err);
        // Non-fatal: monitor continues even if API fails
      }
    }
  });

program.parse();
