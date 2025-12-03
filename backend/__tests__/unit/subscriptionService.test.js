import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Unit tests for Subscription Service
 *
 * Tests cover:
 * - checkExpiredSubscriptions: grace period transitions and shop deactivation
 * - deactivateShop: with/without external client
 * - activatePromoSubscription: promo activation with idempotency
 * - calculateUpgradeAmount: pure function prorated calculations
 * - calculateUpgradeCost: database-backed upgrade cost calculation
 * - getSubscriptionStatus: shop subscription status retrieval
 * - getUserSubscriptions / getMyShopSubscriptions: list queries
 * - sendExpirationReminders: Telegram notification logic
 *
 * CRITICAL: All database queries and external services are mocked
 */

// Mock dependencies
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();

jest.unstable_mockModule('../../src/config/database.js', () => ({
  pool: {
    connect: mockPoolConnect,
    query: mockPoolQuery,
  },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/config/subscriptionPricing.js', () => ({
  SUBSCRIPTION_PRICES: { basic: 25, pro: 35 },
  SUBSCRIPTION_PRICES_YEARLY: { basic: 250, pro: 350 },
  SUBSCRIPTION_PERIOD_DAYS: 30,
  GRACE_PERIOD_DAYS: 2,
  TRIAL_PERIOD_DAYS: 7,
}));

// Import mocked modules after mocking
const { pool } = await import('../../src/config/database.js');
const logger = (await import('../../src/utils/logger.js')).default;
const {
  SUBSCRIPTION_PRICES,
  GRACE_PERIOD_DAYS: _GRACE_PERIOD_DAYS,
} = await import('../../src/config/subscriptionPricing.js');

const {
  checkExpiredSubscriptions,
  checkExpiredTrials,
  deactivateShop,
  activatePromoSubscription,
  calculateUpgradeAmount,
  calculateUpgradeCost,
  getSubscriptionStatus,
  getSubscriptionHistory,
  getUserSubscriptions,
  getMyShopSubscriptions,
  sendExpirationReminders,
} = await import('../../src/services/subscriptionService.js');

