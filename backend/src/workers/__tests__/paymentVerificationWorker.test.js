/**
 * Unit Tests for Payment Verification Worker
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock database
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockQuery = jest.fn();
const mockGetClient = jest.fn(() => Promise.resolve(mockClient));

jest.unstable_mockModule('../../config/database.js', () => ({
  getClient: mockGetClient,
  query: mockQuery,
}));

// Mock blockchain verification service
const mockVerifyPayment = jest.fn();
jest.unstable_mockModule('../../services/blockchainVerificationService.js', () => ({
  verifyPayment: mockVerifyPayment,
}));

// Mock telegram service
const mockSendMessage = jest.fn();
jest.unstable_mockModule('../../services/telegram.js', () => ({
  default: {
    sendMessage: mockSendMessage,
  },
}));

// Mock logger
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after mocks
const {
  startPaymentVerificationWorker,
  stopPaymentVerificationWorker,
  processPendingPayments,
  verifyAndProcessPaymentSafe,
} = await import('../paymentVerificationWorker.js');

describe('Payment Verification Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    stopPaymentVerificationWorker();
  });

  describe('startPaymentVerificationWorker', () => {
    it('should stop worker correctly', () => {
      // Just test stop works without error
      stopPaymentVerificationWorker();
      stopPaymentVerificationWorker(); // Should not throw

      expect(true).toBe(true);
    });
  });

  describe('processPendingPayments', () => {
    it('should do nothing when no pending payments', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT pending
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await processPendingPayments();

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    // Note: processPendingPayments with actual payments is tested via verifyAndProcessPaymentSafe
    // The full integration would require mocking sleep() which adds complexity

    it('should revert payment status on error', async () => {
      const mockPayment = {
        id: 1,
        order_id: 100,
        tx_hash: 'abc123def456',
        currency: 'BTC',
        amount: '0.01',
        recipient_address: '1ABC...',
        expected_crypto_amount: '0.01',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPayment] }) // SELECT pending
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock verification failure
      mockVerifyPayment.mockRejectedValue(new Error('API timeout'));
      mockQuery.mockResolvedValue({ rows: [] });

      await processPendingPayments();

      // Should revert to pending
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments SET status = \'pending\''),
        [1]
      );
    });

    it('should rollback on database error', async () => {
      mockClient.query.mockRejectedValue(new Error('Connection lost'));

      await expect(processPendingPayments()).rejects.toThrow('Connection lost');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('verifyAndProcessPaymentSafe', () => {
    const mockPayment = {
      id: 1,
      order_id: 100,
      tx_hash: 'abc123def456789012345678901234567890123456789012345678901234',
      currency: 'BTC',
      recipient_address: '1ABC...',
      expected_crypto_amount: '0.01',
    };

    it('should confirm order when payment is verified', async () => {
      mockVerifyPayment.mockResolvedValue({
        verified: true,
        status: 'confirmed',
        confirmations: 6,
        txHash: mockPayment.tx_hash,
      });

      // Mock update confirmations
      mockQuery.mockResolvedValue({ rows: [] });

      // Mock confirmOrderPayment dependencies
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 100, status: 'pending', product_id: 1, quantity: 1 }],
        }) // SELECT order
        .mockResolvedValueOnce({
          rows: [{ product_id: 1, quantity: 1, stock_quantity: 10, is_preorder: false }],
        }) // SELECT items
        .mockResolvedValueOnce({ rows: [] }) // UPDATE products
        .mockResolvedValueOnce({ rows: [] }) // UPDATE orders
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await verifyAndProcessPaymentSafe(mockPayment);

      expect(mockVerifyPayment).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments'),
        expect.arrayContaining([6, 1])
      );
    });

    it('should mark payment failed when verification fails', async () => {
      mockVerifyPayment.mockResolvedValue({
        verified: false,
        status: 'failed',
        error: 'Invalid transaction',
        confirmations: 0,
      });

      mockQuery.mockResolvedValue({ rows: [] });

      await verifyAndProcessPaymentSafe(mockPayment);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('verification_status = \'failed\''),
        expect.arrayContaining([1, 'Invalid transaction'])
      );
    });

    it('should return payment to pending when waiting for confirmations', async () => {
      mockVerifyPayment.mockResolvedValue({
        verified: false,
        status: 'pending',
        confirmations: 2,
      });

      mockQuery.mockResolvedValue({ rows: [] });

      await verifyAndProcessPaymentSafe(mockPayment);

      // First call updates confirmations, second returns to pending
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('SET status = \'pending\''),
        [1]
      );
    });
  });

  describe('confirmOrderPayment edge cases', () => {
    it('should handle order not found', async () => {
      const mockPayment = {
        id: 1,
        order_id: 999,
        tx_hash: 'abc123',
        currency: 'BTC',
        recipient_address: '1ABC...',
        expected_crypto_amount: '0.01',
      };

      mockVerifyPayment.mockResolvedValue({
        verified: true,
        status: 'confirmed',
        confirmations: 6,
      });

      mockQuery.mockResolvedValue({ rows: [] });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT order (not found)
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await verifyAndProcessPaymentSafe(mockPayment);

      // Should return payment to pending
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'pending\''),
        [1]
      );
    });

    it('should sync payment status when order already confirmed', async () => {
      const mockPayment = {
        id: 1,
        order_id: 100,
        tx_hash: 'abc123',
        currency: 'BTC',
        recipient_address: '1ABC...',
        expected_crypto_amount: '0.01',
      };

      mockVerifyPayment.mockResolvedValue({
        verified: true,
        status: 'confirmed',
        confirmations: 6,
      });

      mockQuery.mockResolvedValue({ rows: [] });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 100, status: 'confirmed' }] }) // SELECT order
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await verifyAndProcessPaymentSafe(mockPayment);

      // Should sync payment to confirmed
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'confirmed\''),
        [1]
      );
    });
  });
});
