/* eslint-disable no-unused-vars */
/**
 * Comprehensive Unit Tests for Catalog.jsx
 *
 * This file tests the core business logic extracted from Catalog component:
 * - Product filtering (stock vs preorder)
 * - Search functionality
 * - Shop ownership detection
 * - Price parsing
 * - Navigation logic
 *
 * Run: npm test -- Catalog.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// EXTRACTED LOGIC FUNCTIONS (mirroring Catalog.jsx logic)
// ============================================================================

/**
 * Filters products into stock and preorder categories
 * @param {Array} products - Array of product objects
 * @returns {Object} - { stockProducts: [], preorderProducts: [] }
 */
function filterProductsByAvailability(products) {
  const stock = [];
  const preorder = [];

  if (!products) return { stockProducts: [], preorderProducts: [] };

  for (const product of products) {
    if (product.availability === 'preorder') {
      preorder.push(product);
    } else if (product.availability === 'stock') {
      stock.push(product);
    }
  }
  return { stockProducts: stock, preorderProducts: preorder };
}

/**
 * Searches products by name or description
 * @param {Array} products - Array of product objects
 * @param {string} query - Search query
 * @param {Object} displayShop - Current shop info
 * @returns {Array} - Filtered products with shop info
 */
function searchProducts(products, query, displayShop) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const searchTerm = query.trim().toLowerCase();
  const filtered = products.filter((product) => {
    const name = (product.name || '').toLowerCase();
    const description = (product.description || '').toLowerCase();
    return name.includes(searchTerm) || description.includes(searchTerm);
  });

  // Add shop info for display
  return filtered.map((product) => ({
    ...product,
    shop_id: displayShop?.id,
    shop_name: displayShop?.name || 'Shop',
  }));
}

/**
 * Parses price from various formats
 * @param {number|string} price - Price value
 * @returns {number} - Parsed price
 */
function parsePrice(price) {
  return typeof price === 'number' ? price : parseFloat(price) || 0;
}

/**
 * Determines if current shop is owned by user
 * @param {Object} currentShop - Currently viewed shop
 * @param {Array} myShops - User's owned shops
 * @returns {boolean}
 */
function isShopOwned(currentShop, myShops) {
  if (!currentShop || !myShops) return false;
  return myShops.some((s) => s.id === currentShop.id);
}

/**
 * Determines the display shop
 * @param {Object} currentShop - Currently selected shop
 * @param {Object} myShop - User's own shop
 * @returns {Object|null}
 */
function getDisplayShop(currentShop, myShop) {
  return currentShop || myShop;
}

/**
 * Gets shop logo URL
 * @param {Object} shop - Shop object
 * @returns {string|null}
 */
function getShopLogo(shop) {
  if (!shop) return null;
  return shop.logo || shop.image || null;
}

/**
 * Determines if viewing own shop
 * @param {Object} currentShop - Currently selected shop
 * @param {Object} myShop - User's own shop
 * @returns {boolean}
 */
function isViewingOwnShop(currentShop, myShop) {
  return !currentShop && Boolean(myShop);
}

/**
 * Determines back handler type
 * @param {boolean} isViewingSubscription - Viewing external shop
 * @param {Object} currentShop - Currently selected shop
 * @returns {string|null}
 */
function getBackHandlerType(isViewingSubscription, currentShop) {
  if (isViewingSubscription) return 'backToMyShop';
  if (currentShop) return 'back';
  return null;
}

/**
 * Validates search query length
 * @param {string} query - Search query
 * @returns {boolean}
 */
function isSearchQueryValid(query) {
  return query && query.trim().length >= 2;
}

/**
 * Gets products for active section
 * @param {string} activeSection - 'stock' or 'preorder'
 * @param {Array} stockProducts - In-stock products
 * @param {Array} preorderProducts - Preorder products
 * @returns {Array}
 */
