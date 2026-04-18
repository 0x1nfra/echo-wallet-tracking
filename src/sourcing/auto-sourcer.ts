import { runDiscovery } from '../discovery/index.js';
import { fetchEarlyBuyers } from '../discovery/early-buyers.js';
import { importWalletHistory } from '../importers/history.js';
import { scoreAllEligible } from '../scoring/engine.js';
import { GmgnFetcher } from './gmgn-fetcher.js';
import { db } from '../db/index.js';
import { wallets, sourcing_log } from '../db/schema.js';
import { eq, count } from 'drizzle-orm';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getDailyCapEnv(): number {
  const v = parseInt(process.env.AUTO_SOURCE_DAILY_CAP ?? '20', 10);
  return isNaN(v) ? 20 : v;
}

function getTotalCapEnv(): number {
  const v = parseInt(process.env.AUTO_SOURCE_TOTAL_CAP ?? '200', 10);
  return isNaN(v) ? 200 : v;
}

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export interface AutoSourcerStats {
  running: boolean;
  pollCount: number;
  lastPollAt: number | null;
  lastPollStatus: 'ok' | 'error' | 'cap_hit' | 'ceiling_hit' | null;
  dailyAdded: number;
  dailyCap: number;
  totalWallets: number;
  totalCap: number;
  ceilingHit: boolean;
}

export class AutoSourcer {
  private running = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fetcher = new GmgnFetcher();

  private _pollCount = 0;
  private _lastPollAt: number | null = null;
  private _lastPollStatus: AutoSourcerStats['lastPollStatus'] = null;

  // Daily cap tracking
  private _dailyAdded = 0;
  private _dailyDate = utcDateString();

