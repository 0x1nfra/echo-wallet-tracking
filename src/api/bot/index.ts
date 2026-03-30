import { Bot } from 'grammy';
import { registerCommands } from './commands.js';
import { runAlertCycle } from './alerts.js';
import { cycleEmitter } from '../cycle-events.js';

let botInstance: Bot | null = null;

export function startBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    console.log('[bot] TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
    return null;
  }

  const bot = new Bot(token);
  botInstance = bot;

  registerCommands(bot);

  // Wire alert dispatcher to cycle events (only if chatId is configured)
  if (chatId) {
    cycleEmitter.on('cycle', () => {
      runAlertCycle(bot, chatId).catch(err => {
        console.error('[bot] alert cycle error:', err instanceof Error ? err.message : err);
      });
    });
  } else {
    console.log('[bot] TELEGRAM_CHAT_ID not set — alerts disabled (bot commands still work after user sends /start)');
  }

  // Non-blocking long polling: DO NOT await bot.start()
  bot.start({
    onStart: (info) => console.log(`[bot] @${info.username} started (long polling)`),
  }).catch(err => {
    console.error('[bot] crashed:', err);
  });

  return bot;
}

export { botInstance };