function getDisplayedProducts(activeSection, stockProducts, preorderProducts) {
  return activeSection === 'preorder' ? preorderProducts : stockProducts;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Catalog - Product Filtering', () => {
  describe('filterProductsByAvailability', () => {
    it('should separate stock and preorder products', () => {
      const products = [
        { id: 1, name: 'Product A', availability: 'stock' },
        { id: 2, name: 'Product B', availability: 'preorder' },
        { id: 3, name: 'Product C', availability: 'stock' },
        { id: 4, name: 'Product D', availability: 'preorder' },
      ];

      const result = filterProductsByAvailability(products);

      expect(result.stockProducts).toHaveLength(2);
      expect(result.preorderProducts).toHaveLength(2);
      expect(result.stockProducts.map((p) => p.id)).toEqual([1, 3]);
      expect(result.preorderProducts.map((p) => p.id)).toEqual([2, 4]);
    });

    it('should return empty arrays for null products', () => {
      const result = filterProductsByAvailability(null);

      expect(result.stockProducts).toEqual([]);
      expect(result.preorderProducts).toEqual([]);
    });

    it('should return empty arrays for undefined products', () => {
      const result = filterProductsByAvailability(undefined);

      expect(result.stockProducts).toEqual([]);
      expect(result.preorderProducts).toEqual([]);
    });

    it('should return empty arrays for empty array', () => {
      const result = filterProductsByAvailability([]);

      expect(result.stockProducts).toEqual([]);
      expect(result.preorderProducts).toEqual([]);
    });

    it('should ignore products with unknown availability', () => {
      const products = [
        { id: 1, name: 'Product A', availability: 'stock' },
        { id: 2, name: 'Product B', availability: 'out_of_stock' },
        { id: 3, name: 'Product C', availability: 'coming_soon' },
        { id: 4, name: 'Product D', availability: 'preorder' },
      ];

      const result = filterProductsByAvailability(products);

      expect(result.stockProducts).toHaveLength(1);
      expect(result.preorderProducts).toHaveLength(1);
    });

    it('should handle products without availability field', () => {
      const products = [
        { id: 1, name: 'Product A' },
        { id: 2, name: 'Product B', availability: 'stock' },
      ];

      const result = filterProductsByAvailability(products);

      expect(result.stockProducts).toHaveLength(1);
      expect(result.preorderProducts).toHaveLength(0);
    });

    it('should handle all stock products', () => {
      const products = [
        { id: 1, name: 'Product A', availability: 'stock' },
        { id: 2, name: 'Product B', availability: 'stock' },
      ];

      const result = filterProductsByAvailability(products);

      expect(result.stockProducts).toHaveLength(2);
      expect(result.preorderProducts).toHaveLength(0);
    });

    it('should handle all preorder products', () => {
      const products = [
        { id: 1, name: 'Product A', availability: 'preorder' },
        { id: 2, name: 'Product B', availability: 'preorder' },
      ];

      const result = filterProductsByAvailability(products);

      expect(result.stockProducts).toHaveLength(0);
      expect(result.preorderProducts).toHaveLength(2);
    });
  });

  describe('getDisplayedProducts', () => {
    const stockProducts = [{ id: 1, name: 'Stock Item' }];
    const preorderProducts = [{ id: 2, name: 'Preorder Item' }];

    it('should return stock products for stock section', () => {
      const result = getDisplayedProducts('stock', stockProducts, preorderProducts);
      expect(result).toBe(stockProducts);
    });

    it('should return preorder products for preorder section', () => {
      const result = getDisplayedProducts('preorder', stockProducts, preorderProducts);
      expect(result).toBe(preorderProducts);
    });

    it('should default to stock for unknown section', () => {
      const result = getDisplayedProducts('unknown', stockProducts, preorderProducts);
      expect(result).toBe(stockProducts);
    });
  });
});

