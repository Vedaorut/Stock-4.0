/**
 * Unit Tests for Product Sync Service
 * Financial-critical service - comprehensive coverage required
 */

import { jest } from '@jest/globals';

// Mock ALL dependencies BEFORE imports
jest.unstable_mockModule('../../database/queries/index.js', () => ({
  productQueries: {
    findById: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.unstable_mockModule('../../models/shopFollowQueries.js', () => ({
  shopFollowQueries: {
    findById: jest.fn(),
  },
}));

jest.unstable_mockModule('../../models/syncedProductQueries.js', () => ({
  syncedProductQueries: {
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
  },
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  getClient: jest.fn(),
  pool: {
    query: jest.fn(),
  },
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Dynamic imports AFTER mocks
const { productQueries } = await import('../../database/queries/index.js');
const { shopFollowQueries } = await import('../../models/shopFollowQueries.js');
const { syncedProductQueries } = await import('../../models/syncedProductQueries.js');
const { getClient, pool } = await import('../../config/database.js');
const logger = (await import('../../utils/logger.js')).default;

const {
  calculatePriceWithMarkup,
  copyProductWithMarkup,
  updateSyncedProduct,
  handleSourceProductDelete,
  syncAllProductsForFollow,
  updateMarkupForFollow,
  runPeriodicSync,
} = await import('../productSyncService.js');

describe('Product Sync Service', () => {
  // Mock client setup for transaction tests
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock client for each test
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    getClient.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    // Reset pool.query mock - default to PRO tier with 0 products (can add more)
    pool.query.mockResolvedValue({
      rows: [{ tier: 'pro', product_count: 0 }],
    });
  });

  describe('calculatePriceWithMarkup', () => {
    it('should calculate percentage markup correctly', () => {
      const result = calculatePriceWithMarkup(100, 'percentage', 10);
      expect(result).toBe(110);
    });

    it('should calculate fixed markup correctly', () => {
      const result = calculatePriceWithMarkup(100, 'fixed', 10);
      expect(result).toBe(110);
    });

    it('should round to 2 decimal places', () => {
      const result = calculatePriceWithMarkup(99.99, 'percentage', 10);
      expect(result).toBe(109.99);
    });

    it('should handle zero price', () => {
      const result = calculatePriceWithMarkup(0, 'percentage', 10);
      expect(result).toBe(0);
    });

    it('should handle zero markup', () => {
      const result = calculatePriceWithMarkup(100, 'percentage', 0);
      expect(result).toBe(100);
    });

    it('should handle large values without precision loss', () => {
      const result = calculatePriceWithMarkup(9999.99, 'percentage', 15);
      expect(result).toBe(11499.99);
    });

    it('should handle decimal prices with percentage markup', () => {
      const result = calculatePriceWithMarkup(19.99, 'percentage', 20);
      expect(result).toBe(23.99);
    });

    it('should handle decimal prices with fixed markup', () => {
      const result = calculatePriceWithMarkup(19.99, 'fixed', 5.50);
      expect(result).toBe(25.49);
    });

    it('should round fractional cents correctly', () => {
      const result = calculatePriceWithMarkup(33.33, 'percentage', 10);
      expect(result).toBe(36.66); // 33.33 * 1.1 = 36.663 → 36.66
    });
  });

  describe('copyProductWithMarkup', () => {
    const mockFollow = {
      id: 1,
      source_shop_id: 10,
      follower_shop_id: 20,
      mode: 'resell',
      markup_type: 'percentage',
      markup_percentage: 15,
      markup_fixed: null,
    };

    const mockSourceProduct = {
      id: 100,
      name: 'Test Product',
      description: 'Test description',
      price: 100,
      currency: 'USD',
      stock_quantity: 50,
      is_active: true,
    };

    it('should copy product with percentage markup successfully', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);
      productQueries.findById.mockResolvedValue(mockSourceProduct);
      syncedProductQueries.findBySyncedProductId.mockResolvedValue(null);
      syncedProductQueries.findBySourceAndFollow.mockResolvedValue(null);
      productQueries.list.mockResolvedValue([]); // No name collisions

      const mockCreatedProduct = { id: 200, ...mockSourceProduct, price: 115 };
      productQueries.create.mockResolvedValue(mockCreatedProduct);

      const mockSyncRecord = {
        id: 1,
        follow_id: 1,
        synced_product_id: 200,
        source_product_id: 100,
      };
      syncedProductQueries.create.mockResolvedValue(mockSyncRecord);

      const result = await copyProductWithMarkup(100, 1);

      // Result includes name for tracking new products in syncAllProductsForFollow
      expect(result).toEqual({ ...mockSyncRecord, name: 'Test Product' });
      expect(shopFollowQueries.findById).toHaveBeenCalledWith(1);
      expect(productQueries.findById).toHaveBeenCalledWith(100);
      expect(syncedProductQueries.findBySyncedProductId).toHaveBeenCalledWith(100);
      expect(syncedProductQueries.findBySourceAndFollow).toHaveBeenCalledWith(100, 1);
      expect(productQueries.create).toHaveBeenCalledWith({
        shopId: 20,
        name: 'Test Product',
        description: 'Test description',
        price: 115, // 100 * 1.15
        currency: 'USD',
        stockQuantity: 50,
      });
      // syncedProductId should be mockCreatedProduct.id (200), not sourceProductId
      expect(syncedProductQueries.create).toHaveBeenCalledWith({
        followId: 1,
        syncedProductId: mockCreatedProduct.id,
        sourceProductId: 100,
      });
    });

    it('should throw error when follow not found', async () => {
      shopFollowQueries.findById.mockResolvedValue(null);

      await expect(copyProductWithMarkup(100, 999)).rejects.toThrow(
        'Follow relationship 999 not found'
      );

      expect(shopFollowQueries.findById).toHaveBeenCalledWith(999);
      expect(productQueries.findById).not.toHaveBeenCalled();
    });

    it('should throw error when follow mode is not resell', async () => {
      const nonResellFollow = { ...mockFollow, mode: 'observe' };
      shopFollowQueries.findById.mockResolvedValue(nonResellFollow);

      await expect(copyProductWithMarkup(100, 1)).rejects.toThrow(
        'Can only copy products in resell mode'
      );

      expect(productQueries.findById).not.toHaveBeenCalled();
    });

    it('should throw error when source product not found', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);
      productQueries.findById.mockResolvedValue(null);

      await expect(copyProductWithMarkup(999, 1)).rejects.toThrow(
        'Source product 999 not found'
      );

      expect(syncedProductQueries.findBySyncedProductId).not.toHaveBeenCalled();
    });

    it('should return null when source product is already a synced copy (chain protection)', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);
      productQueries.findById.mockResolvedValue(mockSourceProduct);
      syncedProductQueries.findBySyncedProductId.mockResolvedValue({
        id: 10,
        source_product_id: 50,
        follow_id: 5,
      });

      const result = await copyProductWithMarkup(100, 1);

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[CopyProtection] Blocked: Product 100 is already a synced copy')
      );
      expect(syncedProductQueries.findBySourceAndFollow).not.toHaveBeenCalled();
      expect(productQueries.create).not.toHaveBeenCalled();
    });

    it('should return existing record when product already synced', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);
      productQueries.findById.mockResolvedValue(mockSourceProduct);
      syncedProductQueries.findBySyncedProductId.mockResolvedValue(null);

      const existingRecord = {
        id: 5,
        follow_id: 1,
        synced_product_id: 200,
        source_product_id: 100,
      };
      syncedProductQueries.findBySourceAndFollow.mockResolvedValue(existingRecord);

      const result = await copyProductWithMarkup(100, 1);

      expect(result).toEqual(existingRecord);
      expect(logger.info).toHaveBeenCalledWith(
        'Product 100 already synced to follow 1'
      );
      expect(productQueries.create).not.toHaveBeenCalled();
    });

    it('should use fixed markup when markup_type is fixed', async () => {
      const fixedMarkupFollow = {
        ...mockFollow,
        markup_type: 'fixed',
        markup_fixed: 25,
      };

      shopFollowQueries.findById.mockResolvedValue(fixedMarkupFollow);
      productQueries.findById.mockResolvedValue(mockSourceProduct);
      syncedProductQueries.findBySyncedProductId.mockResolvedValue(null);
      syncedProductQueries.findBySourceAndFollow.mockResolvedValue(null);
      productQueries.list.mockResolvedValue([]);

      const mockCreatedProduct = { id: 200, ...mockSourceProduct, price: 125 };
      productQueries.create.mockResolvedValue(mockCreatedProduct);

      const mockSyncRecord = {
        id: 1,
        follow_id: 1,
        synced_product_id: 200,
        source_product_id: 100,
      };
      syncedProductQueries.create.mockResolvedValue(mockSyncRecord);

      await copyProductWithMarkup(100, 1);

      expect(productQueries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 125, // 100 + 25
        })
      );
    });

    it('should generate unique name when name collision exists', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);
      productQueries.findById.mockResolvedValue(mockSourceProduct);
      syncedProductQueries.findBySyncedProductId.mockResolvedValue(null);
      syncedProductQueries.findBySourceAndFollow.mockResolvedValue(null);

      // Mock existing product with same name
      productQueries.list.mockResolvedValue([
        { name: 'Test Product' },
        { name: 'Test Product (копия 1)' },
      ]);

      const mockCreatedProduct = {
        id: 200,
        ...mockSourceProduct,
        name: 'Test Product (копия 2)',
        price: 115,
      };
      productQueries.create.mockResolvedValue(mockCreatedProduct);

      const mockSyncRecord = {
        id: 1,
        follow_id: 1,
        synced_product_id: 200,
        source_product_id: 100,
      };
      syncedProductQueries.create.mockResolvedValue(mockSyncRecord);

      await copyProductWithMarkup(100, 1);

      expect(productQueries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Product (копия 2)',
        })
      );
    });
  });

  describe('updateSyncedProduct', () => {
    const mockSyncRecord = {
      id: 1,
      follow_id: 10,
      synced_product_id: 200,
      source_product_id: 100,
    };

    const mockSourceProduct = {
      id: 100,
      price: 150,
      stock_quantity: 30,
      is_active: true,
    };

    const mockFollow = {
      id: 10,
      markup_type: 'percentage',
      markup_percentage: 10,
      markup_fixed: null,
    };

    it('should update synced product successfully', async () => {
      syncedProductQueries.findById.mockResolvedValue(mockSyncRecord);
      syncedProductQueries.hasManualEdits.mockResolvedValue(false);
      productQueries.findById.mockResolvedValue(mockSourceProduct);
      shopFollowQueries.findById.mockResolvedValue(mockFollow);

      const updatedSyncRecord = { ...mockSyncRecord, last_synced_at: new Date() };
      syncedProductQueries.findById
        .mockResolvedValueOnce(mockSyncRecord) // First call
        .mockResolvedValueOnce(updatedSyncRecord); // Second call after update

      const result = await updateSyncedProduct(1);

      expect(result).toEqual(updatedSyncRecord);
      expect(syncedProductQueries.hasManualEdits).toHaveBeenCalledWith(200);
      expect(productQueries.update).toHaveBeenCalledWith(200, {
        price: 165, // 150 * 1.1
        stockQuantity: 30,
        isActive: true,
      });
      expect(syncedProductQueries.updateLastSynced).toHaveBeenCalledWith(1);
    });

    it('should mark as conflict when manual edits detected', async () => {
      syncedProductQueries.findById.mockResolvedValue(mockSyncRecord);
      syncedProductQueries.hasManualEdits.mockResolvedValue(true);

      const result = await updateSyncedProduct(1);

      expect(result).toEqual(mockSyncRecord);
      expect(syncedProductQueries.updateConflictStatus).toHaveBeenCalledWith(1, 'conflict');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Manual edits detected on synced product 200')
      );
      expect(productQueries.update).not.toHaveBeenCalled();
    });

    it('should skip update when source product deleted', async () => {
      syncedProductQueries.findById.mockResolvedValue(mockSyncRecord);
      syncedProductQueries.hasManualEdits.mockResolvedValue(false);
      productQueries.findById.mockResolvedValue(null);

      const result = await updateSyncedProduct(1);

      expect(result).toEqual(mockSyncRecord);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Source product 100 not found, may have been deleted')
      );
      expect(productQueries.update).not.toHaveBeenCalled();
    });

    it('should throw error when synced product record not found', async () => {
      syncedProductQueries.findById.mockResolvedValue(null);

      await expect(updateSyncedProduct(999)).rejects.toThrow(
        'Synced product 999 not found'
      );

      expect(syncedProductQueries.hasManualEdits).not.toHaveBeenCalled();
    });
  });

  describe('handleSourceProductDelete', () => {
    it('should deactivate synced products and remove sync mappings', async () => {
      const mockSyncedProducts = [
        { id: 1, synced_product_id: 201, source_product_id: 100 },
        { id: 2, synced_product_id: 202, source_product_id: 100 },
        { id: 3, synced_product_id: 203, source_product_id: 100 },
      ];

      syncedProductQueries.findBySourceProductId.mockResolvedValue(mockSyncedProducts);

      const count = await handleSourceProductDelete(100);

      expect(count).toBe(3);
      expect(productQueries.update).toHaveBeenCalledTimes(3);
      expect(productQueries.update).toHaveBeenCalledWith(201, { isActive: false });
      expect(productQueries.update).toHaveBeenCalledWith(202, { isActive: false });
      expect(productQueries.update).toHaveBeenCalledWith(203, { isActive: false });
      expect(syncedProductQueries.deleteBySourceProductId).toHaveBeenCalledWith(100);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('deactivated 3 synced products and removed sync mappings')
      );
    });

    it('should handle zero synced products', async () => {
      syncedProductQueries.findBySourceProductId.mockResolvedValue([]);

      const count = await handleSourceProductDelete(100);

      expect(count).toBe(0);
      expect(productQueries.update).not.toHaveBeenCalled();
      expect(syncedProductQueries.deleteBySourceProductId).not.toHaveBeenCalled();
    });

    it('should throw error on database failure', async () => {
      syncedProductQueries.findBySourceProductId.mockRejectedValue(
        new Error('Database error')
      );

      await expect(handleSourceProductDelete(100)).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('syncAllProductsForFollow', () => {
    const mockFollow = {
      id: 1,
      source_shop_id: 10,
      follower_shop_id: 20,
      mode: 'resell',
      markup_type: 'percentage',
      markup_percentage: 10,
    };

    it('should sync all products successfully', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);

      const mockSourceProducts = [
        { id: 100, name: 'Product 1', is_active: true },
        { id: 101, name: 'Product 2', is_active: true },
        { id: 102, name: 'Product 3', is_active: true },
      ];
      productQueries.list.mockResolvedValue(mockSourceProducts);

      // Mock copyProductWithMarkup to succeed for all products
      shopFollowQueries.findById.mockResolvedValue(mockFollow);
      productQueries.findById.mockImplementation((id) => {
        return Promise.resolve({
          id,
          name: `Product ${id}`,
          price: 100,
          stock_quantity: 10,
          is_active: true,
        });
      });
      syncedProductQueries.findBySyncedProductId.mockResolvedValue(null);
      syncedProductQueries.findBySourceAndFollow.mockResolvedValue(null);
      productQueries.list.mockResolvedValueOnce(mockSourceProducts); // First call for source products
      productQueries.list.mockResolvedValue([]); // Subsequent calls for name collision check

      productQueries.create.mockImplementation((data) => {
        return Promise.resolve({ id: Math.random(), ...data });
      });
      syncedProductQueries.create.mockResolvedValue({ id: 1 });

      const results = await syncAllProductsForFollow(1);

      expect(results.synced).toBe(3);
      expect(results.skipped).toBe(0);
      expect(results.blockedCopies).toBe(0);
      expect(results.errors).toBe(0);
    });

    it('should count skipped products', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);

      const mockSourceProducts = [
        { id: 100, name: 'Product 1', is_active: true },
        { id: 101, name: 'Product 2', is_active: true },
      ];
      productQueries.list.mockResolvedValueOnce(mockSourceProducts);

      // Mock first product already synced, second product is new
      // BUG: When copyProductWithMarkup returns existing record,
      // syncAllProductsForFollow counts it as 'synced', not 'skipped'
      // This is a limitation in the current implementation
      productQueries.findById
        .mockResolvedValueOnce({ id: 100, name: 'Product 1', price: 100, stock_quantity: 10 })
        .mockResolvedValueOnce({ id: 101, name: 'Product 2', price: 100, stock_quantity: 10 });

      syncedProductQueries.findBySyncedProductId
        .mockResolvedValueOnce(null) // Product 100 not a copy
        .mockResolvedValueOnce(null); // Product 101 not a copy

      syncedProductQueries.findBySourceAndFollow
        .mockResolvedValueOnce({ id: 1 }) // Product 100 already synced (returns existing)
        .mockResolvedValueOnce(null); // Product 101 not synced yet

      productQueries.list.mockResolvedValue([]); // Name collision checks
      productQueries.create.mockResolvedValue({ id: 200, name: 'Product 2' });
      syncedProductQueries.create.mockResolvedValue({ id: 2 });

      const results = await syncAllProductsForFollow(1);

      // copyProductWithMarkup returns existing record for Product 100 (no name) → skipped
      // copyProductWithMarkup returns new record for Product 101 (with name) → synced
      expect(results.synced).toBe(1);  // Product 101 newly synced
      expect(results.skipped).toBe(1); // Product 100 already synced
    });

    it('should count blocked chain copies', async () => {
      shopFollowQueries.findById.mockResolvedValue(mockFollow);

      const mockSourceProducts = [
        { id: 100, name: 'Product 1', is_active: true },
      ];
      productQueries.list.mockResolvedValueOnce(mockSourceProducts);

      // Mock product is already a copy
      shopFollowQueries.findById.mockResolvedValue(mockFollow);
      productQueries.findById.mockResolvedValue({
        id: 100,
        name: 'Product 1',
        price: 100,
      });
      syncedProductQueries.findBySyncedProductId.mockResolvedValue({
        id: 10,
        source_product_id: 50,
      });

      const results = await syncAllProductsForFollow(1);

      expect(results.blockedCopies).toBe(1);
      expect(results.synced).toBe(0);
    });

    it('should count errors', async () => {
      // First call succeeds (for syncAllProductsForFollow itself)
      shopFollowQueries.findById.mockResolvedValueOnce(mockFollow);

      const mockSourceProducts = [
        { id: 100, name: 'Product 1', is_active: true },
      ];
      productQueries.list.mockResolvedValueOnce(mockSourceProducts);

      // Second call fails (inside copyProductWithMarkup called by Promise.all)
      shopFollowQueries.findById.mockRejectedValueOnce(new Error('Database error'));

      const results = await syncAllProductsForFollow(1);

      expect(results.errors).toBe(1);
      expect(results.synced).toBe(0);
    });

    it('should return zeros when follow not in resell mode', async () => {
      const observeFollow = { ...mockFollow, mode: 'observe' };
      shopFollowQueries.findById.mockResolvedValue(observeFollow);

      const results = await syncAllProductsForFollow(1);

      expect(results).toEqual({ synced: 0, skipped: 0, errors: 0 });
      expect(productQueries.list).not.toHaveBeenCalled();
    });

    it('should throw error when follow not found', async () => {
      shopFollowQueries.findById.mockResolvedValue(null);

      await expect(syncAllProductsForFollow(999)).rejects.toThrow('Follow 999 not found');
    });
  });

  describe('updateMarkupForFollow', () => {
    it('should update markup for all products in transaction', async () => {
      const mockFollowRow = { id: 1 };
      const mockSyncedProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          conflict_status: 'synced',
          custom_markup_type: null,
          source_product_price: 100,
        },
        {
          id: 2,
          synced_product_id: 202,
          source_product_id: 102,
          conflict_status: 'synced',
          custom_markup_type: null,
          source_product_price: 150,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockFollowRow] }) // SELECT FOR UPDATE (follow)
        .mockResolvedValueOnce({ rows: mockSyncedProducts }) // SELECT synced products
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE (product 1)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE product 1
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products 1
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE (product 2)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE product 2
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const count = await updateMarkupForFollow(1, 'percentage', 20);

      expect(count).toBe(2);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should skip products with custom markup', async () => {
      const mockFollowRow = { id: 1 };
      const mockSyncedProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          conflict_status: 'synced',
          custom_markup_type: 'fixed',
          custom_markup_fixed: 30,
          source_product_price: 100,
        },
        {
          id: 2,
          synced_product_id: 202,
          source_product_id: 102,
          conflict_status: 'synced',
          custom_markup_type: null,
          source_product_price: 150,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockFollowRow] }) // SELECT FOR UPDATE (follow)
        .mockResolvedValueOnce({ rows: mockSyncedProducts }) // SELECT synced products
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE (product 2 only)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE product 2
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const count = await updateMarkupForFollow(1, 'percentage', 20);

      expect(count).toBe(1); // Only 1 product updated (custom markup skipped)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('skipping 1 with custom markup')
      );
    });

    it('should return 0 when follow deleted during update (race condition)', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE returns empty (follow deleted)

      const count = await updateMarkupForFollow(999, 'percentage', 20);

      expect(count).toBe(0);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Follow 999 not found or was deleted')
      );
    });

    it('should rollback transaction on error', async () => {
      const mockFollowRow = { id: 1 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockFollowRow] }) // SELECT FOR UPDATE (follow)
        .mockRejectedValueOnce(new Error('Database error')); // SELECT synced products fails

      await expect(updateMarkupForFollow(1, 'percentage', 20)).rejects.toThrow(
        'Database error'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should skip conflict status products', async () => {
      const mockFollowRow = { id: 1 };
      const mockSyncedProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          conflict_status: 'conflict',
          custom_markup_type: null,
          source_product_price: 100,
        },
        {
          id: 2,
          synced_product_id: 202,
          source_product_id: 102,
          conflict_status: 'synced',
          custom_markup_type: null,
          source_product_price: 150,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockFollowRow] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: mockSyncedProducts }) // SELECT synced products
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE (product 2 only)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE product 2
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const count = await updateMarkupForFollow(1, 'percentage', 20);

      expect(count).toBe(1); // Only non-conflict product updated
    });

    it('should return 0 when no products to update', async () => {
      const mockFollowRow = { id: 1 };
      const mockSyncedProducts = []; // Empty result

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockFollowRow] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: mockSyncedProducts }) // SELECT synced products (empty)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const count = await updateMarkupForFollow(1, 'percentage', 20);

      expect(count).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('No products to update for follow 1');
    });
  });

  describe('runPeriodicSync', () => {
    it('should sync stale products successfully', async () => {
      const mockStaleProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          source_price: '100',
          synced_price: '100', // Changed from 110 to trigger price change detection
          source_stock: 50,
          synced_stock: 40, // Changed to trigger stock change
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          custom_markup_type: null,
          markup_type: 'percentage',
          markup_percentage: 10,
          markup_fixed: null,
        },
      ];

      syncedProductQueries.findStaleProducts.mockResolvedValue(mockStaleProducts);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE products
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const stats = await runPeriodicSync();

      expect(stats.updated).toBe(1);
      expect(stats.skipped).toBe(0);
      expect(stats.errors).toBe(0);
      expect(syncedProductQueries.findStaleProducts).toHaveBeenCalledWith(5);
    });

    it('should skip products when no changes detected', async () => {
      const mockStaleProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          source_price: '100',
          synced_price: '110', // Same as expected (100 * 1.1)
          source_stock: 50,
          synced_stock: 50,
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          custom_markup_type: null,
          markup_type: 'percentage',
          markup_percentage: 10,
          markup_fixed: null,
        },
      ];

      syncedProductQueries.findStaleProducts.mockResolvedValue(mockStaleProducts);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products (timestamp only)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const stats = await runPeriodicSync();

      expect(stats.skipped).toBe(1);
      expect(stats.updated).toBe(0);
    });

    it('should respect custom markup when syncing', async () => {
      const mockStaleProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          source_price: '100',
          synced_price: '130', // Expected with custom markup
          source_stock: 50,
          synced_stock: 50,
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          custom_markup_type: 'fixed',
          custom_markup_fixed: 30,
          markup_type: 'percentage',
          markup_percentage: 10,
        },
      ];

      syncedProductQueries.findStaleProducts.mockResolvedValue(mockStaleProducts);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products (timestamp)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const stats = await runPeriodicSync();

      expect(stats.skipped).toBe(1); // No change, custom markup matches
    });

    it('should handle conflict status correctly', async () => {
      const mockStaleProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          source_price: '120', // Changed
          synced_price: '110',
          source_stock: 50,
          synced_stock: 50,
          source_active: true,
          synced_active: true,
          conflict_status: 'conflict',
          custom_markup_type: null,
          markup_type: 'percentage',
          markup_percentage: 10,
        },
      ];

      syncedProductQueries.findStaleProducts.mockResolvedValue(mockStaleProducts);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE products (stock/active only)
        .mockResolvedValueOnce({ rows: [] }) // UPDATE synced_products
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const stats = await runPeriodicSync();

      expect(stats.updated).toBe(1);
    });

    it('should handle individual product errors gracefully (no rollback)', async () => {
      const mockStaleProducts = [
        {
          id: 1,
          synced_product_id: 201,
          source_product_id: 101,
          source_price: '100',
          synced_price: '100',
          source_stock: 50,
          synced_stock: 40,
          source_active: true,
          synced_active: true,
          conflict_status: 'synced',
          markup_type: 'percentage',
          markup_percentage: 10,
        },
      ];

      syncedProductQueries.findStaleProducts.mockResolvedValue(mockStaleProducts);

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')) // SELECT FOR UPDATE fails
        .mockResolvedValueOnce({ rows: [] }); // COMMIT (still called after individual error)

      const stats = await runPeriodicSync();

      // Individual product error is caught and counted, but chunk continues and commits
      expect(stats.errors).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT'); // Not ROLLBACK - individual errors don't rollback chunk
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle empty stale products list', async () => {
      syncedProductQueries.findStaleProducts.mockResolvedValue([]);

      const stats = await runPeriodicSync();

      expect(stats).toEqual({ updated: 0, conflicts: 0, errors: 0, skipped: 0 });
      expect(logger.info).toHaveBeenCalledWith('Periodic sync: found 0 stale products');
    });
  });
});
