#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createWalletCommand } from '@/commands/wallet.js';
import { resumeImportingWallets } from '@/importers/history.js';

const program = new Command();

program
  .name('echo')
  .description('Solana wallet scoring system')
  .version('0.1.0');

program
  .command('score')
  .description('Score a wallet or multiple wallets')
  .option('-w, --wallet <address>', 'Score a single wallet')
  .option('-f, --file <path>', 'Score multiple wallets from file')
  .option('-d, --days <number>', 'Analysis period in days', '90')
  .option('-e, --export', 'Export results to file')
  .option('-o, --output <path>', 'Output file path')
  .action((options) => {
    console.log(chalk.blue('🔊 Echo - Wallet Scoring'));
    console.log(chalk.gray('Coming soon...'));
    console.log(chalk.yellow('\nOptions:'), options);
  });

program.addCommand(createWalletCommand());

// At startup, resume any wallets stuck in 'importing' state from previous interrupted runs
resumeImportingWallets().catch(() => {}); // silent — don't block CLI startup

program.parse();