describe('Catalog - Search Functionality', () => {
  const mockProducts = [
    { id: 1, name: 'iPhone 15 Pro', description: 'Latest Apple smartphone' },
    { id: 2, name: 'Samsung Galaxy S24', description: 'Android flagship phone' },
    { id: 3, name: 'MacBook Pro', description: 'Apple laptop with M3 chip' },
    { id: 4, name: 'iPad Air', description: 'Tablet for creativity' },
  ];

  const mockShop = { id: 'shop-1', name: 'Tech Store' };

  describe('searchProducts', () => {
    it('should find products by name match', () => {
      const result = searchProducts(mockProducts, 'iPhone', mockShop);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('iPhone 15 Pro');
    });

    it('should find products by description match', () => {
      const result = searchProducts(mockProducts, 'Android', mockShop);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Samsung Galaxy S24');
    });

    it('should be case insensitive', () => {
      const result = searchProducts(mockProducts, 'IPHONE', mockShop);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('iPhone 15 Pro');
    });

    it('should find multiple matching products', () => {
      const result = searchProducts(mockProducts, 'Apple', mockShop);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.name)).toContain('iPhone 15 Pro');
      expect(result.map((p) => p.name)).toContain('MacBook Pro');
    });

    it('should return empty array for query less than 2 chars', () => {
      const result = searchProducts(mockProducts, 'i', mockShop);
      expect(result).toEqual([]);
    });

    it('should return empty array for empty query', () => {
      const result = searchProducts(mockProducts, '', mockShop);
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace query', () => {
      const result = searchProducts(mockProducts, '   ', mockShop);
      expect(result).toEqual([]);
    });

    it('should return empty array for null query', () => {
      const result = searchProducts(mockProducts, null, mockShop);
      expect(result).toEqual([]);
    });

    it('should add shop info to results', () => {
      const result = searchProducts(mockProducts, 'iPhone', mockShop);

      expect(result[0].shop_id).toBe('shop-1');
      expect(result[0].shop_name).toBe('Tech Store');
    });

    it('should use default shop name if not provided', () => {
      const result = searchProducts(mockProducts, 'iPhone', { id: 'shop-1' });

      expect(result[0].shop_name).toBe('Shop');
    });

    it('should handle products with null name', () => {
      const products = [
        { id: 1, name: null, description: 'A product' },
        { id: 2, name: 'Valid Name', description: null },
      ];

      const result = searchProducts(products, 'product', mockShop);
      expect(result).toHaveLength(1);
    });

    it('should handle products with undefined description', () => {
      const products = [{ id: 1, name: 'Test Product' }];

      const result = searchProducts(products, 'Test', mockShop);
      expect(result).toHaveLength(1);
    });

    it('should trim search query whitespace', () => {
      const result = searchProducts(mockProducts, '  iPhone  ', mockShop);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('iPhone 15 Pro');
    });

    it('should find partial matches', () => {
      const result = searchProducts(mockProducts, 'Pro', mockShop);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.name)).toContain('iPhone 15 Pro');
      expect(result.map((p) => p.name)).toContain('MacBook Pro');
    });
  });

  describe('isSearchQueryValid', () => {
    it('should return true for query with 2+ chars', () => {
      expect(isSearchQueryValid('ab')).toBe(true);
      expect(isSearchQueryValid('abc')).toBe(true);
      expect(isSearchQueryValid('test query')).toBe(true);
    });

    it('should return false for query with less than 2 chars', () => {
      expect(isSearchQueryValid('a')).toBeFalsy();
      expect(isSearchQueryValid('')).toBeFalsy();
    });

    it('should return false for null/undefined', () => {
      expect(isSearchQueryValid(null)).toBeFalsy();
      expect(isSearchQueryValid(undefined)).toBeFalsy();
    });

    it('should consider trimmed length', () => {
      expect(isSearchQueryValid('  a  ')).toBeFalsy();
      expect(isSearchQueryValid('  ab  ')).toBe(true);
    });
  });
});

describe('Catalog - Price Parsing', () => {
  describe('parsePrice', () => {
    it('should return number as-is', () => {
      expect(parsePrice(99.99)).toBe(99.99);
      expect(parsePrice(0)).toBe(0);
      expect(parsePrice(100)).toBe(100);
    });

    it('should parse string numbers', () => {
      expect(parsePrice('99.99')).toBe(99.99);
      expect(parsePrice('100')).toBe(100);
      expect(parsePrice('0.01')).toBe(0.01);
    });

    it('should return 0 for invalid strings', () => {
      expect(parsePrice('invalid')).toBe(0);
      expect(parsePrice('abc')).toBe(0);
      expect(parsePrice('')).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(parsePrice(null)).toBe(0);
      expect(parsePrice(undefined)).toBe(0);
    });

    it('should handle string with currency symbol', () => {
      // parseFloat stops at first non-numeric char
      expect(parsePrice('$99.99')).toBe(0); // NaN becomes 0
    });

    it('should handle negative numbers', () => {
      expect(parsePrice(-10)).toBe(-10);
      expect(parsePrice('-10.5')).toBe(-10.5);
    });

    it('should handle decimal precision', () => {
      expect(parsePrice(19.999)).toBe(19.999);
      expect(parsePrice('19.999')).toBe(19.999);
    });
  });
});

