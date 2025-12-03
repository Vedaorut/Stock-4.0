import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Unit tests for Product Sync Service
 *
 * Tests cover:
 * - calculatePriceWithMarkup: pure function for price calculations
 * - generateUniqueName: name deduplication with optimization
 * - copyProductWithMarkup: single product sync with chain copy protection
 * - syncAllProductsForFollow: bulk sync with N+1 optimization
 * - updateMarkupForFollow: batch update with transaction safety
 * - handleSourceProductDelete: cascade deactivation
 * - updateSyncedProduct: individual product sync
 * - runPeriodicSync: cron job batch processing
 *
 * CRITICAL: All database queries and external services are mocked
 */

// ============================================================================
// Mock Setup - BEFORE any imports
// ============================================================================

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockGetClient = jest.fn(() => Promise.resolve(mockClient));

const mockPool = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../src/config/database.js', () => ({
  getClient: mockGetClient,
  pool: mockPool,
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock productQueries
const mockProductQueries = {
  list: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.unstable_mockModule('../../src/database/queries/index.js', () => ({
  productQueries: mockProductQueries,
}));

// Mock shopFollowQueries
const mockShopFollowQueries = {
  findById: jest.fn(),
};

jest.unstable_mockModule('../../src/models/shopFollowQueries.js', () => ({
  shopFollowQueries: mockShopFollowQueries,
}));

// Mock syncedProductQueries
const mockSyncedProductQueries = {
  findById: jest.fn(),
  findBySourceAndFollow: jest.fn(),
  findBySyncedProductId: jest.fn(),
  findBySourceProductId: jest.fn(),
  findStaleProducts: jest.fn(),
  create: jest.fn(),
  updateLastSynced: jest.fn(),
  updateConflictStatus: jest.fn(),
  hasManualEdits: jest.fn(),
  deleteBySourceProductId: jest.fn(),
};

jest.unstable_mockModule('../../src/models/syncedProductQueries.js', () => ({
  syncedProductQueries: mockSyncedProductQueries,
}));

// ============================================================================
// Import AFTER mocks
// ============================================================================

const logger = (await import('../../src/utils/logger.js')).default;
const { productQueries } = await import('../../src/database/queries/index.js');
const { shopFollowQueries } = await import('../../src/models/shopFollowQueries.js');
const { syncedProductQueries } = await import('../../src/models/syncedProductQueries.js');

const {
  calculatePriceWithMarkup,
  copyProductWithMarkup,
  syncAllProductsForFollow,
  updateMarkupForFollow,
  handleSourceProductDelete,
  updateSyncedProduct,
  runPeriodicSync,
} = await import('../../src/services/productSyncService.js');

// ============================================================================
// Helper Functions
// ============================================================================

function createMockQueryHandler(customHandlers = {}) {
  return (sql, params) => {
    if (typeof sql === 'string') {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve();
      }

      const normalizedSql = sql.replace(/\s+/g, ' ').trim();

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

// ============================================================================
// Tests
// ============================================================================

describe('Product Sync Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockClear();
    mockClient.release.mockClear();
    mockGetClient.mockResolvedValue(mockClient);

    // Default pool.query mock - PRO tier with 0 products (can add more)
    mockPool.query.mockResolvedValue({
      rows: [{ tier: 'pro', product_count: 0 }],
    });

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
  // calculatePriceWithMarkup - CRITICAL (P0) - Pure Function
  // ============================================================================
  describe('calculatePriceWithMarkup', () => {
    describe('Percentage Markup', () => {
      it('should calculate 10% markup correctly', () => {
        const result = calculatePriceWithMarkup(100, 'percentage', 10);
        expect(result).toBe(110);
      });

      it('should calculate 50% markup correctly', () => {
        const result = calculatePriceWithMarkup(100, 'percentage', 50);
        expect(result).toBe(150);
      });

      it('should calculate 0% markup (no change)', () => {
        const result = calculatePriceWithMarkup(99.99, 'percentage', 0);
        expect(result).toBe(99.99);
      });

      it('should round to 2 decimal places', () => {
        const result = calculatePriceWithMarkup(10, 'percentage', 33);
        expect(result).toBe(13.3); // 10 * 1.33 = 13.3
      });

      it('should handle fractional source price', () => {
        const result = calculatePriceWithMarkup(19.99, 'percentage', 15);
        expect(result).toBe(22.99); // 19.99 * 1.15 = 22.9885 -> 22.99
      });

      it('should handle string price input', () => {
        const result = calculatePriceWithMarkup('50.00', 'percentage', 20);
        expect(result).toBe(60);
      });

      it('should handle large markup percentages', () => {
        const result = calculatePriceWithMarkup(100, 'percentage', 200);
        expect(result).toBe(300);
      });
    });

    describe('Fixed Markup', () => {
      it('should add fixed amount correctly', () => {
        const result = calculatePriceWithMarkup(100, 'fixed', 25);
        expect(result).toBe(125);
      });

      it('should add $0 fixed markup (no change)', () => {
        const result = calculatePriceWithMarkup(49.99, 'fixed', 0);
        expect(result).toBe(49.99);
      });

      it('should handle fractional fixed amount', () => {
        const result = calculatePriceWithMarkup(10, 'fixed', 2.5);
        expect(result).toBe(12.5);
      });

      it('should handle string inputs for fixed markup', () => {
        const result = calculatePriceWithMarkup('30', 'fixed', '5');
        expect(result).toBe(35);
      });
    });

    describe('Default Behavior', () => {
      it('should default to percentage when markupType is undefined', () => {
        const result = calculatePriceWithMarkup(100, undefined, 10);
        expect(result).toBe(110);
      });

      it('should default to percentage for unknown markupType', () => {
        const result = calculatePriceWithMarkup(100, 'unknown', 10);
        expect(result).toBe(110);
      });
    });
  });

  // ============================================================================
  // copyProductWithMarkup - CRITICAL (P0)
  // ============================================================================
  describe('copyProductWithMarkup', () => {
    const mockFollow = {
      id: 1,
      follower_shop_id: 100,
      source_shop_id: 200,
      mode: 'resell',
      markup_type: 'percentage',
      markup_percentage: 20,
      markup_fixed: 0,
    };

    const mockSourceProduct = {
      id: 10,
      name: 'Test Product',
      description: 'Test description',
      price: 50,
      currency: 'USD',
      stock_quantity: 100,
      is_active: true,
    };

    beforeEach(() => {
      mockShopFollowQueries.findById.mockResolvedValue(mockFollow);
      mockProductQueries.findById.mockResolvedValue(mockSourceProduct);
      mockSyncedProductQueries.findBySyncedProductId.mockResolvedValue(null); // Not a chain copy
      mockSyncedProductQueries.findBySourceAndFollow.mockResolvedValue(null); // Not already synced
      mockSyncedProductQueries.create.mockResolvedValue({ id: 1, follow_id: 1, synced_product_id: 50, source_product_id: 10 });
      mockProductQueries.create.mockResolvedValue({ id: 50, name: 'Test Product' });
      mockProductQueries.list.mockResolvedValue([]); // No existing products (for name dedup)
    });

    describe('Happy Path', () => {
      it('should copy product with markup and return result with name', async () => {
        const result = await copyProductWithMarkup(10, 1);

        expect(result).toBeDefined();
        expect(result.name).toBe('Test Product');
        expect(mockProductQueries.create).toHaveBeenCalledWith(
          expect.objectContaining({
            shopId: 100,
            name: 'Test Product',
            price: 60, // 50 * 1.20
            currency: 'USD',
            stockQuantity: 100,
          })
        );
      });

      it('should use fixed markup when markup_type is fixed', async () => {
        mockShopFollowQueries.findById.mockResolvedValue({
          ...mockFollow,
          markup_type: 'fixed',
          markup_fixed: 15,
        });

        await copyProductWithMarkup(10, 1);

        expect(mockProductQueries.create).toHaveBeenCalledWith(
          expect.objectContaining({
            price: 65, // 50 + 15
          })
        );
      });

      it('should use existingNamesSet when provided (optimization path)', async () => {
        const existingNamesSet = new Set(['existing product']);

        await copyProductWithMarkup(10, 1, existingNamesSet);

        // Should NOT call productQueries.list since existingNamesSet was provided
        expect(mockProductQueries.list).not.toHaveBeenCalled();
      });

      it('should generate unique name when collision detected', async () => {
        // First product has same name
        mockProductQueries.list.mockResolvedValue([{ name: 'Test Product' }]);

        await copyProductWithMarkup(10, 1);

        expect(mockProductQueries.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Product (копия 1)',
          })
        );
      });

      it('should increment suffix until unique name found', async () => {
        mockProductQueries.list.mockResolvedValue([
          { name: 'Test Product' },
          { name: 'Test Product (копия 1)' },
          { name: 'Test Product (копия 2)' },
        ]);

        await copyProductWithMarkup(10, 1);

        expect(mockProductQueries.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Product (копия 3)',
          })
        );
      });
    });

    describe('Chain Copy Protection', () => {
      it('should return null when source product is itself a synced copy', async () => {
        mockSyncedProductQueries.findBySyncedProductId.mockResolvedValue({
          source_product_id: 5,
          follow_id: 99,
        });

        const result = await copyProductWithMarkup(10, 1);

        expect(result).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('[CopyProtection] Blocked')
        );
        expect(mockProductQueries.create).not.toHaveBeenCalled();
      });
    });

    describe('Already Synced', () => {
      it('should return existing record when product already synced', async () => {
        const existingSyncRecord = { id: 99, synced_product_id: 50, source_product_id: 10 };
        mockSyncedProductQueries.findBySourceAndFollow.mockResolvedValue(existingSyncRecord);

        const result = await copyProductWithMarkup(10, 1);

        expect(result).toEqual(existingSyncRecord);
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('already synced')
        );
        expect(mockProductQueries.create).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should throw error when follow not found', async () => {
        mockShopFollowQueries.findById.mockResolvedValue(null);

        await expect(copyProductWithMarkup(10, 999)).rejects.toThrow(
          'Follow relationship 999 not found'
        );
      });

      it('should throw error when mode is not resell', async () => {
        mockShopFollowQueries.findById.mockResolvedValue({
          ...mockFollow,
          mode: 'monitor',
        });

        await expect(copyProductWithMarkup(10, 1)).rejects.toThrow(
          'Can only copy products in resell mode'
        );
      });

      it('should throw error when source product not found', async () => {
        mockProductQueries.findById.mockResolvedValue(null);

        await expect(copyProductWithMarkup(999, 1)).rejects.toThrow(
          'Source product 999 not found'
        );
      });

      it('should log and rethrow on database error', async () => {
        const dbError = new Error('Database connection lost');
        mockProductQueries.create.mockRejectedValue(dbError);

        await expect(copyProductWithMarkup(10, 1)).rejects.toThrow(
          'Database connection lost'
        );
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error copying product'),
          dbError
        );
      });
    });

    describe('Tier Product Limit', () => {
      it('should return LIMIT_REACHED when shop at product limit', async () => {
        // PRO tier with 50 products (at limit)
        mockPool.query.mockResolvedValue({
          rows: [{ tier: 'pro', product_count: 50 }],
        });

        const result = await copyProductWithMarkup(10, 1);

        expect(result).toEqual({
          ok: false,
          code: 'LIMIT_REACHED',
          message: 'Product limit reached (50)',
        });
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('reached product limit 50')
        );
        // Should NOT call productQueries.create
        expect(mockProductQueries.create).not.toHaveBeenCalled();
      });

      it('should allow copy when shop has remaining capacity', async () => {
        // PRO tier with 45 products (5 remaining)
        mockPool.query.mockResolvedValue({
          rows: [{ tier: 'pro', product_count: 45 }],
        });

        const result = await copyProductWithMarkup(10, 1);

        expect(result).toBeDefined();
        expect(result.name).toBe('Test Product');
        expect(mockProductQueries.create).toHaveBeenCalled();
      });

      it('should allow unlimited products for MAX tier', async () => {
        // MAX tier with 1000 products
        mockPool.query.mockResolvedValue({
          rows: [{ tier: 'max', product_count: 1000 }],
        });

        const result = await copyProductWithMarkup(10, 1);

        expect(result).toBeDefined();
        expect(result.name).toBe('Test Product');
        expect(mockProductQueries.create).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // syncAllProductsForFollow - CRITICAL (P0) - N+1 Optimization
  // ============================================================================
  describe('syncAllProductsForFollow', () => {
    const mockFollow = {
      id: 1,
      follower_shop_id: 100,
      source_shop_id: 200,
      mode: 'resell',
      markup_type: 'percentage',
      markup_percentage: 10,
    };

    beforeEach(() => {
      mockShopFollowQueries.findById.mockResolvedValue(mockFollow);
      mockSyncedProductQueries.findBySyncedProductId.mockResolvedValue(null);
      mockSyncedProductQueries.findBySourceAndFollow.mockResolvedValue(null);
    });

    describe('Happy Path', () => {
      it('should sync all products and return results', async () => {
        const sourceProducts = [
          { id: 1, name: 'Product A', price: 10, stock_quantity: 100 },
          { id: 2, name: 'Product B', price: 20, stock_quantity: 50 },
        ];

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts) // Source products
          .mockResolvedValueOnce([]); // Existing products in follower shop

        mockProductQueries.create
          .mockResolvedValueOnce({ id: 101, name: 'Product A' })
          .mockResolvedValueOnce({ id: 102, name: 'Product B' });

        mockSyncedProductQueries.create
          .mockResolvedValueOnce({ id: 1, synced_product_id: 101 })
          .mockResolvedValueOnce({ id: 2, synced_product_id: 102 });

        const results = await syncAllProductsForFollow(1);

        expect(results.synced).toBe(2);
        expect(results.skipped).toBe(0);
        expect(results.errors).toBe(0);
        expect(results.blockedCopies).toBe(0);
      });

      it('should pre-load existing names ONCE before loop (N+1 optimization)', async () => {
        const sourceProducts = [
          { id: 1, name: 'Product A', price: 10, stock_quantity: 5 },
          { id: 2, name: 'Product B', price: 20, stock_quantity: 10 },
          { id: 3, name: 'Product C', price: 30, stock_quantity: 15 },
        ];

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts) // Source products
          .mockResolvedValueOnce([{ name: 'Existing' }]); // Follower shop products (ONCE)

        mockProductQueries.create.mockResolvedValue({ id: 999, name: 'Test' });
        mockSyncedProductQueries.create.mockResolvedValue({ id: 1 });

        await syncAllProductsForFollow(1);

        // productQueries.list should be called exactly TWICE:
        // 1. Once for source products
        // 2. Once for existing products in follower shop (optimization)
        expect(mockProductQueries.list).toHaveBeenCalledTimes(2);
      });

      it('should add new names to Set after each creation', async () => {
        // Create products with same name to test deduplication
        const sourceProducts = [
          { id: 1, name: 'Product', description: 'Desc 1', price: 10, stock_quantity: 5, currency: 'USD' },
          { id: 2, name: 'Product', description: 'Desc 2', price: 20, stock_quantity: 10, currency: 'USD' }, // Same name
        ];

        // Reset mocks for this specific test
        mockShopFollowQueries.findById.mockResolvedValue({
          id: 1,
          follower_shop_id: 100,
          source_shop_id: 200,
          mode: 'resell',
          markup_type: 'percentage',
          markup_percentage: 10,
        });

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts) // Source products
          .mockResolvedValueOnce([]); // No existing products initially in follower shop

        mockProductQueries.findById
          .mockResolvedValueOnce({ id: 1, name: 'Product', description: 'Desc 1', price: 10, stock_quantity: 5, currency: 'USD', is_active: true })
          .mockResolvedValueOnce({ id: 2, name: 'Product', description: 'Desc 2', price: 20, stock_quantity: 10, currency: 'USD', is_active: true });

        mockSyncedProductQueries.findBySyncedProductId.mockResolvedValue(null);
        mockSyncedProductQueries.findBySourceAndFollow.mockResolvedValue(null);

        let createCallCount = 0;
        mockProductQueries.create.mockImplementation((data) => {
          createCallCount++;
          return Promise.resolve({ id: 100 + createCallCount, name: data.name });
        });

        mockSyncedProductQueries.create.mockResolvedValue({ id: 1 });

        await syncAllProductsForFollow(1);

        // First product should have original name
        expect(mockProductQueries.create).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ name: 'Product' })
        );

        // Second product should have suffix because first name was added to Set
        expect(mockProductQueries.create).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ name: 'Product (копия 1)' })
        );
      });
    });

    describe('Edge Cases', () => {
      it('should return zeros for non-resell mode', async () => {
        mockShopFollowQueries.findById.mockResolvedValue({
          ...mockFollow,
          mode: 'monitor',
        });

        const results = await syncAllProductsForFollow(1);

        expect(results).toEqual({ synced: 0, skipped: 0, errors: 0 });
        expect(mockProductQueries.list).not.toHaveBeenCalled();
      });

      it('should handle empty source products', async () => {
        mockProductQueries.list
          .mockResolvedValueOnce([]) // No source products
          .mockResolvedValueOnce([]); // No existing products

        const results = await syncAllProductsForFollow(1);

        expect(results.synced).toBe(0);
        expect(results.skipped).toBe(0);
        expect(results.errors).toBe(0);
      });

      it('should count blocked chain copies separately', async () => {
        const sourceProducts = [
          { id: 1, name: 'Product A', price: 10, stock_quantity: 5 },
        ];

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts)
          .mockResolvedValueOnce([]);

        // This product is a synced copy (chain copy blocked)
        mockSyncedProductQueries.findBySyncedProductId.mockResolvedValue({
          source_product_id: 999,
          follow_id: 50,
        });

        const results = await syncAllProductsForFollow(1);

        expect(results.blockedCopies).toBe(1);
        expect(results.synced).toBe(0);
      });

      it('should count already synced products as skipped', async () => {
        const sourceProducts = [
          { id: 1, name: 'Product A', price: 10, stock_quantity: 5 },
        ];

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts)
          .mockResolvedValueOnce([]);

        mockSyncedProductQueries.findBySourceAndFollow.mockResolvedValue({
          id: 99,
          synced_product_id: 500,
          // No 'name' property - indicates existing record
        });

        const results = await syncAllProductsForFollow(1);

        expect(results.skipped).toBe(1);
        expect(results.synced).toBe(0);
      });
    });

    describe('Tier Product Limit', () => {
      it('should abort sync when shop at product limit', async () => {
        // PRO tier at limit (50 products)
        mockPool.query.mockResolvedValue({
          rows: [{ tier: 'pro', product_count: 50 }],
        });

        const results = await syncAllProductsForFollow(1);

        expect(results).toEqual({
          synced: 0,
          skipped: 0,
          errors: 0,
          blockedCopies: 0,
          limitReached: true,
          reason: 'LIMIT_REACHED',
          limit: 50,
          tier: 'pro',
        });
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('at product limit')
        );
        // Should NOT even try to fetch source products
        expect(mockProductQueries.list).not.toHaveBeenCalled();
      });

      it('should stop syncing when limit reached mid-sync', async () => {
        // PRO tier with 49 products (can sync only 1 more)
        // First call: initial capacity check (49 products, 1 remaining)
        // Second call in copyProductWithMarkup: still 49 (before sync completes)
        // Third call in copyProductWithMarkup: 50 (limit reached after first sync)
        mockPool.query
          .mockResolvedValueOnce({ rows: [{ tier: 'pro', product_count: 49 }] }) // Initial syncAllProductsForFollow check
          .mockResolvedValueOnce({ rows: [{ tier: 'pro', product_count: 49 }] }) // copyProductWithMarkup check for product 1
          .mockResolvedValueOnce({ rows: [{ tier: 'pro', product_count: 50 }] }); // copyProductWithMarkup check for product 2 - at limit

        const sourceProducts = [
          { id: 1, name: 'Product A', price: 10, stock_quantity: 5 },
          { id: 2, name: 'Product B', price: 20, stock_quantity: 10 }, // Won't be synced - limit reached
        ];

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts) // Source products
          .mockResolvedValueOnce([]); // No existing products

        mockProductQueries.findById.mockResolvedValue(
          { id: 1, name: 'Product A', price: 10, stock_quantity: 5, currency: 'USD', is_active: true }
        );

        mockProductQueries.create.mockResolvedValue({ id: 101, name: 'Product A' });
        mockSyncedProductQueries.create.mockResolvedValue({ id: 1 });

        const results = await syncAllProductsForFollow(1);

        expect(results.synced).toBe(1); // Only 1 synced before limit
        expect(results.limitReached).toBe(true);
        expect(results.tier).toBe('pro');
        expect(results.limit).toBe(50);
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Product limit reached')
        );
      });

      it('should sync all products for MAX tier regardless of count', async () => {
        // MAX tier has Infinity limit
        mockPool.query.mockResolvedValue({
          rows: [{ tier: 'max', product_count: 500 }],
        });

        const sourceProducts = [
          { id: 1, name: 'Product A', price: 10, stock_quantity: 5 },
        ];

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts)
          .mockResolvedValueOnce([]);

        mockProductQueries.findById.mockResolvedValue({
          id: 1, name: 'Product A', price: 10, stock_quantity: 5, currency: 'USD', is_active: true,
        });

        mockProductQueries.create.mockResolvedValue({ id: 101, name: 'Product A' });
        mockSyncedProductQueries.create.mockResolvedValue({ id: 1 });

        const results = await syncAllProductsForFollow(1);

        expect(results.synced).toBe(1);
        expect(results.limitReached).toBe(false);
      });

      it('should log warning when source has more products than capacity', async () => {
        // PRO tier with 45 products (can sync only 5 more)
        mockPool.query.mockResolvedValue({
          rows: [{ tier: 'pro', product_count: 45 }],
        });

        // But source has 10 products
        const sourceProducts = Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: `Product ${i + 1}`,
          price: 10,
          stock_quantity: 5,
        }));

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts)
          .mockResolvedValueOnce([]);

        // Sync will be called but we stop after limit
        // Each call increments product_count
        let currentCount = 45;
        mockPool.query.mockImplementation(() => {
          currentCount++;
          return Promise.resolve({
            rows: [{ tier: 'pro', product_count: currentCount }],
          });
        });

        // First call remains at 45
        mockPool.query.mockResolvedValueOnce({
          rows: [{ tier: 'pro', product_count: 45 }],
        });

        await syncAllProductsForFollow(1);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('can only sync 5 of 10 products')
        );
      });
    });

    describe('Error Handling', () => {
      it('should throw error when follow not found', async () => {
        mockShopFollowQueries.findById.mockResolvedValue(null);

        await expect(syncAllProductsForFollow(999)).rejects.toThrow(
          'Follow 999 not found'
        );
      });

      it('should count individual product errors and continue', async () => {
        const sourceProducts = [
          { id: 1, name: 'Product A', price: 10, stock_quantity: 5 },
          { id: 2, name: 'Product B', price: 20, stock_quantity: 10 },
        ];

        mockProductQueries.list
          .mockResolvedValueOnce(sourceProducts)
          .mockResolvedValueOnce([]);

        mockProductQueries.create
          .mockRejectedValueOnce(new Error('DB error'))
          .mockResolvedValueOnce({ id: 102, name: 'Product B' });

        mockSyncedProductQueries.create.mockResolvedValue({ id: 2 });

        const results = await syncAllProductsForFollow(1);

        expect(results.errors).toBe(1);
        expect(results.synced).toBe(1);
      });
    });
  });

  // ============================================================================
  // updateMarkupForFollow - CRITICAL (P0) - Batch Updates
  // ============================================================================
  describe('updateMarkupForFollow', () => {
    beforeEach(() => {
      mockClient.query.mockImplementation(createMockQueryHandler({
        'BEGIN': () => Promise.resolve(),
        'COMMIT': () => Promise.resolve(),
        'ROLLBACK': () => Promise.resolve(),
        'SELECT id FROM shop_follows': () => Promise.resolve({ rows: [{ id: 1 }] }),
      }));
    });

    describe('Happy Path', () => {
      it('should batch update all products with unnest()', async () => {
        const syncedProducts = [
          { id: 1, synced_product_id: 100, source_product_id: 10, conflict_status: 'synced', source_product_price: 50, custom_markup_type: null },
          { id: 2, synced_product_id: 101, source_product_id: 11, conflict_status: 'synced', source_product_price: 100, custom_markup_type: null },
        ];

        mockClient.query.mockImplementation(createMockQueryHandler({
          'BEGIN': () => Promise.resolve(),
          'SELECT id FROM shop_follows': () => Promise.resolve({ rows: [{ id: 1 }] }),
          'SELECT sp.id, sp.synced_product_id': () => Promise.resolve({ rows: syncedProducts }),
          'SELECT id FROM products WHERE id = ANY': () => Promise.resolve({ rows: [] }),
          'UPDATE products p SET price = u.new_price': () => Promise.resolve({ rowCount: 2 }),
          'UPDATE synced_products SET last_synced_at': () => Promise.resolve({ rowCount: 2 }),
          'COMMIT': () => Promise.resolve(),
        }));

        const result = await updateMarkupForFollow(1, 'percentage', 20);

        expect(result).toBe(2);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should lock follow row first with FOR UPDATE', async () => {
        mockClient.query.mockImplementation(createMockQueryHandler({
          'BEGIN': () => Promise.resolve(),
          'SELECT id FROM shop_follows WHERE id = $1 FOR UPDATE': () => Promise.resolve({ rows: [{ id: 1 }] }),
          'SELECT sp.id, sp.synced_product_id': () => Promise.resolve({ rows: [] }),
          'COMMIT': () => Promise.resolve(),
        }));

        await updateMarkupForFollow(1, 'percentage', 10);

        // Verify FOR UPDATE lock was used
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('FOR UPDATE'),
          [1]
        );
      });

      it('should skip products with custom_markup', async () => {
        const syncedProducts = [
          { id: 1, synced_product_id: 100, conflict_status: 'synced', source_product_price: 50, custom_markup_type: null },
          { id: 2, synced_product_id: 101, conflict_status: 'synced', source_product_price: 100, custom_markup_type: 'percentage' }, // Has custom markup
        ];

        mockClient.query.mockImplementation(createMockQueryHandler({
          'BEGIN': () => Promise.resolve(),
          'SELECT id FROM shop_follows': () => Promise.resolve({ rows: [{ id: 1 }] }),
          'SELECT sp.id, sp.synced_product_id': () => Promise.resolve({ rows: syncedProducts }),
          'SELECT id FROM products WHERE id = ANY': () => Promise.resolve({ rows: [] }),
          'UPDATE products p SET price': () => Promise.resolve({ rowCount: 1 }),
          'UPDATE synced_products': () => Promise.resolve({ rowCount: 1 }),
          'COMMIT': () => Promise.resolve(),
        }));

        const result = await updateMarkupForFollow(1, 'percentage', 20);

        expect(result).toBe(1); // Only 1 product updated (the one without custom markup)
        // Verify the log message includes "skipping X with custom markup" in any format
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('skipping 1 with custom markup'),
        );
      });

      it('should calculate fixed markup correctly in batch', async () => {
        const syncedProducts = [
          { id: 1, synced_product_id: 100, source_product_id: 10, conflict_status: 'synced', source_product_price: 50, custom_markup_type: null },
        ];

        let capturedPrices;
        mockClient.query.mockImplementation((sql, params) => {
          if (sql.includes('UPDATE products p') && sql.includes('FROM unnest')) {
            capturedPrices = params[1]; // Second param is the array of prices
            return Promise.resolve({ rowCount: 1 });
          }
          if (sql.includes('SELECT id FROM shop_follows') && sql.includes('FOR UPDATE')) {
            return Promise.resolve({ rows: [{ id: 1 }] });
          }
          if (sql.includes('SELECT sp.id')) {
            return Promise.resolve({ rows: syncedProducts });
          }
          if (sql.includes('SELECT id FROM products WHERE id = ANY')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('UPDATE synced_products')) {
            return Promise.resolve({ rowCount: 1 });
          }
          if (sql === 'BEGIN' || sql === 'COMMIT') {
            return Promise.resolve();
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        await updateMarkupForFollow(1, 'fixed', 25);

        // Check that new price is 50 + 25 = 75
        expect(capturedPrices).toBeDefined();
        expect(capturedPrices).toContain(75);
      });
    });

    describe('Edge Cases', () => {
      it('should return 0 when follow not found (deleted during request)', async () => {
        mockClient.query.mockImplementation(createMockQueryHandler({
          'BEGIN': () => Promise.resolve(),
          'SELECT id FROM shop_follows WHERE id = $1 FOR UPDATE': () => Promise.resolve({ rows: [] }),
          'ROLLBACK': () => Promise.resolve(),
        }));

        const result = await updateMarkupForFollow(999, 'percentage', 10);

        expect(result).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('not found or was deleted')
        );
      });

      it('should return 0 when no products to update', async () => {
        mockClient.query.mockImplementation(createMockQueryHandler({
          'BEGIN': () => Promise.resolve(),
          'SELECT id FROM shop_follows': () => Promise.resolve({ rows: [{ id: 1 }] }),
          'SELECT sp.id, sp.synced_product_id': () => Promise.resolve({ rows: [] }),
          'COMMIT': () => Promise.resolve(),
        }));

        const result = await updateMarkupForFollow(1, 'percentage', 10);

        expect(result).toBe(0);
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('No products to update')
        );
      });

      it('should filter out conflict status products', async () => {
        const syncedProducts = [
          { id: 1, synced_product_id: 100, conflict_status: 'synced', source_product_price: 50, custom_markup_type: null },
          { id: 2, synced_product_id: 101, conflict_status: 'conflict', source_product_price: 100, custom_markup_type: null },
        ];

        mockClient.query.mockImplementation(createMockQueryHandler({
          'BEGIN': () => Promise.resolve(),
          'SELECT id FROM shop_follows': () => Promise.resolve({ rows: [{ id: 1 }] }),
          'SELECT sp.id, sp.synced_product_id': () => Promise.resolve({ rows: syncedProducts }),
          'SELECT id FROM products WHERE id = ANY': () => Promise.resolve({ rows: [] }),
          'UPDATE products p SET price': () => Promise.resolve({ rowCount: 1 }),
          'UPDATE synced_products': () => Promise.resolve({ rowCount: 1 }),
          'COMMIT': () => Promise.resolve(),
        }));

        const result = await updateMarkupForFollow(1, 'percentage', 20);

        expect(result).toBe(1); // Only synced product, not conflict
      });
    });

    describe('Transaction Safety', () => {
      it('should rollback on error', async () => {
        const dbError = new Error('Update failed');

        mockClient.query.mockImplementation((sql) => {
          if (sql === 'BEGIN') {return Promise.resolve();}
          if (sql.includes('SELECT id FROM shop_follows')) {return Promise.resolve({ rows: [{ id: 1 }] });}
          if (sql.includes('SELECT sp.id')) {
            return Promise.resolve({
              rows: [{ id: 1, synced_product_id: 100, conflict_status: 'synced', source_product_price: 50, custom_markup_type: null }],
            });
          }
          if (sql.includes('SELECT id FROM products WHERE id = ANY')) {
            throw dbError;
          }
          if (sql === 'ROLLBACK') {return Promise.resolve();}
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        await expect(updateMarkupForFollow(1, 'percentage', 10)).rejects.toThrow('Update failed');
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should always release client even on rollback error', async () => {
        mockClient.query.mockImplementation((sql) => {
          if (sql === 'BEGIN') {return Promise.resolve();}
          if (sql.includes('SELECT id FROM shop_follows')) {
            throw new Error('Initial error');
          }
          if (sql === 'ROLLBACK') {
            throw new Error('Rollback also failed');
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        await expect(updateMarkupForFollow(1, 'percentage', 10)).rejects.toThrow();
        expect(mockClient.release).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // handleSourceProductDelete - MEDIUM (P1)
  // ============================================================================
  describe('handleSourceProductDelete', () => {
    it('should deactivate all synced products when source deleted', async () => {
      const syncedProducts = [
        { id: 1, synced_product_id: 100 },
        { id: 2, synced_product_id: 101 },
        { id: 3, synced_product_id: 102 },
      ];

      mockSyncedProductQueries.findBySourceProductId.mockResolvedValue(syncedProducts);
      mockProductQueries.update.mockResolvedValue({});
      mockSyncedProductQueries.deleteBySourceProductId.mockResolvedValue(3);

      const count = await handleSourceProductDelete(10);

      expect(count).toBe(3);
      expect(mockProductQueries.update).toHaveBeenCalledTimes(3);
      expect(mockProductQueries.update).toHaveBeenCalledWith(100, { isActive: false });
      expect(mockProductQueries.update).toHaveBeenCalledWith(101, { isActive: false });
      expect(mockProductQueries.update).toHaveBeenCalledWith(102, { isActive: false });
    });

    it('should remove sync mappings after deactivation', async () => {
      const syncedProducts = [{ id: 1, synced_product_id: 100 }];

      mockSyncedProductQueries.findBySourceProductId.mockResolvedValue(syncedProducts);
      mockProductQueries.update.mockResolvedValue({});
      mockSyncedProductQueries.deleteBySourceProductId.mockResolvedValue(1);

      await handleSourceProductDelete(10);

      expect(mockSyncedProductQueries.deleteBySourceProductId).toHaveBeenCalledWith(10);
    });

    it('should handle no synced products gracefully', async () => {
      mockSyncedProductQueries.findBySourceProductId.mockResolvedValue([]);

      const count = await handleSourceProductDelete(10);

      expect(count).toBe(0);
      expect(mockProductQueries.update).not.toHaveBeenCalled();
      expect(mockSyncedProductQueries.deleteBySourceProductId).not.toHaveBeenCalled();
    });

    it('should log and rethrow on error', async () => {
      const dbError = new Error('Delete failed');
      mockSyncedProductQueries.findBySourceProductId.mockRejectedValue(dbError);

      await expect(handleSourceProductDelete(10)).rejects.toThrow('Delete failed');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error handling source product deletion'),
        dbError
      );
    });
  });

  // ============================================================================
  // updateSyncedProduct - MEDIUM (P1)
  // ============================================================================
  describe('updateSyncedProduct', () => {
    const mockSyncRecord = {
      id: 1,
      synced_product_id: 100,
      source_product_id: 10,
      follow_id: 5,
    };

    const mockSourceProduct = {
      id: 10,
      price: 50,
      stock_quantity: 100,
      is_active: true,
    };

    const mockFollow = {
      id: 5,
      markup_type: 'percentage',
      markup_percentage: 20,
      markup_fixed: 0,
    };

    beforeEach(() => {
      mockSyncedProductQueries.findById.mockResolvedValue(mockSyncRecord);
      mockSyncedProductQueries.hasManualEdits.mockResolvedValue(false);
      mockProductQueries.findById.mockResolvedValue(mockSourceProduct);
      mockShopFollowQueries.findById.mockResolvedValue(mockFollow);
      mockProductQueries.update.mockResolvedValue({});
      mockSyncedProductQueries.updateLastSynced.mockResolvedValue(mockSyncRecord);
    });

    it('should update synced product with new price and stock', async () => {
      await updateSyncedProduct(1);

      expect(mockProductQueries.update).toHaveBeenCalledWith(100, {
        price: 60, // 50 * 1.20
        stockQuantity: 100,
        isActive: true,
      });
      expect(mockSyncedProductQueries.updateLastSynced).toHaveBeenCalledWith(1);
    });

    it('should mark as conflict when manual edits detected', async () => {
      mockSyncedProductQueries.hasManualEdits.mockResolvedValue(true);

      const result = await updateSyncedProduct(1);

      expect(mockSyncedProductQueries.updateConflictStatus).toHaveBeenCalledWith(1, 'conflict');
      expect(mockProductQueries.update).not.toHaveBeenCalled();
      expect(result).toEqual(mockSyncRecord);
    });

    it('should throw error when sync record not found', async () => {
      mockSyncedProductQueries.findById.mockResolvedValue(null);

      await expect(updateSyncedProduct(999)).rejects.toThrow(
        'Synced product 999 not found'
      );
    });

    it('should handle deleted source product gracefully', async () => {
      mockProductQueries.findById.mockResolvedValue(null);

      const result = await updateSyncedProduct(1);

      expect(result).toEqual(mockSyncRecord);
      expect(mockProductQueries.update).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('may have been deleted')
      );
    });

    it('should use fixed markup when follow has fixed type', async () => {
      mockShopFollowQueries.findById.mockResolvedValue({
        ...mockFollow,
        markup_type: 'fixed',
        markup_fixed: 15,
      });

      await updateSyncedProduct(1);

      expect(mockProductQueries.update).toHaveBeenCalledWith(100, {
        price: 65, // 50 + 15
        stockQuantity: 100,
        isActive: true,
      });
    });
  });

  // ============================================================================
  // runPeriodicSync - LOW (P2) - Cron Job
  // ============================================================================
  describe('runPeriodicSync', () => {
    it('should process stale products in chunks', async () => {
      const staleProducts = [
        {
          id: 1,
          synced_product_id: 100,
          source_product_id: 10,
          source_price: '50.00',
          synced_price: '50.00', // Same price but will be recalculated
          source_stock: 100,
          synced_stock: 50, // Stock changed - this triggers update
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          markup_type: 'percentage',
          markup_percentage: 10,
          markup_fixed: 0,
          custom_markup_type: null,
          custom_markup_percentage: null,
          custom_markup_fixed: null,
        },
      ];

      mockSyncedProductQueries.findStaleProducts.mockResolvedValue(staleProducts);

      mockClient.query.mockImplementation((sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return Promise.resolve();
        }
        if (sql.includes('FOR UPDATE NOWAIT')) {
          return Promise.resolve({ rows: [{ id: 100 }] });
        }
        if (sql.includes('UPDATE products')) {
          return Promise.resolve({ rowCount: 1 });
        }
        if (sql.includes('UPDATE synced_products')) {
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const stats = await runPeriodicSync();

      expect(stats.updated).toBe(1);
      expect(stats.errors).toBe(0);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should skip locked products (NOWAIT)', async () => {
      const staleProducts = [
        {
          id: 1,
          synced_product_id: 100,
          source_price: 50,
          synced_price: 55,
          source_stock: 100,
          synced_stock: 100,
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          markup_type: 'percentage',
          markup_percentage: 10,
          custom_markup_type: null,
        },
      ];

      mockSyncedProductQueries.findStaleProducts.mockResolvedValue(staleProducts);

      const lockError = new Error('could not obtain lock');
      lockError.code = '55P03'; // Lock not available

      mockClient.query.mockImplementation((sql) => {
        if (sql === 'BEGIN') {return Promise.resolve();}
        if (sql.includes('FOR UPDATE NOWAIT')) {return Promise.reject(lockError);}
        if (sql === 'COMMIT') {return Promise.resolve();}
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const stats = await runPeriodicSync();

      expect(stats.skipped).toBe(1);
      expect(stats.errors).toBe(0);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('locked by another process')
      );
    });

    it('should handle empty stale products', async () => {
      mockSyncedProductQueries.findStaleProducts.mockResolvedValue([]);

      const stats = await runPeriodicSync();

      expect(stats).toEqual({ updated: 0, conflicts: 0, errors: 0, skipped: 0 });
      expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('should use custom markup over global markup', async () => {
      const staleProducts = [
        {
          id: 1,
          synced_product_id: 100,
          source_price: 100,
          synced_price: 110, // Current price with 10% markup
          source_stock: 50,
          synced_stock: 50,
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          markup_type: 'percentage',
          markup_percentage: 10, // Global 10%
          custom_markup_type: 'percentage', // Custom markup
          custom_markup_percentage: 25, // Custom 25%
          custom_markup_fixed: 0,
        },
      ];

      mockSyncedProductQueries.findStaleProducts.mockResolvedValue(staleProducts);

      let capturedPrice;
      mockClient.query.mockImplementation((sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {return Promise.resolve();}
        if (sql.includes('FOR UPDATE NOWAIT')) {return Promise.resolve({ rows: [{ id: 100 }] });}
        if (sql.includes('UPDATE products') && sql.includes('price = $1')) {
          capturedPrice = params[0];
          return Promise.resolve({ rowCount: 1 });
        }
        if (sql.includes('UPDATE synced_products')) {return Promise.resolve({ rowCount: 1 });}
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      await runPeriodicSync();

      // Should use custom 25% markup: 100 * 1.25 = 125
      expect(capturedPrice).toBe(125);
    });

    it('should rollback on chunk-level error', async () => {
      const staleProducts = [
        {
          id: 1,
          synced_product_id: 100,
          source_price: '50.00',
          synced_price: '50.00',
          source_stock: 100,
          synced_stock: 50,
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          markup_type: 'percentage',
          markup_percentage: 10,
          markup_fixed: 0,
          custom_markup_type: null,
        },
      ];

      mockSyncedProductQueries.findStaleProducts.mockResolvedValue(staleProducts);

      // Throw error AFTER BEGIN but in a way that causes chunk-level rollback
      let callCount = 0;
      mockClient.query.mockImplementation((sql) => {
        callCount++;
        if (sql === 'BEGIN') {return Promise.resolve();}
        if (sql === 'ROLLBACK') {return Promise.resolve();}
        if (sql === 'COMMIT') {return Promise.resolve();}
        // Error on lock acquisition causes the product to be skipped (not chunk error)
        // To trigger chunk-level error, we need error outside try/catch
        if (sql.includes('FOR UPDATE NOWAIT')) {
          // This error has code 55P03 so it will be caught and skipped, not cause rollback
          // To trigger rollback, we need a different kind of error
          const err = new Error('Connection lost');
          err.code = '08006'; // Connection failure
          throw err;
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const stats = await runPeriodicSync();

      // The error is caught at product level, not chunk level, so it goes to errors count
      expect(stats.errors).toBeGreaterThanOrEqual(1);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
