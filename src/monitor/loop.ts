import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallets, swaps } from '../db/schema.js';
import { createHeliusFetcher } from '../fetchers/helius.js';
import { parseSwaps, applyFifo } from '../parsers/swap.js';
import { runDetectionIfNeeded } from '../detection/engine.js';
import { scoreWalletIfNeeded } from '../scoring/engine.js';
import { checkRemovalPolicies } from './removal.js';
import { computeAllTokenSignals } from '../signals/engine.js';

const CYCLE_INTERVAL_MS = 30_000;
const STARTUP_STAGGER_MS = 200; // stagger wallet fetches on first cycle to avoid burst
const CRASH_RESTART_DELAY_MS = 5_000;

export class MonitorLoop {
  private paused: boolean = false;
  private stopped: boolean = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cycleRunning: boolean = false;
  private running: boolean = false;

  start(): void {
    if (this.running) {
      console.log('[monitor] already running — ignoring duplicate start');
      return;
    }
    this.running = true;
    this.stopped = false;
    this.paused = false;
    console.log(`[monitor] starting — cycle interval ${CYCLE_INTERVAL_MS / 1000}s`);
    this.scheduleNextCycle(0);
    process.once('SIGTERM', () => { this.stop(); });
  }

  pause(): void {
    this.paused = true;
    console.log('[monitor] paused — current cycle will drain');
  }

  resume(): void {
    this.paused = false;
    console.log('[monitor] resumed');
    this.scheduleNextCycle(CYCLE_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    this.paused = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[monitor] stopped');
  }

  private scheduleNextCycle(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    if (this.stopped || this.paused) return;
    try {
      await this.runCycle();
    } catch (err) {
      console.error('[monitor] cycle crashed:', err);
      // Auto-restart after delay
      setTimeout(() => {
        if (!this.stopped && !this.paused) this.scheduleNextCycle(CRASH_RESTART_DELAY_MS);
      }, CRASH_RESTART_DELAY_MS);
      return;
    }
    if (!this.stopped && !this.paused) {
      this.scheduleNextCycle(CYCLE_INTERVAL_MS);
    }
  }

  async runCycle(): Promise<void> {
    const startMs = Date.now();

    // Get all tracked wallets (status='tracked')
    const trackedWallets = db.select({
      address: wallets.address,
      last_checked_at: wallets.last_checked_at,
    }).from(wallets)
      .where(inArray(wallets.status, ['tracked']))
      .all()
      .filter(w => w !== null);

    console.log(`[monitor] cycle start — ${trackedWallets.length} wallets`);

    const fetcher = createHeliusFetcher();
    let processed = 0;
    let removed = 0;
    let failed = 0;

    for (let i = 0; i < trackedWallets.length; i++) {
      const wallet = trackedWallets[i];
      if (this.stopped || this.paused) break;

      // Stagger fetches to avoid burst (200ms between wallets)
      if (i > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, STARTUP_STAGGER_MS));
      }

      try {
        // Incremental fetch: only since last_checked_at (convert ms to seconds for Helius API)
        const afterTimestamp = wallet.last_checked_at
          ? Math.floor(wallet.last_checked_at / 1000)
          : 0;

        const rawTxs = await fetcher.fetchSwapHistory(wallet.address, afterTimestamp);

        if (rawTxs.length > 0) {
          // Parse and insert new swaps
          const parsedSwaps: ReturnType<typeof parseSwaps> = [];
          for (const tx of rawTxs) {
            try {
              parsedSwaps.push(...parseSwaps([tx], wallet.address));
            } catch {
              // Parse errors are silently skipped in steady state
            }
          }
          const enrichedSwaps = applyFifo(parsedSwaps);

          db.transaction((tx) => {
            for (const swap of enrichedSwaps) {
              try {
                tx.insert(swaps).values(swap).run();
              } catch (err) {
                if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) continue;
                throw err;
              }
            }
          });

          // Update last_trade_at: find most recent swap timestamp in new swaps
          if (enrichedSwaps.length > 0) {
            const latestSwapTs = Math.max(...enrichedSwaps.map((s) => s.timestamp));
            db.update(wallets)
              .set({ last_trade_at: latestSwapTs * 1000 }) // convert seconds to ms
              .where(eq(wallets.address, wallet.address))
              .run();
          }
        }

        // Update last_checked_at to now (milliseconds)
        db.update(wallets)
          .set({ last_checked_at: Date.now() })
          .where(eq(wallets.address, wallet.address))
          .run();

        // Run detection and scoring conditionally
        await runDetectionIfNeeded(wallet.address);
        scoreWalletIfNeeded(wallet.address);

        // Check removal policies — only called after successful pipeline
        const wasRemoved = checkRemovalPolicies(wallet.address);
        if (wasRemoved) removed++;
        else processed++;

      } catch (err) {
        // Single-wallet failure: log and skip — do NOT increment low_score_streak
        console.error(
          `[monitor] failed to process ${wallet.address}:`,
          err instanceof Error ? err.message : err,
        );
        failed++;
      }
    }

    const durationMs = Date.now() - startMs;
    console.log(
      `[monitor] cycle complete — ${processed} processed, ${removed} removed, ${failed} failed in ${durationMs}ms`,
    );

    // Post-cycle: update token signals (non-fatal — wrapped in try/catch)
    try {
      const { updated, suppressed } = computeAllTokenSignals();
      console.log(`[monitor] signals — ${updated} updated, ${suppressed} suppressed`);
    } catch (err) {
      console.error(
        '[monitor] signal engine error (non-fatal):',
        err instanceof Error ? err.message : err,
      );
    }
  }
}
