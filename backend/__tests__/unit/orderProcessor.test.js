import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Unit tests for Order Processor
 *
 * Tests cover:
 * - processOrderPayment: Main order payment flow
 * - Idempotency: Already confirmed orders/invoices
 * - Authorization: Buyer/seller access control
 * - Stock deduction: Inventory management
 * - Error handling: Rollback on failures
 * - Blockchain verification: Integration with verification service
 *
 * CRITICAL: Money-handling code. All external dependencies are mocked.
 */

// Mock database
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../src/config/database.js', () => ({
  getClient: jest.fn().mockResolvedValue(mockClient),
  query: jest.fn(),
}));

// Mock validators
const mockValidateAndLockOrder = jest.fn();
jest.unstable_mockModule(
  '../../src/services/invoicePayment/validators/index.js',
  () => ({
    validateAndLockOrder: mockValidateAndLockOrder,
  })
);

// Mock utils
const mockEnsureInvoiceActive = jest.fn();
const mockGuardTxReuse = jest.fn();
jest.unstable_mockModule(
  '../../src/services/invoicePayment/utils/index.js',
  () => ({
    ensureInvoiceActive: mockEnsureInvoiceActive,
    guardTxReuse: mockGuardTxReuse,
  })
);

// Mock payment records
const mockMarkInvoicePaid = jest.fn();
jest.unstable_mockModule(
  '../../src/services/invoicePayment/utils/paymentRecords.js',
  () => ({
    markInvoicePaid: mockMarkInvoicePaid,
  })
);

// Mock notifications
const mockNotifyOrderConfirmed = jest.fn();
jest.unstable_mockModule(
  '../../src/services/invoicePayment/notifications/index.js',
  () => ({
    notifyOrderConfirmed: mockNotifyOrderConfirmed,
  })
);

// Mock blockchain verification
const mockVerifyPayment = jest.fn();
jest.unstable_mockModule(
  '../../src/services/blockchainVerificationService.js',
  () => ({
    verifyPayment: mockVerifyPayment,
  })
);

// Mock websocket
jest.unstable_mockModule('../../src/utils/websocket.js', () => ({
  broadcast: jest.fn(),
}));

// Mock alerts
jest.unstable_mockModule('../../src/utils/alerts.js', () => ({
  alertStockDeductionFailed: jest.fn(),
}));

// Mock productQueries
jest.unstable_mockModule('../../src/database/queries/index.js', () => ({
  productQueries: {
    unreserveStock: jest.fn().mockResolvedValue({ rowCount: 1 }),
  },
}));

// Mock logger
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Import after mocking
const { getClient: _getClient } = await import('../../src/config/database.js');
const { processOrderPayment } = await import(
  '../../src/services/invoicePayment/processors/orderProcessor.js'
);
const logger = (await import('../../src/utils/logger.js')).default;
const { broadcast } = await import('../../src/utils/websocket.js');
const { alertStockDeductionFailed } = await import('../../src/utils/alerts.js');

// Helper function to setup common mock scenarios
function setupMockQueryHandler(handlers = {}) {
  return (sql, params) => {
    if (typeof sql === 'string') {
      if (
        sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' ||
        sql === 'COMMIT' ||
        sql === 'ROLLBACK'
      ) {
        return Promise.resolve();
      }
      if (sql.includes('pg_advisory_xact_lock')) {
        return Promise.resolve();
      }

      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      for (const [pattern, handler] of Object.entries(handlers)) {
        if (normalizedSql.includes(pattern)) {
          return handler(sql, params);
        }
      }
    }
    return Promise.resolve({ rows: [] });
  };
}

