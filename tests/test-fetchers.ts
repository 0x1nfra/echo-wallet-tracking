/**
 * Test script for API fetchers
 * Run with: pnpm run tsx tests/test-fetchers.ts
 */

import 'dotenv/config';
import { createHeliusFetcher } from '../src/fetchers/helius.js';
import { createDexScreenerFetcher } from '../src/fetchers/dexscreener.js';
import chalk from 'chalk';

// ⬇️ ADD YOUR TEST WALLET ADDRESS HERE ⬇️
const TEST_WALLET = 'Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN';
// Example: const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

async function testHelius() {
  console.log(chalk.blue('\n📡 Testing Helius Fetcher...\n'));

  try {
    const helius = createHeliusFetcher();

    // Test connection
    console.log('Testing connection...');
    const connected = await helius.testConnection();
    if (!connected) {
      console.log(chalk.red('✗ Connection failed'));
      return;
    }
    console.log(chalk.green('✓ Connection successful\n'));

    // Fetch transactions
    // if (TEST_WALLET === 'Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN') {
    //   console.log(chalk.yellow('⚠ Please add a test wallet address in tests/test-fetchers.ts'));
    //   console.log(chalk.gray('   Look for: const TEST_WALLET = ...'));
    //   return;
    // }

    const transactions = await helius.getTransactions(TEST_WALLET, 1);

    console.log(chalk.green(`\n✓ Fetched ${transactions.length} transactions`));

    if (transactions.length > 0) {
      const first = transactions[0];
      console.log('\nSample transaction:');
      console.log(`  Signature: ${first.signature.slice(0, 16)}...`);
      console.log(`  Timestamp: ${new Date(first.timestamp * 1000).toLocaleString()}`); //FIXME: change to local date format
      // console.log(`  Success: ${first.success}`); FIXME: do i need this?
      console.log(`  Type: ${first.type}`);
      console.log(`  Fee: ${first.fee} SOL`);

      if (first.tokenTransfers && first.tokenTransfers.length > 0) {
        console.log(`  Token transfers: ${first.tokenTransfers.length}`);
      }
      if (first.nativeTransfers && first.nativeTransfers.length > 0) {
        console.log(`  Native transfers: ${first.nativeTransfers.length}`);
      }
    }
  } catch (error) {
    console.error(chalk.red('✗ Helius test failed:'), error);
  }
}

async function testDexScreener() {
  console.log(chalk.blue('\n💹 Testing DexScreener Fetcher...\n'));

  try {
    const dexscreener = createDexScreenerFetcher();

    // Test connection
    console.log('Testing connection...');
    const connected = await dexscreener.testConnection();
    if (!connected) {
      console.log(chalk.red('✗ Connection failed'));
      return;
    }
    console.log(chalk.green('✓ Connection successful\n'));

    // Test with popular Solana tokens
    const testTokens = [
      { name: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
      { name: 'WIF', address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
    ];

    for (const token of testTokens) {
      console.log(`Fetching price for ${token.name}...`);
      const price = await dexscreener.getTokenPrice(token.address);

      if (price !== null) {
        console.log(chalk.green(`✓ ${token.name}: $${price}`));
      } else {
        console.log(chalk.yellow(`⚠ ${token.name}: No price found`));
      }
    }

    // Test batch fetch
    console.log('\nTesting batch price fetch...');
    const addresses = testTokens.map((t) => t.address);
    const priceMap = await dexscreener.getTokenPrices(addresses);

    console.log(chalk.green(`✓ Fetched prices for ${priceMap.size} tokens`));
    priceMap.forEach((price, address) => {
      const token = testTokens.find((t) => t.address === address);
      console.log(`  ${token?.name}: $${price}`);
    });
  } catch (error) {
    console.error(chalk.red('✗ DexScreener test failed:'), error);
  }
}

async function main() {
  console.log(chalk.bold('\n🔊 Echo - API Fetcher Tests\n'));
  console.log('='.repeat(50));

  await testHelius();
  await testDexScreener();

  console.log(chalk.bold('\n' + '='.repeat(50)));
  console.log(chalk.green('\n✓ All tests complete!\n'));
}

main().catch(console.error);
