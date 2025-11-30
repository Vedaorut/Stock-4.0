import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { INVOICE_PURPOSES, INVOICE_STATES } from '../../src/constants/invoice.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../src/utils/errors.js';

/**
 * Unit tests for Invoice Payment Service
 *
 * Tests cover:
 * - Happy paths for order and subscription payments
 * - Error handling (expired invoices, duplicate tx_hash, missing resources)
 * - Authorization checks (buyer/seller access control)
 * - Edge cases (stock depletion, concurrent payments, CrystalPay flows)
 * - Idempotency (duplicate payment attempts)
 *
 * CRITICAL: All database queries and external services are mocked
 */

// Mock dependencies
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPoolQuery = jest.fn();

jest.unstable_mockModule('../../src/config/database.js', () => ({
  getClient: jest.fn().mockResolvedValue(mockClient),
  query: mockPoolQuery,
}));

jest.unstable_mockModule('../../src/database/queries/index.js', () => ({
  orderItemQueries: {
    findByOrderIdWithStock: jest.fn(),
  },
  orderQueries: {
    findById: jest.fn(),
  },
  paymentQueries: {
    create: jest.fn(),
    updateStatus: jest.fn(),
  },
  productQueries: {
    findById: jest.fn(),
    updateStock: jest.fn(),
  },
  shopQueries: {
    findById: jest.fn(),
  },
  subscriptionQueries: {
    findShopSubscriptionById: jest.fn(),
  },
  userQueries: {
    findById: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/services/telegram.js', () => ({
  default: {
    notifyPaymentConfirmed: jest.fn(),
    notifyPaymentConfirmedSeller: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Import mocked modules
const { getClient, query: _query } = await import('../../src/config/database.js');
const {
  orderItemQueries,
  orderQueries,
  paymentQueries,
  productQueries,
  shopQueries,
  subscriptionQueries,
  userQueries,
} = await import('../../src/database/queries/index.js');

const {
  processOrderPayment,
  processSubscriptionPayment,
} = await import('../../src/services/invoicePaymentService.js');

const ORDER_STATES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
};

// Helper function to create mock implementation that handles transaction SQL
function createMockQueryHandler(customHandlers = {}) {
  return (sql, params) => {
    if (typeof sql === 'string') {
      if (sql === 'BEGIN' || sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
        return Promise.resolve();
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve();
      }
      if (sql.includes('SET LOCAL lock_timeout')) {
        return Promise.resolve();
      }
      if (sql.includes('pg_advisory_xact_lock')) {
        return Promise.resolve();
      }

      // Normalize SQL for matching (remove extra whitespace and newlines)
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      // Custom handlers
      for (const [pattern, handler] of Object.entries(customHandlers)) {
        const normalizedPattern = pattern.replace(/\s+/g, ' ').trim();
        if (normalizedSql.includes(normalizedPattern)) {
          return handler(sql, params);
        }
      }
    }
    return Promise.resolve({ rows: [] });
  };
}

describe('Invoice Payment Service', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
    mockPoolQuery.mockClear();

    // Default successful transaction flow
    mockClient.query.mockImplementation((sql) => {
      if (typeof sql === 'string') {
        if (sql === 'BEGIN' || sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE') {
          return Promise.resolve();
        }
        if (sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (sql.includes('SET LOCAL lock_timeout')) {
          return Promise.resolve();
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          return Promise.resolve();
        }
      }
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processOrderPayment', () => {
    describe('Happy Path - Successful Order Payment', () => {
      it('should return idempotent result if order already confirmed', async () => {
        const orderId = 123;
        const actorUserId = 456;

        const mockOrder = {
          id: orderId,
          buyer_id: actorUserId,
          status: ORDER_STATES.CONFIRMED,
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
          })
        );

        const result = await processOrderPayment({
          orderId,
          actorUserId,
        });

        expect(result.ok).toBe(true);
        expect(result.idempotent).toBe(true);
        expect(result.message).toBe('Order already confirmed');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should process order with CrystalPay disabled message', async () => {
        const orderId = 123;
        const actorUserId = 456;
        const txHash = 'valid_tx_hash_123';

        const mockOrder = {
          id: orderId,
          buyer_id: actorUserId,
          product_id: 789,
          quantity: 2,
          total_price: 100,
          currency: 'USDT',
          status: ORDER_STATES.PENDING,
          buyer_telegram_id: 987654321,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 111,
          order_id: orderId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
          expected_amount: 100,
          currency: 'USDT',
          chain: 'ETHEREUM',
          purpose: INVOICE_PURPOSES.ORDER,
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
            'SELECT * FROM invoices WHERE order_id': () => Promise.resolve({ rows: [mockInvoice] }),
            'SELECT * FROM payments WHERE tx_hash': () => Promise.resolve({ rows: [] }),
          })
        );

        orderItemQueries.findByOrderIdWithStock.mockResolvedValue([]);

        const result = await processOrderPayment({
          orderId,
          txHash,
          actorUserId,
        });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('UNSUPPORTED_PAYMENT_METHOD');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });

    describe('Error Handling - Expired Invoice', () => {
      it('should reject payment if invoice has expired', async () => {
        const orderId = 123;
        const actorUserId = 456;

        const mockOrder = {
          id: orderId,
          buyer_id: actorUserId,
          status: ORDER_STATES.PENDING,
        };

        const pastDate = new Date(Date.now() - 60 * 60 * 1000);
        const mockInvoice = {
          id: 111,
          order_id: orderId,
          status: INVOICE_STATES.PENDING,
          expires_at: pastDate.toISOString(),
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
            'SELECT * FROM invoices WHERE order_id': () => Promise.resolve({ rows: [mockInvoice] }),
            'UPDATE invoices SET status': () => Promise.resolve(),
          })
        );

        const result = await processOrderPayment({
          orderId,
          actorUserId,
        });

        expect(result.ok).toBe(false);
        expect(result.state).toBe('expired');
        expect(result.code).toBe('INVOICE_EXPIRED');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should return idempotent result if invoice already paid', async () => {
        const orderId = 123;
        const actorUserId = 456;

        const mockOrder = {
          id: orderId,
          buyer_id: actorUserId,
          status: ORDER_STATES.PENDING,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 111,
          order_id: orderId,
          status: INVOICE_STATES.PAID,
          expires_at: futureDate.toISOString(),
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
            'SELECT * FROM invoices WHERE order_id': () => Promise.resolve({ rows: [mockInvoice] }),
          })
        );

        const result = await processOrderPayment({
          orderId,
          actorUserId,
        });

        expect(result.ok).toBe(true);
        expect(result.idempotent).toBe(true);
        expect(result.message).toBe('Invoice already paid');
      });
    });

    describe('Error Handling - Duplicate Transaction Hash', () => {
      it('should reject payment if tx_hash was used for different order', async () => {
        const orderId = 123;
        const actorUserId = 456;
        const txHash = 'duplicate_tx_hash';

        const mockOrder = {
          id: orderId,
          buyer_id: actorUserId,
          status: ORDER_STATES.PENDING,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 111,
          order_id: orderId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
        };

        const existingPayment = {
          id: 999,
          order_id: 456,
          tx_hash: txHash,
          status: 'confirmed',
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
            'SELECT * FROM invoices WHERE order_id': () => Promise.resolve({ rows: [mockInvoice] }),
            'SELECT * FROM payments WHERE tx_hash': () => Promise.resolve({ rows: [existingPayment] }),
          })
        );

        await expect(
          processOrderPayment({
            orderId,
            txHash,
            actorUserId,
          })
        ).rejects.toThrow(ValidationError);

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should accept payment if tx_hash was used for same order (idempotency)', async () => {
        const orderId = 123;
        const actorUserId = 456;
        const txHash = 'same_order_tx_hash';

        const mockOrder = {
          id: orderId,
          buyer_id: actorUserId,
          status: ORDER_STATES.PENDING,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 111,
          order_id: orderId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
        };

        const existingPayment = {
          id: 999,
          order_id: orderId,
          tx_hash: txHash,
          status: 'confirmed',
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
            'SELECT * FROM invoices WHERE order_id': () => Promise.resolve({ rows: [mockInvoice] }),
            'SELECT * FROM payments WHERE tx_hash': () => Promise.resolve({ rows: [existingPayment] }),
            'UPDATE invoices': () => Promise.resolve(),
          })
        );

        orderQueries.findById.mockResolvedValue(mockOrder);
        productQueries.findById.mockResolvedValue({ id: 789, name: 'Product', shop_id: 321 });
        shopQueries.findById.mockResolvedValue({ id: 321, name: 'Shop', owner_id: 999 });
        userQueries.findById.mockResolvedValue({ id: actorUserId, telegram_id: 123 });

        const result = await processOrderPayment({
          orderId,
          txHash,
          actorUserId,
        });

        expect(result.ok).toBe(true);
        expect(result.idempotent).toBe(true);
      });
    });

    describe('Error Handling - Missing Resources', () => {
      it('should throw NotFoundError if order does not exist', async () => {
        const orderId = 999;
        const actorUserId = 456;

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT o.*, s.owner_id FROM orders')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        await expect(
          processOrderPayment({
            orderId,
            actorUserId,
          })
        ).rejects.toThrow(NotFoundError);

        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should throw ValidationError if no invoice found for order', async () => {
        const orderId = 123;
        const actorUserId = 456;

        const mockOrder = {
          id: orderId,
          buyer_id: actorUserId,
          status: ORDER_STATES.PENDING,
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
            'SELECT * FROM invoices WHERE order_id': () => Promise.resolve({ rows: [] }),
          })
        );

        await expect(
          processOrderPayment({
            orderId,
            actorUserId,
          })
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('Authorization - Access Control', () => {
      it('should allow buyer to process payment for their order', async () => {
        const orderId = 123;
        const buyerId = 456;

        const mockOrder = {
          id: orderId,
          buyer_id: buyerId,
          status: ORDER_STATES.CONFIRMED,
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
          })
        );

        const result = await processOrderPayment({
          orderId,
          actorUserId: buyerId,
        });

        expect(result.ok).toBe(true);
      });

      it('should reject if user is not buyer and allowSeller=false', async () => {
        const orderId = 123;
        const buyerId = 456;
        const otherUserId = 789;

        const mockOrder = {
          id: orderId,
          buyer_id: buyerId,
          owner_id: 999,
          status: ORDER_STATES.PENDING,
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
          })
        );

        await expect(
          processOrderPayment({
            orderId,
            actorUserId: otherUserId,
            allowSeller: false,
          })
        ).rejects.toThrow(UnauthorizedError);
      });

      it('should allow seller to process payment when allowSeller=true', async () => {
        const orderId = 123;
        const buyerId = 456;
        const sellerId = 999;

        const mockOrder = {
          id: orderId,
          buyer_id: buyerId,
          owner_id: sellerId,
          status: ORDER_STATES.CONFIRMED,
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT o.*, s.owner_id FROM orders': () => Promise.resolve({ rows: [mockOrder] }),
          })
        );

        const result = await processOrderPayment({
          orderId,
          actorUserId: sellerId,
          allowSeller: true,
        });

        expect(result.ok).toBe(true);
      });
    });

    describe('Error Handling - Rollback on Failure', () => {
      it('should rollback transaction on database error', async () => {
        const orderId = 123;
        const actorUserId = 456;

        mockClient.query.mockRejectedValue(new Error('Database connection lost'));

        await expect(
          processOrderPayment({
            orderId,
            actorUserId,
          })
        ).rejects.toThrow('Database connection lost');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should handle rollback errors gracefully', async () => {
        const orderId = 123;
        const actorUserId = 456;

        mockClient.query
          .mockRejectedValueOnce(new Error('Transaction failed'))
          .mockRejectedValueOnce(new Error('Rollback failed'));

        await expect(
          processOrderPayment({
            orderId,
            actorUserId,
          })
        ).rejects.toThrow('Transaction failed');

        expect(mockClient.release).toHaveBeenCalled();
      });
    });
  });

  describe('processSubscriptionPayment', () => {
    describe('Happy Path - Successful Subscription Payment', () => {
      it('should successfully process CrystalPay subscription payment', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;
        const txHash = 'crystalpay_tx_123';

        const mockSubscription = {
          id: subscriptionId,
          user_id: actorUserId,
          shop_id: 789,
          tier: 'basic',
          status: 'pending',
          owner_id: actorUserId,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
          purpose: INVOICE_PURPOSES.SUBSCRIPTION,
          chain: 'CRYSTALPAY',
          currency: 'USDT',
          expected_amount: 25,
          crypto_amount: '25.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [mockSubscription] });
          }
          if (sql.includes('SELECT * FROM invoices WHERE id')) {
            return Promise.resolve({ rows: [mockInvoice] });
          }
          if (sql.includes('SELECT * FROM payments WHERE tx_hash')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('UPDATE shops SET tier')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE shop_subscriptions')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE invoices')) {
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        paymentQueries.create.mockResolvedValue({
          id: 333,
          subscription_id: subscriptionId,
          status: 'confirmed',
        });

        subscriptionQueries.findShopSubscriptionById.mockResolvedValue(mockSubscription);
        shopQueries.findById.mockResolvedValue({ id: 789, name: 'Shop', owner_id: actorUserId });
        userQueries.findById.mockResolvedValue({ id: actorUserId, telegram_id: 123456789 });

        const result = await processSubscriptionPayment({
          subscriptionId,
          txHash,
          actorUserId,
        });

        expect(result.ok).toBe(true);
        expect(result.state).toBe('confirmed');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should auto-create shop if subscription has no shop_id', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;
        const txHash = 'auto_shop_tx';

        const mockSubscription = {
          id: subscriptionId,
          user_id: actorUserId,
          shop_id: null,
          tier: 'basic',
          status: 'pending',
          owner_id: actorUserId,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
          purpose: INVOICE_PURPOSES.SUBSCRIPTION,
          chain: 'CRYSTALPAY',
          currency: 'USDT',
          expected_amount: 25,
          crypto_amount: '25.00',
        };

        const mockUser = {
          id: actorUserId,
          telegram_id: 123456789,
          username: 'testuser',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [mockSubscription] });
          }
          if (sql.includes('SELECT * FROM invoices WHERE id')) {
            return Promise.resolve({ rows: [mockInvoice] });
          }
          if (sql.includes('SELECT * FROM payments WHERE tx_hash')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('SELECT telegram_id, username FROM users')) {
            return Promise.resolve({ rows: [mockUser] });
          }
          if (sql.includes('SELECT id, name FROM shops WHERE owner_id')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('INSERT INTO shops')) {
            return Promise.resolve({
              rows: [{ id: 999, name: 'Shop_testuser_123' }],
            });
          }
          if (sql.includes('UPDATE shop_subscriptions')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE shops SET next_payment_due')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE invoices')) {
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        paymentQueries.create.mockResolvedValue({
          id: 333,
          subscription_id: subscriptionId,
          status: 'confirmed',
        });

        const result = await processSubscriptionPayment({
          subscriptionId,
          txHash,
          actorUserId,
        });

        expect(result.ok).toBe(true);
        expect(result.state).toBe('confirmed');
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO shops'),
          expect.any(Array)
        );
      });

      it('should use existing shop if user already has active shop', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;
        const txHash = 'existing_shop_tx';

        const mockSubscription = {
          id: subscriptionId,
          user_id: actorUserId,
          shop_id: null,
          tier: 'basic',
          status: 'pending',
          owner_id: actorUserId,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
          purpose: INVOICE_PURPOSES.SUBSCRIPTION,
          chain: 'CRYSTALPAY',
          currency: 'USDT',
          expected_amount: 25,
          crypto_amount: '25.00',
        };

        const existingShop = {
          id: 888,
          name: 'Existing Shop',
          owner_id: actorUserId,
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [mockSubscription] });
          }
          if (sql.includes('SELECT * FROM invoices WHERE id')) {
            return Promise.resolve({ rows: [mockInvoice] });
          }
          if (sql.includes('SELECT telegram_id, username FROM users')) {
            return Promise.resolve({ rows: [{ telegram_id: 123, username: 'user' }] });
          }
          if (sql.includes('SELECT id, name FROM shops WHERE owner_id')) {
            return Promise.resolve({ rows: [existingShop] });
          }
          if (sql.includes('UPDATE shop_subscriptions')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE shops SET next_payment_due')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE invoices')) {
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        paymentQueries.create.mockResolvedValue({ id: 333, status: 'confirmed' });

        const result = await processSubscriptionPayment({
          subscriptionId,
          txHash,
          actorUserId,
        });

        expect(result.ok).toBe(true);
        expect(mockClient.query).not.toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO shops'),
          expect.any(Array)
        );
      });
    });

    describe('Happy Path - Subscription Upgrade', () => {
      it('should process upgrade from basic to pro', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;
        const txHash = 'upgrade_tx';

        const mockSubscription = {
          id: subscriptionId,
          user_id: actorUserId,
          shop_id: 789,
          tier: 'basic',
          status: 'active',
          owner_id: actorUserId,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
          purpose: INVOICE_PURPOSES.UPGRADE,
          chain: 'CRYSTALPAY',
          currency: 'USDT',
          expected_amount: 10,
          crypto_amount: '10.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [mockSubscription] });
          }
          if (sql.includes('SELECT owner_id FROM shops WHERE id')) {
            return Promise.resolve({ rows: [{ owner_id: actorUserId }] });
          }
          if (sql.includes('SELECT * FROM invoices WHERE id')) {
            return Promise.resolve({ rows: [mockInvoice] });
          }
          if (sql.includes('UPDATE shops SET tier')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE shop_subscriptions')) {
            return Promise.resolve();
          }
          if (sql.includes('UPDATE invoices')) {
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        paymentQueries.create.mockResolvedValue({ id: 333, status: 'confirmed' });

        const result = await processSubscriptionPayment({
          subscriptionId,
          txHash,
          actorUserId,
          mode: 'upgrade',
        });

        expect(result.ok).toBe(true);
        expect(result.state).toBe('confirmed');
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining("SET tier = 'pro'"),
          expect.any(Array)
        );
      });

      it('should return idempotent result if already upgraded to pro', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;
        const txHash = 'already_pro_tx';

        const mockSubscription = {
          id: subscriptionId,
          user_id: actorUserId,
          shop_id: 789,
          tier: 'pro',
          status: 'active',
          owner_id: actorUserId,
        };

        const futureDate = new Date(Date.now() + 60 * 60 * 1000);
        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: futureDate.toISOString(),
          purpose: INVOICE_PURPOSES.UPGRADE,
          chain: 'CRYSTALPAY',
          currency: 'USDT',
          expected_amount: 10,
          crypto_amount: '10.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [mockSubscription] });
          }
          if (sql.includes('SELECT owner_id FROM shops WHERE id')) {
            return Promise.resolve({ rows: [{ owner_id: actorUserId }] });
          }
          if (sql.includes('SELECT * FROM invoices WHERE id')) {
            return Promise.resolve({ rows: [mockInvoice] });
          }
          if (sql.includes('UPDATE invoices')) {
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        paymentQueries.create.mockResolvedValue({ id: 333, status: 'confirmed' });

        const result = await processSubscriptionPayment({
          subscriptionId,
          txHash,
          actorUserId,
          mode: 'upgrade',
        });

        expect(result.ok).toBe(true);
        expect(result.idempotent).toBe(true);
      });
    });

    describe('Error Handling - Expired Invoice', () => {
      it('should reject payment if invoice expired', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;

        const pastDate = new Date(Date.now() - 60 * 60 * 1000);
        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: pastDate.toISOString(),
          purpose: INVOICE_PURPOSES.SUBSCRIPTION,
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        const result = await processSubscriptionPayment({
          subscriptionId,
          actorUserId,
        });

        expect(result.ok).toBe(false);
        expect(result.state).toBe('expired');
        expect(result.code).toBe('INVOICE_EXPIRED');
        expect(getClient).not.toHaveBeenCalled();
      });

      it('should return early if invoice already processed', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;

        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PAID,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        const result = await processSubscriptionPayment({
          subscriptionId,
          actorUserId,
        });

        expect(result.ok).toBe(true);
        expect(result.state).toBe('already_processed');
        expect(getClient).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling - Missing Resources', () => {
      it('should throw ValidationError if invoice not found', async () => {
        const subscriptionId = 999;
        const actorUserId = 456;

        mockPoolQuery.mockResolvedValue({ rows: [] });

        await expect(
          processSubscriptionPayment({
            subscriptionId,
            actorUserId,
          })
        ).rejects.toThrow(ValidationError);
      });

      it('should throw NotFoundError if subscription not found', async () => {
        const subscriptionId = 999;
        const actorUserId = 456;

        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          chain: 'CRYSTALPAY',
          crypto_amount: '25.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        await expect(
          processSubscriptionPayment({
            subscriptionId,
            actorUserId,
          })
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('Authorization - Access Control', () => {
      it('should allow subscription owner to process payment', async () => {
        const subscriptionId = 111;
        const ownerId = 456;

        const mockSubscription = {
          id: subscriptionId,
          user_id: ownerId,
          shop_id: 789,
          tier: 'basic',
          status: 'active',
          owner_id: ownerId,
        };

        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          chain: 'CRYSTALPAY',
          crypto_amount: '25.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [mockSubscription] });
          }
          if (sql.includes('SELECT owner_id FROM shops WHERE id')) {
            return Promise.resolve({ rows: [{ owner_id: ownerId }] });
          }
          if (sql.includes('SELECT * FROM invoices WHERE id')) {
            return Promise.resolve({ rows: [mockInvoice] });
          }
          if (sql.includes('UPDATE')) {
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        paymentQueries.create.mockResolvedValue({ id: 333, status: 'confirmed' });

        const result = await processSubscriptionPayment({
          subscriptionId,
          actorUserId: ownerId,
        });

        expect(result.ok).toBe(true);
      });

      it('should reject if user is not subscription owner', async () => {
        const subscriptionId = 111;
        const ownerId = 456;
        const otherUserId = 789;

        const mockSubscription = {
          id: subscriptionId,
          user_id: ownerId,
          shop_id: 999,
          tier: 'basic',
          status: 'pending',
          owner_id: ownerId,
        };

        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          chain: 'CRYSTALPAY',
          crypto_amount: '25.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            return Promise.resolve({ rows: [mockSubscription] });
          }
          if (sql.includes('SELECT owner_id FROM shops WHERE id')) {
            return Promise.resolve({ rows: [{ owner_id: ownerId }] });
          }
          return Promise.resolve({ rows: [] });
        });

        await expect(
          processSubscriptionPayment({
            subscriptionId,
            actorUserId: otherUserId,
          })
        ).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('Edge Cases - Non-CrystalPay Chains', () => {
      it('should reject non-CrystalPay blockchain payments', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;

        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          chain: 'ETHEREUM',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        const result = await processSubscriptionPayment({
          subscriptionId,
          actorUserId,
        });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('UNSUPPORTED_CHAIN');
        expect(result.message).toContain('CrystalPay');
      });
    });

    describe('Edge Cases - Purpose Mismatch', () => {
      it('should reject if mode=upgrade but invoice purpose is not upgrade', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;

        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          purpose: INVOICE_PURPOSES.SUBSCRIPTION,
          chain: 'CRYSTALPAY',
          crypto_amount: '25.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        await expect(
          processSubscriptionPayment({
            subscriptionId,
            actorUserId,
            mode: 'upgrade',
          })
        ).rejects.toThrow(ValidationError);
      });
    });

    describe('Error Handling - Lock Timeout', () => {
      it('should handle lock timeout error gracefully', async () => {
        const subscriptionId = 111;
        const actorUserId = 456;

        const mockInvoice = {
          id: 222,
          subscription_id: subscriptionId,
          status: INVOICE_STATES.PENDING,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          chain: 'CRYSTALPAY',
          crypto_amount: '25.00',
        };

        mockPoolQuery.mockResolvedValue({ rows: [mockInvoice] });

        const lockTimeoutError = new Error('Lock timeout');
        lockTimeoutError.code = '55P03';

        mockClient.query.mockImplementation((sql) => {
          if (sql.includes('SELECT * FROM shop_subscriptions WHERE id')) {
            throw lockTimeoutError;
          }
          return Promise.resolve({ rows: [] });
        });

        await expect(
          processSubscriptionPayment({
            subscriptionId,
            actorUserId,
          })
        ).rejects.toThrow(ValidationError);

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      });
    });
  });
});