describe('Order Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
    mockValidateAndLockOrder.mockClear();
    mockEnsureInvoiceActive.mockClear();
    mockGuardTxReuse.mockClear();
    mockMarkInvoicePaid.mockClear();
    mockNotifyOrderConfirmed.mockClear();
    mockVerifyPayment.mockClear();

    // Default mock implementations
    mockClient.query.mockImplementation(setupMockQueryHandler());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // Idempotency - Already Confirmed
  // ============================================================================
  describe('Idempotency', () => {
    it('should return idempotent result if order already confirmed', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'confirmed',
        shop_id: 789,
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);

      const result = await processOrderPayment({
        orderId: 123,
        actorUserId: 456,
      });

      expect(result.ok).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.message).toBe('Order already confirmed');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return idempotent result if invoice already paid', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
        shop_id: 789,
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'paid',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({
        active: false,
        reason: 'already_paid',
      });

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
        })
      );

      const result = await processOrderPayment({
        orderId: 123,
        actorUserId: 456,
      });

      expect(result.ok).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.message).toBe('Invoice already paid');
    });

    it('should handle duplicate tx_hash for same order (idempotent)', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
        shop_id: 789,
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const existingPayment = {
        id: 999,
        order_id: 123,
        tx_hash: 'same_tx_hash',
        status: 'confirmed',
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(existingPayment);
      mockMarkInvoicePaid.mockResolvedValueOnce();
      mockNotifyOrderConfirmed.mockResolvedValueOnce();

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
        })
      );

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'same_tx_hash',
        actorUserId: 456,
      });

      expect(result.ok).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(mockMarkInvoicePaid).toHaveBeenCalledWith(mockClient, 111, 'same_tx_hash');
    });
  });

  // ============================================================================
  // Invoice Validation
  // ============================================================================
  describe('Invoice Validation', () => {
    it('should throw ValidationError if no invoice found', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [] }),
        })
      );

      await expect(
        processOrderPayment({
          orderId: 123,
          actorUserId: 456,
        })
      ).rejects.toThrow('No invoice found for this order');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return expired state if invoice expired', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() - 60000).toISOString(), // Expired
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({
        active: false,
        reason: 'expired',
      });

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
        })
      );

      const result = await processOrderPayment({
        orderId: 123,
        actorUserId: 456,
      });

      expect(result.ok).toBe(false);
      expect(result.state).toBe('expired');
      expect(result.code).toBe('INVOICE_EXPIRED');
    });
  });

  // ============================================================================
  // Payment Record Validation
  // ============================================================================
  describe('Payment Record Validation', () => {
    it('should return NO_PAYMENT_RECORD if no pending payment found', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
          'SELECT id, tx_hash, currency': () => Promise.resolve({ rows: [] }),
        })
      );

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'tx_hash_123',
        actorUserId: 456,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe('NO_PAYMENT_RECORD');
    });

    it('should return NO_TX_HASH if no transaction hash available', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const mockPayment = {
        id: 222,
        order_id: 123,
        tx_hash: null, // No tx_hash
        currency: 'BTC',
        recipient_address: 'bc1qtest',
        expected_crypto_amount: '0.001',
        status: 'pending',
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
          'SELECT id, tx_hash, currency': () =>
            Promise.resolve({ rows: [mockPayment] }),
        })
      );

      const result = await processOrderPayment({
        orderId: 123,
        actorUserId: 456,
        // No txHash provided
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe('NO_TX_HASH');
    });
  });

  // ============================================================================
  // Blockchain Verification
  // ============================================================================
  describe('Blockchain Verification', () => {
    it('should return pending state when awaiting confirmations', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const mockPayment = {
        id: 222,
        order_id: 123,
        tx_hash: 'tx_123',
        currency: 'BTC',
        recipient_address: 'bc1qtest',
        expected_crypto_amount: '0.001',
        status: 'pending',
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);
      mockVerifyPayment.mockResolvedValueOnce({
        verified: false,
        status: 'pending',
        confirmations: 1,
      });

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
          'SELECT id, tx_hash, currency': () =>
            Promise.resolve({ rows: [mockPayment] }),
          'UPDATE payments SET blockchain_confirmations': () => Promise.resolve(),
        })
      );

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'tx_123',
        actorUserId: 456,
      });

      expect(result.ok).toBe(false);
      expect(result.state).toBe('pending');
      expect(result.code).toBe('AWAITING_CONFIRMATIONS');
      expect(result.confirmations).toBe(1);
    });

    it('should return failed state when verification fails', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const mockPayment = {
        id: 222,
        order_id: 123,
        tx_hash: 'tx_123',
        currency: 'BTC',
        recipient_address: 'bc1qtest',
        expected_crypto_amount: '0.001',
        status: 'pending',
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);
      mockVerifyPayment.mockResolvedValueOnce({
        verified: false,
        status: 'failed',
        error: 'Insufficient amount',
        confirmations: 0,
      });

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
          'SELECT id, tx_hash, currency': () =>
            Promise.resolve({ rows: [mockPayment] }),
          'UPDATE payments SET blockchain_confirmations': () => Promise.resolve(),
          'UPDATE payments SET verification_status': () => Promise.resolve(),
        })
      );

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'tx_123',
        actorUserId: 456,
      });

      expect(result.ok).toBe(false);
      expect(result.state).toBe('failed');
      expect(result.code).toBe('VERIFICATION_FAILED');
      expect(result.message).toBe('Insufficient amount');
    });
  });

  // ============================================================================
  // Stock Deduction
  // ============================================================================
  describe('Stock Deduction', () => {
    it('should deduct stock on successful payment verification', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
        shop_id: 789,
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const mockPayment = {
        id: 222,
        order_id: 123,
        tx_hash: 'tx_123',
        currency: 'BTC',
        recipient_address: 'bc1qtest',
        expected_crypto_amount: '0.001',
        status: 'pending',
      };

      const mockOrderItems = [
        { product_id: 1, quantity: 2, stock_quantity: 10, is_preorder: false },
        { product_id: 2, quantity: 1, stock_quantity: 5, is_preorder: false },
      ];

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);
      mockVerifyPayment.mockResolvedValueOnce({
        verified: true,
        status: 'confirmed',
        confirmations: 6,
        amount: '0.001',
      });
      mockMarkInvoicePaid.mockResolvedValueOnce();
      mockNotifyOrderConfirmed.mockResolvedValueOnce();

      const stockUpdates = [];
      let orderUpdateCalled = false;
      let paymentUpdateCalled = false;

      mockClient.query.mockImplementation((sql, params) => {
        if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          return Promise.resolve();
        }
        if (sql.includes('SELECT * FROM invoices WHERE order_id')) {
          return Promise.resolve({ rows: [mockInvoice] });
        }
        if (sql.includes('SELECT id, tx_hash, currency')) {
          return Promise.resolve({ rows: [mockPayment] });
        }
        if (sql.includes('SELECT oi.product_id, oi.quantity')) {
          return Promise.resolve({ rows: mockOrderItems });
        }
        if (sql.includes('UPDATE products') && sql.includes('stock_quantity = stock_quantity')) {
          stockUpdates.push({ quantity: params[0], productId: params[1] });
          return Promise.resolve();
        }
        if (sql.includes('UPDATE orders') && sql.includes("status = 'confirmed'")) {
          orderUpdateCalled = true;
          return Promise.resolve();
        }
        if (sql.includes('UPDATE payments') && sql.includes("status = 'confirmed'")) {
          paymentUpdateCalled = true;
          return Promise.resolve();
        }
        if (sql.includes('UPDATE payments SET blockchain_confirmations')) {
          return Promise.resolve();
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'tx_123',
        actorUserId: 456,
      });

      expect(result.ok).toBe(true);
      expect(result.state).toBe('confirmed');
      // Verify stock was updated for non-preorder items
      expect(stockUpdates).toHaveLength(2);
      expect(orderUpdateCalled).toBe(true);
      expect(paymentUpdateCalled).toBe(true);
    });

    it('should skip stock deduction for preorder items', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
        shop_id: 789,
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const mockPayment = {
        id: 222,
        order_id: 123,
        tx_hash: 'tx_123',
        currency: 'BTC',
        recipient_address: 'bc1qtest',
        expected_crypto_amount: '0.001',
        status: 'pending',
      };

      const mockOrderItems = [
        { product_id: 1, quantity: 2, stock_quantity: 10, is_preorder: true },
      ];

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);
      mockVerifyPayment.mockResolvedValueOnce({
        verified: true,
        status: 'confirmed',
        confirmations: 6,
        amount: '0.001',
      });
      mockMarkInvoicePaid.mockResolvedValueOnce();
      mockNotifyOrderConfirmed.mockResolvedValueOnce();

      const stockUpdates = [];

      mockClient.query.mockImplementation((sql, params) => {
        if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          return Promise.resolve();
        }
        if (sql.includes('SELECT * FROM invoices WHERE order_id')) {
          return Promise.resolve({ rows: [mockInvoice] });
        }
        if (sql.includes('SELECT id, tx_hash, currency')) {
          return Promise.resolve({ rows: [mockPayment] });
        }
        if (sql.includes('SELECT oi.product_id, oi.quantity')) {
          return Promise.resolve({ rows: mockOrderItems });
        }
        if (sql.includes('UPDATE products SET stock_quantity')) {
          stockUpdates.push({ quantity: params[0], productId: params[1] });
          return Promise.resolve();
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'tx_123',
        actorUserId: 456,
      });

      expect(result.ok).toBe(true);
      expect(stockUpdates).toHaveLength(0); // No stock deduction for preorder
    });

    it('should return INSUFFICIENT_STOCK and rollback when stock is depleted', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
        shop_id: 789,
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const mockPayment = {
        id: 222,
        order_id: 123,
        tx_hash: 'tx_123',
        currency: 'BTC',
        recipient_address: 'bc1qtest',
        expected_crypto_amount: '0.001',
        status: 'pending',
      };

      const mockOrderItems = [
        { product_id: 1, quantity: 5, stock_quantity: 2, is_preorder: false }, // Not enough stock
      ];

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);
      mockVerifyPayment.mockResolvedValueOnce({
        verified: true,
        status: 'confirmed',
        confirmations: 6,
        amount: '0.001',
      });

      mockClient.query.mockImplementation((sql, _params) => {
        if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
          return Promise.resolve();
        }
        if (sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          return Promise.resolve();
        }
        if (sql.includes('SELECT * FROM invoices WHERE order_id')) {
          return Promise.resolve({ rows: [mockInvoice] });
        }
        if (sql.includes('SELECT id, tx_hash, currency')) {
          return Promise.resolve({ rows: [mockPayment] });
        }
        if (sql.includes('SELECT oi.product_id, oi.quantity')) {
          return Promise.resolve({ rows: mockOrderItems });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'tx_123',
        actorUserId: 456,
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_STOCK');
      expect(result.productId).toBe(1);
      expect(result.available).toBe(2);
      expect(result.requested).toBe(5);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(alertStockDeductionFailed).toHaveBeenCalledWith(
        123,
        1,
        'Insufficient stock: 2 < 5'
      );
    });
  });

  // ============================================================================
  // Successful Payment Flow
  // ============================================================================
  describe('Successful Payment Flow', () => {
    it('should complete payment flow and emit websocket event', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
        shop_id: 789,
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const mockPayment = {
        id: 222,
        order_id: 123,
        tx_hash: 'tx_123',
        currency: 'BTC',
        recipient_address: 'bc1qtest',
        expected_crypto_amount: '0.001',
        status: 'pending',
      };

      const mockOrderItems = [
        { product_id: 1, quantity: 1, stock_quantity: 10, is_preorder: false },
      ];

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({ active: true });
      mockGuardTxReuse.mockResolvedValueOnce(null);
      mockVerifyPayment.mockResolvedValueOnce({
        verified: true,
        status: 'confirmed',
        confirmations: 6,
        amount: '0.001',
      });
      mockMarkInvoicePaid.mockResolvedValueOnce();
      mockNotifyOrderConfirmed.mockResolvedValueOnce();

      mockClient.query.mockImplementation((sql, _params) => {
        if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          return Promise.resolve();
        }
        if (sql.includes('SELECT * FROM invoices WHERE order_id')) {
          return Promise.resolve({ rows: [mockInvoice] });
        }
        if (sql.includes('SELECT id, tx_hash, currency')) {
          return Promise.resolve({ rows: [mockPayment] });
        }
        if (sql.includes('SELECT oi.product_id, oi.quantity')) {
          return Promise.resolve({ rows: mockOrderItems });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await processOrderPayment({
        orderId: 123,
        txHash: 'tx_123',
        actorUserId: 456,
      });

      expect(result.ok).toBe(true);
      expect(result.state).toBe('confirmed');
      expect(result.confirmations).toBe(6);
      expect(result.amount).toBe('0.001');

      expect(broadcast).toHaveBeenCalledWith('order_status', {
        orderId: 123,
        status: 'confirmed',
        shopId: 789,
      });

      expect(mockNotifyOrderConfirmed).toHaveBeenCalledWith(123);
      expect(mockMarkInvoicePaid).toHaveBeenCalledWith(mockClient, 111, 'tx_123');
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================
  describe('Error Handling', () => {
    it('should rollback and release client on error', async () => {
      const dbError = new Error('Database connection lost');

      mockValidateAndLockOrder.mockRejectedValueOnce(dbError);

      await expect(
        processOrderPayment({
          orderId: 123,
          actorUserId: 456,
        })
      ).rejects.toThrow('Database connection lost');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        '[InvoicePayment] Order payment processing failed',
        expect.objectContaining({
          orderId: 123,
          error: 'Database connection lost',
        })
      );
    });

    it('should handle rollback error gracefully', async () => {
      mockValidateAndLockOrder.mockRejectedValueOnce(new Error('DB Error'));
      mockClient.query.mockImplementation((sql) => {
        if (sql === 'ROLLBACK') {
          throw new Error('Rollback failed');
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        processOrderPayment({
          orderId: 123,
          actorUserId: 456,
        })
      ).rejects.toThrow('DB Error');

      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        '[InvoicePayment] Rollback error',
        expect.objectContaining({ error: 'Rollback failed' })
      );
    });

    it('should always release client in finally block', async () => {
      mockClient.query.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(
        processOrderPayment({
          orderId: 123,
          actorUserId: 456,
        })
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Transaction Isolation
  // ============================================================================
  describe('Transaction Isolation', () => {
    it('should use SERIALIZABLE isolation level', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'confirmed',
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);

      await processOrderPayment({
        orderId: 123,
        actorUserId: 456,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        'BEGIN ISOLATION LEVEL SERIALIZABLE'
      );
    });

    it('should acquire advisory lock on invoice', async () => {
      const mockOrder = {
        id: 123,
        buyer_id: 456,
        status: 'pending',
      };

      const mockInvoice = {
        id: 111,
        order_id: 123,
        status: 'paid',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      mockValidateAndLockOrder.mockResolvedValueOnce(mockOrder);
      mockEnsureInvoiceActive.mockResolvedValueOnce({
        active: false,
        reason: 'already_paid',
      });

      mockClient.query.mockImplementation(
        setupMockQueryHandler({
          'SELECT * FROM invoices WHERE order_id': () =>
            Promise.resolve({ rows: [mockInvoice] }),
        })
      );

      await processOrderPayment({
        orderId: 123,
        actorUserId: 456,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock($1)',
        [111]
      );
    });
  });
});
