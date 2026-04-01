import { createHeliusFetcher, HeliusCreditExhaustedError } from '../helius.js';
import type { HeliusFetcher } from '../helius.js';
import { HeliusProvider } from './helius-provider.js';
import { ProviderRouter } from './router.js';
import type { RpcProvider } from './types.js';

import { ShyftProvider } from './shyft-provider.js';

// Probe timing: starts at 5 minutes, doubles each attempt, caps at 60 minutes
const CREDIT_EXHAUSTION_BASE_DELAY_MS = 5 * 60 * 1000;   // 5 minutes
const CREDIT_EXHAUSTION_MAX_DELAY_MS = 60 * 60 * 1000;   // 60 minutes

async function sendProviderExhaustedAlert(): Promise<void> {
  const { botInstance } = await import('../../api/bot/index.js');
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botInstance || !chatId) {
    console.warn('[provider] Telegram not configured — skipping exhaustion alert');
    return;
  }
  await botInstance.api.sendMessage(
    chatId,
    '<b>PROVIDER ALERT</b>\nAll RPC providers exhausted. Wallet cycles are being skipped.\nCheck HELIUS_API_KEY and SHYFT_API_KEY.',
    { parse_mode: 'HTML' }
  );
}

/**
 * Start a probe loop that periodically tests whether Helius credits have been restored.
 * Retry interval starts at 5m, doubles each failed probe, caps at 60m.
 * Resumes monitorLoop when Helius responds successfully.
 */
function startCreditExhaustionProbe(heliusFetcher: HeliusFetcher): void {
  let delayMs = CREDIT_EXHAUSTION_BASE_DELAY_MS;

  const probe = async (): Promise<void> => {
    console.log(`[provider] Helius credit exhaustion probe in ${delayMs / 60000}m...`);
    await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    try {
      // Lightweight probe: single transaction for a well-known address with limit=1
      await heliusFetcher.fetchOnePage('So11111111111111111111111111111111111111112', 1);
      // Success — credits restored
      console.log('[provider] Helius credits restored — resuming monitor loop');
      const { monitorLoop } = await import('../../commands/wallet.js');
      monitorLoop.resume();
    } catch (err) {
      if (err instanceof HeliusCreditExhaustedError) {
        // Still exhausted — double delay (cap at 60m) and try again
        delayMs = Math.min(delayMs * 2, CREDIT_EXHAUSTION_MAX_DELAY_MS);
        probe().catch(() => {}); // fire-and-forget; errors logged inside probe
      } else {
        // Different error (network, auth, etc.) — don't resume, stop probing
        console.error('[provider] Helius probe failed with unexpected error:', err instanceof Error ? err.message : err);
      }
    }
  };

  probe().catch(() => {}); // fire-and-forget; errors handled internally
}

/**
 * Wrap a HeliusProvider method to intercept HeliusCreditExhaustedError.
 * On detection: pause monitorLoop, start probe, re-throw so ProviderRouter
 * falls back to Shyft for the current request cycle.
 */
async function handleCreditExhaustion<T>(
  fn: () => Promise<T>,
  heliusFetcher: HeliusFetcher
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HeliusCreditExhaustedError) {
      console.warn('[provider] Helius credit exhaustion detected — pausing monitor loop');
      // Lazy-import to avoid circular dependency at module load time
      const { monitorLoop } = await import('../../commands/wallet.js');
      monitorLoop.pause();
      startCreditExhaustionProbe(heliusFetcher);
    }
    throw err; // Re-throw so ProviderRouter falls back to Shyft for this cycle
  }
}

export function createProviderRouter(): ProviderRouter {
  const heliusFetcher = createHeliusFetcher(); // throws if HELIUS_API_KEY missing
  const heliusProvider = new HeliusProvider(heliusFetcher);

  // Wrap HeliusProvider to intercept credit exhaustion BEFORE ProviderRouter swallows it
  const heliusProviderWrapped: RpcProvider = {
    fetchSwapHistory: (address, afterTimestamp) =>
      handleCreditExhaustion(
        () => heliusProvider.fetchSwapHistory(address, afterTimestamp),
        heliusFetcher
      ),
    fetchEarlySwapsForMint: (mint, limit, sortOrder) =>
      handleCreditExhaustion(
        () => heliusProvider.fetchEarlySwapsForMint(mint, limit, sortOrder),
        heliusFetcher
      ),
    fetchOnePage: (address, limit) =>
      handleCreditExhaustion(
        () => heliusProvider.fetchOnePage(address, limit),
        heliusFetcher
      ),
  };

  const providers: RpcProvider[] = [heliusProviderWrapped];

  const shyftKey = process.env.SHYFT_API_KEY;
  if (!shyftKey) {
    console.warn('[provider] SHYFT_API_KEY not set — running with Helius-only, no fallback');
  } else {
    const shyftProvider = new ShyftProvider(shyftKey);
    providers.push(shyftProvider);
    console.log('[provider] SHYFT_API_KEY found — ShyftProvider added as fallback provider');
  }

  const onAllExhausted = () => {
    console.error('[provider] ALL providers exhausted — skipping wallet cycle');
    sendProviderExhaustedAlert().catch(() => {});
  };

  return new ProviderRouter(providers, onAllExhausted);
}

export type { RpcProvider, ProviderTransaction } from './types.js';
export { ProviderRouter } from './router.js';
