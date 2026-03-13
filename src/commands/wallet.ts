import { Command } from 'commander';
import { and, desc, eq, inArray } from 'drizzle-orm';
import Table from 'cli-table3';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { db } from '../db/index.js';
import { wallets, wallet_flags } from '../db/schema.js';
import { importWalletHistory } from '../importers/history.js';
import { computeOverallStatus } from '../detection/engine.js';
import { CLEAR_THRESHOLD_MULTIPLIER_FACTOR, MAX_THRESHOLD_MULTIPLIER } from '../detection/thresholds.js';

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
      const allRows = db.select().from(wallets)
        .where(inArray(wallets.status, ['tracked', 'importing']))
        .orderBy(desc(wallets.added_at))
        .all();

      const cleanRows = allRows.filter(r =>
        !r.detection_status ||
        r.detection_status === 'pending' ||
        r.detection_status === 'confirmed_passing'
      );
      const flaggedRows = allRows.filter(r =>
        r.detection_status === 'suspected' ||
        r.detection_status === 'review' ||
        r.detection_status === 'confirmed_suspicious'
      );

      if (allRows.length === 0) {
        console.log('No wallets tracked yet.\n\nGet started: echo wallet add <address>');
        return;
      }

      // Section 1: Clean wallets
      if (cleanRows.length > 0) {
        console.log(chalk.bold('\nClean Wallets'));
        const cleanTable = new Table({ head: ['ADDRESS', 'LABEL', 'STATUS', 'ADDED'], style: { head: ['cyan'] } });
        for (const row of cleanRows) {
          const statusDisplay = row.status === 'importing'
            ? chalk.yellow('importing')
            : row.detection_status === 'confirmed_passing'
            ? chalk.green('confirmed_passing')
            : chalk.gray(row.detection_status ?? 'pending');
          cleanTable.push([truncateAddress(row.address), row.label ?? chalk.gray('(no label)'), statusDisplay, new Date(row.added_at).toLocaleDateString()]);
        }
        console.log(cleanTable.toString());
      }

      // Section 2: Flagged wallets
      if (flaggedRows.length > 0) {
        console.log(chalk.bold('\nFlagged Wallets'));
        const flagTable = new Table({ head: ['ADDRESS', 'LABEL', 'DETECTION STATUS', 'ADDED'], style: { head: ['yellow'] } });
        for (const row of flaggedRows) {
          const statusColor = row.detection_status === 'confirmed_suspicious' ? chalk.red : chalk.yellow;
          flagTable.push([truncateAddress(row.address), row.label ?? chalk.gray('(no label)'), statusColor(row.detection_status ?? ''), new Date(row.added_at).toLocaleDateString()]);
        }
        console.log(flagTable.toString());
        console.log(chalk.gray(`\nRun 'echo wallet review' to see flag details.`));
      }
    });

  wallet
    .command('review')
    .description('List all wallets with active detection flags awaiting review')
    .action(() => {
      const flaggedWallets = db.select({
        address: wallets.address,
        label: wallets.label,
        detection_status: wallets.detection_status,
      }).from(wallets)
      .where(inArray(wallets.detection_status, ['suspected', 'review', 'confirmed_suspicious']))
      .all();

      if (flaggedWallets.length === 0) {
        console.log('No wallets currently flagged for review.');
        return;
      }

      for (const w of flaggedWallets) {
        const statusColor = w.detection_status === 'confirmed_suspicious' ? chalk.red : chalk.yellow;
        console.log('\n' + chalk.bold(w.address) + (w.label ? ` (${w.label})` : '') + ' — ' + statusColor(w.detection_status ?? ''));

        const flags = db.select().from(wallet_flags)
          .where(and(eq(wallet_flags.wallet_address, w.address), eq(wallet_flags.cleared, false)))
          .all();

        const flagTable = new Table({
          head: ['DETECTOR', 'CONFIDENCE', 'EVIDENCE'],
          style: { head: ['cyan'] },
          colWidths: [15, 25, 60],
        });

        for (const flag of flags) {
          let evidenceSummary = '';
          try {
            evidenceSummary = JSON.stringify(JSON.parse(flag.evidence_summary), null, 0);
          } catch {
            evidenceSummary = flag.evidence_summary;
          }
          flagTable.push([flag.detector, flag.confidence, evidenceSummary.slice(0, 58)]);
        }
        console.log(flagTable.toString());
      }
      console.log(chalk.gray("\nUse 'echo wallet clear-flag <address>' to override a detection flag."));
    });

  wallet
    .command('clear-flag <address>')
    .description('Clear detection flags for a wallet after reviewing evidence')
    .option('--detector <type>', 'Clear only flags from a specific detector (bundler|dev_wallet|sniper|wash_trader)')
    .action(async (address: string, options: { detector?: string }) => {
      // 1. Fetch active flags
      const flagQuery = db.select().from(wallet_flags)
        .where(and(eq(wallet_flags.wallet_address, address), eq(wallet_flags.cleared, false)));
      const activeFlags = flagQuery.all();

      // Filter by detector if specified
      const flagsToReview = options.detector
        ? activeFlags.filter(f => f.detector === options.detector)
        : activeFlags;

      if (flagsToReview.length === 0) {
        console.log(options.detector
          ? `No active ${options.detector} flags found for wallet ${address}.`
          : `No active flags found for wallet ${address}.`
        );
        return;
      }

      // 2. Display evidence for each flag
      console.log(chalk.bold(`\nActive flags for ${address}:`));
      for (const flag of flagsToReview) {
        console.log(`\n  Detector: ${chalk.yellow(flag.detector)}`);
        console.log(`  Confidence: ${chalk.red(flag.confidence)}`);
        try {
          const evidence = JSON.parse(flag.evidence_summary);
          console.log(`  Evidence: ${JSON.stringify(evidence, null, 2)}`);
        } catch {
          console.log(`  Evidence: ${flag.evidence_summary}`);
        }
      }

      // 3. Prompt for confirmation
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: 'Are you sure you want to clear these flags? (Wallet will require significantly more evidence to be re-flagged)',
        default: false,
      }]);

      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }

      // 4. Clear flags — raise threshold_multiplier, cap at MAX
      const now = Date.now();
      for (const flag of flagsToReview) {
        const newMultiplier = Math.min(
          flag.threshold_multiplier * CLEAR_THRESHOLD_MULTIPLIER_FACTOR,
          MAX_THRESHOLD_MULTIPLIER
        );
        db.update(wallet_flags).set({
          cleared: true,
          cleared_at: now,
          cleared_by: 'user',
          threshold_multiplier: newMultiplier,
          updated_at: now,
        }).where(eq(wallet_flags.id, flag.id)).run();
      }

      // 5. Recompute wallet status from remaining active flags
      const remainingFlags = db.select().from(wallet_flags)
        .where(and(eq(wallet_flags.wallet_address, address), eq(wallet_flags.cleared, false)))
        .all();

      const newStatus = computeOverallStatus(remainingFlags.map(f => ({
        detector: f.detector as any,
        confidence: f.confidence as any,
        cleared: false,
        threshold_multiplier: f.threshold_multiplier,
      })));

      db.update(wallets).set({ detection_status: newStatus })
        .where(eq(wallets.address, address)).run();

      console.log(chalk.green(`\nFlags cleared. Wallet ${address} is now: ${newStatus}`));
      console.log(chalk.gray('Re-flagging requires significantly stronger evidence (threshold raised).'));
    });

  wallet
    .command('flag <address>')
    .description('Manually flag a wallet at a specific detection tier (force-promote)')
    .option('--detector <type>', 'Detector to attribute flag to (bundler|dev_wallet|sniper|wash_trader)', 'manual')
    .option('--tier <tier>', 'Confidence tier to assign (suspected|review|confirmed_suspicious)', 'review')
    .action(async (address: string, options: { detector: string; tier: string }) => {
      const VALID_TIERS = ['suspected', 'review', 'confirmed_suspicious'] as const;
      type ValidTier = typeof VALID_TIERS[number];

      // Validate tier option
      if (!VALID_TIERS.includes(options.tier as ValidTier)) {
        console.error(chalk.red(`Invalid --tier "${options.tier}". Must be one of: ${VALID_TIERS.join(', ')}`));
        process.exit(1);
      }

      // Verify wallet exists
      const w = db.select().from(wallets).where(eq(wallets.address, address)).get();
      if (!w) {
        console.error(chalk.red(`Wallet ${address} not found. Add it first with: echo wallet add ${address}`));
        process.exit(1);
      }

      // Display what will be written and prompt for confirmation
      console.log(chalk.bold(`\nForce-promote wallet: ${address}`));
      console.log(`  Detector : ${chalk.yellow(options.detector)}`);
      console.log(`  Tier     : ${chalk.red(options.tier)}`);
      console.log(`  Action   : Insert wallet_flag row (cleared=false), then recompute detection_status\n`);

      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: `Set wallet ${address} to at least "${options.tier}" via ${options.detector} flag?`,
        default: false,
      }]);

      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }

      // Insert new wallet_flag row with cleared=false
      db.insert(wallet_flags).values({
        wallet_address: address,
        detector: options.detector as any,
        confidence: options.tier as ValidTier,
        evidence_summary: JSON.stringify({ manual: true, set_by: 'user', tier: options.tier }),
        evidence_detail: JSON.stringify({ note: 'Manually force-promoted by user via wallet flag command' }),
        cleared: false,
        threshold_multiplier: 1.0,
      }).run();

      // Recompute overall status from all active flags (including the one just inserted)
      const allActiveFlags = db.select().from(wallet_flags)
        .where(and(eq(wallet_flags.wallet_address, address), eq(wallet_flags.cleared, false)))
        .all();

      const newStatus = computeOverallStatus(allActiveFlags.map(f => ({
        detector: f.detector as any,
        confidence: f.confidence as any,
        cleared: false,
        threshold_multiplier: f.threshold_multiplier,
      })));

      db.update(wallets).set({ detection_status: newStatus })
        .where(eq(wallets.address, address)).run();

      console.log(chalk.green(`\nWallet ${address} is now: ${newStatus}`));
      console.log(chalk.gray(`Run 'echo wallet review' to see active flags. Use 'echo wallet clear-flag ${address}' to remove.`));
    });

  return wallet;
}
