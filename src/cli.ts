#!/usr/bin/env node
import 'dotenv/config';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { createWalletCommand, monitorLoop } from '@/commands/wallet.js';
import { autoSourcer } from './monitor/index.js';
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
    // 1. Validate volume mount BEFORE db module is imported
    const dbUrl = process.env.DATABASE_URL ?? 'data/echo.db';
    const dbPath = path.resolve(process.cwd(), dbUrl);
    const { validateVolumeMount, VolumeCheckError } = await import('./startup/volume-check.js');
    try {
      await validateVolumeMount(dbPath);
    } catch (err) {
      if (err instanceof VolumeCheckError) {
        console.error(err.message);
      } else {
        console.error('[startup] Volume check failed:', err);
      }
      process.exit(1);
    }

    // 2. Replica warning (emit before DB init — WAL mode + replicas = corruption risk)
    if (process.env.RAILWAY_REPLICA_ID) {
      console.warn(
        '[startup] WARNING: RAILWAY_REPLICA_ID detected. Running multiple replicas with SQLite WAL ' +
        'mode risks database corruption. Scale to exactly 1 replica in Railway dashboard.',
      );
    }

    // 3. Start API server (hard fail — no dashboard = abort)
    const port = parseInt(process.env.PORT ?? '3000', 10);
    let server: Awaited<ReturnType<typeof buildServer>>;
    try {
      server = await buildServer();
      await server.listen({ port, host: '0.0.0.0' });
      console.log(`[api] dashboard running on port ${port}`);
    } catch (err) {
      console.error('[startup] API server failed to start:', err instanceof Error ? err.message : err);
      process.exit(1);
    }

    // 4. Start Telegram bot (hard fail if TELEGRAM_BOT_TOKEN present)
    const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN;
    try {
      startBot();
    } catch (err) {
      if (telegramConfigured) {
        console.error('[startup] Telegram bot failed to start:', err instanceof Error ? err.message : err);
        process.exit(1);
      }
      // No token = expected, not an error
    }

    // 5. Resume pending imports + start monitor loop + AutoSourcer
    resumeImportingWallets()
      .catch(() => {})
      .then(() => { monitorLoop.start(); autoSourcer.start(); });

    // 6. Startup summary
    const telegramStatus = telegramConfigured ? 'configured' : 'not configured (TELEGRAM_BOT_TOKEN not set)';
    console.log(
      `[startup] Echo running — cycle interval ${30}s, API port ${port}, Telegram ${telegramStatus}`,
    );
  });

program.parse();