  // Ceiling alert dedup
  private _ceilingAlertFired = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = false;
    console.log('[auto-sourcer] starting — poll interval 5m');
    this.scheduleNext(0);
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    console.log('[auto-sourcer] stopped');
  }

  getStats(): AutoSourcerStats {
    const totalWallets = db.select({ count: count() })
      .from(wallets)
      .where(eq(wallets.status, 'tracked'))
      .get()?.count ?? 0;
    return {
      running: this.running,
      pollCount: this._pollCount,
      lastPollAt: this._lastPollAt,
      lastPollStatus: this._lastPollStatus,
      dailyAdded: this._dailyAdded,
      dailyCap: getDailyCapEnv(),
      totalWallets,
      totalCap: getTotalCapEnv(),
      ceilingHit: totalWallets >= getTotalCapEnv(),
    };
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    if (this.stopped) return;
    try {
      await this.runPoll();
    } catch (err) {
      console.error('[auto-sourcer] poll crashed:', err);
      this._lastPollStatus = 'error';
    }
    this.scheduleNext(POLL_INTERVAL_MS);
  }

  private async runPoll(): Promise<void> {
    // Reset daily counter at UTC midnight
    const today = utcDateString();
    if (today !== this._dailyDate) {
      this._dailyDate = today;
      this._dailyAdded = 0;
      console.log('[auto-sourcer] daily cap counter reset for', today);
    }

    this._pollCount++;
    this._lastPollAt = Date.now();

    const dailyCap = getDailyCapEnv();
    const totalCap = getTotalCapEnv();

    const totalWallets = db.select({ count: count() })
      .from(wallets)
      .where(eq(wallets.status, 'tracked'))
      .get()?.count ?? 0;

    // Ceiling check — reset alert flag if below ceiling again (auto-resume)
    if (totalWallets >= totalCap) {
      console.log(`[auto-sourcer] ceiling hit (${totalWallets}/${totalCap}) — skipping seeding`);
      this._lastPollStatus = 'ceiling_hit';
      if (!this._ceilingAlertFired) {
        this._ceilingAlertFired = true;
        await this.fireCeilingAlert(totalWallets, totalCap);
      }
      this.logPollRun({ fetched: 0, seeded: 0, skipped: 0, filtered: 0, walletsAdded: 0, status: 'ceiling_hit' });
      return;
    } else {
      // Below ceiling — reset flag to allow future alert if ceiling is hit again
      this._ceilingAlertFired = false;
    }

    // Daily cap check
    if (this._dailyAdded >= dailyCap) {
      console.log(`[auto-sourcer] daily cap hit (${this._dailyAdded}/${dailyCap}) — skipping seeding`);
      this._lastPollStatus = 'cap_hit';
      this.logPollRun({ fetched: 0, seeded: 0, skipped: 0, filtered: 0, walletsAdded: 0, status: 'cap_hit' });
      return;
    }

    // Fetch from GMGN
    const rawTokens = await this.fetcher.fetch();
    const { passed, filteredCount } = this.fetcher.applyPreFilters(rawTokens);

    console.log(`[auto-sourcer] poll ${this._pollCount}: fetched ${rawTokens.length}, passed filters ${passed.length}, filtered ${filteredCount}`);

    let seededCount = 0;
    let skippedCount = 0;
    let walletsAdded = 0;

    for (const token of passed) {
      if (this.stopped) break;
      if (this._dailyAdded >= dailyCap) break;

      try {
        const result = await runDiscovery(token.address, {
          _deps: {
            fetchEarlyBuyersFn: (m) => fetchEarlyBuyers(m),
            fetchCoTradersFn: async () => [], // SEED-03: graph traversal disabled for auto-sourced tokens
            importHistoryFn: (addr, opts) => importWalletHistory(addr, opts),
            scoreAllEligibleFn: () => scoreAllEligible(),
          },
        });

        if (result.alreadyTracked > 0 && result.added === 0) {
          skippedCount++;
          console.log(`[auto-sourcer] ${token.address} already tracked — skipped`);
        } else {
          seededCount++;
          if (result.added > 0) {
            walletsAdded += result.added;
            this._dailyAdded += result.added;
            // TODO(Plan 03): pass source: 'gmgn' via DiscoveryOptions once discovery/index.ts is updated
            // Plan 03 Task 1 extends runDiscovery() to accept source in DiscoveryOptions and sets it
            // cleanly during wallet insertion — avoids the rough approximation of updating recently added wallets.
          }
        }
      } catch (err) {
        console.error(`[auto-sourcer] discovery error for ${token.address}:`, err instanceof Error ? err.message : err);
      }
    }

    this._lastPollStatus = 'ok';
    console.log(`[auto-sourcer] poll done — seeded ${seededCount}, skipped ${skippedCount}, wallets added ${walletsAdded}`);
    this.logPollRun({ fetched: rawTokens.length, seeded: seededCount, skipped: skippedCount, filtered: filteredCount, walletsAdded, status: 'ok' });
  }

  private logPollRun(data: {
    fetched: number; seeded: number; skipped: number; filtered: number; walletsAdded: number;
    status: 'ok' | 'error' | 'cap_hit' | 'ceiling_hit'; errorMessage?: string;
  }): void {
    try {
      db.insert(sourcing_log).values({
        source: 'gmgn',
        tokens_fetched: data.fetched,
        tokens_seeded: data.seeded,
        tokens_skipped: data.skipped,
        tokens_filtered: data.filtered,
        wallets_added: data.walletsAdded,
        status: data.status,
        error_message: data.errorMessage ?? null,
      }).run();
    } catch (err) {
      console.error('[auto-sourcer] failed to write sourcing_log:', err);
    }
  }

  private async fireCeilingAlert(total: number, cap: number): Promise<void> {
    try {
      const { botInstance } = await import('../api/bot/index.js');
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!botInstance || !chatId) return;
      await botInstance.api.sendMessage(
        chatId,
        `<b>AutoSourcer: Wallet Ceiling Reached</b>\n` +
        `Total tracked wallets: <b>${total}/${cap}</b>\n` +
        `Auto-sourcing paused. Seeding will resume automatically when wallet count drops below ceiling via auto-removal.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[auto-sourcer] ceiling alert send failed:', err instanceof Error ? err.message : err);
    }
  }
}
