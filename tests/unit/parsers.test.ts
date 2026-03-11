// tests/unit/parser.test.ts

import { parseSwaps } from '../../src/parsers/swap';
import { DEX_PROGRAM_IDS } from '../../src/types/transaction';

describe('Swap Parser', () => {
  const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

  describe('parseSwaps', () => {
    it('should parse a simple buy transaction', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        type: 'SWAP',
        fee: 0.000005,
        events: {
          swap: [
            {
              nativeInput: {
                account: TEST_WALLET,
                amount: '1000000000', // 1 SOL in lamports
              },
              tokenOutputs: [
                {
                  mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
                  rawTokenAmount: {
                    tokenAmount: '1000000',
                    decimals: 5,
                  },
                  userAccount: TEST_WALLET,
                },
              ],
            },
          ],
        },
        instructions: [
          {
            programId: DEX_PROGRAM_IDS.RAYDIUM,
          },
        ],
      };

      const swaps = parseSwaps([mockTx as any], TEST_WALLET);

      expect(swaps).toHaveLength(1);
      expect(swaps[0].type).toBe('buy');
      expect(swaps[0].amountSol).toBe(1);
      expect(swaps[0].amountTokens).toBe(10); // 1000000 / 10^5
      expect(swaps[0].pricePerToken).toBe(0.1);
      expect(swaps[0].dex).toBe('raydium');
      expect(swaps[0].tokenAddress).toBe('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
    });

    it('should parse a simple sell transaction', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        type: 'SWAP',
        fee: 0.000005,
        events: {
          swap: [
            {
              tokenInputs: [
                {
                  mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
                  rawTokenAmount: {
                    tokenAmount: '1000000',
                    decimals: 5,
                  },
                  userAccount: TEST_WALLET,
                },
              ],
              nativeOutput: {
                account: TEST_WALLET,
                amount: '1500000000', // 1.5 SOL
              },
            },
          ],
        },
        instructions: [
          {
            programId: DEX_PROGRAM_IDS.JUPITER,
          },
        ],
      };

      const swaps = parseSwaps([mockTx as any], TEST_WALLET);

      expect(swaps).toHaveLength(1);
      expect(swaps[0].type).toBe('sell');
      expect(swaps[0].amountSol).toBe(1.5);
      expect(swaps[0].amountTokens).toBe(10);
      expect(swaps[0].pricePerToken).toBe(0.15);
      expect(swaps[0].dex).toBe('jupiter');
    });

    it('should skip non-swap transactions', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        type: 'TRANSFER',
        fee: 0.000005,
        nativeTransfers: [
          {
            fromUserAccount: TEST_WALLET,
            toUserAccount: 'AnotherWallet...',
            amount: 1000000000,
          },
        ],
      };

      const swaps = parseSwaps([mockTx as any], TEST_WALLET);
      expect(swaps).toHaveLength(0);
    });

    it('should handle multiple swaps in a batch', () => {
      const mockTxs = [
        {
          signature: '5mBE1...',
          timestamp: 1704067200,
          type: 'SWAP',
          fee: 0.000005,
          events: {
            swap: [
              {
                nativeInput: {
                  account: TEST_WALLET,
                  amount: '1000000000',
                },
                tokenOutputs: [
                  {
                    mint: 'TokenA',
                    rawTokenAmount: {
                      tokenAmount: '1000000',
                      decimals: 6,
                    },
                    userAccount: TEST_WALLET,
                  },
                ],
              },
            ],
          },
          instructions: [{ programId: DEX_PROGRAM_IDS.RAYDIUM }],
        },
        {
          signature: '5mBE2...',
          timestamp: 1704067300,
          type: 'SWAP',
          fee: 0.000005,
          events: {
            swap: [
              {
                nativeInput: {
                  account: TEST_WALLET,
                  amount: '2000000000',
                },
                tokenOutputs: [
                  {
                    mint: 'TokenB',
                    rawTokenAmount: {
                      tokenAmount: '2000000',
                      decimals: 6,
                    },
                    userAccount: TEST_WALLET,
                  },
                ],
              },
            ],
          },
          instructions: [{ programId: DEX_PROGRAM_IDS.JUPITER }],
        },
      ];

      const swaps = parseSwaps(mockTxs as any, TEST_WALLET);

      expect(swaps).toHaveLength(2);
      expect(swaps[0].tokenAddress).toBe('TokenA');
      expect(swaps[1].tokenAddress).toBe('TokenB');
      expect(swaps[0].dex).toBe('raydium');
      expect(swaps[1].dex).toBe('jupiter');
    });

    it('should identify different DEXs correctly', () => {
      const dexTests = [
        { programId: DEX_PROGRAM_IDS.RAYDIUM, expected: 'raydium' },
        { programId: DEX_PROGRAM_IDS.JUPITER, expected: 'jupiter' },
        { programId: DEX_PROGRAM_IDS.PUMP_FUN, expected: 'pump.fun' },
        { programId: DEX_PROGRAM_IDS.ORCA, expected: 'orca' },
        { programId: DEX_PROGRAM_IDS.METEORA, expected: 'meteora' },
        { programId: 'UnknownProgramId123', expected: 'unknown' },
      ];

      dexTests.forEach(({ programId, expected }) => {
        const mockTx = {
          signature: '5mBE...',
          timestamp: 1704067200,
          type: 'SWAP',
          fee: 0.000005,
          events: {
            swap: [
              {
                nativeInput: {
                  account: TEST_WALLET,
                  amount: '1000000000',
                },
                tokenOutputs: [
                  {
                    mint: 'Token',
                    rawTokenAmount: {
                      tokenAmount: '1000000',
                      decimals: 6,
                    },
                    userAccount: TEST_WALLET,
                  },
                ],
              },
            ],
          },
          instructions: [{ programId }],
        };

        const swaps = parseSwaps([mockTx as any], TEST_WALLET);
        expect(swaps[0].dex).toBe(expected);
      });
    });

    it('should handle token-to-token swaps (skip for now)', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        type: 'SWAP',
        fee: 0.000005,
        events: {
          swap: [
            {
              tokenInputs: [
                {
                  mint: 'TokenA',
                  rawTokenAmount: {
                    tokenAmount: '1000000',
                    decimals: 6,
                  },
                  userAccount: TEST_WALLET,
                },
              ],
              tokenOutputs: [
                {
                  mint: 'TokenB',
                  rawTokenAmount: {
                    tokenAmount: '2000000',
                    decimals: 6,
                  },
                  userAccount: TEST_WALLET,
                },
              ],
            },
          ],
        },
        instructions: [{ programId: DEX_PROGRAM_IDS.JUPITER }],
      };

      const swaps = parseSwaps([mockTx as any], TEST_WALLET);
      // Should skip token-to-token swaps (no SOL involved)
      expect(swaps).toHaveLength(0);
    });
  });
});
