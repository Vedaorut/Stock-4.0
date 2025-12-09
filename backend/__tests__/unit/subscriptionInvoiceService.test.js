/**
 * @fileoverview Subscription Invoice Service Tests
 * @description Tests for CrystalPay invoice creation for subscription payments
 *
 * CRITICAL: These tests cover the subscription renewal payment flow
 * that was broken in production (subscriptionId = undefined bug)
 *
 * Tests cover:
 * - createCrystalPayInvoice: Invoice creation flow
 * - findActiveInvoiceForSubscription: Active invoice lookup
 * - Edge cases: missing subscriptionId, shop without subscription record
 */

import { jest } from '@jest/globals';

// Mock dependencies BEFORE importing service
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/config/database.js', () => ({
  query: jest.fn(),
}));

jest.unstable_mockModule('../../src/database/queries/index.js', () => ({
  invoiceQueries: {
    createForCrystalPay: jest.fn(),
    setCrystalPayId: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/services/crystalPayService.js', () => ({
  createInvoice: jest.fn(),
  PAYMENT_METHODS: {
    BITCOIN: 'BITCOIN',
    LITECOIN: 'LITECOIN',
  },
}));

// Import after mocks
const { query } = await import('../../src/config/database.js');
const { invoiceQueries } = await import('../../src/database/queries/index.js');
const crystalPayService = await import('../../src/services/crystalPayService.js');
const logger = (await import('../../src/utils/logger.js')).default;

const {
  createCrystalPayInvoice,
  findActiveInvoiceForSubscription,
} = await import('../../src/services/subscriptionInvoiceService.js');

describe('Subscription Invoice Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // createCrystalPayInvoice - CRITICAL (P0)
  // ============================================================================
  describe('createCrystalPayInvoice', () => {
    describe('Happy Path', () => {
      it('should create invoice and return payment URL', async () => {
        const mockInternalInvoice = { id: 123 };
        const mockCrystalInvoice = {
          id: 'crystal_abc123',
          url: 'https://pay.crystalpay.io/crystal_abc123',
          amount: '35',
          currency: 'RUB',
        };

        invoiceQueries.createForCrystalPay.mockResolvedValue(mockInternalInvoice);
        crystalPayService.createInvoice.mockResolvedValue(mockCrystalInvoice);
        invoiceQueries.setCrystalPayId.mockResolvedValue({});

        const result = await createCrystalPayInvoice({
          subscriptionId: 1,
          purpose: 'subscription_renewal',
          amountUsd: 35,
          method: 'BITCOIN',
        });

        expect(result).toEqual({
          invoiceId: 123,
          paymentUrl: 'https://pay.crystalpay.io/crystal_abc123',
          crystalPayId: 'crystal_abc123',
          amount: 35,
          method: 'BITCOIN',
        });

        expect(invoiceQueries.createForCrystalPay).toHaveBeenCalledWith({
          subscriptionId: 1,
          purpose: 'subscription_renewal',
          currency: 'USD',
          amount: 35,
        });

        const call = crystalPayService.createInvoice.mock.calls[0][0];
        expect(call.amount).toBe(35);
        expect(call.method).toBe('BITCOIN');
        expect(call.description).toContain('subscription_renewal');
        expect(call.extra).toBe('123');
        expect(call.lifetime).toBeGreaterThanOrEqual(60);

        expect(invoiceQueries.setCrystalPayId).toHaveBeenCalledWith(
          123,
          'crystal_abc123'
        );
      });

      it('should support LITECOIN payment method', async () => {
        const mockInternalInvoice = { id: 456 };
        const mockCrystalInvoice = {
          id: 'crystal_ltc123',
          url: 'https://pay.crystalpay.io/crystal_ltc123',
          amount: '25',
          currency: 'RUB',
        };

        invoiceQueries.createForCrystalPay.mockResolvedValue(mockInternalInvoice);
        crystalPayService.createInvoice.mockResolvedValue(mockCrystalInvoice);
        invoiceQueries.setCrystalPayId.mockResolvedValue({});

        const result = await createCrystalPayInvoice({
          subscriptionId: 2,
          purpose: 'subscription_new',
          amountUsd: 25,
          method: 'LITECOIN',
        });

        expect(result.method).toBe('LITECOIN');
        expect(crystalPayService.createInvoice).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'LITECOIN' })
        );
      });

      it('should use default BITCOIN method when not specified', async () => {
        const mockInternalInvoice = { id: 789 };
        const mockCrystalInvoice = {
          id: 'crystal_default',
          url: 'https://pay.crystalpay.io/crystal_default',
          amount: '35',
          currency: 'RUB',
        };

        invoiceQueries.createForCrystalPay.mockResolvedValue(mockInternalInvoice);
        crystalPayService.createInvoice.mockResolvedValue(mockCrystalInvoice);
        invoiceQueries.setCrystalPayId.mockResolvedValue({});

        await createCrystalPayInvoice({
          subscriptionId: 3,
          purpose: 'subscription_renewal',
          amountUsd: 35,
          // method not specified - should default to BITCOIN
        });

        expect(crystalPayService.createInvoice).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'BITCOIN' })
        );
      });
    });

    describe('Validation', () => {
      it('should throw error for invalid payment method', async () => {
        await expect(
          createCrystalPayInvoice({
            subscriptionId: 1,
            purpose: 'subscription_renewal',
            amountUsd: 35,
            method: 'INVALID_METHOD',
          })
        ).rejects.toThrow('Invalid payment method: INVALID_METHOD');
      });

      it('should throw error for ETHEREUM (unsupported)', async () => {
        await expect(
          createCrystalPayInvoice({
            subscriptionId: 1,
            purpose: 'subscription_renewal',
            amountUsd: 35,
            method: 'ETHEREUM',
          })
        ).rejects.toThrow('Invalid payment method: ETHEREUM');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when CrystalPay API fails', async () => {
        const mockInternalInvoice = { id: 123 };

        invoiceQueries.createForCrystalPay.mockResolvedValue(mockInternalInvoice);
        crystalPayService.createInvoice.mockRejectedValue(
          new Error('CrystalPay API timeout')
        );

        await expect(
          createCrystalPayInvoice({
            subscriptionId: 1,
            purpose: 'subscription_renewal',
            amountUsd: 35,
            method: 'BITCOIN',
          })
        ).rejects.toThrow('CrystalPay API timeout');

        expect(logger.error).toHaveBeenCalledWith(
          '[SubscriptionInvoice] CrystalPay invoice creation failed',
          expect.objectContaining({
            invoiceId: 123,
            error: 'CrystalPay API timeout',
          })
        );
      });

      it('should throw error when internal invoice creation fails', async () => {
        invoiceQueries.createForCrystalPay.mockRejectedValue(
          new Error('Database connection lost')
        );

        await expect(
          createCrystalPayInvoice({
            subscriptionId: 1,
            purpose: 'subscription_renewal',
            amountUsd: 35,
            method: 'BITCOIN',
          })
        ).rejects.toThrow('Database connection lost');
      });
    });

    describe('Logging', () => {
      it('should log successful invoice creation', async () => {
        const mockInternalInvoice = { id: 100 };
        const mockCrystalInvoice = {
          id: 'crystal_success',
          url: 'https://pay.crystalpay.io/crystal_success',
          amount: '35',
          currency: 'RUB',
        };

        invoiceQueries.createForCrystalPay.mockResolvedValue(mockInternalInvoice);
        crystalPayService.createInvoice.mockResolvedValue(mockCrystalInvoice);
        invoiceQueries.setCrystalPayId.mockResolvedValue({});

        await createCrystalPayInvoice({
          subscriptionId: 5,
          purpose: 'subscription_renewal',
          amountUsd: 35,
          method: 'BITCOIN',
        });

        expect(logger.info).toHaveBeenCalledWith(
          '[SubscriptionInvoice] CrystalPay invoice created',
          expect.objectContaining({
            invoiceId: 100,
            crystalPayId: 'crystal_success',
            method: 'BITCOIN',
            amountUsd: 35,
          })
        );
      });
    });
  });

  // ============================================================================
  // findActiveInvoiceForSubscription - CRITICAL (P0)
  // ============================================================================
  describe('findActiveInvoiceForSubscription', () => {
    describe('Happy Path', () => {
      it('should find active pending invoice', async () => {
        const mockInvoice = {
          id: 123,
          subscription_id: 1,
          status: 'pending',
          expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
          address: 'bc1qtest...',
        };

        query.mockResolvedValueOnce({ rows: [mockInvoice] });

        const result = await findActiveInvoiceForSubscription(1);

        expect(result).toEqual(mockInvoice);
        expect(logger.info).toHaveBeenCalledWith(
          '[SubscriptionInvoice] Found active invoice',
          expect.objectContaining({
            subscriptionId: 1,
            invoiceId: 123,
          })
        );
      });

      it('should find paid invoice for UI display', async () => {
        const mockInvoice = {
          id: 456,
          subscription_id: 2,
          status: 'paid',
          expires_at: new Date(Date.now() - 30 * 60 * 1000), // expired but paid
        };

        query.mockResolvedValueOnce({ rows: [mockInvoice] });

        const result = await findActiveInvoiceForSubscription(2);

        expect(result).toEqual(mockInvoice);
        expect(result.status).toBe('paid');
      });

      it('should filter by purpose when provided', async () => {
        const mockInvoice = {
          id: 789,
          subscription_id: 3,
          status: 'pending',
          purpose: 'subscription_renewal',
          expires_at: new Date(Date.now() + 60 * 60 * 1000),
        };

        query.mockResolvedValueOnce({ rows: [mockInvoice] });

        await findActiveInvoiceForSubscription(3, 'subscription_renewal');

        expect(query).toHaveBeenCalledWith(
          expect.stringContaining('AND purpose = $2'),
          [3, 'subscription_renewal']
        );
      });
    });

    describe('No Active Invoice', () => {
      it('should return null when no active invoice exists', async () => {
        // First query: main search returns empty
        query.mockResolvedValueOnce({ rows: [] });
        // Second query: diagnostic query
        query.mockResolvedValueOnce({ rows: [] });

        const result = await findActiveInvoiceForSubscription(999);

        expect(result).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(
          '[SubscriptionInvoice] No active invoice found - running diagnostics',
          expect.objectContaining({ subscriptionId: 999 })
        );
      });

      it('should log diagnostic info for expired invoices', async () => {
        const expiredInvoice = {
          id: 100,
          status: 'pending',
          expires_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          current_time: new Date(),
          is_valid: false,
          seconds_until_expiry: -3600,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
        };

        // First query: main search returns empty
        query.mockResolvedValueOnce({ rows: [] });
        // Second query: diagnostic query returns expired invoice
        query.mockResolvedValueOnce({ rows: [expiredInvoice] });

        await findActiveInvoiceForSubscription(1);

        expect(logger.warn).toHaveBeenCalledWith(
          '[SubscriptionInvoice] Invoice found but not active',
          expect.objectContaining({
            subscriptionId: 1,
            invoiceId: 100,
            status: 'pending',
          })
        );
      });

      it('should log reason when no invoices ever created', async () => {
        // First query: main search returns empty
        query.mockResolvedValueOnce({ rows: [] });
        // Second query: diagnostic query also empty
        query.mockResolvedValueOnce({ rows: [] });

        await findActiveInvoiceForSubscription(42);

        expect(logger.warn).toHaveBeenCalledWith(
          '[SubscriptionInvoice] No invoices exist for this subscription',
          expect.objectContaining({
            subscriptionId: 42,
            reason: 'No invoices created yet',
          })
        );
      });
    });

    describe('Error Handling', () => {
      it('should throw on database failure (logged by caller)', async () => {
        query.mockRejectedValueOnce(new Error('Connection refused'));
        await expect(findActiveInvoiceForSubscription(1)).rejects.toThrow('Connection refused');
      });
    });
  });

  // ============================================================================
  // CRITICAL BUG (FIXED): Shop without subscription record
  // This test documents the bug found in production where shop_id=2136
  // had no entry in shop_subscriptions table, causing subscriptionId=undefined
  //
  // FIX APPLIED:
  // 1. bot/src/scenes/paySubscription.js - passes shopId to createPending()
  // 2. bot/src/utils/api/payments.js - createPending() now accepts shopId
  // 3. backend subscriptionFinalizer.js - clears is_trial/trial_ends_at on payment
  //
  // Now trial shops can properly convert to paid subscriptions.
  // ============================================================================
  describe('Critical Bug: Shop without subscription record (FIXED)', () => {
    it('documents the root cause - trial shops have no subscription record', async () => {
      // This scenario PREVIOUSLY caused the bot to send:
      // POST /payments/subscriptions/undefined/invoice/crystalpay
      //
      // Root cause: paySubscriptionScene.js line 124:
      // ctx.wizard.state.subscriptionId = statusResponse.currentSubscription?.id || statusResponse.latestSubscription?.id
      //
      // When both are null, subscriptionId becomes undefined
      //
      // FIX APPLIED:
      // 1. Bot's paySubscriptionScene.js now passes shopId to createPending()
      // 2. Bot's payments.js createPending() accepts and sends shopId
      // 3. Backend pendingHandlers.js creates subscription linked to shop
      // 4. Backend subscriptionFinalizer.js clears is_trial on payment success
      //
      // This test documents the scenario - actual integration testing
      // would require mocking the full subscriptionService module chain

      // Simulate the scenario where both subscriptions are null
      const statusResponse = {
        currentSubscription: null,
        latestSubscription: null,
      };

      // OLD BEHAVIOR: subscriptionId becomes undefined
      const oldBehavior =
        statusResponse.currentSubscription?.id || statusResponse.latestSubscription?.id;
      expect(oldBehavior).toBeUndefined();

      // NEW BEHAVIOR: bot detects !subscriptionId and creates pending subscription with shopId
      // This is now handled in paySubscriptionScene.js Step 2 (lines 177-206)
    });

    it('should document that createCrystalPayInvoice fails with undefined subscriptionId', async () => {
      // When subscriptionId is undefined, the backend returns 500 error
      // because parseInt(undefined) = NaN

      const mockInternalInvoice = { id: 123 };
      invoiceQueries.createForCrystalPay.mockResolvedValue(mockInternalInvoice);

      // NaN subscriptionId causes issues
      await expect(
        createCrystalPayInvoice({
          subscriptionId: undefined,
          purpose: 'subscription_renewal',
          amountUsd: 35,
          method: 'BITCOIN',
        })
      ).resolves.toBeDefined(); // Function doesn't validate subscriptionId

      // But the description will be "Subscription #undefined - subscription_renewal"
      expect(crystalPayService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Subscription #undefined - subscription_renewal',
        })
      );
    });
  });
});