describe('Catalog - Shop Ownership Detection', () => {
  describe('isShopOwned', () => {
    const myShops = [
      { id: 'shop-1', name: 'My First Shop' },
      { id: 'shop-2', name: 'My Second Shop' },
    ];

    it('should return true if shop is in myShops', () => {
      const currentShop = { id: 'shop-1', name: 'My First Shop' };
      expect(isShopOwned(currentShop, myShops)).toBe(true);
    });

    it('should return false if shop is not in myShops', () => {
      const currentShop = { id: 'shop-999', name: 'External Shop' };
      expect(isShopOwned(currentShop, myShops)).toBe(false);
    });

    it('should return false for null currentShop', () => {
      expect(isShopOwned(null, myShops)).toBe(false);
    });

    it('should return false for null myShops', () => {
      const currentShop = { id: 'shop-1' };
      expect(isShopOwned(currentShop, null)).toBe(false);
    });

    it('should return false for empty myShops', () => {
      const currentShop = { id: 'shop-1' };
      expect(isShopOwned(currentShop, [])).toBe(false);
    });

    it('should match by id only', () => {
      const currentShop = { id: 'shop-1', name: 'Different Name' };
      expect(isShopOwned(currentShop, myShops)).toBe(true);
    });
  });

  describe('isViewingOwnShop', () => {
    it('should return true when no currentShop and myShop exists', () => {
      const myShop = { id: 'shop-1', name: 'My Shop' };
      expect(isViewingOwnShop(null, myShop)).toBe(true);
    });

    it('should return false when currentShop is set', () => {
      const currentShop = { id: 'shop-2' };
      const myShop = { id: 'shop-1' };
      expect(isViewingOwnShop(currentShop, myShop)).toBe(false);
    });

    it('should return false when myShop is null', () => {
      expect(isViewingOwnShop(null, null)).toBe(false);
    });

    it('should return false when myShop is undefined', () => {
      expect(isViewingOwnShop(null, undefined)).toBe(false);
    });
  });

  describe('getDisplayShop', () => {
    it('should return currentShop if set', () => {
      const currentShop = { id: 'shop-1' };
      const myShop = { id: 'shop-2' };
      expect(getDisplayShop(currentShop, myShop)).toBe(currentShop);
    });

    it('should return myShop if currentShop is null', () => {
      const myShop = { id: 'shop-2' };
      expect(getDisplayShop(null, myShop)).toBe(myShop);
    });

    it('should return null if both are null', () => {
      expect(getDisplayShop(null, null)).toBe(null);
    });

    it('should prioritize currentShop over myShop', () => {
      const currentShop = { id: 'external' };
      const myShop = { id: 'owned' };
      expect(getDisplayShop(currentShop, myShop).id).toBe('external');
    });
  });
});

describe('Catalog - Shop Display Helpers', () => {
  describe('getShopLogo', () => {
    it('should return logo if available', () => {
      const shop = { logo: 'https://example.com/logo.png', image: 'https://example.com/image.png' };
      expect(getShopLogo(shop)).toBe('https://example.com/logo.png');
    });

    it('should return image if logo not available', () => {
      const shop = { image: 'https://example.com/image.png' };
      expect(getShopLogo(shop)).toBe('https://example.com/image.png');
    });

    it('should return null if neither available', () => {
      const shop = { name: 'Shop' };
      expect(getShopLogo(shop)).toBe(null);
    });

    it('should return null for null shop', () => {
      expect(getShopLogo(null)).toBe(null);
    });

    it('should prioritize logo over image', () => {
      const shop = { logo: 'logo.png', image: 'image.png' };
      expect(getShopLogo(shop)).toBe('logo.png');
    });
  });
});

describe('Catalog - Navigation Logic', () => {
  describe('getBackHandlerType', () => {
    it('should return backToMyShop when viewing subscription', () => {
      const result = getBackHandlerType(true, { id: 'shop-1' });
      expect(result).toBe('backToMyShop');
    });

    it('should return back when currentShop set but not subscription', () => {
      const result = getBackHandlerType(false, { id: 'shop-1' });
      expect(result).toBe('back');
    });

    it('should return null when no currentShop', () => {
      const result = getBackHandlerType(false, null);
      expect(result).toBe(null);
    });

    it('should prioritize subscription over regular back', () => {
      // isViewingSubscription takes precedence
      const result = getBackHandlerType(true, { id: 'owned-shop' });
      expect(result).toBe('backToMyShop');
    });
  });
});

