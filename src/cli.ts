#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { createWalletCommand, monitorLoop } from '@/commands/wallet.js';
import { createSignalCommand } from '@/commands/signal.js';
import { resumeImportingWallets } from '@/importers/history.js';

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

// At startup: resume any interrupted imports, then start the monitoring loop
resumeImportingWallets()
  .catch(() => {}) // silent — incomplete imports are retried on next cycle
  .then(() => {
    if (!isMonitorStart) {
      monitorLoop.start();
    }
  });

program.parse();
