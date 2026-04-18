import type { RpcProvider, ProviderTransaction } from './types.js';
import type { HeliusTransaction } from '../../types/index.js';

const COOLDOWN_MS = 60_000;

export class ProviderRouter implements RpcProvider {
  private providers: RpcProvider[];
  private cooldownUntil: Map<number, number> = new Map();
  private lastError: Map<number, string> = new Map();
  private onAllExhausted: () => void;

  constructor(providers: RpcProvider[], onAllExhausted: () => void) {
    this.providers = providers;
    this.onAllExhausted = onAllExhausted;
  }

  private isOnCooldown(index: number): boolean {
    const until = this.cooldownUntil.get(index);
    return until !== undefined && Date.now() < until;
  }

  private markCooldown(index: number, methodName: string, reason: string): void {
    this.cooldownUntil.set(index, Date.now() + COOLDOWN_MS);
    this.lastError.set(index, reason);
    console.log(`[provider] provider[${index}] failed on ${methodName}: ${reason}`);
    console.log(`[provider] provider[${index}] on cooldown for ${COOLDOWN_MS / 1000}s`);
  }

  private async tryCallSwapHistory(
    address: string,
    afterTimestamp: number
  ): Promise<HeliusTransaction[] | null> {
    for (let i = 0; i < this.providers.length; i++) {
      if (this.isOnCooldown(i)) continue;
      try {
        return await this.providers[i].fetchSwapHistory(address, afterTimestamp);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.markCooldown(i, 'fetchSwapHistory', reason);
      }
    }
    console.error('[provider] ALL providers exhausted — returning empty result');
    this.onAllExhausted();
    return null;
  }

  private async tryCallEarlySwaps(
    mint: string,
    limit: number,
    sortOrder: 'asc' | 'desc'
  ): Promise<HeliusTransaction[] | null> {
    for (let i = 0; i < this.providers.length; i++) {
      if (this.isOnCooldown(i)) continue;
      try {
        return await this.providers[i].fetchEarlySwapsForMint(mint, limit, sortOrder);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.markCooldown(i, 'fetchEarlySwapsForMint', reason);
      }
    }
    console.error('[provider] ALL providers exhausted — returning empty result');
    this.onAllExhausted();
    return null;
  }

  private async tryCallOnePage(
    address: string,
    limit: number
  ): Promise<HeliusTransaction[] | null> {
    for (let i = 0; i < this.providers.length; i++) {
      if (this.isOnCooldown(i)) continue;
      try {
        return await this.providers[i].fetchOnePage(address, limit);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.markCooldown(i, 'fetchOnePage', reason);
      }
    }
    console.error('[provider] ALL providers exhausted — returning empty result');
    this.onAllExhausted();
    return null;
  }

  async fetchSwapHistory(address: string, afterTimestamp: number): Promise<HeliusTransaction[]> {
    return (await this.tryCallSwapHistory(address, afterTimestamp)) ?? [];
  }

  async fetchEarlySwapsForMint(
    mint: string,
    limit: number,
    sortOrder: 'asc' | 'desc'
  ): Promise<HeliusTransaction[]> {
    return (await this.tryCallEarlySwaps(mint, limit, sortOrder)) ?? [];
  }

  async fetchOnePage(address: string, limit: number): Promise<HeliusTransaction[]> {
    return (await this.tryCallOnePage(address, limit)) ?? [];
  }

  getStatus(): Array<{ index: number; name: string; state: 'active' | 'cooldown'; lastError: string | null }> {
    return this.providers.map((provider, i) => ({
      index: i,
      name: provider.constructor.name,
      state: this.isOnCooldown(i) ? 'cooldown' : 'active',
      lastError: this.lastError.get(i) ?? null,
    }));
  }
}