describe('Catalog - Edge Cases', () => {
  describe('Product data integrity', () => {
    it('should handle products with extra fields', () => {
      const products = [
        { id: 1, name: 'Product', availability: 'stock', extra: 'field', nested: { a: 1 } },
      ];

      const result = filterProductsByAvailability(products);
      expect(result.stockProducts).toHaveLength(1);
      expect(result.stockProducts[0].extra).toBe('field');
    });

    it('should preserve product references', () => {
      const product = { id: 1, name: 'Product', availability: 'stock' };
      const products = [product];

      const result = filterProductsByAvailability(products);
      expect(result.stockProducts[0]).toBe(product);
    });
  });

  describe('Search with special characters', () => {
    const products = [
      { id: 1, name: 'iPhone 15 Pro (2024)', description: 'Price: $999' },
      { id: 2, name: 'C++ Programming Book', description: 'Learn C++' },
    ];
    const mockShop = { id: 'shop-1', name: 'Shop' };

    it('should handle parentheses in search', () => {
      const result = searchProducts(products, '(2024)', mockShop);
      expect(result).toHaveLength(1);
    });

    it('should handle special characters in product name', () => {
      const result = searchProducts(products, 'C++', mockShop);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('C++ Programming Book');
    });

    it('should handle numbers in search', () => {
      const result = searchProducts(products, '15', mockShop);
      expect(result).toHaveLength(1);
    });
  });

  describe('Large dataset handling', () => {
    it('should filter large product arrays efficiently', () => {
      const products = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Product ${i}`,
        availability: i % 2 === 0 ? 'stock' : 'preorder',
      }));

      const start = performance.now();
      const result = filterProductsByAvailability(products);
      const duration = performance.now() - start;

      expect(result.stockProducts).toHaveLength(500);
      expect(result.preorderProducts).toHaveLength(500);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should search large product arrays efficiently', () => {
      const products = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Product ${i}`,
        description: `Description for product ${i}`,
      }));
      const mockShop = { id: 'shop-1', name: 'Shop' };

      const start = performance.now();
      const result = searchProducts(products, 'Product 50', mockShop);
      const duration = performance.now() - start;

      expect(result.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
    });
  });
});

describe('Catalog - Integration Scenarios', () => {
  describe('Full workflow: filter then display', () => {
    it('should correctly filter and select products for display', () => {
      const products = [
        { id: 1, name: 'Stock Item 1', availability: 'stock' },
        { id: 2, name: 'Preorder Item 1', availability: 'preorder' },
        { id: 3, name: 'Stock Item 2', availability: 'stock' },
      ];

      // Step 1: Filter
      const { stockProducts, preorderProducts } = filterProductsByAvailability(products);

      // Step 2: Select based on active section
      const stockView = getDisplayedProducts('stock', stockProducts, preorderProducts);
      const preorderView = getDisplayedProducts('preorder', stockProducts, preorderProducts);

      expect(stockView).toHaveLength(2);
      expect(preorderView).toHaveLength(1);
    });
  });

  describe('Full workflow: search within filtered products', () => {
    it('should search within stock products only', () => {
      const allProducts = [
        { id: 1, name: 'iPhone Stock', availability: 'stock' },
        { id: 2, name: 'iPhone Preorder', availability: 'preorder' },
      ];
      const mockShop = { id: 'shop-1', name: 'Shop' };

      // Filter first
      const { stockProducts } = filterProductsByAvailability(allProducts);

      // Then search within stock only
      const result = searchProducts(stockProducts, 'iPhone', mockShop);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('iPhone Stock');
    });
  });

  describe('Shop navigation flow', () => {
    it('should determine correct back behavior for owned shop', () => {
      const myShops = [{ id: 'shop-1' }];
      const currentShop = { id: 'shop-1' };

      const isOwned = isShopOwned(currentShop, myShops);
      const isViewingSubscription = currentShop && !isOwned;
      const backType = getBackHandlerType(isViewingSubscription, currentShop);

      expect(isOwned).toBe(true);
      expect(isViewingSubscription).toBe(false);
      expect(backType).toBe('back');
    });

    it('should determine correct back behavior for subscription shop', () => {
      const myShops = [{ id: 'shop-1' }];
      const currentShop = { id: 'shop-999' }; // External shop

      const isOwned = isShopOwned(currentShop, myShops);
      const isViewingSubscription = currentShop && !isOwned;
      const backType = getBackHandlerType(isViewingSubscription, currentShop);

      expect(isOwned).toBe(false);
      expect(isViewingSubscription).toBe(true);
      expect(backType).toBe('backToMyShop');
    });

    it('should have no back handler on own shop home', () => {
      const myShops = [{ id: 'shop-1' }];
      const myShop = { id: 'shop-1' };
      const currentShop = null; // Viewing own shop

      const displayShop = getDisplayShop(currentShop, myShop);
      const isOwn = isViewingOwnShop(currentShop, myShop);
      const backType = getBackHandlerType(false, currentShop);

      expect(displayShop.id).toBe('shop-1');
      expect(isOwn).toBe(true);
      expect(backType).toBe(null);
    });
  });
});
