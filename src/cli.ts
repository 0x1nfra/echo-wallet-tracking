#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { createWalletCommand, monitorLoop } from '@/commands/wallet.js';
import { resumeImportingWallets } from '@/importers/history.js';

const program = new Command();

program
  .name('echo')
  .description('Solana wallet scoring system')
  .version('0.1.0');

program.addCommand(createWalletCommand());

// At startup: resume any interrupted imports, then start the monitoring loop
resumeImportingWallets()
  .catch(() => {}) // silent — incomplete imports are retried on next cycle
  .then(() => {
    monitorLoop.start();
  });

program.parse();
