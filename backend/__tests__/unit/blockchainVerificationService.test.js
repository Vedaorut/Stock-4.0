import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Unit tests for Blockchain Verification Service
 *
 * Tests cover:
 * - verifyPayment: Main entry point with chain routing
 * - verifyBitcoinPayment: BTC verification via Blockstream
 * - verifyLitecoinPayment: LTC verification via BlockCypher
 * - verifyEthereumPayment: ETH verification via Etherscan
 * - verifyUSDTTRC20Payment: USDT TRC20 verification via TronGrid
 * - VERIFICATION_STATUS: All status cases
 * - Amount tolerance: 2% tolerance for network fees
 * - Error handling: API errors vs invalid transactions
 *
 * CRITICAL: All blockchain API calls are mocked
 */

// Mock axios
const mockAxios = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: mockAxios,
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Store original env
const originalEnv = { ...process.env };

// Import after mocking
const _logger = (await import('../../src/utils/logger.js')).default;
const {
  VERIFICATION_STATUS,
  verifyPayment,
  verifyBitcoinPayment,
  verifyLitecoinPayment,
  verifyEthereumPayment,
  verifyUSDTTRC20Payment,
} = await import('../../src/services/blockchainVerificationService.js');

describe('Blockchain Verification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.mockClear();
    process.env.ETHERSCAN_API_KEY = 'test_etherscan_key';
    process.env.BLOCKCYPHER_API_KEY = 'test_blockcypher_key';
    process.env.TRONGRID_API_KEY = 'test_trongrid_key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  // ============================================================================
  // VERIFICATION_STATUS Constants
  // ============================================================================
  describe('VERIFICATION_STATUS', () => {
    it('should export all status types', () => {
      expect(VERIFICATION_STATUS).toEqual({
        SUCCESS: 'SUCCESS',
        TX_NOT_FOUND: 'TX_NOT_FOUND',
        TX_INVALID: 'TX_INVALID',
        API_ERROR: 'API_ERROR',
      });
    });
  });

  // ============================================================================
  // verifyPayment - Main Entry Point
  // ============================================================================
  describe('verifyPayment', () => {
    describe('Input Validation', () => {
      it('should return TX_INVALID for null txHash', async () => {
        const result = await verifyPayment(null, 'BTC', 'address', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Invalid transaction hash');
      });

      it('should return TX_INVALID for empty txHash', async () => {
        const result = await verifyPayment('', 'BTC', 'address', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Invalid transaction hash');
      });

      it('should return TX_INVALID for non-string txHash', async () => {
        const result = await verifyPayment(12345, 'BTC', 'address', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Invalid transaction hash');
      });

      it('should return TX_INVALID for unsupported chain', async () => {
        const result = await verifyPayment('txhash', 'DOGE', 'address', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Unsupported chain: DOGE');
      });

      it('should normalize USDT_TRC20 to USDT', async () => {
        mockAxios.mockResolvedValueOnce({ data: {} });

        const _result = await verifyPayment('txhash', 'USDT_TRC20', 'address', '100');

        // Should have called TronGrid API (USDT handler)
        expect(mockAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('trongrid.io'),
          })
        );
      });
    });

    describe('Chain Routing', () => {
      it('should route BTC to verifyBitcoinPayment', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              txid: 'btc_tx_123',
              vout: [{ scriptpubkey_address: 'bc1address', value: 100000000 }],
              status: { confirmed: true, block_height: 800000 },
            },
          })
          .mockResolvedValueOnce({ data: 800005 });

        const _result = await verifyPayment('btc_tx_123', 'BTC', 'bc1address', '1.0');

        expect(mockAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('blockstream.info'),
          })
        );
      });

      it('should route LTC to verifyLitecoinPayment', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            hash: 'ltc_tx_123',
            outputs: [{ addresses: ['ltc_address'], value: 100000000 }],
            confirmations: 6,
          },
        });

        const _result = await verifyPayment('ltc_tx_123', 'LTC', 'ltc_address', '1.0');

        expect(mockAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('blockcypher.com'),
          })
        );
      });

      it('should route ETH to verifyEthereumPayment', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              result: {
                to: '0xaddress',
                value: '0xde0b6b3a7640000', // 1 ETH in wei
              },
            },
          })
          .mockResolvedValueOnce({
            data: { result: { status: '0x1', blockNumber: '0x100' } },
          })
          .mockResolvedValueOnce({
            data: { result: '0x110' },
          });

        const _result = await verifyPayment('eth_tx_123', 'ETH', '0xaddress', '1.0');

        expect(mockAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('etherscan.io'),
          })
        );
      });
    });

    describe('Error Handling', () => {
      it('should return API_ERROR for network errors', async () => {
        const networkError = new Error('Network timeout');
        networkError.code = 'ETIMEDOUT';
        mockAxios.mockRejectedValueOnce(networkError);

        const result = await verifyPayment('txhash', 'BTC', 'address', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.API_ERROR);
        expect(result.error).toContain('Verification failed');
      });

      it('should return API_ERROR for ECONNREFUSED', async () => {
        const error = new Error('Connection refused');
        error.code = 'ECONNREFUSED';
        mockAxios.mockRejectedValueOnce(error);

        const result = await verifyPayment('txhash', 'BTC', 'address', '1.0');

        expect(result.resultStatus).toBe(VERIFICATION_STATUS.API_ERROR);
      });

      it('should handle general errors gracefully', async () => {
        const error = new Error('Parsing error');
        mockAxios.mockRejectedValueOnce(error);

        const result = await verifyPayment('txhash', 'BTC', 'address', '1.0');

        // General errors are wrapped as API_ERROR due to retry logic
        expect(result.verified).toBe(false);
        expect(result.status).toBe('failed');
      });
    });
  });

  // ============================================================================
  // verifyBitcoinPayment
  // ============================================================================
  describe('verifyBitcoinPayment', () => {
    describe('Happy Path', () => {
      it('should return verified=true for confirmed BTC payment', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              txid: 'btc_tx_confirmed',
              vout: [{ scriptpubkey_address: 'bc1qtest', value: 100000 }], // 0.001 BTC
              status: { confirmed: true, block_height: 800000 },
            },
          })
          .mockResolvedValueOnce({ data: 800003 }); // Current block = 3 confirmations

        const result = await verifyBitcoinPayment('btc_tx_confirmed', 'bc1qtest', '0.001');

        expect(result.verified).toBe(true);
        expect(result.status).toBe('confirmed');
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.SUCCESS);
        expect(result.confirmations).toBe(4); // 800003 - 800000 + 1
        expect(result.amount).toBe('0.00100000');
      });

      it('should return verified=false for pending BTC payment', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            txid: 'btc_tx_pending',
            vout: [{ scriptpubkey_address: 'bc1qtest', value: 100000 }],
            status: { confirmed: false },
          },
        });

        const result = await verifyBitcoinPayment('btc_tx_pending', 'bc1qtest', '0.001');

        expect(result.verified).toBe(false);
        expect(result.status).toBe('pending');
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.SUCCESS);
        expect(result.confirmations).toBe(0);
      });
    });

    describe('Amount Validation', () => {
      it('should accept amount within 2% tolerance', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              txid: 'btc_tx',
              vout: [{ scriptpubkey_address: 'bc1qtest', value: 98000 }], // 0.00098 BTC (2% less than 0.001)
              status: { confirmed: true, block_height: 800000 },
            },
          })
          .mockResolvedValueOnce({ data: 800003 });

        const result = await verifyBitcoinPayment('btc_tx', 'bc1qtest', '0.001');

        expect(result.verified).toBe(true);
        expect(result.amount).toBe('0.00098000');
      });

      it('should reject amount below tolerance', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            txid: 'btc_tx',
            vout: [{ scriptpubkey_address: 'bc1qtest', value: 90000 }], // 0.0009 BTC (10% less)
            status: { confirmed: true, block_height: 800000 },
          },
        });

        const result = await verifyBitcoinPayment('btc_tx', 'bc1qtest', '0.001');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toContain('Insufficient amount');
      });

      it('should reject NaN expected amount (security)', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            txid: 'btc_tx',
            vout: [{ scriptpubkey_address: 'bc1qtest', value: 100000 }],
            status: { confirmed: true, block_height: 800000 },
          },
        });

        const result = await verifyBitcoinPayment('btc_tx', 'bc1qtest', 'invalid');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Invalid expected amount');
      });

      it('should reject zero expected amount (security)', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            txid: 'btc_tx',
            vout: [{ scriptpubkey_address: 'bc1qtest', value: 100000 }],
            status: { confirmed: true, block_height: 800000 },
          },
        });

        const result = await verifyBitcoinPayment('btc_tx', 'bc1qtest', '0');

        expect(result.verified).toBe(false);
        expect(result.error).toBe('Invalid expected amount');
      });
    });

    describe('Address Validation', () => {
      it('should return TX_INVALID for wrong address', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            txid: 'btc_tx',
            vout: [{ scriptpubkey_address: 'bc1qother', value: 100000 }],
            status: { confirmed: true, block_height: 800000 },
          },
        });

        const result = await verifyBitcoinPayment('btc_tx', 'bc1qtest', '0.001');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Payment not sent to expected address');
      });
    });

    describe('Error Cases', () => {
      it('should return TX_NOT_FOUND for missing transaction', async () => {
        mockAxios.mockResolvedValueOnce({ data: null });

        const result = await verifyBitcoinPayment('nonexistent', 'bc1qtest', '0.001');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_NOT_FOUND);
        expect(result.error).toBe('Transaction not found');
      });

      it('should return TX_NOT_FOUND for empty transaction', async () => {
        mockAxios.mockResolvedValueOnce({ data: {} });

        const result = await verifyBitcoinPayment('empty_tx', 'bc1qtest', '0.001');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_NOT_FOUND);
      });
    });
  });

  // ============================================================================
  // verifyLitecoinPayment
  // ============================================================================
  describe('verifyLitecoinPayment', () => {
    describe('Happy Path', () => {
      it('should return verified=true for confirmed LTC payment', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            hash: 'ltc_tx_confirmed',
            outputs: [{ addresses: ['ltc_address'], value: 100000000 }], // 1 LTC
            confirmations: 6,
            double_spend: false,
          },
        });

        const result = await verifyLitecoinPayment('ltc_tx_confirmed', 'ltc_address', '1.0');

        expect(result.verified).toBe(true);
        expect(result.status).toBe('confirmed');
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.SUCCESS);
        expect(result.confirmations).toBe(6);
        expect(result.amount).toBe('1.00000000');
      });

      it('should return verified=false for pending LTC payment', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            hash: 'ltc_tx_pending',
            outputs: [{ addresses: ['ltc_address'], value: 100000000 }],
            confirmations: 2, // Below minimum (6)
          },
        });

        const result = await verifyLitecoinPayment('ltc_tx_pending', 'ltc_address', '1.0');

        expect(result.verified).toBe(false);
        expect(result.status).toBe('pending');
        expect(result.confirmations).toBe(2);
      });
    });

    describe('Double Spend Detection', () => {
      it('should reject double-spend transactions', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            hash: 'ltc_tx_doublespend',
            outputs: [{ addresses: ['ltc_address'], value: 100000000 }],
            confirmations: 10,
            double_spend: true,
          },
        });

        const result = await verifyLitecoinPayment('ltc_tx_doublespend', 'ltc_address', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Transaction flagged as double-spend');
      });
    });

    describe('API Key Usage', () => {
      it('should include API key in request when configured', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            hash: 'ltc_tx',
            outputs: [{ addresses: ['ltc_address'], value: 100000000 }],
            confirmations: 6,
          },
        });

        await verifyLitecoinPayment('ltc_tx', 'ltc_address', '1.0');

        expect(mockAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('token=test_blockcypher_key'),
          })
        );
      });

      it('should work without API key', async () => {
        delete process.env.BLOCKCYPHER_API_KEY;

        mockAxios.mockResolvedValueOnce({
          data: {
            hash: 'ltc_tx',
            outputs: [{ addresses: ['ltc_address'], value: 100000000 }],
            confirmations: 6,
          },
        });

        await verifyLitecoinPayment('ltc_tx', 'ltc_address', '1.0');

        expect(mockAxios).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.not.stringContaining('token='),
          })
        );
      });
    });

    describe('Amount Validation', () => {
      it('should reject NaN expected amount', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            hash: 'ltc_tx',
            outputs: [{ addresses: ['ltc_address'], value: 100000000 }],
            confirmations: 6,
          },
        });

        const result = await verifyLitecoinPayment('ltc_tx', 'ltc_address', 'not_a_number');

        expect(result.verified).toBe(false);
        expect(result.error).toBe('Invalid expected amount');
      });
    });
  });

  // ============================================================================
  // verifyEthereumPayment
  // ============================================================================
  describe('verifyEthereumPayment', () => {
    describe('Happy Path', () => {
      it('should return verified=true for confirmed ETH payment', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              result: {
                to: '0xRecipient',
                value: '0xde0b6b3a7640000', // 1 ETH in wei
              },
            },
          })
          .mockResolvedValueOnce({
            data: { result: { status: '0x1', blockNumber: '0x100' } },
          })
          .mockResolvedValueOnce({
            data: { result: '0x110' }, // 16 confirmations
          });

        const result = await verifyEthereumPayment('eth_tx', '0xRecipient', '1.0');

        expect(result.verified).toBe(true);
        expect(result.status).toBe('confirmed');
        expect(result.confirmations).toBe(16);
      });

      it('should handle case-insensitive address matching', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              result: {
                to: '0xRECIPIENT',
                value: '0xde0b6b3a7640000',
              },
            },
          })
          .mockResolvedValueOnce({
            data: { result: { status: '0x1', blockNumber: '0x100' } },
          })
          .mockResolvedValueOnce({
            data: { result: '0x110' },
          });

        const result = await verifyEthereumPayment('eth_tx', '0xrecipient', '1.0');

        expect(result.verified).toBe(true);
      });
    });

    describe('Configuration', () => {
      it('should return TX_INVALID if ETHERSCAN_API_KEY not configured', async () => {
        delete process.env.ETHERSCAN_API_KEY;

        const result = await verifyEthereumPayment('eth_tx', '0xAddress', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('ETHERSCAN_API_KEY not configured');
      });
    });

    describe('Transaction Status', () => {
      it('should return pending for unconfirmed transaction', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              result: {
                to: '0xRecipient',
                value: '0xde0b6b3a7640000',
              },
            },
          })
          .mockResolvedValueOnce({
            data: { result: null }, // No receipt yet
          })
          .mockResolvedValueOnce({
            data: { result: '0x100' },
          });

        const result = await verifyEthereumPayment('eth_tx', '0xRecipient', '1.0');

        expect(result.verified).toBe(false);
        expect(result.status).toBe('pending');
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.SUCCESS);
      });

      it('should return TX_INVALID for failed transaction', async () => {
        mockAxios
          .mockResolvedValueOnce({
            data: {
              result: {
                to: '0xRecipient',
                value: '0xde0b6b3a7640000',
              },
            },
          })
          .mockResolvedValueOnce({
            data: { result: { status: '0x0', blockNumber: '0x100' } }, // Failed
          })
          .mockResolvedValueOnce({
            data: { result: '0x110' },
          });

        const result = await verifyEthereumPayment('eth_tx', '0xRecipient', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Transaction failed on blockchain');
      });
    });

    describe('Address Validation', () => {
      it('should return TX_INVALID for wrong recipient', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            result: {
              to: '0xOtherAddress',
              value: '0xde0b6b3a7640000',
            },
          },
        });

        const result = await verifyEthereumPayment('eth_tx', '0xRecipient', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
        expect(result.error).toBe('Payment not sent to expected address');
      });
    });

    describe('Error Cases', () => {
      it('should return TX_NOT_FOUND for missing transaction', async () => {
        mockAxios.mockResolvedValueOnce({
          data: { result: null },
        });

        const result = await verifyEthereumPayment('nonexistent', '0xRecipient', '1.0');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_NOT_FOUND);
      });
    });
  });

  // ============================================================================
  // verifyUSDTTRC20Payment
  // ============================================================================
  describe('verifyUSDTTRC20Payment', () => {
    describe('Transaction Validation', () => {
      it('should return TX_NOT_FOUND for null transaction info', async () => {
        mockAxios.mockResolvedValueOnce({ data: null });

        const result = await verifyUSDTTRC20Payment('nonexistent', 'TAddress', '100');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_NOT_FOUND);
      });

      it('should return TX_INVALID for failed receipt', async () => {
        mockAxios.mockResolvedValueOnce({
          data: {
            blockNumber: 50000000,
            receipt: { result: 'FAILED' },
            id: 'tx_123',
          },
        });

        const result = await verifyUSDTTRC20Payment('failed_tx', 'TAddress', '100');

        expect(result.verified).toBe(false);
        expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
      });
    });

    describe('API Error Handling', () => {
      it('should handle API errors from fetchWithRetry', async () => {
        // When fetchWithRetry throws BlockchainAPIError with isAPIError flag
        const apiError = new Error('Network error');
        apiError.isAPIError = true;
        mockAxios.mockRejectedValue(apiError);

        const result = await verifyUSDTTRC20Payment('tx', 'TAddress', '100');

        expect(result.verified).toBe(false);
        // After retry logic exhausted, error is handled
      });
    });
  });

  // ============================================================================
  // Retry Logic and API Error Handling
  // ============================================================================
  describe('Retry Logic', () => {
    it('should retry on API failures with exponential backoff', async () => {
      jest.useFakeTimers();

      const apiError = new Error('Timeout');
      mockAxios
        .mockRejectedValueOnce(apiError)
        .mockRejectedValueOnce(apiError)
        .mockResolvedValueOnce({
          data: {
            txid: 'btc_tx',
            vout: [{ scriptpubkey_address: 'bc1qtest', value: 100000 }],
            status: { confirmed: true, block_height: 800000 },
          },
        })
        .mockResolvedValueOnce({ data: 800003 });

      const promise = verifyBitcoinPayment('btc_tx', 'bc1qtest', '0.001');

      // Fast-forward through retries
      await jest.advanceTimersByTimeAsync(1000); // First retry
      await jest.advanceTimersByTimeAsync(2000); // Second retry

      const result = await promise;

      expect(result.verified).toBe(true);
      expect(mockAxios).toHaveBeenCalledTimes(4); // 2 retries + success + block height

      jest.useRealTimers();
    });

    it('should return API_ERROR result after all retries exhausted', async () => {
      // Test through verifyPayment which catches the error and returns a result
      const apiError = new Error('Persistent failure');
      mockAxios.mockRejectedValue(apiError);

      // Use verifyPayment which catches the error
      const result = await verifyPayment('btc_tx', 'BTC', 'bc1qtest', '0.001');

      expect(result.verified).toBe(false);
      expect(result.resultStatus).toBe(VERIFICATION_STATUS.API_ERROR);
      expect(result.error).toContain('API request failed');
    });
  });
});
