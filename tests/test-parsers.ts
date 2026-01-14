// tests/parser-test.ts

import 'dotenv/config';
import { createHeliusFetcher } from '../src/fetchers/helius.js';
import { parseSwaps, enrichSwaps } from '../src/parsers/swap.js';
import { createDexScreenerFetcher } from '../src/fetchers/dexscreener.js';
import chalk from 'chalk';

/**
 * Format market cap with appropriate suffix (K, M, B)
 */
function formatMarketCap(marketCap: number | undefined): string {
  if (marketCap === undefined || marketCap === null) {
    return 'N/A';
  }

  if (marketCap >= 1_000_000_000) {
    return `${(marketCap / 1_000_000_000).toFixed(2)}B`;
  } else if (marketCap >= 1_000_000) {
    return `${(marketCap / 1_000_000).toFixed(2)}M`;
  } else if (marketCap >= 1_000) {
    return `${(marketCap / 1_000).toFixed(2)}K`;
  } else {
    return marketCap.toString();
  }
}

const TEST_WALLET = 'Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN';
const DAYS = 1; // Analyze last 1 day

async function testParser() {
  console.log(chalk.blue('🔊 Echo - Transaction Parser Test'));
  console.log('='.repeat(50));

  const helius = createHeliusFetcher();

  try {
    console.log(chalk.cyan('\n📡 Fetching transactions...'));
    console.log(`Wallet: ${TEST_WALLET}`);
    console.log(`Period: Last ${DAYS} days\n`);

    const transactions = await helius.getTransactions(TEST_WALLET, DAYS);
    console.log(chalk.green(`✓ Fetched ${transactions.length} transactions`));

    console.log(chalk.cyan('\n🔍 Parsing swaps...'));
    const swaps = parseSwaps(transactions as any, TEST_WALLET);
    console.log(chalk.green(`✓ Found ${swaps.length} swaps`));

    if (swaps.length === 0) {
      console.log(chalk.yellow('\n⚠ No swaps found in this period'));
      return;
    }

    // Enrich swaps with USD prices and token metadata
    console.log(chalk.cyan('\n💰 Enriching swaps with USD prices...'));
    const dexscreener = createDexScreenerFetcher();
    const enrichedSwaps = await enrichSwaps(swaps, dexscreener);
    console.log(chalk.green(`✓ Enriched ${enrichedSwaps.length} swaps with USD values`));

    // Analyze swaps
    const buys = enrichedSwaps.filter((s) => s.type === 'buy').length;
    const sells = enrichedSwaps.filter((s) => s.type === 'sell').length;
    const uniqueTokens = new Set(enrichedSwaps.map((s) => s.tokenAddress)).size;
    const dexCounts = enrichedSwaps.reduce(
      (acc, s) => {
        acc[s.dex] = (acc[s.dex] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log(chalk.cyan('\n📊 Swap Analysis:'));
    console.log(`  Total swaps: ${enrichedSwaps.length}`);
    console.log(`  Buys: ${buys} (${((buys / enrichedSwaps.length) * 100).toFixed(1)}%)`);
    console.log(`  Sells: ${sells} (${((sells / enrichedSwaps.length) * 100).toFixed(1)}%)`);
    console.log(`  Unique tokens: ${uniqueTokens}`);
    console.log(`\n  DEX breakdown:`);
    Object.entries(dexCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([dex, count]) => {
        console.log(`    ${dex}: ${count} (${((count / enrichedSwaps.length) * 100).toFixed(1)}%)`);
      });

    // Show sample swaps
    console.log(chalk.cyan('\n📋 Sample Swaps (first 5):'));
    enrichedSwaps.slice(0, 5).forEach((swap, i) => {
      const date = new Date(swap.timestamp * 1000).toLocaleString();
      const typeColor = swap.type === 'buy' ? chalk.green : chalk.red;
      const typeSymbol = swap.type === 'buy' ? '↑' : '↓';

      console.log(`\n  ${i + 1}. ${typeColor(typeSymbol + ' ' + swap.type.toUpperCase())}`);
      console.log(`     Time: ${date}`);
      console.log(`     Token: ${swap.tokenAddress.slice(0, 8)}...`);
      console.log(`     Ticker: $${swap.tokenSymbol}`);
      console.log(`     Amount: ${swap.amountTokens.toFixed(2)} tokens`);
      console.log(`     SOL: ${swap.amountSol.toFixed(4)} SOL`);
      console.log(`     Price: $${swap.pricePerTokenUsd?.toFixed(6) || '0.000000'}`); // Format price to show decimal places
      console.log(`     Market Cap: $${formatMarketCap(swap.marketCapUsd)}`);
      // FIXME: do we need this?
      console.log(`     DEX: ${swap.dex}`);
      console.log(`     Sig: ${swap.signature.slice(0, 20)}...`);
    });

    // Calculate total volume
    const totalVolume = enrichedSwaps.reduce((sum, s) => sum + s.amountSol, 0);
    console.log(chalk.cyan('\n💰 Trading Volume:'));
    console.log(`  Total SOL traded: ${totalVolume.toFixed(2)} SOL`);
    console.log(`  Average per swap: ${(totalVolume / enrichedSwaps.length).toFixed(4)} SOL`);

    // Token frequency
    const tokenFreq = enrichedSwaps.reduce(
      (acc, s) => {
        const key = s.tokenAddress;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const topTokens = Object.entries(tokenFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    console.log(chalk.cyan('\n🔥 Most Traded Tokens:'));
    topTokens.forEach(([token, count], i) => {
      console.log(`  ${i + 1}. ${token.slice(0, 8)}... (${count} swaps)`);
    });

    console.log('\n' + '='.repeat(50));
    console.log(chalk.green('✓ Parser test complete!'));
  } catch (error) {
    console.error(chalk.red('\n✗ Error:'), error);
    throw error;
  }
}

testParser();
