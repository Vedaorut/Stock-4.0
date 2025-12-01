/**
 * Unit Tests for Blockchain Verification Service
 */

import { jest } from '@jest/globals';

// Mock axios
const mockAxios = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: mockAxios,
}));

// Mock logger
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  VERIFICATION_STATUS,
  verifyPayment,
  verifyBitcoinPayment,
  verifyLitecoinPayment,
  verifyEthereumPayment,
  verifyUSDTTRC20Payment,
} = await import('../blockchainVerificationService.js');

describe('Blockchain Verification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('VERIFICATION_STATUS constants', () => {
    it('should export all status types', () => {
      expect(VERIFICATION_STATUS.SUCCESS).toBe('SUCCESS');
      expect(VERIFICATION_STATUS.TX_NOT_FOUND).toBe('TX_NOT_FOUND');
      expect(VERIFICATION_STATUS.TX_INVALID).toBe('TX_INVALID');
      expect(VERIFICATION_STATUS.API_ERROR).toBe('API_ERROR');
    });
  });

  describe('verifyPayment - dispatcher', () => {
    it('should return TX_INVALID for invalid transaction hash', async () => {
      const result = await verifyPayment('', 'BTC', 'address', '1.0');

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
      expect(result.error).toContain('Invalid transaction hash');
    });

    it('should return TX_INVALID for unsupported chain', async () => {
      const result = await verifyPayment('txhash', 'DOGE', 'address', '1.0');

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_INVALID);
      expect(result.error).toContain('Unsupported chain');
    });

    it('should return API_ERROR when blockchain API fails', async () => {
      const networkError = new Error('ECONNREFUSED');
      networkError.code = 'ECONNREFUSED';
      mockAxios.mockRejectedValue(networkError);

      const result = await verifyPayment('txhash', 'BTC', 'address', '1.0');

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.resultStatus).toBe(VERIFICATION_STATUS.API_ERROR);
    });
  });

  describe('verifyBitcoinPayment', () => {
    // Blockstream Esplora API response format:
    // { txid, vout: [{ scriptpubkey_address, value }], status: { confirmed, block_height } }
    // Note: value is returned in satoshi

    it('should verify confirmed BTC transaction successfully', async () => {
      // Mock tx response
      mockAxios.mockResolvedValueOnce({
        data: {
          txid: 'txhash',
          vout: [
            {
              scriptpubkey_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
              value: 100000000, // 1 BTC in satoshi
            },
          ],
          status: {
            confirmed: true,
            block_height: 100,
          },
        },
      });
      // Mock current height response
      mockAxios.mockResolvedValueOnce({
        data: 102, // 3 confirmations (102 - 100 + 1)
      });

      const result = await verifyBitcoinPayment(
        'txhash',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '1.0'
      );

      expect(result.verified).toBe(true);
      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(3);
      expect(result.amount).toBe('1.00000000');
    });

    it('should detect pending BTC transaction (insufficient confirmations)', async () => {
      mockAxios.mockResolvedValueOnce({
        data: {
          txid: 'txhash',
          vout: [
            {
              scriptpubkey_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
              value: 100000000,
            },
          ],
          status: {
            confirmed: true,
            block_height: 100,
          },
        },
      });
      mockAxios.mockResolvedValueOnce({
        data: 100, // 1 confirmation
      });

      const result = await verifyBitcoinPayment(
        'txhash',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '1.0'
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe('pending');
      expect(result.confirmations).toBe(1);
    });

    it('should return failed for transaction not found', async () => {
      mockAxios.mockResolvedValueOnce({
        data: null,
      });

      const result = await verifyBitcoinPayment(
        'txhash',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '1.0'
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
    });

    it('should reject payment to wrong address', async () => {
      mockAxios.mockResolvedValueOnce({
        data: {
          txid: 'txhash',
          vout: [
            {
              scriptpubkey_address: '1WrongAddressHere',
              value: 100000000,
            },
          ],
          status: { confirmed: false },
        },
      });

      const result = await verifyBitcoinPayment(
        'txhash',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '1.0'
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('expected address');
    });

    it('should reject insufficient amount (with tolerance)', async () => {
      mockAxios.mockResolvedValueOnce({
        data: {
          txid: 'txhash',
          vout: [
            {
              scriptpubkey_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
              value: 95000000, // 0.95 BTC (< 0.98 BTC minimum with 2% tolerance)
            },
          ],
          status: { confirmed: false },
        },
      });

      const result = await verifyBitcoinPayment(
        'txhash',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '1.0'
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Insufficient amount');
    });

    it('should accept amount within tolerance (99% of expected)', async () => {
      mockAxios.mockResolvedValueOnce({
        data: {
          txid: 'txhash',
          vout: [
            {
              scriptpubkey_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
              value: 99000000, // 0.99 BTC (>= 0.98 BTC minimum)
            },
          ],
          status: {
            confirmed: true,
            block_height: 100,
          },
        },
      });
      mockAxios.mockResolvedValueOnce({
        data: 102,
      });

      const result = await verifyBitcoinPayment(
        'txhash',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '1.0'
      );

      expect(result.verified).toBe(true);
      expect(result.status).toBe('confirmed');
      expect(result.amount).toBe('0.99000000');
    });
  });

  describe('verifyLitecoinPayment', () => {
    // BlockCypher API response format:
    // { confirmations, double_spend, outputs: [{ addresses: [], value }] }
    // Note: value is in litoshi, addresses is an array

    it('should verify confirmed LTC transaction successfully', async () => {
      mockAxios.mockResolvedValueOnce({
        data: {
          confirmations: 6,
          double_spend: false,
          outputs: [
            {
              addresses: ['LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL'],
              value: 100000000, // 1 LTC in litoshi
            },
          ],
        },
      });

      const result = await verifyLitecoinPayment(
        'txhash',
        'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL',
        '1.0'
      );

      expect(result.verified).toBe(true);
      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(6);
    });

    it('should reject double-spend LTC transaction', async () => {
      mockAxios.mockResolvedValueOnce({
        data: {
          confirmations: 6,
          double_spend: true,
          outputs: [
            {
              addresses: ['LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL'],
              value: 100000000,
            },
          ],
        },
      });

      const result = await verifyLitecoinPayment(
        'txhash',
        'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL',
        '1.0'
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('double-spend');
    });
  });

  describe('verifyEthereumPayment', () => {
    beforeEach(() => {
      // Set env var for tests
      process.env.ETHERSCAN_API_KEY = 'test-api-key';
    });

    it('should verify confirmed ETH transaction successfully', async () => {
      // Mock eth_getTransactionByHash
      mockAxios.mockResolvedValueOnce({
        data: {
          result: {
            to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
            value: '0xde0b6b3a7640000', // 1 ETH in hex wei
          },
        },
      });

      // Mock eth_getTransactionReceipt
      mockAxios.mockResolvedValueOnce({
        data: {
          result: {
            status: '0x1',
            blockNumber: '0x100',
          },
        },
      });

      // Mock eth_blockNumber
      mockAxios.mockResolvedValueOnce({
        data: {
          result: '0x10C', // 12 blocks ahead
        },
      });

      const result = await verifyEthereumPayment(
        'txhash',
        '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
        '1.0'
      );

      expect(result.verified).toBe(true);
      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(12);
      expect(parseFloat(result.amount)).toBeCloseTo(1.0, 5);
    });

    it('should reject failed ETH transaction', async () => {
      // Mock eth_getTransactionByHash
      mockAxios.mockResolvedValueOnce({
        data: {
          result: {
            to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
            value: '0xde0b6b3a7640000',
          },
        },
      });

      // Mock eth_getTransactionReceipt with failed status
      mockAxios.mockResolvedValueOnce({
        data: {
          result: {
            status: '0x0', // Failed transaction
            blockNumber: '0x100',
          },
        },
      });

      const result = await verifyEthereumPayment(
        'txhash',
        '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
        '1.0'
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('failed on blockchain');
    });

    it('should handle pending ETH transaction (no receipt)', async () => {
      // Mock eth_getTransactionByHash
      mockAxios.mockResolvedValueOnce({
        data: {
          result: {
            to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
            value: '0xde0b6b3a7640000',
          },
        },
      });

      // Mock eth_getTransactionReceipt with null result
      mockAxios.mockResolvedValueOnce({
        data: {
          result: null,
        },
      });

      const result = await verifyEthereumPayment(
        'txhash',
        '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
        '1.0'
      );

      expect(result.verified).toBe(false);
      expect(result.status).toBe('pending');
      expect(result.error).toContain('pending');
    });
  });

  describe('verifyUSDTTRC20Payment', () => {
    beforeEach(() => {
      process.env.TRONGRID_API_KEY = 'test-api-key';
    });

    it('should reject transaction not found', async () => {
      mockAxios.mockResolvedValueOnce({
        data: {},
      });

      const result = await verifyUSDTTRC20Payment('txhash', 'address', '100.0');

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.resultStatus).toBe(VERIFICATION_STATUS.TX_NOT_FOUND);
      expect(result.error).toContain('not found');
    });

    it('should return API_ERROR when TronGrid API fails', async () => {
      // Simulate API error (network timeout)
      const apiError = new Error('ETIMEDOUT');
      apiError.code = 'ETIMEDOUT';
      mockAxios.mockRejectedValueOnce(apiError);

      const result = await verifyUSDTTRC20Payment('txhash', 'address', '100.0');

      expect(result.verified).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.resultStatus).toBe(VERIFICATION_STATUS.API_ERROR);
      expect(result.error).toContain('TRON API error');
    });

    // Note: Full USDT TRC20 verification test requires TronWeb library
    // for proper hex to base58 address conversion. Skipping detailed test for now.
  });

  // Note: USDT TRC20 verification requires TronWeb library for proper address conversion
  // and more complex event parsing. Tests for USDT can be added when TronWeb is integrated.

  // Note: Retry logic is implemented with exponential backoff (1s, 2s, 4s)
  // Integration tests would be better suited for testing retry behavior with real APIs.
});
