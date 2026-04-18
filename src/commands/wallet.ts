import { Command } from 'commander';
import { and, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import Table from 'cli-table3';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { db } from '../db/index.js';
import { wallets, wallet_flags, wallet_metrics, removal_log } from '../db/schema.js';
import { importWalletHistory } from '../importers/history.js';
import { computeOverallStatus } from '../detection/engine.js';
import type { DetectorId } from '../detection/types.js';
import { CLEAR_THRESHOLD_MULTIPLIER_FACTOR, MAX_THRESHOLD_MULTIPLIER } from '../detection/thresholds.js';
import { MonitorLoop, writePid, readPid, clearPid, autoSourcer } from '../monitor/index.js';

// Shared loop instance — used by both `wallet monitor` commands and cli.ts auto-start
export const monitorLoop = new MonitorLoop();

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
      const nowMs = Date.now();

      // Probationary wallets: status='tracked' AND probation_until IS NOT NULL AND probation_until > now
      const probationaryRows = db.select().from(wallets)
        .where(and(eq(wallets.status, 'tracked'), isNotNull(wallets.probation_until), gt(wallets.probation_until, nowMs)))
        .orderBy(desc(wallets.added_at))
        .all();

      const probationaryAddresses = new Set(probationaryRows.map(r => r.address));

      // Active wallets: tracked/importing but NOT on probation
      const allRows = db.select().from(wallets)
        .where(inArray(wallets.status, ['tracked', 'importing']))
        .orderBy(desc(wallets.added_at))
        .all();

      const activeRows = allRows.filter(r => !probationaryAddresses.has(r.address));

      const cleanRows = activeRows.filter(r =>
        !r.detection_status ||
        r.detection_status === 'pending' ||
        r.detection_status === 'confirmed_passing'
      );
      const flaggedRows = activeRows.filter(r =>
        r.detection_status === 'suspected' ||
        r.detection_status === 'review' ||
        r.detection_status === 'confirmed_suspicious'
      );

      if (allRows.length === 0 && probationaryRows.length === 0) {
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

      // Section 3: Probationary wallets
      if (probationaryRows.length > 0) {
        console.log(chalk.bold('\nProbationary Wallets') + chalk.gray(' (7-day probation — excluded from signal scoring)'));
        const probTable = new Table({ head: ['ADDRESS', 'LABEL', 'PROBATION UNTIL'], style: { head: ['magenta'] } });
        for (const row of probationaryRows) {
          probTable.push([
            truncateAddress(row.address),
            row.label ?? chalk.gray('-'),
            new Date(row.probation_until!).toUTCString(),
          ]);
        }
        console.log(probTable.toString());
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
        detector: f.detector,
        confidence: f.confidence,
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
        detector: options.detector as DetectorId,
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
        detector: f.detector,
        confidence: f.confidence,
        cleared: false,
        threshold_multiplier: f.threshold_multiplier,
      })));

      db.update(wallets).set({ detection_status: newStatus })
        .where(eq(wallets.address, address)).run();

      console.log(chalk.green(`\nWallet ${address} is now: ${newStatus}`));
      console.log(chalk.gray(`Run 'echo wallet review' to see active flags. Use 'echo wallet clear-flag ${address}' to remove.`));
    });

  wallet
    .command('score [address]')
    .description('Score a wallet or all eligible wallets')
    .option('--all', 'Score all eligible wallets')
    .action(async (address: string | undefined, options: { all?: boolean }) => {
      if (options.all) {
        const { scoreAllEligible } = await import('../scoring/engine.js');
        const result = scoreAllEligible();
        console.log(chalk.green(`Scoring complete: ${result.scored} scored, ${result.skipped} skipped`));

        // Print top 20 wallets by score
        const topWallets = db.select({
          address: wallets.address,
          score: wallets.score,
          detection_status: wallets.detection_status,
          trade_count: wallet_metrics.trade_count,
        }).from(wallets)
          .leftJoin(wallet_metrics, eq(wallets.address, wallet_metrics.wallet_address))
          .where(isNotNull(wallets.score))
          .orderBy(desc(wallets.score))
          .limit(20)
          .all();

        if (topWallets.length > 0) {
          const table = new Table({
            head: ['ADDRESS', 'SCORE', 'STATUS', 'TRADES'],
            style: { head: ['cyan'] },
          });
          for (const row of topWallets) {
            const scoreVal = row.score ?? 0;
            const scoreStr = scoreVal >= 70
              ? chalk.green(String(scoreVal))
              : scoreVal >= 40
              ? chalk.yellow(String(scoreVal))
              : chalk.red(String(scoreVal));
            table.push([
              truncateAddress(row.address),
              scoreStr,
              row.detection_status ?? 'pending',
              String(row.trade_count ?? '-'),
            ]);
          }
          console.log(table.toString());
        }
      } else if (address) {
        const { scoreWallet } = await import('../scoring/engine.js');
        scoreWallet(address);

        // Query and display score breakdown
        const metrics = db.select().from(wallet_metrics)
          .where(eq(wallet_metrics.wallet_address, address))
          .get();
        const wallet = db.select().from(wallets).where(eq(wallets.address, address)).get();

        if (!metrics || metrics.score_total === null) {
          // Explain why wallet is ineligible
          if (!wallet) {
            console.log(chalk.yellow(`Wallet ${address} not found. Add it with: echo wallet add ${address}`));
          } else if (!wallet.history_complete) {
            console.log(chalk.yellow(`Wallet ${address} is not yet eligible: history import incomplete.`));
          } else if (wallet.detection_status !== 'confirmed_passing') {
            console.log(chalk.yellow(`Wallet ${address} is not eligible: detection_status is "${wallet.detection_status ?? 'pending'}".`));
          } else {
            console.log(chalk.yellow(`Wallet ${address} has insufficient trade history for scoring (needs ≥20 swaps, or may be dormant).`));
          }
          return;
        }

        const score = metrics.score_total;
        const scoreColor = score >= 70 ? chalk.green : score >= 40 ? chalk.yellow : chalk.red;
        console.log(chalk.bold(`\nScore breakdown for ${truncateAddress(address)}`));
        console.log(`Total Score: ${scoreColor(String(Math.round(score)))}`);

        const table = new Table({
          head: ['COMPONENT', 'WEIGHT', 'SUB-SCORE'],
          style: { head: ['cyan'] },
        });
        table.push(
          ['Risk-Adjusted Return', '40%', String(Math.round(metrics.score_risk_adjusted ?? 0))],
          ['Win Rate', '20%', String(Math.round(metrics.score_win_rate ?? 0))],
          ['Consistency / Recency', '20%', String(Math.round(metrics.score_consistency_recency ?? 0))],
          ['Activity Health', '20%', String(Math.round(metrics.score_activity_health ?? 0))],
        );
        console.log(table.toString());
        console.log(chalk.gray(`Trades: ${metrics.trade_count ?? '-'}  |  Recent (180d): ${metrics.recent_trade_count ?? '-'}  |  Last scored: ${metrics.calculated_at ? new Date(metrics.calculated_at).toLocaleDateString() : '-'}`));
      } else {
        console.log(chalk.yellow('Usage: echo wallet score <address> | --all'));
      }
    });

  wallet
    .command('discover <mint>')
    .description('Discover profitable early traders from a token contract address')
    .option('--min-score <number>', 'Minimum score threshold for adding a wallet', '70')
    .option('--dry-run', 'Score candidates but do not add them to tracking')
    // SEED-06: Manual CA seeding confirmed working in Railway via:
    // railway run node dist/cli.js wallet discover <mint>
    .action(async (mint: string, options: { minScore: string; dryRun?: boolean }) => {
      try {
        const { runDiscovery } = await import('../discovery/index.js');
        const result = await runDiscovery(mint, {
          minScore: parseFloat(options.minScore),
          dryRun: options.dryRun ?? false,
        });

        console.log(chalk.bold('\nDiscovery complete'));
        const summaryTable = new Table({ style: { head: ['cyan'] } });
        summaryTable.push(
          [chalk.gray('Total evaluated'), String(result.totalCandidates)],
          [chalk.gray('Added'), chalk.green(String(result.added))],
          [chalk.gray('Rejected'), chalk.red(String(result.rejected))],
          [chalk.gray('Already tracked'), String(result.alreadyTracked)],
        );
        console.log(summaryTable.toString());

        if (result.dryRun) {
          console.log(chalk.yellow('[DRY RUN — no wallets were added]'));
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.error(chalk.red(err.message));
        } else {
          console.error(chalk.red(String(err)));
        }
        process.exit(1);
      }
    });

  const monitor = new Command('monitor').description('Control the monitoring loop');

  monitor
    .command('start')
    .description('Start the monitoring loop (runs a cycle every 30 seconds)')
    .action(() => {
      monitorLoop.start();
      autoSourcer.start();
      writePid(process.pid);
      console.log('Monitoring loop started. Press Ctrl+C to exit.');
      // Keep process alive
      process.on('SIGTERM', () => { monitorLoop.stop(); autoSourcer.stop(); clearPid(); process.exit(0); });
      process.on('SIGINT', () => {
        monitorLoop.stop();
        autoSourcer.stop();
        process.exit(0);
      });
    });

  monitor
    .command('pause')
    .description('Pause the monitoring loop (current cycle drains first)')
    .action(() => {
      monitorLoop.pause();
    });

  monitor
    .command('stop')
    .description('Stop the monitoring loop')
    .action(() => {
      const pid = readPid();
      if (pid === null) {
        console.log('[monitor] no running loop found (no PID file)');
        process.exit(0);
      }
      try {
        process.kill(pid, 'SIGTERM');
        clearPid();
        console.log(`[monitor] sent SIGTERM to process ${pid}`);
      } catch (_err) {
        clearPid();
        console.log('[monitor] loop process was not running — PID file cleaned up');
      }
      process.exit(0);
    });

  wallet.addCommand(monitor);

  const removals = new Command('removals').description('View and manage auto-removed wallets');

  removals
    .command('list')
    .description('List all auto-removed wallets with removal details')
    .action(() => {
      const rows = db.select().from(removal_log)
        .orderBy(desc(removal_log.removed_at))
        .all();

      if (rows.length === 0) {
        console.log('No wallets have been auto-removed.');
        return;
      }

      const table = new Table({
        head: ['ADDRESS', 'LABEL', 'SCORE', 'DETECTION STATUS', 'REASON', 'REMOVED AT'],
        style: { head: ['cyan'] },
        colWidths: [20, 15, 8, 22, 36, 14],
      });

      for (const row of rows) {
        const restoredMark = row.restored_at ? chalk.green(' [restored]') : '';
        table.push([
          truncateAddress(row.wallet_address) + restoredMark,
          row.label ?? chalk.gray('(none)'),
          row.score_at_removal !== null ? row.score_at_removal.toFixed(1) : chalk.gray('—'),
          row.detection_details ?? chalk.gray('—'),
          row.reason,
          new Date(row.removed_at).toLocaleDateString(),
        ]);
      }
      console.log(table.toString());
    });

  removals
    .command('restore <address>')
    .description('Restore an auto-removed wallet back to tracked status')
    .action(async (address: string) => {
      // Check it exists in removal_log and is not already restored
      const logEntry = db.select().from(removal_log)
        .where(eq(removal_log.wallet_address, address))
        .orderBy(desc(removal_log.removed_at))
        .get();

      if (!logEntry) {
        console.error(`No removal log entry found for ${address}.`);
        process.exit(1);
      }

      if (logEntry.restored_at !== null) {
        console.log(`Wallet ${address} was already restored on ${new Date(logEntry.restored_at).toLocaleDateString()}.`);
      }

      // Re-activate wallet in wallets table
      // If the row was set to status='removed', restore to 'tracked' with history_complete=true
      // Existing swap data is preserved (no re-import of full history)
      db.update(wallets)
        .set({ status: 'tracked', detection_status: 'pending', low_score_streak: 0 })
        .where(eq(wallets.address, address))
        .run();

      // Mark as restored in removal_log
      db.update(removal_log)
        .set({ restored_at: Date.now() })
        .where(eq(removal_log.id, logEntry.id))
        .run();

      console.log(`Wallet ${address} restored — incremental fetch will run on next monitoring cycle.`);
    });

  wallet.addCommand(removals);

  return wallet;
}
