import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NotFoundError, UnauthorizedError, ValidationError, ConflictError } from '../../src/utils/errors.js';

/**
 * Unit tests for Order Controller
 *
 * Tests cover:
 * - generatePaymentUri: BTC, ETH, LTC, USDT_TRC20, unknown
 * - parseStatusFilter: parsing, aliasing, deduplication
 * - getPaymentInfo: happy path, errors
 * - submitPayment: happy path, idempotency, conflicts
 * - getPaymentStatus: buyer/seller access, various states
 * - getById: access control
 *
 * CRITICAL: All database queries and external services are mocked
 */

// Mock dependencies
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../src/config/database.js', () => ({
  getClient: jest.fn().mockResolvedValue(mockClient),
  query: jest.fn(),
}));

jest.unstable_mockModule('../../src/database/queries/index.js', () => ({
  orderQueries: {
    findById: jest.fn(),
    getInvoiceData: jest.fn(),
    setCryptoPayment: jest.fn(),
    updatePaymentHash: jest.fn(),
  },
  shopQueries: {
    findById: jest.fn(),
  },
  paymentQueries: {
    findByTxHash: jest.fn(),
    createForDirectCrypto: jest.fn(),
  },
  workerQueries: {
    findByShopAndUser: jest.fn(),
    getWorkerShops: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/services/telegram.js', () => ({
  default: {
    notifyOrderStatusUpdate: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/services/cryptoPriceService.js', () => ({
  default: {
    getCryptoPrice: jest.fn().mockResolvedValue(50000),
    convertUsdToCrypto: jest.fn().mockReturnValue('0.001'),
    roundCryptoAmount: jest.fn().mockReturnValue('0.001'),
    convertAndRound: jest.fn().mockResolvedValue({
      cryptoAmount: '0.001',
      usdRate: 50000,
    }),
  },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/middleware/errorHandler.js', () => ({
  asyncHandler: (fn) => fn,
  dbErrorHandler: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/orderStateValidator.js', () => ({
  validateStatusTransition: jest.fn(),
}));

jest.unstable_mockModule('../../src/validators/orderValidator.js', () => ({
  validateCartItems: jest.fn(),
  validateProductsForOrder: jest.fn(),
  validateOrderAccess: jest.fn(),
  validateStatusUpdate: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/blockchainVerificationService.js', () => ({
  verifyPayment: jest.fn(),
  VERIFICATION_STATUS: {
    SUCCESS: 'success',
    TX_NOT_FOUND: 'tx_not_found',
    TX_INVALID: 'tx_invalid',
    API_ERROR: 'api_error',
  },
}));

jest.unstable_mockModule('../../src/services/orderService.js', () => ({
  createOrderWithItems: jest.fn(),
  updateOrderStatusWithStockLogic: jest.fn(),
  getOrderAnalytics: jest.fn(),
}));

// Import mocked modules
const { getClient: _getClient } = await import('../../src/config/database.js');
const {
  orderQueries,
  shopQueries,
  paymentQueries,
} = await import('../../src/database/queries/index.js');

const { validateOrderAccess } = await import('../../src/validators/orderValidator.js');

const { verifyPayment } = await import('../../src/services/blockchainVerificationService.js');

const { orderController } = await import('../../src/controllers/orderController.js');

// Helper to create mock req/res
function createMockReqRes(overrides = {}) {
  const req = {
    params: {},
    query: {},
    body: {},
    user: { id: 1 },
    ...overrides,
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return { req, res };
}

describe('Order Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================
  // generatePaymentUri Tests
  // ============================================================
  describe('generatePaymentUri (internal function)', () => {
    // Test via getPaymentInfo which uses generatePaymentUri
    describe('BTC format', () => {
      it('should generate bitcoin: URI with amount', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '50.00',
          wallet_btc: 'bc1qtest123',
          shop_name: 'Test Shop',
        });

        orderQueries.setCryptoPayment.mockResolvedValue({});

        await orderController.getPaymentInfo(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              qrUri: 'bitcoin:bc1qtest123?amount=0.001',
              currency: 'BTC',
            }),
          })
        );
      });
    });

    describe('ETH format', () => {
      it('should generate ethereum: URI with wei value', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'ETH' },
          user: { id: 1 },
        });

        const cryptoPriceService = (await import('../../src/services/cryptoPriceService.js')).default;
        cryptoPriceService.convertAndRound.mockResolvedValue({
          cryptoAmount: 0.5,
          usdRate: 2000,
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '1000.00',
          wallet_eth: '0xTestAddress123',
          shop_name: 'Test Shop',
        });

        orderQueries.setCryptoPayment.mockResolvedValue({});

        await orderController.getPaymentInfo(req, res);

        // 0.5 ETH = 500000000000000000 wei
        const expectedWei = BigInt(Math.floor(0.5 * 1e18));
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              qrUri: `ethereum:0xTestAddress123?value=${expectedWei}`,
              currency: 'ETH',
            }),
          })
        );
      });
    });

    describe('LTC format', () => {
      it('should generate litecoin: URI with amount', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'LTC' },
          user: { id: 1 },
        });

        const cryptoPriceService = (await import('../../src/services/cryptoPriceService.js')).default;
        cryptoPriceService.convertAndRound.mockResolvedValue({
          cryptoAmount: 0.1,
          usdRate: 100,
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '10.00',
          wallet_ltc: 'ltc1qtest456',
          shop_name: 'Test Shop',
        });

        orderQueries.setCryptoPayment.mockResolvedValue({});

        await orderController.getPaymentInfo(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              qrUri: 'litecoin:ltc1qtest456?amount=0.1',
              currency: 'LTC',
            }),
          })
        );
      });
    });

    describe('USDT_TRC20 format', () => {
      it('should return address only for TRC20', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'USDT_TRC20' },
          user: { id: 1 },
        });

        const cryptoPriceService = (await import('../../src/services/cryptoPriceService.js')).default;
        cryptoPriceService.convertAndRound.mockResolvedValue({
          cryptoAmount: 50,
          usdRate: 1,
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '50.00',
          wallet_usdt: 'TTestAddress789',
          shop_name: 'Test Shop',
        });

        orderQueries.setCryptoPayment.mockResolvedValue({});

        await orderController.getPaymentInfo(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              qrUri: 'TTestAddress789',
              currency: 'USDT_TRC20',
            }),
          })
        );
      });
    });
  });

  // ============================================================
  // parseStatusFilter Tests (tested via internal controller logic)
  // ============================================================
  describe('parseStatusFilter (internal function)', () => {
    // Since parseStatusFilter is internal, we test it via getMyOrders behavior
    // We need to test the parsing logic indirectly

    it('should handle null/undefined status param', async () => {
      const { req, res } = createMockReqRes({
        query: { type: 'seller', status: null },
        user: { id: 1 },
      });

      shopQueries.findByOwnerId = jest.fn().mockResolvedValue([{ id: 1 }]);
      orderQueries.findByOwnerId = jest.fn().mockResolvedValue([]);

      await orderController.getMyOrders(req, res);

      // Should pass empty array to findByOwnerId
      expect(orderQueries.findByOwnerId).toHaveBeenCalledWith(1, expect.objectContaining({
        statuses: [],
      }));
    });

    it('should parse comma-separated statuses', async () => {
      const { req, res } = createMockReqRes({
        query: { type: 'seller', status: 'pending,confirmed' },
        user: { id: 1 },
      });

      shopQueries.findByOwnerId = jest.fn().mockResolvedValue([{ id: 1 }]);
      orderQueries.findByOwnerId = jest.fn().mockResolvedValue([]);

      await orderController.getMyOrders(req, res);

      expect(orderQueries.findByOwnerId).toHaveBeenCalledWith(1, expect.objectContaining({
        statuses: expect.arrayContaining(['pending', 'confirmed']),
      }));
    });

    it('should map "completed" alias to "delivered"', async () => {
      const { req, res } = createMockReqRes({
        query: { type: 'seller', status: 'completed' },
        user: { id: 1 },
      });

      shopQueries.findByOwnerId = jest.fn().mockResolvedValue([{ id: 1 }]);
      orderQueries.findByOwnerId = jest.fn().mockResolvedValue([]);

      await orderController.getMyOrders(req, res);

      expect(orderQueries.findByOwnerId).toHaveBeenCalledWith(1, expect.objectContaining({
        statuses: ['delivered'],
      }));
    });

    it('should filter out invalid statuses', async () => {
      const { req, res } = createMockReqRes({
        query: { type: 'seller', status: 'invalid,pending' },
        user: { id: 1 },
      });

      shopQueries.findByOwnerId = jest.fn().mockResolvedValue([{ id: 1 }]);
      orderQueries.findByOwnerId = jest.fn().mockResolvedValue([]);

      await orderController.getMyOrders(req, res);

      expect(orderQueries.findByOwnerId).toHaveBeenCalledWith(1, expect.objectContaining({
        statuses: ['pending'],
      }));
    });

    it('should deduplicate statuses', async () => {
      const { req, res } = createMockReqRes({
        query: { type: 'seller', status: 'pending,pending,confirmed' },
        user: { id: 1 },
      });

      shopQueries.findByOwnerId = jest.fn().mockResolvedValue([{ id: 1 }]);
      orderQueries.findByOwnerId = jest.fn().mockResolvedValue([]);

      await orderController.getMyOrders(req, res);

      const call = orderQueries.findByOwnerId.mock.calls[0];
      const statuses = call[1].statuses;
      expect(statuses.length).toBe(2);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('confirmed');
    });
  });

  // ============================================================
  // getPaymentInfo Tests
  // ============================================================
  describe('getPaymentInfo', () => {
    describe('Happy Path', () => {
      it('should return payment info with QR URI and converted crypto amount', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'BTC' },
          user: { id: 1 },
        });

        const cryptoPriceService = (await import('../../src/services/cryptoPriceService.js')).default;
        cryptoPriceService.convertAndRound.mockResolvedValue({
          cryptoAmount: 0.002,
          usdRate: 50000,
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '100.00',
          wallet_btc: 'bc1qwallet',
          shop_name: 'My Shop',
          shop_id: 1,
        });

        orderQueries.setCryptoPayment.mockResolvedValue({});

        await orderController.getPaymentInfo(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            orderId: 123,
            currency: 'BTC',
            address: 'bc1qwallet',
            amount: 0.002,
            amountUsd: 100,
            usdRate: 50000,
            qrUri: 'bitcoin:bc1qwallet?amount=0.002',
            shopName: 'My Shop',
            expiresIn: 3600,
            minConfirmations: 3,
          },
        });
      });
    });

    describe('Error Cases', () => {
      it('should throw ValidationError for invalid currency', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'DOGE' },
          user: { id: 1 },
        });

        await expect(orderController.getPaymentInfo(req, res)).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for missing currency', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: {},
          user: { id: 1 },
        });

        await expect(orderController.getPaymentInfo(req, res)).rejects.toThrow(ValidationError);
      });

      it('should throw NotFoundError for non-existent order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '999' },
          query: { currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.getInvoiceData.mockResolvedValue(null);

        await expect(orderController.getPaymentInfo(req, res)).rejects.toThrow(NotFoundError);
      });

      it('should throw UnauthorizedError if not buyer', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'BTC' },
          user: { id: 999 },
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '100.00',
          wallet_btc: 'bc1qwallet',
        });

        await expect(orderController.getPaymentInfo(req, res)).rejects.toThrow(UnauthorizedError);
      });

      it('should throw ValidationError for non-pending order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'confirmed',
          total_price: '100.00',
          wallet_btc: 'bc1qwallet',
        });

        await expect(orderController.getPaymentInfo(req, res)).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError if seller wallet not configured', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          query: { currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.getInvoiceData.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '100.00',
          wallet_btc: null,
          wallet_eth: '0xTest',
        });

        await expect(orderController.getPaymentInfo(req, res)).rejects.toThrow(ValidationError);
      });
    });
  });

  // ============================================================
  // submitPayment Tests
  // ============================================================
  // Valid tx_hash lengths:
  // BTC: 64 hex chars (32 bytes)
  // ETH: 66 hex chars (0x + 32 bytes)
  // LTC: 64 hex chars
  // USDT_TRC20: 64 hex chars
  const VALID_BTC_TX_HASH = 'a'.repeat(64);  // 64 hex chars for BTC
  const VALID_ETH_TX_HASH = '0x' + 'b'.repeat(64);  // 66 chars (0x + 64)

  describe('submitPayment', () => {
    describe('Happy Path', () => {
      it('should create payment record and return paymentId', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: VALID_BTC_TX_HASH, currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '100.00',
          crypto_amount: 0.002,
          updated_at: new Date(), // Fresh invoice
        });

        paymentQueries.findByTxHash.mockResolvedValue(null);

        orderQueries.getInvoiceData.mockResolvedValue({
          wallet_btc: 'bc1qwallet',
        });

        verifyPayment.mockResolvedValue({
          resultStatus: 'success',
          verified: false,
          confirmations: 0,
          amount: 0.002,
        });

        paymentQueries.createForDirectCrypto.mockResolvedValue({
          id: 456,
          order_id: 123,
          tx_hash: VALID_BTC_TX_HASH,
        });

        orderQueries.updatePaymentHash.mockResolvedValue({});

        await orderController.submitPayment(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            paymentId: 456,
            status: 'pending_confirmations',
            confirmations: 0,
            required: 3,
            message: 'Payment verified. Waiting for 3 confirmations.',
          },
        });
      });
    });

    describe('Edge Cases', () => {
      it('should return already_confirmed for confirmed order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: VALID_BTC_TX_HASH, currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'confirmed',
        });

        await orderController.submitPayment(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            status: 'already_confirmed',
            orderId: 123,
          },
        });
      });

      it('should be idempotent for duplicate tx_hash same order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: VALID_BTC_TX_HASH, currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          total_price: '100.00',
          crypto_amount: 0.002,
          updated_at: new Date(), // Fresh invoice
        });

        const existingPayment = {
          id: 456,
          order_id: 123,
          tx_hash: VALID_BTC_TX_HASH,
        };

        paymentQueries.findByTxHash.mockResolvedValue(existingPayment);

        orderQueries.getInvoiceData.mockResolvedValue({
          wallet_btc: 'bc1qwallet',
        });

        verifyPayment.mockResolvedValue({
          resultStatus: 'success',
          verified: false,
          confirmations: 1,
          amount: 0.002,
        });

        orderQueries.updatePaymentHash.mockResolvedValue({});

        await orderController.submitPayment(req, res);

        // Should not create new payment
        expect(paymentQueries.createForDirectCrypto).not.toHaveBeenCalled();

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            paymentId: 456,
            status: 'pending_confirmations',
            confirmations: 1,
            required: 3,
            message: 'Payment verified. Waiting for 3 confirmations.',
          },
        });
      });

      it('should throw ConflictError for duplicate tx_hash different order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: VALID_BTC_TX_HASH, currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
          crypto_amount: 0.002,
          updated_at: new Date(), // Fresh invoice
        });

        paymentQueries.findByTxHash.mockResolvedValue({
          id: 456,
          order_id: 999, // Different order!
          tx_hash: VALID_BTC_TX_HASH,
        });

        // ConflictError is thrown BEFORE verifyPayment is called
        // because findByTxHash returns payment with different order_id

        await expect(orderController.submitPayment(req, res)).rejects.toThrow(ConflictError);
      });
    });

    describe('Error Cases', () => {
      it('should throw ValidationError for invalid tx_hash', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: 'short', currency: 'BTC' },
          user: { id: 1 },
        });

        await expect(orderController.submitPayment(req, res)).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for missing tx_hash', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { currency: 'BTC' },
          user: { id: 1 },
        });

        await expect(orderController.submitPayment(req, res)).rejects.toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid currency', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: 'abc123def456', currency: 'DOGE' },
          user: { id: 1 },
        });

        await expect(orderController.submitPayment(req, res)).rejects.toThrow(ValidationError);
      });

      it('should throw NotFoundError for non-existent order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '999' },
          body: { tx_hash: VALID_BTC_TX_HASH, currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.findById.mockResolvedValue(null);

        await expect(orderController.submitPayment(req, res)).rejects.toThrow(NotFoundError);
      });

      it('should throw UnauthorizedError if not buyer', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: VALID_BTC_TX_HASH, currency: 'BTC' },
          user: { id: 999 },
        });

        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'pending',
        });

        await expect(orderController.submitPayment(req, res)).rejects.toThrow(UnauthorizedError);
      });

      it('should throw ValidationError for cancelled order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          body: { tx_hash: VALID_BTC_TX_HASH, currency: 'BTC' },
          user: { id: 1 },
        });

        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          status: 'cancelled',
        });

        await expect(orderController.submitPayment(req, res)).rejects.toThrow(ValidationError);
      });
    });
  });

  // ============================================================
  // getPaymentStatus Tests
  // ============================================================
  describe('getPaymentStatus', () => {
    describe('Access Control', () => {
      it('should allow buyer to access payment status', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          user: { id: 1 },
        });

        // findById now returns owner_id via JOIN with shops table
        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          owner_id: 2, // Seller - from shops JOIN
          status: 'pending',
          payment_hash: null,
        });

        await orderController.getPaymentStatus(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            status: 'awaiting_payment',
            orderId: 123,
          },
        });
      });

      it('should allow seller to access payment status', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          user: { id: 2 },
        });

        // findById now returns owner_id via JOIN with shops table
        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          owner_id: 2, // Seller - from shops JOIN
          status: 'pending',
          payment_hash: null,
        });

        await orderController.getPaymentStatus(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            status: 'awaiting_payment',
            orderId: 123,
          },
        });
      });

      it('should throw UnauthorizedError for unauthorized user', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          user: { id: 999 },
        });

        // findById now returns owner_id via JOIN with shops table
        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          owner_id: 2, // Seller - from shops JOIN
          status: 'pending',
        });

        await expect(orderController.getPaymentStatus(req, res)).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('Status States', () => {
      it('should return awaiting_payment when no payment_hash', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          user: { id: 1 },
        });

        // findById now returns owner_id via JOIN with shops table
        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          owner_id: 2, // Seller - from shops JOIN
          status: 'pending',
          payment_hash: null,
        });

        await orderController.getPaymentStatus(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            status: 'awaiting_payment',
            orderId: 123,
          },
        });
      });

      it('should return confirmed for confirmed order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          user: { id: 1 },
        });

        // findById now returns owner_id via JOIN with shops table
        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          owner_id: 2, // Seller - from shops JOIN
          status: 'confirmed',
        });

        await orderController.getPaymentStatus(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            status: 'confirmed',
            orderId: 123,
          },
        });
      });

      it('should return pending payment status with confirmations', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '123' },
          user: { id: 1 },
        });

        // findById now returns owner_id via JOIN with shops table
        orderQueries.findById.mockResolvedValue({
          id: 123,
          buyer_id: 1,
          owner_id: 2, // Seller - from shops JOIN
          status: 'pending',
          payment_hash: 'tx123',
        });

        paymentQueries.findByTxHash.mockResolvedValue({
          verification_status: 'pending',
          blockchain_confirmations: 2,
          currency: 'BTC',
          verification_error: null,
        });

        await orderController.getPaymentStatus(req, res);

        expect(res.json).toHaveBeenCalledWith({
          success: true,
          data: {
            status: 'pending',
            confirmations: 2,
            required: 3,
            orderId: 123,
            error: null,
          },
        });
      });
    });

    describe('Error Cases', () => {
      it('should throw NotFoundError for non-existent order', async () => {
        const { req, res } = createMockReqRes({
          params: { id: '999' },
          user: { id: 1 },
        });

        orderQueries.findById.mockResolvedValue(null);

        await expect(orderController.getPaymentStatus(req, res)).rejects.toThrow(NotFoundError);
      });
    });
  });

  // ============================================================
  // getById Tests
  // ============================================================
  describe('getById', () => {
    it('should return order for buyer', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        user: { id: 1 },
      });

      const mockOrder = {
        id: 123,
        buyer_id: 1,
        status: 'pending',
        product_name: 'Test Product',
      };

      orderQueries.findById.mockResolvedValue(mockOrder);
      validateOrderAccess.mockImplementation(() => {});

      await orderController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockOrder,
      });
    });

    it('should return order for seller', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        user: { id: 2 },
      });

      const mockOrder = {
        id: 123,
        buyer_id: 1,
        owner_id: 2,
        status: 'pending',
        product_name: 'Test Product',
      };

      orderQueries.findById.mockResolvedValue(mockOrder);
      validateOrderAccess.mockImplementation(() => {});

      await orderController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockOrder,
      });
    });

    it('should throw NotFoundError for non-existent order', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '999' },
        user: { id: 1 },
      });

      orderQueries.findById.mockResolvedValue(null);

      await expect(orderController.getById(req, res)).rejects.toThrow(NotFoundError);
    });

    it('should throw UnauthorizedError for unauthorized access', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        user: { id: 999 },
      });

      const mockOrder = {
        id: 123,
        buyer_id: 1,
        owner_id: 2,
        status: 'pending',
      };

      orderQueries.findById.mockResolvedValue(mockOrder);
      validateOrderAccess.mockImplementation(() => {
        throw new UnauthorizedError('Access denied');
      });

      await expect(orderController.getById(req, res)).rejects.toThrow(UnauthorizedError);
    });
  });
});
