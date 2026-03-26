import { createHeliusFetcher } from '../helius.js';
import { HeliusProvider } from './helius-provider.js';
import { ProviderRouter } from './router.js';
import type { RpcProvider } from './types.js';

// ShyftProvider is added in Plan 03. When SHYFT_API_KEY is present, it is
// imported and appended to the provider list below.
// TODO(11-03): uncomment when shyft-provider.ts is created
// import { ShyftProvider } from './shyft-provider.js';

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

export function createProviderRouter(): ProviderRouter {
  const heliusFetcher = createHeliusFetcher(); // throws if HELIUS_API_KEY missing
  const providers: RpcProvider[] = [new HeliusProvider(heliusFetcher)];

  const shyftKey = process.env.SHYFT_API_KEY;
  if (!shyftKey) {
    console.warn('[provider] SHYFT_API_KEY not set — running with Helius-only, no fallback');
  } else {
    // TODO(11-03): instantiate and push ShyftProvider once shyft-provider.ts exists
    // const shyftProvider = new ShyftProvider(shyftKey);
    // providers.push(shyftProvider);
    console.log('[provider] SHYFT_API_KEY found — ShyftProvider will be wired in Plan 03');
  }

  const onAllExhausted = () => {
    console.error('[provider] ALL providers exhausted — skipping wallet cycle');
    sendProviderExhaustedAlert().catch(() => {});
  };

  return new ProviderRouter(providers, onAllExhausted);
}

export type { RpcProvider, ProviderTransaction } from './types.js';
export { ProviderRouter } from './router.js';