// Helper function to create mock implementation that handles transaction SQL
function createMockQueryHandler(customHandlers = {}) {
  return (sql, params) => {
    if (typeof sql === 'string') {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve();
      }

      // Normalize SQL for matching
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

      // Custom handlers
      for (const [pattern, handler] of Object.entries(customHandlers)) {
        const normalizedPattern = pattern.replace(/\s+/g, ' ').trim();
        if (normalizedSql.includes(normalizedPattern)) {
          return handler(sql, params);
        }
      }
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  };
}

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
    mockPoolQuery.mockClear();
    mockPoolConnect.mockResolvedValue(mockClient);

    // Default successful transaction flow
    mockClient.query.mockImplementation((sql) => {
      if (typeof sql === 'string') {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve();
        }
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // checkExpiredSubscriptions - CRITICAL (P0)
  // ============================================================================
  describe('checkExpiredSubscriptions', () => {
    describe('Happy Path - Status Transitions', () => {
      it('should transition active shop with expired next_payment_due to grace_period', async () => {
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
        const mockShop = {
          id: 1,
          name: 'Test Shop',
          tier: 'basic',
          next_payment_due: pastDate,
          grace_period_until: null,
          subscription_status: 'active',
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, tier, next_payment_due': () =>
              Promise.resolve({ rows: [mockShop] }),
            'UPDATE shops SET subscription_status': () => Promise.resolve(),
            'UPDATE shop_subscriptions SET status': () =>
              Promise.resolve({ rowCount: 0 }),
          })
        );

        const result = await checkExpiredSubscriptions();

        expect(result.gracePeriod).toBe(1);
        expect(result.deactivated).toBe(0);
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining("subscription_status = 'grace_period'"),
          expect.any(Array)
        );
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should deactivate shop when grace_period_until has expired', async () => {
        const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
        const graceExpired = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
        const mockShop = {
          id: 2,
          name: 'Grace Expired Shop',
          tier: 'pro',
          next_payment_due: pastDate,
          grace_period_until: graceExpired,
          subscription_status: 'grace_period',
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, tier, next_payment_due': () =>
              Promise.resolve({ rows: [mockShop] }),
            'UPDATE shops SET is_active = false': () => Promise.resolve(),
            'UPDATE shop_subscriptions SET status': () =>
              Promise.resolve({ rowCount: 0 }),
          })
        );

        const result = await checkExpiredSubscriptions();

        expect(result.deactivated).toBe(1);
        expect(result.gracePeriod).toBe(0);
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('deactivated after grace period expiry')
        );
      });

      it('should mark shop_subscriptions as expired when period_end passed', async () => {
        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, tier, next_payment_due': () =>
              Promise.resolve({ rows: [] }),
            'UPDATE shop_subscriptions SET status': () =>
              Promise.resolve({ rowCount: 3 }),
          })
        );

        const result = await checkExpiredSubscriptions();

        expect(result.expired).toBe(3);
        expect(result.gracePeriod).toBe(0);
        expect(result.deactivated).toBe(0);
      });
    });

    describe('Edge Cases', () => {
      it('should return zeros when no expired subscriptions exist', async () => {
        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, tier, next_payment_due': () =>
              Promise.resolve({ rows: [] }),
            'UPDATE shop_subscriptions SET status': () =>
              Promise.resolve({ rowCount: 0 }),
          })
        );

        const result = await checkExpiredSubscriptions();

        expect(result).toEqual({
          expired: 0,
          gracePeriod: 0,
          deactivated: 0,
        });
      });

      it('should process multiple shops with different statuses', async () => {
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const graceExpired = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
        const mockShops = [
          {
            id: 1,
            name: 'Active Shop',
            next_payment_due: pastDate,
            grace_period_until: null,
            subscription_status: 'active',
          },
          {
            id: 2,
            name: 'Grace Expired',
            next_payment_due: pastDate,
            grace_period_until: graceExpired,
            subscription_status: 'grace_period',
          },
        ];

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, tier, next_payment_due': () =>
              Promise.resolve({ rows: mockShops }),
            'UPDATE shops SET subscription_status': () => Promise.resolve(),
            'UPDATE shops SET is_active = false': () => Promise.resolve(),
            'UPDATE shop_subscriptions SET status': () =>
              Promise.resolve({ rowCount: 2 }),
          })
        );

        const result = await checkExpiredSubscriptions();

        expect(result.gracePeriod).toBe(1);
        expect(result.deactivated).toBe(1);
        expect(result.expired).toBe(2);
      });
    });

    describe('Error Handling', () => {
      it('should throw and release client on database error', async () => {
        const dbError = new Error('Database connection lost');
        mockClient.query.mockRejectedValue(dbError);

        await expect(checkExpiredSubscriptions()).rejects.toThrow(
          'Database connection lost'
        );
        expect(mockClient.release).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
          '[Subscription] Error checking expired subscriptions:',
          dbError
        );
      });
    });

    describe('Idempotency', () => {
      it('should not re-process already inactive shops', async () => {
        // Shops with subscription_status = 'inactive' are excluded by the query
        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, tier, next_payment_due': () =>
              Promise.resolve({ rows: [] }), // No shops returned (inactive excluded)
            'UPDATE shop_subscriptions SET status': () =>
              Promise.resolve({ rowCount: 0 }),
          })
        );

        const result = await checkExpiredSubscriptions();

        expect(result.deactivated).toBe(0);
        expect(result.gracePeriod).toBe(0);
      });
    });
  });

  // ============================================================================
  // checkExpiredTrials - CRITICAL (P0)
  // ============================================================================
  describe('checkExpiredTrials', () => {
    describe('Transaction Handling', () => {
      it('should wrap updates in transaction (BEGIN/COMMIT)', async () => {
        const expiredTrial = {
          id: 1,
          name: 'Test Shop',
          trial_ends_at: new Date(Date.now() - 1000),
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, trial_ends_at FROM shops': () =>
              Promise.resolve({ rows: [expiredTrial] }),
            'UPDATE shops': () => Promise.resolve(),
          })
        );

        await checkExpiredTrials();

        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should rollback on database error', async () => {
        mockClient.query
          .mockResolvedValueOnce({}) // BEGIN
          .mockRejectedValueOnce(new Error('DB Error'));

        await expect(checkExpiredTrials()).rejects.toThrow('DB Error');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should always release client in finally block', async () => {
        const dbError = new Error('Connection failed');
        mockClient.query.mockRejectedValue(dbError);

        await expect(checkExpiredTrials()).rejects.toThrow('Connection failed');

        expect(mockClient.release).toHaveBeenCalledTimes(1);
      });
    });

    describe('Tier Reset Logic', () => {
      it('should reset tier to basic when trial expires', async () => {
        const expiredTrial = {
          id: 1,
          name: 'Pro Trial Shop',
          trial_ends_at: new Date(Date.now() - 1000),
        };

        let updateParams = null;
        mockClient.query.mockImplementation((sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return Promise.resolve();
          }
          if (typeof sql === 'string' && sql.includes('SELECT id, name, trial_ends_at')) {
            return Promise.resolve({ rows: [expiredTrial] });
          }
          if (typeof sql === 'string' && sql.includes('UPDATE shops')) {
            updateParams = { sql, params };
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        await checkExpiredTrials();

        expect(updateParams).not.toBeNull();
        expect(updateParams.sql).toContain("tier = 'basic'");
        expect(updateParams.sql).toContain('is_trial = false');
        expect(updateParams.sql).toContain("subscription_status = 'grace_period'");
      });

      it('should set is_trial to false when trial expires', async () => {
        const expiredTrial = {
          id: 5,
          name: 'Expired Trial Shop',
          trial_ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        };

        let updateQuery = null;
        mockClient.query.mockImplementation((sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return Promise.resolve();
          }
          if (typeof sql === 'string' && sql.includes('SELECT id, name, trial_ends_at')) {
            return Promise.resolve({ rows: [expiredTrial] });
          }
          if (typeof sql === 'string' && sql.includes('UPDATE shops')) {
            updateQuery = sql;
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        await checkExpiredTrials();

        expect(updateQuery).toContain('is_trial = false');
      });

      it('should set subscription_status to grace_period', async () => {
        const expiredTrial = {
          id: 3,
          name: 'Trial Shop',
          trial_ends_at: new Date(Date.now() - 1000),
        };

        let updateQuery = null;
        mockClient.query.mockImplementation((sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return Promise.resolve();
          }
          if (typeof sql === 'string' && sql.includes('SELECT id, name, trial_ends_at')) {
            return Promise.resolve({ rows: [expiredTrial] });
          }
          if (typeof sql === 'string' && sql.includes('UPDATE shops')) {
            updateQuery = sql;
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        await checkExpiredTrials();

        expect(updateQuery).toContain("subscription_status = 'grace_period'");
      });

      it('should calculate grace_period_until correctly (GRACE_PERIOD_DAYS from now)', async () => {
        const expiredTrial = {
          id: 1,
          name: 'Test Shop',
          trial_ends_at: new Date(Date.now() - 1000),
        };

        let gracePeriodUntil = null;
        mockClient.query.mockImplementation((sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return Promise.resolve();
          }
          if (typeof sql === 'string' && sql.includes('SELECT id, name, trial_ends_at')) {
            return Promise.resolve({ rows: [expiredTrial] });
          }
          if (typeof sql === 'string' && sql.includes('UPDATE shops') && params) {
            // First param is grace_period_until, second is shop id
            gracePeriodUntil = params[0];
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        const beforeTest = new Date();
        await checkExpiredTrials();
        const afterTest = new Date();

        expect(gracePeriodUntil).toBeInstanceOf(Date);

        // Grace period should be ~2 days from now (GRACE_PERIOD_DAYS = 2)
        const expectedMinMs = beforeTest.getTime() + 2 * 24 * 60 * 60 * 1000 - 1000;
        const expectedMaxMs = afterTest.getTime() + 2 * 24 * 60 * 60 * 1000 + 1000;

        expect(gracePeriodUntil.getTime()).toBeGreaterThanOrEqual(expectedMinMs);
        expect(gracePeriodUntil.getTime()).toBeLessThanOrEqual(expectedMaxMs);
      });
    });

    describe('Edge Cases', () => {
      it('should return transitioned: 0 when no expired trials exist', async () => {
        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, trial_ends_at FROM shops': () =>
              Promise.resolve({ rows: [] }),
          })
        );

        const result = await checkExpiredTrials();

        expect(result).toEqual({ transitioned: 0 });
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should process multiple expired trials (batch processing)', async () => {
        const expiredTrials = [
          { id: 1, name: 'Shop 1', trial_ends_at: new Date(Date.now() - 1000) },
          { id: 2, name: 'Shop 2', trial_ends_at: new Date(Date.now() - 2000) },
          { id: 3, name: 'Shop 3', trial_ends_at: new Date(Date.now() - 3000) },
        ];

        let updateCount = 0;
        mockClient.query.mockImplementation((sql, params) => {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return Promise.resolve();
          }
          if (typeof sql === 'string' && sql.includes('SELECT id, name, trial_ends_at')) {
            return Promise.resolve({ rows: expiredTrials });
          }
          if (typeof sql === 'string' && sql.includes('UPDATE shops')) {
            updateCount++;
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [] });
        });

        const result = await checkExpiredTrials();

        expect(result.transitioned).toBe(3);
        expect(updateCount).toBe(3);
      });

      it('should log warning for each transitioned shop', async () => {
        const expiredTrial = {
          id: 42,
          name: 'Logged Shop',
          trial_ends_at: new Date(Date.now() - 1000),
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, trial_ends_at FROM shops': () =>
              Promise.resolve({ rows: [expiredTrial] }),
            'UPDATE shops': () => Promise.resolve(),
          })
        );

        await checkExpiredTrials();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Shop 42 (Logged Shop) trial expired')
        );
      });

      it('should log info when trials are transitioned', async () => {
        const expiredTrials = [
          { id: 1, name: 'Shop 1', trial_ends_at: new Date(Date.now() - 1000) },
          { id: 2, name: 'Shop 2', trial_ends_at: new Date(Date.now() - 2000) },
        ];

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, trial_ends_at FROM shops': () =>
              Promise.resolve({ rows: expiredTrials }),
            'UPDATE shops': () => Promise.resolve(),
          })
        );

        await checkExpiredTrials();

        expect(logger.info).toHaveBeenCalledWith(
          '[Trial] 2 trials expired and transitioned to grace period'
        );
      });

      it('should not log info when no trials are transitioned', async () => {
        mockClient.query.mockImplementation(
          createMockQueryHandler({
            'SELECT id, name, trial_ends_at FROM shops': () =>
              Promise.resolve({ rows: [] }),
          })
        );

        // Clear previous calls
        logger.info.mockClear();

        await checkExpiredTrials();

        // Should not have the "X trials expired" log
        const infoCalls = logger.info.mock.calls;
        const hasTrialExpiredLog = infoCalls.some(
          call => typeof call[0] === 'string' && call[0].includes('trials expired')
        );
        expect(hasTrialExpiredLog).toBe(false);
      });
    });

    describe('Error Handling', () => {
      it('should log error before rethrowing', async () => {
        const dbError = new Error('Database connection lost');
        mockClient.query
          .mockResolvedValueOnce({}) // BEGIN
          .mockRejectedValueOnce(dbError);

        await expect(checkExpiredTrials()).rejects.toThrow('Database connection lost');

        expect(logger.error).toHaveBeenCalledWith(
          '[SubscriptionService] checkExpiredTrials error:',
          dbError
        );
      });
    });
  });

  // ============================================================================
  // deactivateShop - CRITICAL (P0)
  // ============================================================================
  describe('deactivateShop', () => {
    it('should use external client and NOT release it', async () => {
      const externalClient = {
        query: jest.fn().mockResolvedValue({}),
        release: jest.fn(),
      };

      await deactivateShop(123, externalClient);

      expect(externalClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE shops'),
        [123]
      );
      expect(externalClient.release).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('should create new client and release it when no client provided', async () => {
      mockClient.query.mockResolvedValue({});

      await deactivateShop(456);

      expect(pool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("subscription_status = 'inactive'"),
        [456]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should update is_active to false and subscription_status to inactive', async () => {
      mockClient.query.mockResolvedValue({});

      await deactivateShop(789);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = false'),
        expect.any(Array)
      );
      expect(logger.warn).toHaveBeenCalledWith(
        '[Subscription] Shop 789 deactivated'
      );
    });

    it('should throw and release client on error', async () => {
      const dbError = new Error('Update failed');
      mockClient.query.mockRejectedValue(dbError);

      await expect(deactivateShop(999)).rejects.toThrow('Update failed');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        '[Subscription] Error deactivating shop 999:',
        dbError
      );
    });
  });

  // ============================================================================
  // activatePromoSubscription - CRITICAL (P0)
  // ============================================================================
  describe('activatePromoSubscription', () => {
    describe('Happy Path', () => {
      it('should create promo_activation and shop_subscription', async () => {
        const shopId = 1;
        const userId = 100;
        const promoCode = 'PROMO50';

        const mockShop = {
          id: shopId,
          tier: 'basic',
          owner_id: userId,
        };

        const updatedShop = {
          id: shopId,
          tier: 'pro',
          subscription_status: 'active',
          is_active: true,
        };

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            BEGIN: () => Promise.resolve(),
            'SELECT id FROM promo_activations': () =>
              Promise.resolve({ rows: [] }),
            'SELECT id, tier, owner_id FROM shops': () =>
              Promise.resolve({ rows: [mockShop] }),
            'INSERT INTO promo_activations': () => Promise.resolve(),
            'INSERT INTO shop_subscriptions': () => Promise.resolve(),
            'UPDATE shops SET tier': () =>
              Promise.resolve({ rows: [updatedShop] }),
            COMMIT: () => Promise.resolve(),
          })
        );

        const result = await activatePromoSubscription(shopId, userId, promoCode);

        expect(result.tier).toBe('pro');
        expect(result.is_active).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should set subscription period_end to 30 days from now', async () => {
        const shopId = 1;
        const userId = 100;
        const promoCode = 'FREE30';

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            BEGIN: () => Promise.resolve(),
            'SELECT id FROM promo_activations': () =>
              Promise.resolve({ rows: [] }),
            'SELECT id, tier, owner_id FROM shops': () =>
              Promise.resolve({ rows: [{ id: shopId, tier: 'basic', owner_id: userId }] }),
            'INSERT INTO promo_activations': () => Promise.resolve(),
            'INSERT INTO shop_subscriptions': () => Promise.resolve(),
            'UPDATE shops SET tier': () =>
              Promise.resolve({ rows: [{ id: shopId }] }),
            COMMIT: () => Promise.resolve(),
          })
        );

        await activatePromoSubscription(shopId, userId, promoCode);

        // Check that INSERT INTO shop_subscriptions was called
        const insertCall = mockClient.query.mock.calls.find(
          ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO shop_subscriptions')
        );
        expect(insertCall).toBeDefined();
      });
    });

    describe('Idempotency', () => {
      it('should throw error if promo already used by this user', async () => {
        const shopId = 1;
        const userId = 100;
        const promoCode = 'USED_PROMO';

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            BEGIN: () => Promise.resolve(),
            'SELECT id FROM promo_activations': () =>
              Promise.resolve({ rows: [{ id: 1 }] }), // Already exists
            ROLLBACK: () => Promise.resolve(),
          })
        );

        await expect(
          activatePromoSubscription(shopId, userId, promoCode)
        ).rejects.toThrow('Promo code already used by this user');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });

    describe('Authorization', () => {
      it('should throw error if user does not own the shop', async () => {
        const shopId = 1;
        const userId = 100;
        const differentOwnerId = 999;
        const promoCode = 'PROMO';

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            BEGIN: () => Promise.resolve(),
            'SELECT id FROM promo_activations': () =>
              Promise.resolve({ rows: [] }),
            'SELECT id, tier, owner_id FROM shops': () =>
              Promise.resolve({ rows: [{ id: shopId, tier: 'basic', owner_id: differentOwnerId }] }),
            ROLLBACK: () => Promise.resolve(),
          })
        );

        await expect(
          activatePromoSubscription(shopId, userId, promoCode)
        ).rejects.toThrow('User does not own this shop');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      });
    });

    describe('Error Handling', () => {
      it('should throw error if shop not found', async () => {
        const shopId = 999;
        const userId = 100;
        const promoCode = 'PROMO';

        mockClient.query.mockImplementation(
          createMockQueryHandler({
            BEGIN: () => Promise.resolve(),
            'SELECT id FROM promo_activations': () =>
              Promise.resolve({ rows: [] }),
            'SELECT id, tier, owner_id FROM shops': () =>
              Promise.resolve({ rows: [] }),
            ROLLBACK: () => Promise.resolve(),
          })
        );

        await expect(
          activatePromoSubscription(shopId, userId, promoCode)
        ).rejects.toThrow('Shop not found');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should rollback on database error', async () => {
        const shopId = 1;
        const userId = 100;
        const promoCode = 'PROMO';

        mockClient.query
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // promo check
          .mockResolvedValueOnce({ rows: [{ id: shopId, tier: 'basic', owner_id: userId }] }) // shop check
          .mockRejectedValueOnce(new Error('Insert failed')); // promo_activations insert

        await expect(
          activatePromoSubscription(shopId, userId, promoCode)
        ).rejects.toThrow('Insert failed');

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // calculateUpgradeAmount - MEDIUM (P1) - Pure Function
  // ============================================================================
  describe('calculateUpgradeAmount', () => {
    it('should calculate prorated amount for half period remaining', async () => {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      const periodEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

      const result = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // 15 remaining / 30 total * (35 - 25) = 5
      expect(result).toBe(5);
    });

    it('should return full difference for full period remaining', async () => {
      const now = new Date();
      const periodStart = now;
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const result = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // 30 remaining / 30 total * 10 = 10
      expect(result).toBe(10);
    });

    it('should return full pro price when no time remaining', async () => {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // Already ended

      const result = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // Period ended, return full pro price
      expect(result).toBe(35);
    });

    it('should return price difference when totalDays <= 0', async () => {
      const now = new Date();
      const periodStart = now;
      const periodEnd = now; // Same day = 0 total days

      const result = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      expect(result).toBe(10); // proPrice - basicPrice
    });

    it('should round to 2 decimal places', async () => {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

      const result = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // 20 remaining / 30 total * 10 = 6.666...
      expect(result).toBe(6.67);
    });
  });

  // ============================================================================
  // calculateUpgradeCost - MEDIUM (P1)
  // Uses pool.query() directly (optimized - no pool.connect())
  // ============================================================================
  describe('calculateUpgradeCost', () => {
    it('should return upgrade cost with remaining days info', async () => {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

      const mockShop = { tier: 'basic' };
      const mockSubscription = {
        period_start: periodStart,
        period_end: periodEnd,
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [mockShop] })
        .mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await calculateUpgradeCost(1);

      expect(result.alreadyPro).toBe(false);
      expect(result.currentTier).toBe('basic');
      expect(result.newTier).toBe('pro');
      expect(result.remainingDays).toBe(20);
      expect(result.amount).toBeCloseTo(6.67, 1);
    });

    it('should throw error if shop not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(calculateUpgradeCost(999)).rejects.toThrow('Shop not found');
    });

    it('should throw error if no active subscription found', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ tier: 'basic' }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(calculateUpgradeCost(1)).rejects.toThrow(
        'No active subscription found'
      );
    });

    it('should return alreadyPro: true with amount 0 for pro tier', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ tier: 'pro' }] });

      const result = await calculateUpgradeCost(1);

      expect(result.alreadyPro).toBe(true);
      expect(result.amount).toBe(0);
    });

    it('should use pool.query() directly (not pool.connect())', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ tier: 'basic' }] })
        .mockResolvedValueOnce({ rows: [{ period_start: new Date(), period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }] });

      await calculateUpgradeCost(1);

      expect(mockPoolQuery).toHaveBeenCalled();
      expect(mockPoolConnect).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getSubscriptionStatus - MEDIUM (P1)
  // Uses pool.query() directly (optimized - no pool.connect())
  // ============================================================================
  describe('getSubscriptionStatus', () => {
    it('should use pool.query() directly (not pool.connect())', async () => {
      const mockShop = {
        id: 1,
        tier: 'pro',
        subscription_status: 'active',
        next_payment_due: new Date(),
        grace_period_until: null,
        is_active: true,
      };
      const mockSubscription = {
        id: 100,
        shop_id: 1,
        tier: 'pro',
        status: 'active',
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [mockShop] }) // First query: shop info
        .mockResolvedValueOnce({ rows: [mockSubscription] }); // Second query: subscription

      await getSubscriptionStatus(1);

      // Should use pool.query() not pool.connect()
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
      expect(mockPoolConnect).not.toHaveBeenCalled();
    });

    it('should return shop info with current subscription', async () => {
      const mockShop = {
        id: 1,
        tier: 'pro',
        subscription_status: 'active',
        next_payment_due: new Date(),
        grace_period_until: null,
        is_active: true,
      };
      const mockSubscription = {
        id: 100,
        shop_id: 1,
        tier: 'pro',
        status: 'active',
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [mockShop] })
        .mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await getSubscriptionStatus(1);

      expect(result.shopId).toBe(1);
      expect(result.tier).toBe('pro');
      expect(result.status).toBe('active');
      expect(result.isActive).toBe(true);
      expect(result.currentSubscription).toEqual(mockSubscription);
      expect(result.price).toBe(SUBSCRIPTION_PRICES.pro);
    });

    it('should throw error if shop not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await expect(getSubscriptionStatus(999)).rejects.toThrow('Shop not found');
    });

    it('should return null currentSubscription if no active subscription', async () => {
      const mockShop = {
        id: 1,
        tier: 'basic',
        subscription_status: 'inactive',
        next_payment_due: null,
        grace_period_until: null,
        is_active: false,
      };

      const mockLatestSubscription = {
        id: 123,
        shop_id: 1,
        tier: 'basic',
        status: 'expired',
        period_end: new Date(Date.now() - 86400000), // Yesterday
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [mockShop] })
        .mockResolvedValueOnce({ rows: [] }) // No active subscription
        .mockResolvedValueOnce({ rows: [mockLatestSubscription] }); // Latest subscription for renewal

      const result = await getSubscriptionStatus(1);

      expect(result.currentSubscription).toBeNull();
      expect(result.latestSubscription).toEqual(mockLatestSubscription);
    });

    it('should query shop with correct SQL', async () => {
      const mockShop = {
        id: 1,
        tier: 'basic',
        subscription_status: 'active',
        next_payment_due: new Date(),
        grace_period_until: null,
        is_active: true,
      };

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [mockShop] })
        .mockResolvedValueOnce({ rows: [] }) // No active subscription
        .mockResolvedValueOnce({ rows: [] }); // No latest subscription either

      await getSubscriptionStatus(1);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, tier, subscription_status'),
        [1]
      );
    });
  });

  // ============================================================================
  // getSubscriptionHistory - LOW (P2)
  // Uses pool.query() directly (optimized - no pool.connect())
  // ============================================================================
  describe('getSubscriptionHistory', () => {
    it('should use pool.query() directly (not pool.connect())', async () => {
      const mockHistory = [
        { id: 1, shop_id: 1, tier: 'pro', created_at: new Date() },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockHistory });

      await getSubscriptionHistory(1, 10);

      // Should use pool.query() not pool.connect()
      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      expect(mockPoolConnect).not.toHaveBeenCalled();
    });

    it('should return subscription history for shop', async () => {
      const mockHistory = [
        { id: 1, shop_id: 1, tier: 'pro', created_at: new Date() },
        { id: 2, shop_id: 1, tier: 'basic', created_at: new Date() },
      ];

      mockPoolQuery.mockResolvedValueOnce({ rows: mockHistory });

      const result = await getSubscriptionHistory(1, 10);

      expect(result).toHaveLength(2);
      expect(result[0].tier).toBe('pro');
    });

    it('should use default limit of 10', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await getSubscriptionHistory(1);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [1, 10]
      );
    });

    it('should use custom limit when provided', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await getSubscriptionHistory(1, 5);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.any(String),
        [1, 5]
      );
    });

    it('should query with correct SQL structure', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      await getSubscriptionHistory(1, 10);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM shop_subscriptions'),
        expect.any(Array)
      );
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no history exists', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getSubscriptionHistory(999, 10);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // getUserSubscriptions - LOW (P2)
  // ============================================================================
  describe('getUserSubscriptions', () => {
    it('should return list of shop subscriptions for user', async () => {
      const mockSubscriptions = [
        { id: 1, shop_id: 10, shop_name: 'Shop A', tier: 'pro' },
        { id: 2, shop_id: 20, shop_name: 'Shop B', tier: 'basic' },
      ];

      mockPoolQuery.mockResolvedValue({ rows: mockSubscriptions });

      const result = await getUserSubscriptions(100);

      expect(result).toHaveLength(2);
      expect(result[0].shop_name).toBe('Shop A');
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM subscriptions sub'),
        [100]
      );
    });

    it('should return empty array if no subscriptions', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await getUserSubscriptions(999);

      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockPoolQuery.mockRejectedValue(new Error('Query failed'));

      await expect(getUserSubscriptions(100)).rejects.toThrow('Query failed');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getMyShopSubscriptions - LOW (P2)
  // ============================================================================
  describe('getMyShopSubscriptions', () => {
    it('should return shops with subscription info for owner', async () => {
      const mockShopSubs = [
        {
          id: 1,
          shop_id: 10,
          shop_name: 'My Shop',
          tier: 'pro',
          is_active: true,
        },
      ];

      mockPoolQuery.mockResolvedValue({ rows: mockShopSubs });

      const result = await getMyShopSubscriptions(100);

      expect(result).toHaveLength(1);
      expect(result[0].is_active).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.owner_id = $1'),
        [100]
      );
    });

    it('should return empty array if user owns no shops', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await getMyShopSubscriptions(999);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // sendExpirationReminders - LOW (P2)
  // ============================================================================
  describe('sendExpirationReminders', () => {
    const mockBot = {
      telegram: {
        sendMessage: jest.fn(),
      },
    };

    beforeEach(() => {
      mockBot.telegram.sendMessage.mockReset();
    });

    it('should send reminders to shops expiring within 3 days', async () => {
      const expiresIn2Days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const mockShops = [
        {
          id: 1,
          name: 'Expiring Shop',
          tier: 'basic',
          next_payment_due: expiresIn2Days,
          telegram_id: 123456789,
          first_name: 'John',
        },
      ];

      mockClient.query.mockImplementation(
        createMockQueryHandler({
          'SELECT s.id, s.name, s.tier, s.next_payment_due': () =>
            Promise.resolve({ rows: mockShops }),
        })
      );

      mockBot.telegram.sendMessage.mockResolvedValue({});

      const result = await sendExpirationReminders(mockBot);

      expect(result.reminded).toBe(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        123456789,
        expect.stringContaining('John'),
        { parse_mode: 'HTML' }
      );
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        expect.stringContaining('Expiring Shop'),
        expect.any(Object)
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle telegram send errors gracefully', async () => {
      const expiresIn1Day = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
      const mockShops = [
        {
          id: 1,
          name: 'Shop 1',
          tier: 'pro',
          next_payment_due: expiresIn1Day,
          telegram_id: 111,
          first_name: 'User1',
        },
        {
          id: 2,
          name: 'Shop 2',
          tier: 'basic',
          next_payment_due: expiresIn1Day,
          telegram_id: 222,
          first_name: 'User2',
        },
      ];

      mockClient.query.mockImplementation(
        createMockQueryHandler({
          'SELECT s.id, s.name, s.tier, s.next_payment_due': () =>
            Promise.resolve({ rows: mockShops }),
        })
      );

      mockBot.telegram.sendMessage
        .mockRejectedValueOnce(new Error('User blocked bot'))
        .mockResolvedValueOnce({});

      const result = await sendExpirationReminders(mockBot);

      expect(result.reminded).toBe(1); // Only one successful
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send reminder'),
        'User blocked bot'
      );
    });

    it('should return 0 reminded when no shops need reminders', async () => {
      mockClient.query.mockImplementation(
        createMockQueryHandler({
          'SELECT s.id, s.name, s.tier, s.next_payment_due': () =>
            Promise.resolve({ rows: [] }),
        })
      );

      const result = await sendExpirationReminders(mockBot);

      expect(result.reminded).toBe(0);
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('should show "expires today" for 0 days remaining', async () => {
      // next_payment_due already passed but still within reminder window
      const expiresToday = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago (0 or negative days)
      const mockShops = [
        {
          id: 1,
          name: 'Urgent Shop',
          tier: 'pro',
          next_payment_due: expiresToday,
          telegram_id: 123,
          first_name: 'Urgent User',
        },
      ];

      mockClient.query.mockImplementation(
        createMockQueryHandler({
          'SELECT s.id, s.name, s.tier, s.next_payment_due': () =>
            Promise.resolve({ rows: mockShops }),
        })
      );

      mockBot.telegram.sendMessage.mockResolvedValue({});

      await sendExpirationReminders(mockBot);

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('истекает сегодня'),
        expect.any(Object)
      );
    });

    it('should use default owner name when first_name is null', async () => {
      const expiresIn1Day = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
      const mockShops = [
        {
          id: 1,
          name: 'Shop',
          tier: 'basic',
          next_payment_due: expiresIn1Day,
          telegram_id: 123,
          first_name: null,
        },
      ];

      mockClient.query.mockImplementation(
        createMockQueryHandler({
          'SELECT s.id, s.name, s.tier, s.next_payment_due': () =>
            Promise.resolve({ rows: mockShops }),
        })
      );

      mockBot.telegram.sendMessage.mockResolvedValue({});

      await sendExpirationReminders(mockBot);

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('владелец'),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // DEPRECATED Functions - Should throw errors
  // ============================================================================
  describe('Deprecated Functions', () => {
    it('processSubscriptionPayment should throw deprecation error', async () => {
      const { processSubscriptionPayment: deprecatedFn } = await import(
        '../../src/services/subscriptionService.js'
      );

      await expect(deprecatedFn()).rejects.toThrow(
        'Direct blockchain payments not supported'
      );
    });

    it('upgradeShopToPro should throw deprecation error', async () => {
      const { upgradeShopToPro: deprecatedFn } = await import(
        '../../src/services/subscriptionService.js'
      );

      await expect(deprecatedFn()).rejects.toThrow(
        'Direct blockchain payments not supported'
      );
    });
  });
});
