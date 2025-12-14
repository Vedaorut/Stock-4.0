/**
 * Unit Tests for Subscription Service
 *
 * Tests for shop subscription management including:
 * - Upgrade calculations (prorated pricing)
 * - Expired subscription checking
 * - Shop deactivation
 * - Subscription status and history
 */

import { jest } from '@jest/globals';

// Mock database pool
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn(() => Promise.resolve(mockClient)),
  query: jest.fn(),
};

jest.unstable_mockModule('../../config/database.js', () => ({
  pool: mockPool,
  query: mockPool.query,
  getClient: () => Promise.resolve(mockClient),
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: mockLogger,
}));

// Mock subscription pricing config
jest.unstable_mockModule('../../config/subscriptionPricing.js', () => ({
  SUBSCRIPTION_PRICES: { basic: 25.0, pro: 35.0 },
  SUBSCRIPTION_PRICES_YEARLY: { basic: 250.0, pro: 350.0 },
  SUBSCRIPTION_PERIOD_DAYS: 30,
  GRACE_PERIOD_DAYS: 2,
}));

// Import after mocks
const {
  calculateUpgradeAmount,
  processSubscriptionPayment,
  upgradeShopToPro,
  checkExpiredSubscriptions,
  deactivateShop,
  sendExpirationReminders,
  getSubscriptionStatus,
  getSubscriptionHistory,
  calculateUpgradeCost,
  getUserSubscriptions,
  getMyShopSubscriptions,
  activatePromoSubscription,
  SUBSCRIPTION_PRICES,
  GRACE_PERIOD_DAYS,
} = await import('../subscriptionService.js');

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockImplementation(() => Promise.resolve(mockClient));
    mockPool.query.mockReset();
  });

  // ==================== PURE FUNCTIONS ====================

  describe('calculateUpgradeAmount', () => {
    it('should calculate prorated upgrade for half period remaining', () => {
      // 30 day period, 15 days remaining
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      // Mock "now" to be Jan 16 (15 days remaining)
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-16'));

      const amount = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // (35 - 25) * 15 / 30 = $5.00
      expect(amount).toBe(5);

      jest.useRealTimers();
    });

    it('should return full difference for invalid period (totalDays <= 0)', () => {
      const periodStart = new Date('2024-01-31');
      const periodEnd = new Date('2024-01-01'); // End before start

      const amount = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // Should return pro - basic = 10
      expect(amount).toBe(10);
    });

    it('should return full pro price when no time remaining', () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-15');

      // Set now to after period end
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-20'));

      const amount = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // Should return full pro price
      expect(amount).toBe(35);

      jest.useRealTimers();
    });

    it('should round to 2 decimal places', () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-08')); // 23 days remaining

      const amount = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // (35 - 25) * 23 / 30 = 7.666...
      expect(amount).toBe(7.67);

      jest.useRealTimers();
    });

    it('should handle full period remaining', () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01')); // Day 1, 30 days remaining

      const amount = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // (35 - 25) * 30 / 30 = $10.00
      expect(amount).toBe(10);

      jest.useRealTimers();
    });

    it('should handle 1 day remaining', () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-30')); // 1 day remaining

      const amount = calculateUpgradeAmount(periodStart, periodEnd, 25, 35);

      // (35 - 25) * 1 / 30 = 0.33
      expect(amount).toBe(0.33);

      jest.useRealTimers();
    });
  });

  // ==================== DEPRECATED FUNCTIONS ====================

  describe('processSubscriptionPayment (deprecated)', () => {
    it('should throw error directing to CrystalPay', async () => {
      await expect(processSubscriptionPayment()).rejects.toThrow(
        'Direct blockchain payments not supported. Use CrystalPay via /api/payments/subscription/crystalpay'
      );
    });
  });

  describe('upgradeShopToPro (deprecated)', () => {
    it('should throw error directing to CrystalPay', async () => {
      await expect(upgradeShopToPro()).rejects.toThrow(
        'Direct blockchain payments not supported. Use CrystalPay.'
      );
    });
  });

  // ==================== DATABASE FUNCTIONS ====================

  describe('checkExpiredSubscriptions', () => {
    it('should return zeros when no pending subscriptions', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // shops query
        .mockResolvedValueOnce({ rowCount: 0 }); // subscription update

      const result = await checkExpiredSubscriptions();

      expect(result).toEqual({ expired: 0, gracePeriod: 0, deactivated: 0 });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should move active subscription to grace period', async () => {
      const now = new Date();
      const expiredPaymentDue = new Date(now.getTime() - 1000); // 1 second ago

      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              name: 'Test Shop',
              tier: 'basic',
              next_payment_due: expiredPaymentDue,
              grace_period_until: null,
              subscription_status: 'active',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE shops (grace period)
        .mockResolvedValueOnce({ rowCount: 0 }); // UPDATE shop_subscriptions

      const result = await checkExpiredSubscriptions();

      expect(result.gracePeriod).toBe(1);
      expect(result.deactivated).toBe(0);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET subscription_status = 'grace_period'"),
        expect.any(Array)
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('entered grace period')
      );
    });

    it('should deactivate shop after grace period expires', async () => {
      const now = new Date();
      const expiredPaymentDue = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const expiredGracePeriod = new Date(now.getTime() - 1000); // 1 second ago

      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              name: 'Test Shop',
              tier: 'basic',
              next_payment_due: expiredPaymentDue,
              grace_period_until: expiredGracePeriod,
              subscription_status: 'grace_period',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE shops (deactivate)
        .mockResolvedValueOnce({ rowCount: 0 }); // UPDATE shop_subscriptions

      const result = await checkExpiredSubscriptions();

      expect(result.deactivated).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET is_active = false"),
        [1]
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('deactivated after grace period')
      );
    });

    it('should not deactivate shop still within grace period', async () => {
      const now = new Date();
      const expiredPaymentDue = new Date(now.getTime() - 1000); // 1 second ago
      const gracePeriodStillValid = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow

      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              name: 'Grace Period Shop',
              tier: 'basic',
              next_payment_due: expiredPaymentDue,
              grace_period_until: gracePeriodStillValid, // Still valid!
              subscription_status: 'grace_period',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 0 }); // No subscriptions marked expired

      const result = await checkExpiredSubscriptions();

      // Shop should NOT be deactivated since grace_period_until > now
      expect(result.deactivated).toBe(0);
      expect(result.gracePeriod).toBe(0);
    });

    it('should handle mixed scenarios correctly', async () => {
      const now = new Date();
      const expiredPaymentDue = new Date(now.getTime() - 1000);
      const expiredGracePeriod = new Date(now.getTime() - 1000);

      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            // Shop 1: active -> grace period
            {
              id: 1,
              name: 'Shop 1',
              tier: 'basic',
              next_payment_due: expiredPaymentDue,
              grace_period_until: null,
              subscription_status: 'active',
            },
            // Shop 2: grace_period -> deactivated
            {
              id: 2,
              name: 'Shop 2',
              tier: 'pro',
              next_payment_due: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
              grace_period_until: expiredGracePeriod,
              subscription_status: 'grace_period',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE shop 1
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE shop 2 (deactivate)
        .mockResolvedValueOnce({ rowCount: 2 }); // UPDATE subscriptions

      const result = await checkExpiredSubscriptions();

      expect(result.expired).toBe(2);
      expect(result.gracePeriod).toBe(1);
      expect(result.deactivated).toBe(1);
    });

    it('should release client on error', async () => {
      const error = new Error('Database error');
      mockClient.query.mockRejectedValueOnce(error);

      await expect(checkExpiredSubscriptions()).rejects.toThrow('Database error');

      expect(mockClient.release).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking expired subscriptions'),
        error
      );
    });
  });

  describe('deactivateShop', () => {
    it('should deactivate shop with provided client (transaction)', async () => {
      const providedClient = { query: jest.fn().mockResolvedValueOnce({}) };

      await deactivateShop(123, providedClient);

      expect(providedClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET is_active = false"),
        [123]
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Subscription] Shop 123 deactivated'
      );
      // Should NOT release provided client
      expect(mockClient.release).not.toHaveBeenCalled();
    });

    it('should create and release own client when none provided', async () => {
      mockClient.query.mockResolvedValueOnce({});

      await deactivateShop(456);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET is_active = false"),
        [456]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw and log error on database failure', async () => {
      const error = new Error('Update failed');
      mockClient.query.mockRejectedValueOnce(error);

      await expect(deactivateShop(789)).rejects.toThrow('Update failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Subscription] Error deactivating shop 789:',
        error
      );
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getSubscriptionStatus', () => {
    it('should return subscription status for active shop', async () => {
      const mockShop = {
        id: 1,
        tier: 'pro',
        subscription_status: 'active',
        next_payment_due: new Date('2024-02-01'),
        grace_period_until: null,
        is_active: true,
      };

      const mockSubscription = {
        id: 100,
        shop_id: 1,
        tier: 'pro',
        period_start: new Date('2024-01-01'),
        period_end: new Date('2024-02-01'),
        status: 'active',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockShop] })
        .mockResolvedValueOnce({ rows: [mockSubscription] });

      const result = await getSubscriptionStatus(1);

      expect(result).toEqual({
        shopId: 1,
        tier: 'pro',
        status: 'active',
        isActive: true,
        nextPaymentDue: mockShop.next_payment_due,
        gracePeriodUntil: null,
        currentSubscription: mockSubscription,
        price: 35.0,
      });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error when shop not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(getSubscriptionStatus(999)).rejects.toThrow('Shop not found');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return null for currentSubscription when none exists', async () => {
      const mockShop = {
        id: 2,
        tier: 'basic',
        subscription_status: 'inactive',
        next_payment_due: null,
        grace_period_until: null,
        is_active: false,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockShop] })
        .mockResolvedValueOnce({ rows: [] }); // No active subscription

      const result = await getSubscriptionStatus(2);

      expect(result.currentSubscription).toBeNull();
      expect(result.status).toBe('inactive');
    });

    it('should handle database error and release client', async () => {
      const error = new Error('Connection lost');
      mockClient.query.mockRejectedValueOnce(error);

      await expect(getSubscriptionStatus(1)).rejects.toThrow('Connection lost');

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getSubscriptionHistory', () => {
    it('should return subscription history for shop owner', async () => {
      const mockHistory = [
        { id: 3, tier: 'pro', amount: 35, created_at: new Date('2024-01-01') },
        { id: 2, tier: 'basic', amount: 25, created_at: new Date('2023-12-01') },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ owner_id: 42 }] }) // ownership check
        .mockResolvedValueOnce({ rows: mockHistory });

      const result = await getSubscriptionHistory(1, 42);

      expect(result).toEqual(mockHistory);
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'SELECT owner_id FROM shops WHERE id = $1', [1]);
      expect(mockClient.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('FROM shop_subscriptions'),
        [1, 10]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should respect custom limit', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ owner_id: 7 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await getSubscriptionHistory(5, 7, 5);

      expect(mockClient.query).toHaveBeenNthCalledWith(2, expect.any(String), [5, 5]);
    });

    it('should throw on unauthorized access', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ owner_id: 99 }] });

      await expect(getSubscriptionHistory(1, 1)).rejects.toThrow('Unauthorized');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error on database failure', async () => {
      const error = new Error('Query failed');
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ owner_id: 1 }] })
        .mockRejectedValueOnce(error);

      await expect(getSubscriptionHistory(1, 1)).rejects.toThrow('Query failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Subscription] Error getting subscription history:',
        error
      );
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('calculateUpgradeCost', () => {
    it('should return alreadyPro when shop is PRO tier', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ tier: 'pro' }] });

      const result = await calculateUpgradeCost(1);

      expect(result).toEqual({ alreadyPro: true, amount: 0 });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error when shop not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(calculateUpgradeCost(999)).rejects.toThrow('Shop not found');
    });

    it('should throw error when no active subscription', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ tier: 'basic' }] })
        .mockResolvedValueOnce({ rows: [] }); // No active subscription

      await expect(calculateUpgradeCost(1)).rejects.toThrow(
        'No active subscription found'
      );
    });

    it('should calculate prorated upgrade cost', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-01-31');

      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-16')); // 15 days remaining

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ tier: 'basic' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 100,
              period_start: periodStart,
              period_end: periodEnd,
              status: 'active',
            },
          ],
        });

      const result = await calculateUpgradeCost(1);

      expect(result.alreadyPro).toBe(false);
      expect(result.currentTier).toBe('basic');
      expect(result.newTier).toBe('pro');
      expect(result.periodStart).toEqual(periodStart);
      expect(result.periodEnd).toEqual(periodEnd);
      expect(result.remainingDays).toBe(15);
      // Amount: (35 - 25) * 15 / 30 = 5.00
      expect(result.amount).toBe(5);

      jest.useRealTimers();
    });

    it('should release client on error', async () => {
      const error = new Error('DB error');
      mockClient.query.mockRejectedValueOnce(error);

      await expect(calculateUpgradeCost(1)).rejects.toThrow('DB error');

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return user subscriptions', async () => {
      const mockSubscriptions = [
        {
          id: 1,
          shop_id: 10,
          shop_name: 'Shop A',
          shop_is_active: true,
          created_at: new Date(),
        },
        {
          id: 2,
          shop_id: 20,
          shop_name: 'Shop B',
          shop_is_active: false,
          created_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockSubscriptions });

      const result = await getUserSubscriptions(123);

      expect(result).toEqual(mockSubscriptions);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM shop_subscribers'),
        [123]
      );
    });

    it('should throw error on database failure', async () => {
      const error = new Error('Query failed');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(getUserSubscriptions(123)).rejects.toThrow('Query failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Subscription] Error getting user subscriptions:',
        error
      );
    });
  });

  describe('getMyShopSubscriptions', () => {
    it('should return shop subscriptions for owner', async () => {
      const mockSubscriptions = [
        {
          id: 1,
          shop_id: 10,
          shop_name: 'My Shop',
          tier: 'pro',
          status: 'active',
          amount: 35,
          currency: 'USDT',
          is_active: true,
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockSubscriptions });

      const result = await getMyShopSubscriptions(456);

      expect(result).toEqual(mockSubscriptions);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM shop_subscriptions'),
        [456]
      );
    });

    it('should throw error on database failure', async () => {
      const error = new Error('Connection error');
      mockPool.query.mockRejectedValueOnce(error);

      await expect(getMyShopSubscriptions(456)).rejects.toThrow('Connection error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Subscription] Error getting shop subscriptions:',
        error
      );
    });
  });

  // ==================== COMPLEX FUNCTIONS ====================

  describe('sendExpirationReminders', () => {
    it('should send reminders to shops expiring within 3 days', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockBot = {
        telegram: {
          sendMessage: jest.fn().mockResolvedValue({}),
        },
      };

      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Expiring Shop',
            tier: 'pro',
            next_payment_due: twoDaysFromNow,
            telegram_id: '123456789',
            first_name: 'John',
          },
        ],
      });

      const result = await sendExpirationReminders(mockBot);

      expect(result.reminded).toBe(1);
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '123456789',
        expect.stringContaining('Напоминание о подписке'),
        { parse_mode: 'HTML' }
      );
      expect(mockClient.release).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle telegram send errors gracefully', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockBot = {
        telegram: {
          sendMessage: jest.fn().mockRejectedValue(new Error('Bot blocked by user')),
        },
      };

      const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Shop 1',
            tier: 'basic',
            next_payment_due: twoDaysFromNow,
            telegram_id: '111111',
            first_name: 'User',
          },
        ],
      });

      const result = await sendExpirationReminders(mockBot);

      // Should not count failed sends
      expect(result.reminded).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send reminder'),
        'Bot blocked by user'
      );
      expect(mockClient.release).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should return zero reminded when no shops need reminders', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const mockBot = {
        telegram: { sendMessage: jest.fn() },
      };

      const result = await sendExpirationReminders(mockBot);

      expect(result.reminded).toBe(0);
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('should show "expires today" message for 0 days remaining', async () => {
      const now = new Date('2024-01-15T23:59:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockBot = {
        telegram: {
          sendMessage: jest.fn().mockResolvedValue({}),
        },
      };

      // Expires in negative time (already expired but within query window)
      // Math.ceil((next_payment_due - now) / day) <= 0
      const expiredJustNow = new Date(now.getTime() - 1000); // 1 second ago

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Urgent Shop',
            tier: 'basic',
            next_payment_due: expiredJustNow,
            telegram_id: '999',
            first_name: 'Jane',
          },
        ],
      });

      await sendExpirationReminders(mockBot);

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '999',
        expect.stringContaining('истекает сегодня'),
        expect.any(Object)
      );

      jest.useRealTimers();
    });

    it('should use default owner name when first_name is null', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockBot = {
        telegram: {
          sendMessage: jest.fn().mockResolvedValue({}),
        },
      };

      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Shop',
            tier: 'basic',
            next_payment_due: tomorrow,
            telegram_id: '555',
            first_name: null, // No first name
          },
        ],
      });

      await sendExpirationReminders(mockBot);

      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '555',
        expect.stringContaining('владелец'),
        expect.any(Object)
      );

      jest.useRealTimers();
    });

    it('should throw and release client on database error', async () => {
      const mockBot = { telegram: { sendMessage: jest.fn() } };
      const error = new Error('Database connection lost');

      mockClient.query.mockRejectedValueOnce(error);

      await expect(sendExpirationReminders(mockBot)).rejects.toThrow(
        'Database connection lost'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Subscription] Error sending expiration reminders:',
        error
      );
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('activatePromoSubscription', () => {
    it('should activate promo subscription successfully', async () => {
      const now = new Date('2024-01-15');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockUpdatedShop = {
        id: 1,
        tier: 'pro',
        subscription_status: 'active',
        is_active: true,
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // promo check - not used
        .mockResolvedValueOnce({ rows: [{ id: 1, tier: 'basic', owner_id: 123 }] }) // shop FOR UPDATE
        .mockResolvedValueOnce({}) // INSERT promo_activations
        .mockResolvedValueOnce({}) // INSERT shop_subscriptions
        .mockResolvedValueOnce({ rows: [mockUpdatedShop] }) // UPDATE shops RETURNING
        .mockResolvedValueOnce({}); // COMMIT

      const result = await activatePromoSubscription(1, 123, 'PROMO2024');

      expect(result).toEqual(mockUpdatedShop);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should throw error if promo already used', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // promo already exists

      await expect(activatePromoSubscription(1, 123, 'PROMO2024')).rejects.toThrow(
        'Promo code already used by this user'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error if shop not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // promo not used
        .mockResolvedValueOnce({ rows: [] }); // shop not found

      await expect(activatePromoSubscription(999, 123, 'PROMO2024')).rejects.toThrow(
        'Shop not found'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw error if user does not own shop', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // promo not used
        .mockResolvedValueOnce({ rows: [{ id: 1, tier: 'basic', owner_id: 999 }] }); // different owner

      await expect(activatePromoSubscription(1, 123, 'PROMO2024')).rejects.toThrow(
        'User does not own this shop'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should rollback and release client on database error', async () => {
      const error = new Error('Insert failed');

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // promo check
        .mockResolvedValueOnce({ rows: [{ id: 1, tier: 'basic', owner_id: 123 }] })
        .mockRejectedValueOnce(error); // Error on INSERT

      await expect(activatePromoSubscription(1, 123, 'PROMO2024')).rejects.toThrow(
        'Insert failed'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle rollback error gracefully', async () => {
      const insertError = new Error('Insert failed');
      const rollbackError = new Error('Rollback failed');

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // promo check
        .mockResolvedValueOnce({ rows: [{ id: 1, tier: 'basic', owner_id: 123 }] })
        .mockRejectedValueOnce(insertError) // Error on INSERT
        .mockRejectedValueOnce(rollbackError); // Rollback also fails

      await expect(activatePromoSubscription(1, 123, 'PROMO2024')).rejects.toThrow(
        'Insert failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Subscription] Promo rollback error:',
        rollbackError
      );
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ==================== EXPORTS ====================

  describe('Module exports', () => {
    it('should export SUBSCRIPTION_PRICES', () => {
      expect(SUBSCRIPTION_PRICES).toEqual({ basic: 25.0, pro: 35.0 });
    });

    it('should export GRACE_PERIOD_DAYS', () => {
      expect(GRACE_PERIOD_DAYS).toBe(2);
    });
  });
});
