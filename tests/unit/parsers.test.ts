// tests/unit/parsers.test.ts

import { parseSwaps, applyFifo } from '../../src/parsers/swap';
import { DEX_PROGRAM_IDS } from '../../src/types/transaction';
import type { SwapRow } from '../../src/types/transaction';

describe('Swap Parser', () => {
  const TEST_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

  describe('parseSwaps', () => {
    it('should parse a simple buy transaction (Raydium)', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        slot: 100,
        type: 'SWAP',
        fee: 5000, // lamports
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
      expect(swaps[0].side).toBe('buy');
      expect(swaps[0].sol_amount).toBe(1);
      expect(swaps[0].token_amount).toBe(10); // 1000000 / 10^5
      expect(swaps[0].dex).toBe('raydium');
      expect(swaps[0].token_mint).toBe('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
      expect(swaps[0].cost_basis_sol).toBeNull();
      expect(swaps[0].realized_pnl_sol).toBeNull();
    });

    it('should parse a simple sell transaction (Jupiter)', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        slot: 101,
        type: 'SWAP',
        fee: 5000,
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
      expect(swaps[0].side).toBe('sell');
      expect(swaps[0].sol_amount).toBe(1.5);
      expect(swaps[0].token_amount).toBe(10); // 1000000 / 10^5
      expect(swaps[0].dex).toBe('jupiter');
    });

    it('should skip non-swap transactions (TRANSFER)', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        slot: 102,
        type: 'TRANSFER',
        fee: 5000,
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
          slot: 103,
          type: 'SWAP',
          fee: 5000,
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
          slot: 104,
          type: 'SWAP',
          fee: 5000,
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
      expect(swaps[0].token_mint).toBe('TokenA');
      expect(swaps[1].token_mint).toBe('TokenB');
      expect(swaps[0].dex).toBe('raydium');
      expect(swaps[1].dex).toBe('jupiter');
    });

    it('should identify all 5 supported DEXes correctly', () => {
      const dexTests = [
        { programId: DEX_PROGRAM_IDS.RAYDIUM, expected: 'raydium' },
        { programId: DEX_PROGRAM_IDS.JUPITER, expected: 'jupiter' },
        { programId: DEX_PROGRAM_IDS.PUMP_FUN, expected: 'pump.fun' },
        { programId: DEX_PROGRAM_IDS.ORCA, expected: 'orca' },
        { programId: DEX_PROGRAM_IDS.METEORA, expected: 'meteora' },
      ];

      dexTests.forEach(({ programId, expected }) => {
        const mockTx = {
          signature: '5mBE...',
          timestamp: 1704067200,
          slot: 200,
          type: 'SWAP',
          fee: 5000,
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
        expect(swaps).toHaveLength(1);
        expect(swaps[0].dex).toBe(expected);
      });
    });

    it('should skip unknown programId (return empty array, no result)', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        slot: 201,
        type: 'SWAP',
        fee: 5000,
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
        instructions: [{ programId: 'UnknownProgramId123' }],
      };

      const swaps = parseSwaps([mockTx as any], TEST_WALLET);
      // Unknown programId → skip entirely, do not produce a result with dex='unknown'
      expect(swaps).toHaveLength(0);
    });

    it('should skip token-to-token swaps (no SOL involved)', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        slot: 202,
        type: 'SWAP',
        fee: 5000,
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
      // Token-to-token: no nativeInput and no nativeOutput → skip
      expect(swaps).toHaveLength(0);
    });

    it('should handle events.swap as single object (not array)', () => {
      const mockTx = {
        signature: '5mBE...',
        timestamp: 1704067200,
        slot: 203,
        type: 'SWAP',
        fee: 5000,
        events: {
          swap: {
            // object, not array
            nativeInput: {
              account: TEST_WALLET,
              amount: '500000000', // 0.5 SOL
            },
            tokenOutputs: [
              {
                mint: 'TokenC',
                rawTokenAmount: {
                  tokenAmount: '500000',
                  decimals: 6,
                },
                userAccount: TEST_WALLET,
              },
            ],
          },
        },
        instructions: [{ programId: DEX_PROGRAM_IDS.ORCA }],
      };

      const swaps = parseSwaps([mockTx as any], TEST_WALLET);
      expect(swaps).toHaveLength(1);
      expect(swaps[0].side).toBe('buy');
      expect(swaps[0].sol_amount).toBe(0.5);
      expect(swaps[0].dex).toBe('orca');
    });
  });

  describe('applyFifo', () => {
    it('should calculate realized PnL for a matched sell', () => {
      // Buy 10 tokens @ 1 SOL (0.1 SOL/token), then sell 10 tokens for 1.5 SOL
      const swaps: SwapRow[] = [
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'buy-sig',
          dex: 'raydium',
          token_mint: 'TokenA',
          side: 'buy',
          token_amount: 10,
          sol_amount: 1,
          timestamp: 1704067200,
          slot: 100,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'sell-sig',
          dex: 'raydium',
          token_mint: 'TokenA',
          side: 'sell',
          token_amount: 10,
          sol_amount: 1.5,
          timestamp: 1704067300,
          slot: 101,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
      ];

      const result = applyFifo(swaps);

      expect(result).toHaveLength(2);
      // Buy: cost_basis_sol = sol_amount, realized_pnl_sol = null
      expect(result[0].side).toBe('buy');
      expect(result[0].cost_basis_sol).toBe(1);
      expect(result[0].realized_pnl_sol).toBeNull();
      // Sell: cost_basis_sol = 1 SOL consumed, realized_pnl_sol = 1.5 - 1 = 0.5
      expect(result[1].side).toBe('sell');
      expect(result[1].cost_basis_sol).toBe(1);
      expect(result[1].realized_pnl_sol).toBeCloseTo(0.5, 9);
    });

    it('should set null fields for orphaned sell (no prior buy)', () => {
      const swaps: SwapRow[] = [
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'sell-sig',
          dex: 'jupiter',
          token_mint: 'TokenB',
          side: 'sell',
          token_amount: 5,
          sol_amount: 0.75,
          timestamp: 1704067200,
          slot: 200,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
      ];

      const result = applyFifo(swaps);

      expect(result).toHaveLength(1);
      expect(result[0].cost_basis_sol).toBeNull();
      expect(result[0].realized_pnl_sol).toBeNull();
    });

    it('should handle multiple tokens independently', () => {
      const swaps: SwapRow[] = [
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'buy-a',
          dex: 'raydium',
          token_mint: 'TokenA',
          side: 'buy',
          token_amount: 10,
          sol_amount: 1,
          timestamp: 1704067100,
          slot: 100,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'buy-b',
          dex: 'jupiter',
          token_mint: 'TokenB',
          side: 'buy',
          token_amount: 20,
          sol_amount: 2,
          timestamp: 1704067200,
          slot: 101,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'sell-a',
          dex: 'raydium',
          token_mint: 'TokenA',
          side: 'sell',
          token_amount: 10,
          sol_amount: 1.5,
          timestamp: 1704067300,
          slot: 102,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
      ];

      const result = applyFifo(swaps);

      expect(result).toHaveLength(3);
      // TokenA sell: matched, pnl = 1.5 - 1 = 0.5
      const sellA = result.find(r => r.tx_signature === 'sell-a')!;
      expect(sellA.realized_pnl_sol).toBeCloseTo(0.5, 9);
      // TokenB buy: not yet sold, no pnl
      const buyB = result.find(r => r.tx_signature === 'buy-b')!;
      expect(buyB.realized_pnl_sol).toBeNull();
    });

    it('should not mutate the input array', () => {
      const swaps: SwapRow[] = [
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'buy-sig',
          dex: 'raydium',
          token_mint: 'TokenA',
          side: 'buy',
          token_amount: 10,
          sol_amount: 1,
          timestamp: 1704067200,
          slot: 300,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
      ];

      const originalFirst = { ...swaps[0] };
      applyFifo(swaps);

      expect(swaps[0]).toEqual(originalFirst);
    });

    it('should sort by timestamp before processing', () => {
      // Sell appears first in array but has later timestamp — buy should be processed first
      const swaps: SwapRow[] = [
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'sell-sig',
          dex: 'raydium',
          token_mint: 'TokenA',
          side: 'sell',
          token_amount: 10,
          sol_amount: 1.5,
          timestamp: 1704067300, // later
          slot: 201,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
        {
          wallet_address: TEST_WALLET,
          tx_signature: 'buy-sig',
          dex: 'raydium',
          token_mint: 'TokenA',
          side: 'buy',
          token_amount: 10,
          sol_amount: 1,
          timestamp: 1704067200, // earlier
          slot: 200,
          fee_sol: null,
          cost_basis_sol: null,
          realized_pnl_sol: null,
        },
      ];

      const result = applyFifo(swaps);

      const sell = result.find(r => r.side === 'sell')!;
      expect(sell.realized_pnl_sol).toBeCloseTo(0.5, 9);
    });
  });
});
