import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallets, swaps, parse_errors } from '../db/schema.js';
import { createHeliusFetcher } from '../fetchers/helius.js';
import { parseSwaps, applyFifo } from '../parsers/swap.js';
import type { SwapRow } from '../types/transaction.js';
import type { HeliusTransaction } from '../types/index.js';
import { runDetection } from '../detection/engine.js';

const DAYS_180_IN_SECONDS = 180 * 24 * 60 * 60;

export interface ImportOptions {
  fullHistory?: boolean;  // true = no time limit; false/undefined = 180 days
}

export async function importWalletHistory(
  address: string,
  options: ImportOptions = {}
): Promise<void> {
  const fetcher = createHeliusFetcher();
  const afterTimestamp = options.fullHistory
    ? 0
    : Math.floor(Date.now() / 1000) - DAYS_180_IN_SECONDS;

  // fetchSwapHistory returns ALL pages already paginated
  const rawTxs = await fetcher.fetchSwapHistory(address, afterTimestamp);

  // Parse all transactions
  const parsedSwaps: SwapRow[] = [];
  for (const tx of rawTxs) {
    try {
      const swapRows = parseSwaps([tx], address);
      parsedSwaps.push(...swapRows);
    } catch (err) {
      // Known-DEX parse failure — write to parse_errors silently
      const dex = identifyDexForError(tx);
      if (dex) {
        silentlyLogParseError(tx.signature, dex, address, err as Error);
      }
      // Unknown DEX failures are not logged (skip silently per locked decision)
    }
  }

  // Apply FIFO cost basis pass
  const enrichedSwaps = applyFifo(parsedSwaps);

  // Batch insert into swaps table — skip duplicates via UNIQUE constraint
  db.transaction((tx) => {
    for (const swap of enrichedSwaps) {
      try {
        tx.insert(swaps).values(swap).run();
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
          continue; // Duplicate signature — already stored
        }
        throw err;
      }
    }
  });

  // Mark import complete
  db.update(wallets)
    .set({ status: 'tracked', history_complete: true, last_checked_at: Date.now() })
    .where(eq(wallets.address, address))
    .run();

  // Run detection after full history import — gate all four detectors on history_complete=true
  await runDetection(address);
}

function identifyDexForError(tx: HeliusTransaction): string | null {
  // Minimal DEX identification for error logging — avoids re-importing full parser
  const DEX_PROGRAMS: Record<string, string> = {
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'raydium',
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'raydium',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'raydium',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'jupiter',
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun',
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'pump.fun',
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'orca',
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': 'meteora',
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG': 'meteora',
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB': 'meteora',
  };
  for (const ix of (tx.instructions ?? [])) {
    if (DEX_PROGRAMS[ix.programId]) return DEX_PROGRAMS[ix.programId];
  }
  return null;
}

function silentlyLogParseError(sig: string, dex: string, wallet: string, err: Error): void {
  try {
    db.insert(parse_errors).values({
      tx_signature: sig,
      dex,
      wallet_address: wallet,
      error_message: err.message.slice(0, 500),
    }).run();
  } catch {
    // Truly silent — even error logging can fail
  }
}

export async function resumeImportingWallets(): Promise<void> {
  // Called at startup — resume any wallets stuck in 'importing' state
  const importingWallets = db
    .select({ address: wallets.address })
    .from(wallets)
    .where(eq(wallets.status, 'importing'))
    .all();

  for (const wallet of importingWallets) {
    // Re-run import — duplicate signatures are skipped via UNIQUE constraint
    await importWalletHistory(wallet.address);
  }
}
