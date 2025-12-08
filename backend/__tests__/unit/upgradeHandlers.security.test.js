import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Security tests for upgradeHandlers - IDOR vulnerability fix
 *
 * Tests cover:
 * - confirmUpgradePaymentWithTxHash: ownership verification before payment processing
 * - IDOR attack prevention: user cannot confirm payment for another user's subscription
 *
 * CRITICAL: All database queries and external services are mocked
 */

// Mock dependencies BEFORE imports
jest.unstable_mockModule('../../src/controllers/subscription/utils/ownership.js', () => ({
  verifyShopOwnership: jest.fn(),
  verifySubscriptionOwnership: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/subscriptionInvoiceService.js', () => ({
  findActiveInvoiceForSubscription: jest.fn(),
  INVOICE_PURPOSES: {
    SUBSCRIPTION: 'subscription',
    UPGRADE: 'upgrade',
    RENEWAL: 'renewal',
  },
}));

jest.unstable_mockModule('../../src/services/invoicePaymentService.js', () => ({
  default: {
    processSubscriptionPayment: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/middleware/errorHandler.js', () => ({
  asyncHandler: (fn) => fn,
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/services/subscriptionService.js', () => ({
  calculateUpgradeCost: jest.fn(),
}));

jest.unstable_mockModule('../../src/controllers/subscription/validators/payloadValidators.js', () => ({
  ensurePaymentProof: jest.fn((body) => ({
    txHash: body.txHash || 'mock_tx_hash',
    paymentLink: body.paymentLink || null,
  })),
}));

// Import mocked modules AFTER mocking
const { verifySubscriptionOwnership } = await import(
  '../../src/controllers/subscription/utils/ownership.js'
);
const subscriptionInvoiceService = await import('../../src/services/subscriptionInvoiceService.js');
const invoicePaymentService = (await import('../../src/services/invoicePaymentService.js')).default;
const { confirmUpgradePaymentWithTxHash } = await import(
  '../../src/controllers/subscription/handlers/upgradeHandlers.js'
);

/**
 * Helper to create mock Express req/res objects
 */
function createMockReqRes(overrides = {}) {
  const req = {
    params: { id: '123' },
    body: { txHash: 'valid_tx_hash_123' },
    user: { id: 1 },
    ...overrides,
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return { req, res };
}

describe('confirmUpgradePaymentWithTxHash - Security (IDOR Fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Ownership Verification', () => {
    it('should reject request from non-owner with 403', async () => {
      // Arrange: User 2 tries to confirm payment for subscription owned by User 1
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        body: { txHash: 'attacker_tx_hash' },
        user: { id: 2 }, // Attacker (NOT owner)
      });

      // Mock ownership check to FAIL (user is not owner)
      verifySubscriptionOwnership.mockResolvedValue({
        success: false,
        status: 403,
        error: 'Not authorized to access this subscription',
      });

      // Act
      await confirmUpgradePaymentWithTxHash(req, res);

      // Assert: Should return 403 Forbidden
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not authorized to access this subscription',
      });

      // CRITICAL: Payment service should NOT be called
      expect(invoicePaymentService.processSubscriptionPayment).not.toHaveBeenCalled();
      expect(subscriptionInvoiceService.findActiveInvoiceForSubscription).not.toHaveBeenCalled();
    });

    it('should reject request for non-existent subscription with 404', async () => {
      // Arrange: Subscription doesn't exist
      const { req, res } = createMockReqRes({
        params: { id: '999' },
        body: { txHash: 'some_tx_hash' },
        user: { id: 1 },
      });

      verifySubscriptionOwnership.mockResolvedValue({
        success: false,
        status: 404,
        error: 'Subscription not found',
      });

      // Act
      await confirmUpgradePaymentWithTxHash(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Subscription not found',
      });
      expect(invoicePaymentService.processSubscriptionPayment).not.toHaveBeenCalled();
    });

    it('should allow request from authorized owner (happy path)', async () => {
      // Arrange: Owner (User 1) confirms their own subscription
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        body: { txHash: 'owner_tx_hash' },
        user: { id: 1 }, // Owner
      });

      // Mock ownership check to PASS
      verifySubscriptionOwnership.mockResolvedValue({
        success: true,
        subscription: { id: 123, user_id: 1, shop_id: 10 },
      });

      // Mock active invoice found
      const mockInvoice = {
        id: 456,
        subscription_id: 123,
        status: 'pending',
        purpose: 'upgrade',
      };
      subscriptionInvoiceService.findActiveInvoiceForSubscription.mockResolvedValue(mockInvoice);

      // Mock successful payment processing
      invoicePaymentService.processSubscriptionPayment.mockResolvedValue({
        ok: true,
        state: 'confirmed',
        payment: { id: 789 },
      });

      // Act
      await confirmUpgradePaymentWithTxHash(req, res);

      // Assert: Should process payment successfully
      expect(verifySubscriptionOwnership).toHaveBeenCalledWith(123, 1);
      expect(subscriptionInvoiceService.findActiveInvoiceForSubscription).toHaveBeenCalledWith(
        123,
        subscriptionInvoiceService.INVOICE_PURPOSES.UPGRADE
      );
      expect(invoicePaymentService.processSubscriptionPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: 123,
          actorUserId: 1,
          mode: 'upgrade',
          invoiceId: 456,
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          state: 'confirmed',
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle internal server error from ownership check', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        user: { id: 1 },
      });

      verifySubscriptionOwnership.mockResolvedValue({
        success: false,
        status: 500,
        error: 'Internal server error',
      });

      await confirmUpgradePaymentWithTxHash(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
      expect(invoicePaymentService.processSubscriptionPayment).not.toHaveBeenCalled();
    });

    it('should return 404 when no active upgrade invoice found', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        user: { id: 1 },
      });

      verifySubscriptionOwnership.mockResolvedValue({ success: true });
      subscriptionInvoiceService.findActiveInvoiceForSubscription.mockResolvedValue(null);

      await confirmUpgradePaymentWithTxHash(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No active upgrade invoice found for this subscription',
        subscriptionId: 123,
      });
    });

    it('should handle payment processing failure', async () => {
      const { req, res } = createMockReqRes({
        params: { id: '123' },
        user: { id: 1 },
      });

      verifySubscriptionOwnership.mockResolvedValue({ success: true });
      subscriptionInvoiceService.findActiveInvoiceForSubscription.mockResolvedValue({
        id: 456,
        status: 'pending',
      });
      invoicePaymentService.processSubscriptionPayment.mockResolvedValue({
        ok: false,
        message: 'Payment not verified',
        code: 'PAYMENT_NOT_VERIFIED',
        state: 'pending',
      });

      await confirmUpgradePaymentWithTxHash(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment not verified',
        code: 'PAYMENT_NOT_VERIFIED',
        state: 'pending',
      });
    });
  });

  describe('IDOR Attack Scenarios', () => {
    it('should prevent attacker from confirming victim subscription by ID', async () => {
      // Scenario: Attacker knows victim's subscription ID and tries to confirm it
      const attackerUserId = 999;
      const victimSubscriptionId = 123;

      const { req, res } = createMockReqRes({
        params: { id: String(victimSubscriptionId) },
        body: { txHash: 'attacker_fake_tx' },
        user: { id: attackerUserId },
      });

      // Ownership check correctly rejects
      verifySubscriptionOwnership.mockResolvedValue({
        success: false,
        status: 403,
        error: 'Not authorized to access this subscription',
      });

      await confirmUpgradePaymentWithTxHash(req, res);

      // Attack prevented
      expect(res.status).toHaveBeenCalledWith(403);
      expect(invoicePaymentService.processSubscriptionPayment).not.toHaveBeenCalled();
    });

    it('should verify ownership is called with correct parameters', async () => {
      const userId = 42;
      const subscriptionId = 777;

      const { req, res } = createMockReqRes({
        params: { id: String(subscriptionId) },
        user: { id: userId },
      });

      verifySubscriptionOwnership.mockResolvedValue({
        success: false,
        status: 403,
        error: 'Not authorized',
      });

      await confirmUpgradePaymentWithTxHash(req, res);

      // Verify correct params passed to ownership check
      expect(verifySubscriptionOwnership).toHaveBeenCalledWith(subscriptionId, userId);
      expect(verifySubscriptionOwnership).toHaveBeenCalledTimes(1);
    });
  });
});
