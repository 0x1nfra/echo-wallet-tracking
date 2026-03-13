#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { createWalletCommand } from '@/commands/wallet.js';
import { resumeImportingWallets } from '@/importers/history.js';

const program = new Command();

program
  .name('echo')
  .description('Solana wallet scoring system')
  .version('0.1.0');

program.addCommand(createWalletCommand());

// At startup, resume any wallets stuck in 'importing' state from previous interrupted runs
resumeImportingWallets().catch(() => {}); // silent — don't block CLI startup

program.parse();
