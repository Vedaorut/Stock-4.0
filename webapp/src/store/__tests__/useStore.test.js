/* eslint-disable no-unused-vars */
/**
 * Comprehensive Unit Tests for useStore (Zustand Store)
 *
 * Setup Instructions:
 * 1. Install Vitest: npm install -D vitest @testing-library/react jsdom
 * 2. Add to vite.config.js:
 *    test: {
 *      globals: true,
 *      environment: 'jsdom',
 *      setupFiles: ['./src/test/setup.js'],
 *    }
 * 3. Add script to package.json: "test": "vitest"
 * 4. Run: npm test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ============================================================================
// MOCKS - Use vi.hoisted to create mocks before vi.mock hoisting
// ============================================================================

const { mockAxiosGet, mockAxiosPost, mockAxiosDefaults, mockAddToast } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
  mockAxiosPost: vi.fn(),
  mockAxiosDefaults: { headers: { common: {} } },
  mockAddToast: vi.fn(),
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: mockAxiosGet,
    post: mockAxiosPost,
    defaults: mockAxiosDefaults,
  },
}));

// Mock useToastStore
vi.mock('../../hooks/useToast', () => ({
  useToastStore: {
    getState: () => ({ addToast: mockAddToast }),
  },
}));

// Mock apiBase
vi.mock('../../utils/apiBase', () => ({
  getApiBaseUrl: () => 'http://localhost:3000/api',
}));

// Now import the store (after mocks are set up)
import { useStore, normalizeProduct, normalizeOrder } from '../useStore';

// Mock Telegram WebApp
const mockTelegram = {
  WebApp: {
    initData: 'mock-init-data',
  },
};

// ============================================================================
// HELPER: Reset store before each test
// ============================================================================

const getInitialState = () => ({
  // User data
  user: null,
  token: null,

  // Cart
  cart: [],

  // Products
  products: [],
  productsShopId: null,

  // Shops
  currentShop: null,
  myShop: null,
  myShops: [],

  // Subscriptions
  subscriptions: [],

  // UI State
  isCartOpen: false,
  activeTab: 'subscriptions',
  viewMode: 'buyer',
  hasFollows: false,

  // Payment State
  currentOrder: null,
  selectedCrypto: null,
  paymentStep: 'idle',
  pendingOrders: [],
  paymentWallet: null,
  cryptoAmount: 0,
  invoiceExpiresAt: null,
  isVerifying: false,
  verifyError: null,
  isCreatingOrder: false,
  isGeneratingInvoice: false,

  // Language
  language: 'ru',

  // Follow Detail
  followDetailId: null,
  currentFollow: null,
  followProducts: [],

  // Worker Mode
  workspaceShopId: null,
  isWorkerMode: false,
  workspaceShop: null,
});

beforeEach(() => {
  // Reset store to initial state
  useStore.setState(getInitialState());

  // Clear all mocks
  vi.clearAllMocks();
  mockAxiosGet.mockReset();
  mockAxiosPost.mockReset();

  // Reset axios defaults
  mockAxiosDefaults.headers.common = {};

  // Setup Telegram mock
  global.window = {
    Telegram: mockTelegram,
    location: { origin: 'http://localhost:5173' },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// 1. PURE FUNCTIONS - normalizeProduct
// ============================================================================

describe('normalizeProduct', () => {
  describe('basic normalization', () => {
    it('should handle null input', () => {
      const result = normalizeProduct(null);
      expect(result.price).toBe(0);
      expect(result.stock).toBe(0);
      expect(result.stock_quantity).toBe(0);
    });

    it('should handle undefined input', () => {
      const result = normalizeProduct(undefined);
      expect(result.price).toBe(0);
      expect(result.stock).toBe(0);
    });

    it('should handle empty object', () => {
      const result = normalizeProduct({});
      expect(result.price).toBe(0);
      expect(result.stock).toBe(0);
      expect(result.is_available).toBe(true);
      expect(result.currency).toBe('USD');
    });
  });

  describe('price normalization', () => {
    it('should convert string price to number', () => {
      const result = normalizeProduct({ price: '10.50' });
      expect(result.price).toBe(10.5);
    });

    it('should keep numeric price as-is', () => {
      const result = normalizeProduct({ price: 25.99 });
      expect(result.price).toBe(25.99);
    });

    it('should handle invalid price string', () => {
      const result = normalizeProduct({ price: 'invalid' });
      expect(result.price).toBe(0);
    });

    it('should handle negative price', () => {
      const result = normalizeProduct({ price: -10 });
      expect(result.price).toBe(-10);
    });

    it('should handle zero price', () => {
      const result = normalizeProduct({ price: 0 });
      expect(result.price).toBe(0);
    });
  });

  describe('stock normalization', () => {
    it('should use stock_quantity if present', () => {
      const result = normalizeProduct({ stock_quantity: 15 });
      expect(result.stock).toBe(15);
      expect(result.stock_quantity).toBe(15);
    });

    it('should fallback to stock field', () => {
      const result = normalizeProduct({ stock: 8 });
      expect(result.stock).toBe(8);
      expect(result.stock_quantity).toBe(8);
    });

    it('should prefer stock_quantity over stock', () => {
      const result = normalizeProduct({ stock_quantity: 10, stock: 5 });
      expect(result.stock).toBe(10);
    });

    it('should default to 0 if no stock fields', () => {
      const result = normalizeProduct({ name: 'Test' });
      expect(result.stock).toBe(0);
    });
  });

  describe('availability and preorder', () => {
    it('should detect preorder when flag is set', () => {
      const result = normalizeProduct({ is_available: true, stock_quantity: 0, is_preorder: true });
      expect(result.isPreorder).toBe(true);
      expect(result.availability).toBe('preorder');
    });

    it('should detect regular stock when available with stock', () => {
      const result = normalizeProduct({ is_available: true, stock_quantity: 5 });
      expect(result.isPreorder).toBe(false);
      expect(result.availability).toBe('stock');
    });

    it('should not mark preorder when stock is zero but flag is false', () => {
      const result = normalizeProduct({ is_available: true, stock_quantity: 0, is_preorder: false });
      expect(result.isPreorder).toBe(false);
      expect(result.availability).toBe('stock');
    });

    it('should detect unavailable product', () => {
      const result = normalizeProduct({ is_available: false, stock_quantity: 5 });
      expect(result.isPreorder).toBe(false);
      expect(result.availability).toBe('unavailable');
    });

    it('should use isActive as fallback for is_available', () => {
      const result = normalizeProduct({ isActive: false });
      expect(result.is_available).toBe(false);
      expect(result.isAvailable).toBe(false);
    });

    it('should default is_available to true', () => {
      const result = normalizeProduct({});
      expect(result.is_available).toBe(true);
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('available quantity', () => {
    it('should compute available from reserved_quantity', () => {
      const result = normalizeProduct({ stock_quantity: 10, reserved_quantity: 3 });
      expect(result.available).toBe(7);
    });

    it('should prefer provided available when present', () => {
      const result = normalizeProduct({ stock_quantity: 10, reserved_quantity: 8, available: 6 });
      expect(result.available).toBe(6);
    });
  });

  describe('image normalization', () => {
    it('should use image field if present', () => {
      const result = normalizeProduct({ image: 'https://example.com/img.jpg' });
      expect(result.image).toBe('https://example.com/img.jpg');
    });

    it('should fallback to first image in images array', () => {
      const result = normalizeProduct({
        images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
      });
      expect(result.image).toBe('https://example.com/1.jpg');
    });

    it('should prefer image over images array', () => {
      const result = normalizeProduct({
        image: 'https://example.com/main.jpg',
        images: ['https://example.com/1.jpg'],
      });
      expect(result.image).toBe('https://example.com/main.jpg');
    });

    it('should return null if no images', () => {
      const result = normalizeProduct({});
      expect(result.image).toBe(null);
    });
  });

  describe('discount fields', () => {
    it('should preserve original_price', () => {
      const result = normalizeProduct({ original_price: 99.99 });
      expect(result.original_price).toBe(99.99);
    });

    it('should preserve discount_percentage', () => {
      const result = normalizeProduct({ discount_percentage: 25 });
      expect(result.discount_percentage).toBe(25);
    });

    it('should preserve discount_expires_at', () => {
      const expiresAt = '2024-12-31T23:59:59Z';
      const result = normalizeProduct({ discount_expires_at: expiresAt });
      expect(result.discount_expires_at).toBe(expiresAt);
    });

    it('should default discount_percentage to 0', () => {
      const result = normalizeProduct({});
      expect(result.discount_percentage).toBe(0);
    });

    it('should default original_price to null', () => {
      const result = normalizeProduct({});
      expect(result.original_price).toBe(null);
    });
  });

  describe('currency', () => {
    it('should preserve currency if present', () => {
      const result = normalizeProduct({ currency: 'EUR' });
      expect(result.currency).toBe('EUR');
    });

    it('should default to USD', () => {
      const result = normalizeProduct({});
      expect(result.currency).toBe('USD');
    });
  });

  describe('preserves original fields', () => {
    it('should spread all original fields', () => {
      const product = {
        id: 123,
        name: 'Test Product',
        description: 'A test product',
        shop_id: 456,
        category: 'electronics',
      };
      const result = normalizeProduct(product);

      expect(result.id).toBe(123);
      expect(result.name).toBe('Test Product');
      expect(result.description).toBe('A test product');
      expect(result.shop_id).toBe(456);
      expect(result.category).toBe('electronics');
    });
  });
});

// ============================================================================
// 2. PURE FUNCTIONS - normalizeOrder
// ============================================================================

describe('normalizeOrder', () => {
  describe('null/undefined handling', () => {
    it('should return null for null input', () => {
      expect(normalizeOrder(null)).toBe(null);
    });

    it('should return null for undefined input', () => {
      expect(normalizeOrder(undefined)).toBe(null);
    });
  });

  describe('PostgreSQL DECIMAL conversion', () => {
    it('should convert string total_price to number', () => {
      const result = normalizeOrder({ total_price: '99.99' });
      expect(result.total_price).toBe(99.99);
    });

    it('should convert string total to number', () => {
      const result = normalizeOrder({ total: '150.50' });
      expect(result.total).toBe(150.5);
    });

    it('should convert string quantity to integer', () => {
      const result = normalizeOrder({ quantity: '5' });
      expect(result.quantity).toBe(5);
    });

    it('should keep numeric values as-is', () => {
      const result = normalizeOrder({
        total_price: 100,
        total: 100,
        quantity: 3,
      });
      expect(result.total_price).toBe(100);
      expect(result.total).toBe(100);
      expect(result.quantity).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid string values', () => {
      const result = normalizeOrder({
        total_price: 'invalid',
        total: 'NaN',
        quantity: 'abc',
      });
      expect(result.total_price).toBe(0);
      expect(result.total).toBe(0);
      expect(result.quantity).toBe(1); // parseInt defaults to 1
    });

    it('should handle empty strings', () => {
      const result = normalizeOrder({
        total_price: '',
        total: '',
        quantity: '',
      });
      expect(result.total_price).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle decimal quantity (truncate)', () => {
      const result = normalizeOrder({ quantity: '2.7' });
      expect(result.quantity).toBe(2);
    });
  });

  describe('preserves original fields', () => {
    it('should spread all original fields', () => {
      const order = {
        id: 789,
        status: 'pending',
        user_id: 123,
        shop_id: 456,
        created_at: '2024-01-01T00:00:00Z',
        total_price: '50.00',
      };
      const result = normalizeOrder(order);

      expect(result.id).toBe(789);
      expect(result.status).toBe('pending');
      expect(result.user_id).toBe(123);
      expect(result.shop_id).toBe(456);
      expect(result.created_at).toBe('2024-01-01T00:00:00Z');
      expect(result.total_price).toBe(50);
    });
  });
});

// ============================================================================
// 3. CART OPERATIONS
// ============================================================================

describe('Cart Operations', () => {
  const mockProduct = {
    id: 1,
    name: 'Test Product',
    price: 10,
    stock_quantity: 5,
    shop_id: 100,
  };

  const mockShop = {
    id: 100,
    name: 'Test Shop',
  };

  describe('addToCart', () => {
    beforeEach(() => {
      useStore.setState({ currentShop: mockShop });
    });

    it('should add new product to empty cart', () => {
      useStore.getState().addToCart(mockProduct);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(1);
      expect(cart[0].id).toBe(1);
      expect(cart[0].quantity).toBe(1);
      expect(cart[0].shopId).toBe(100);
    });

    it('should increment quantity for existing product', () => {
      useStore.getState().addToCart(mockProduct);
      useStore.getState().addToCart(mockProduct);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(1);
      expect(cart[0].quantity).toBe(2);
    });

    it('should not exceed stock for regular products', () => {
      // Add 5 times (stock is 5)
      for (let i = 0; i < 6; i++) {
        useStore.getState().addToCart(mockProduct);
      }
      const cart = useStore.getState().cart;

      expect(cart[0].quantity).toBe(5); // Capped at stock
    });

    it('should allow unlimited quantity for preorder products', () => {
      const preorderProduct = {
        ...mockProduct,
        stock_quantity: 0,
        is_available: true,
        isPreorder: true,
        availability: 'preorder',
      };

      for (let i = 0; i < 10; i++) {
        useStore.getState().addToCart(preorderProduct);
      }
      const cart = useStore.getState().cart;

      expect(cart[0].quantity).toBe(10);
    });

    it('should clear currentOrder when cart changes', () => {
      useStore.setState({ currentOrder: { id: 999 } });
      useStore.getState().addToCart(mockProduct);

      expect(useStore.getState().currentOrder).toBe(null);
    });

    it('should reject product without shopId', () => {
      useStore.setState({ currentShop: null, productsShopId: null });
      const productNoShop = { ...mockProduct, shop_id: undefined, shopId: undefined };

      useStore.getState().addToCart(productNoShop);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(0);
    });

    it('should use productsShopId as fallback', () => {
      useStore.setState({ currentShop: null, productsShopId: 200 });
      const productNoShop = { ...mockProduct, shop_id: undefined };

      useStore.getState().addToCart(productNoShop);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(1);
      expect(cart[0].shopId).toBe(200);
    });

    describe('cart isolation (multi-shop prevention)', () => {
      it('should prevent adding products from different shop', () => {
        // Add first product from shop 100
        useStore.getState().addToCart(mockProduct);

        // Try to add product from different shop
        useStore.setState({ currentShop: { id: 200, name: 'Other Shop' } });
        const otherShopProduct = { ...mockProduct, id: 2, shop_id: 200 };

        const result = useStore.getState().addToCart(otherShopProduct);
        const cart = useStore.getState().cart;

        expect(cart).toHaveLength(1);
        expect(cart[0].shopId).toBe(100);
        expect(result).toBe(false);
        expect(mockAddToast).toHaveBeenCalledWith({
          type: 'warning',
          message: expect.stringContaining('Clear the cart'),
          duration: 3000,
        });
      });

      it('should allow adding products from same shop', () => {
        useStore.getState().addToCart(mockProduct);

        const sameShopProduct = { ...mockProduct, id: 2 };
        useStore.getState().addToCart(sameShopProduct);
        const cart = useStore.getState().cart;

        expect(cart).toHaveLength(2);
      });
    });
  });

  describe('removeFromCart', () => {
    beforeEach(() => {
      useStore.setState({
        currentShop: mockShop,
        cart: [
          { ...mockProduct, quantity: 2, shopId: 100 },
          { id: 2, name: 'Product 2', price: 20, quantity: 1, shopId: 100 },
        ],
      });
    });

    it('should remove product from cart', () => {
      useStore.getState().removeFromCart(1);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(1);
      expect(cart[0].id).toBe(2);
    });

    it('should clear currentOrder when removing', () => {
      useStore.setState({ currentOrder: { id: 999 } });
      useStore.getState().removeFromCart(1);

      expect(useStore.getState().currentOrder).toBe(null);
    });

    it('should handle removing non-existent product', () => {
      useStore.getState().removeFromCart(999);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(2);
    });
  });

  describe('updateCartQuantity', () => {
    beforeEach(() => {
      useStore.setState({
        currentShop: mockShop,
        cart: [{ ...mockProduct, quantity: 2, shopId: 100 }],
      });
    });

    it('should update quantity', () => {
      useStore.getState().updateCartQuantity(1, 4);
      const cart = useStore.getState().cart;

      expect(cart[0].quantity).toBe(4);
    });

    it('should remove item when quantity <= 0', () => {
      useStore.getState().updateCartQuantity(1, 0);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(0);
    });

    it('should remove item when quantity is negative', () => {
      useStore.getState().updateCartQuantity(1, -5);
      const cart = useStore.getState().cart;

      expect(cart).toHaveLength(0);
    });

    it('should cap quantity at stock for regular products', () => {
      useStore.getState().updateCartQuantity(1, 100);
      const cart = useStore.getState().cart;

      expect(cart[0].quantity).toBe(5); // Capped at stock_quantity
    });

    it('should allow unlimited quantity for preorder', () => {
      useStore.setState({
        cart: [
          {
            ...mockProduct,
            quantity: 2,
            shopId: 100,
            stock_quantity: 0,
            isPreorder: true,
            availability: 'preorder',
          },
        ],
      });

      useStore.getState().updateCartQuantity(1, 100);
      const cart = useStore.getState().cart;

      expect(cart[0].quantity).toBe(100);
    });

    it('should clear currentOrder when updating', () => {
      useStore.setState({ currentOrder: { id: 999 } });
      useStore.getState().updateCartQuantity(1, 3);

      expect(useStore.getState().currentOrder).toBe(null);
    });
  });

  describe('clearCart', () => {
    beforeEach(() => {
      useStore.setState({
        cart: [{ ...mockProduct, quantity: 2, shopId: 100 }],
        currentOrder: { id: 123 },
        selectedCrypto: 'BTC',
        paymentStep: 'method',
      });
    });

    it('should clear all items from cart', () => {
      useStore.getState().clearCart();
      expect(useStore.getState().cart).toEqual([]);
    });

    it('should reset payment flow', () => {
      useStore.getState().clearCart();
      expect(useStore.getState().paymentStep).toBe('idle');
      expect(useStore.getState().selectedCrypto).toBe(null);
    });
  });

  describe('getCartTotal', () => {
    it('should calculate total correctly', () => {
      useStore.setState({
        cart: [
          { id: 1, price: 10, quantity: 2, shopId: 100 },
          { id: 2, price: 25.5, quantity: 3, shopId: 100 },
        ],
      });

      const total = useStore.getState().getCartTotal();
      expect(total).toBe(10 * 2 + 25.5 * 3); // 20 + 76.5 = 96.5
    });

    it('should return 0 for empty cart', () => {
      useStore.setState({ cart: [] });
      expect(useStore.getState().getCartTotal()).toBe(0);
    });
  });

  describe('getCartCount', () => {
    it('should count total items correctly', () => {
      useStore.setState({
        cart: [
          { id: 1, quantity: 2, shopId: 100 },
          { id: 2, quantity: 5, shopId: 100 },
        ],
      });

      const count = useStore.getState().getCartCount();
      expect(count).toBe(7);
    });

    it('should return 0 for empty cart', () => {
      useStore.setState({ cart: [] });
      expect(useStore.getState().getCartCount()).toBe(0);
    });
  });
});

// ============================================================================
// 4. AUTH & USER
// ============================================================================

describe('Auth & User', () => {
  describe('setUser', () => {
    it('should set user data', () => {
      const user = { id: 123, name: 'Test User', telegram_id: 456 };
      useStore.getState().setUser(user);

      expect(useStore.getState().user).toEqual(user);
    });

    it('should handle null user (logout)', () => {
      useStore.setState({ user: { id: 123 } });
      useStore.getState().setUser(null);

      expect(useStore.getState().user).toBe(null);
    });
  });

  describe('setToken', () => {
    it('should set token and configure axios header', () => {
      const axios = require('axios').default;

      useStore.getState().setToken('test-jwt-token');

      expect(useStore.getState().token).toBe('test-jwt-token');
      expect(mockAxiosDefaults.headers.common['Authorization']).toBe('Bearer test-jwt-token');
    });

    it('should remove axios header when token is null', () => {
      const axios = require('axios').default;
      mockAxiosDefaults.headers.common['Authorization'] = 'Bearer old-token';

      useStore.getState().setToken(null);

      expect(useStore.getState().token).toBe(null);
      expect(mockAxiosDefaults.headers.common['Authorization']).toBeUndefined();
    });

    it('should remove axios header when token is empty string', () => {
      const axios = require('axios').default;
      mockAxiosDefaults.headers.common['Authorization'] = 'Bearer old-token';

      useStore.getState().setToken('');

      expect(useStore.getState().token).toBe('');
      expect(mockAxiosDefaults.headers.common['Authorization']).toBeUndefined();
    });
  });
});

// ============================================================================
// 5. SHOP MANAGEMENT
// ============================================================================

describe('Shop Management', () => {
  const mockShop = { id: 100, name: 'My Shop', tier: 'PRO' };
  const mockShop2 = { id: 200, name: 'Second Shop', tier: 'BASIC' };

  describe('setCurrentShop', () => {
    it('should set current shop', () => {
      useStore.getState().setCurrentShop(mockShop);
      expect(useStore.getState().currentShop).toEqual(mockShop);
    });

    it('should handle null shop', () => {
      useStore.setState({ currentShop: mockShop });
      useStore.getState().setCurrentShop(null);
      expect(useStore.getState().currentShop).toBe(null);
    });
  });

  describe('setMyShop', () => {
    it('should set my shop', () => {
      useStore.getState().setMyShop(mockShop);
      expect(useStore.getState().myShop).toEqual(mockShop);
    });
  });

  describe('setMyShops', () => {
    it('should set my shops array', () => {
      useStore.getState().setMyShops([mockShop, mockShop2]);
      expect(useStore.getState().myShops).toHaveLength(2);
    });

    it('should also set myShop to first shop', () => {
      useStore.getState().setMyShops([mockShop, mockShop2]);
      expect(useStore.getState().myShop).toEqual(mockShop);
    });

    it('should handle empty array', () => {
      useStore.setState({ myShop: mockShop });
      useStore.getState().setMyShops([]);
      expect(useStore.getState().myShops).toEqual([]);
      expect(useStore.getState().myShop).toBe(null);
    });
  });

  describe('isOwnShop', () => {
    beforeEach(() => {
      useStore.setState({ myShops: [mockShop, mockShop2] });
    });

    it('should return true for own shop', () => {
      expect(useStore.getState().isOwnShop(100)).toBe(true);
      expect(useStore.getState().isOwnShop(200)).toBe(true);
    });

    it('should return false for other shop', () => {
      expect(useStore.getState().isOwnShop(999)).toBe(false);
    });

    it('should return false when no shops', () => {
      useStore.setState({ myShops: [] });
      expect(useStore.getState().isOwnShop(100)).toBe(false);
    });
  });
});

// ============================================================================
// 6. PAYMENT FLOW
// ============================================================================

describe('Payment Flow', () => {
  const mockProduct = {
    id: 1,
    name: 'Test Product',
    price: 50,
    quantity: 2,
    stock_quantity: 10,
    shopId: 100,
  };

  const mockShop = {
    id: 100,
    name: 'Test Shop',
    availableCryptos: ['BTC', 'ETH', 'USDT'],
  };

  describe('startCheckout', () => {
    it('should not start checkout with empty cart', () => {
      useStore.setState({ cart: [] });
      useStore.getState().startCheckout();

      expect(useStore.getState().paymentStep).toBe('idle');
    });

    it('should not start checkout with invalid items (price <= 0)', () => {
      useStore.setState({
        cart: [{ ...mockProduct, price: 0 }],
        currentShop: mockShop,
      });
      useStore.getState().startCheckout();

      expect(useStore.getState().paymentStep).toBe('idle');
    });

    it('should not start checkout with invalid items (quantity <= 0)', () => {
      useStore.setState({
        cart: [{ ...mockProduct, quantity: 0 }],
        currentShop: mockShop,
      });
      useStore.getState().startCheckout();

      expect(useStore.getState().paymentStep).toBe('idle');
    });

    it('should not start checkout with multi-shop cart', () => {
      useStore.setState({
        cart: [
          { ...mockProduct, shopId: 100 },
          { ...mockProduct, id: 2, shopId: 200 },
        ],
        currentShop: mockShop,
      });
      useStore.getState().startCheckout();

      expect(useStore.getState().paymentStep).toBe('idle');
    });

    it('should not start checkout without shopId', () => {
      useStore.setState({
        cart: [{ ...mockProduct, shopId: undefined }],
        currentShop: null,
      });
      useStore.getState().startCheckout();

      expect(useStore.getState().paymentStep).toBe('idle');
      expect(useStore.getState().isCartOpen).toBe(true);
    });

    it('should start checkout successfully with valid cart', () => {
      useStore.setState({
        cart: [mockProduct],
        currentShop: mockShop,
      });
      useStore.getState().startCheckout();

      expect(useStore.getState().paymentStep).toBe('method');
      expect(useStore.getState().currentOrder).toBe(null);
      expect(useStore.getState().selectedCrypto).toBe(null);
      expect(useStore.getState().verifyError).toBe(null);
    });

    it('should set currentShop from cart item shopId', () => {
      useStore.setState({
        cart: [mockProduct],
        currentShop: null,
        myShops: [mockShop],
      });
      useStore.getState().startCheckout();

      expect(useStore.getState().currentShop.id).toBe(100);
    });
  });

  describe('createOrder', () => {
    const axios = require('axios').default;

    beforeEach(() => {
      useStore.setState({
        cart: [mockProduct],
        currentShop: mockShop,
        token: 'test-token',
      });
    });

    it('should return null for empty cart', async () => {
      useStore.setState({ cart: [] });
      const result = await useStore.getState().createOrder();

      expect(result).toBe(null);
    });

    it('should prevent race condition with isCreatingOrder flag', async () => {
      useStore.setState({ isCreatingOrder: true });
      const result = await useStore.getState().createOrder();

      expect(result).toBe(null);
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should create order successfully', async () => {
      const mockOrder = { id: 123, total_price: '100.00', status: 'pending' };
      mockAxiosPost.mockResolvedValueOnce({ data: { data: mockOrder } });

      const result = await useStore.getState().createOrder();

      expect(result.id).toBe(123);
      expect(result.total_price).toBe(100); // Normalized
      expect(useStore.getState().currentOrder).toEqual(result);
      expect(useStore.getState().isCreatingOrder).toBe(false);
    });

    it('should send correct payload', async () => {
      mockAxiosPost.mockResolvedValueOnce({ data: { data: { id: 1 } } });

      await useStore.getState().createOrder();

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders',
        expect.objectContaining({
          items: [{ productId: 1, quantity: 2 }],
          deliveryAddress: null,
        }),
        expect.any(Object)
      );
    });

    it('should reject invalid items in cart', async () => {
      useStore.setState({
        cart: [{ ...mockProduct, id: -1 }], // Invalid productId
      });

      const result = await useStore.getState().createOrder();
      expect(result).toBe(null);
    });

    it('should handle 400 error with toast', async () => {
      mockAxiosPost.mockRejectedValueOnce({
        response: { status: 400, data: { error: 'Malformed JSON payload' } },
      });

      await expect(useStore.getState().createOrder()).rejects.toThrow();

      expect(mockAddToast).toHaveBeenCalledWith('Order data error', 'error');
      expect(useStore.getState().isCreatingOrder).toBe(false);
    });

    it('should handle "cannot order your own" error', async () => {
      mockAxiosPost.mockRejectedValueOnce({
        response: { status: 400, data: { error: 'You cannot order your own products' } },
      });

      await expect(useStore.getState().createOrder()).rejects.toThrow();

      expect(mockAddToast).toHaveBeenCalledWith('Cannot order your own products', 'warning');
    });

    it('should always reset isCreatingOrder flag on error', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Network error'));

      await expect(useStore.getState().createOrder()).rejects.toThrow();

      expect(useStore.getState().isCreatingOrder).toBe(false);
    });
  });

  describe('selectCrypto', () => {
    const axios = require('axios').default;

    beforeEach(() => {
      useStore.setState({
        cart: [mockProduct],
        currentShop: mockShop,
        currentOrder: { id: 123, total_price: 100 },
        token: 'test-token',
      });
    });

    it('should normalize crypto to uppercase', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { data: { address: 'bc1...', amount: '0.005', expiresIn: 1800 } },
      });

      await useStore.getState().selectCrypto('btc');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('/orders/123/payment-info'),
        expect.objectContaining({
          params: { currency: 'BTC' },
        })
      );
    });

    it('should prevent double-click with isGeneratingInvoice flag', async () => {
      useStore.setState({ isGeneratingInvoice: true });

      await useStore.getState().selectCrypto('BTC');

      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('should create order if not exists', async () => {
      const mockOrder = { id: 456, total_price: 100 };
      useStore.setState({ currentOrder: null });

      mockAxiosPost.mockResolvedValueOnce({ data: { data: mockOrder } });
      mockAxiosGet.mockResolvedValueOnce({
        data: { data: { address: 'bc1...', amount: '0.005', expiresIn: 1800 } },
      });

      await useStore.getState().selectCrypto('BTC');

      expect(mockAxiosPost).toHaveBeenCalled();
    });

    it('should set payment details on success', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          data: { address: 'bc1qtest123', amount: '0.0042', expiresIn: 1800 },
        },
      });

      await useStore.getState().selectCrypto('BTC');

      expect(useStore.getState().paymentWallet).toBe('bc1qtest123');
      expect(useStore.getState().cryptoAmount).toBe(0.0042);
      expect(useStore.getState().invoiceExpiresAt).not.toBe(null);
      expect(useStore.getState().paymentStep).toBe('details');
      expect(useStore.getState().isGeneratingInvoice).toBe(false);
    });

    it('should validate crypto amount is positive', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { data: { address: 'bc1...', amount: '0', expiresIn: 1800 } },
      });

      await expect(useStore.getState().selectCrypto('BTC')).rejects.toThrow();

      expect(mockAddToast).toHaveBeenCalledWith({
        type: 'error',
        message: 'Invalid amount from server',
        duration: 3000,
      });
    });

    it('should reset to method step on error', async () => {
      mockAxiosGet.mockRejectedValueOnce({
        response: { data: { error: 'Invalid currency' } },
      });

      await expect(useStore.getState().selectCrypto('INVALID')).rejects.toThrow();

      expect(useStore.getState().paymentStep).toBe('method');
      expect(mockAddToast).toHaveBeenCalled();
    });

    it('should re-create order if total mismatch', async () => {
      // Cart total = 50 * 2 = 100, order total = 50 (mismatch)
      useStore.setState({
        currentOrder: { id: 123, total_price: 50 },
      });

      const newOrder = { id: 456, total_price: 100 };
      mockAxiosPost.mockResolvedValueOnce({ data: { data: newOrder } });
      mockAxiosGet.mockResolvedValueOnce({
        data: { data: { address: 'bc1...', amount: '0.005', expiresIn: 1800 } },
      });

      await useStore.getState().selectCrypto('BTC');

      // Should have created new order
      expect(mockAxiosPost).toHaveBeenCalled();
    });

    it('should always reset isGeneratingInvoice on error', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network error'));

      await expect(useStore.getState().selectCrypto('BTC')).rejects.toThrow();

      expect(useStore.getState().isGeneratingInvoice).toBe(false);
    });
  });

  describe('submitPaymentHash', () => {
    const axios = require('axios').default;

    beforeEach(() => {
      useStore.setState({
        cart: [mockProduct],
        currentShop: mockShop,
        currentOrder: { id: 123, total_price: 100 },
        selectedCrypto: 'BTC',
        token: 'test-token',
        pendingOrders: [],
      });
    });

    it('should do nothing without currentOrder', async () => {
      useStore.setState({ currentOrder: null });

      await useStore.getState().submitPaymentHash('0xabc123');

      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should submit payment hash successfully', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { success: true, data: { paymentId: 999 } },
      });

      await useStore.getState().submitPaymentHash('0xabc123');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'http://localhost:3000/api/orders/123/submit-payment',
        { tx_hash: '0xabc123', currency: 'BTC' },
        expect.any(Object)
      );
    });

    it('should add to pendingOrders on success', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { success: true, data: { paymentId: 999 } },
      });

      await useStore.getState().submitPaymentHash('0xabc123');

      const pending = useStore.getState().pendingOrders;
      expect(pending).toHaveLength(1);
      expect(pending[0].txHash).toBe('0xabc123');
      expect(pending[0].crypto).toBe('BTC');
      expect(pending[0].status).toBe('pending');
    });

    it('should set paymentStep to success after submitPaymentHash', async () => {
      // submitPaymentHash sets paymentStep to 'success' to show confirmation UI
      mockAxiosPost.mockResolvedValueOnce({
        data: { success: true, data: { paymentId: 999 } },
      });

      await useStore.getState().submitPaymentHash('0xabc123');

      // paymentStep stays at 'success' to show confirmation UI
      expect(useStore.getState().paymentStep).toBe('success');
    });

    it('should clear cart on success', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { success: true, data: { paymentId: 999 } },
      });

      await useStore.getState().submitPaymentHash('0xabc123');

      expect(useStore.getState().cart).toEqual([]);
    });

    it('should set verifyError on failure', async () => {
      mockAxiosPost.mockRejectedValueOnce({
        response: { data: { error: 'Transaction not found' } },
      });

      await useStore.getState().submitPaymentHash('0xinvalid');

      expect(useStore.getState().verifyError).toBe('Transaction not found');
    });

    it('should reset isVerifying after request', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { success: true, data: { paymentId: 999 } },
      });

      await useStore.getState().submitPaymentHash('0xabc123');

      expect(useStore.getState().isVerifying).toBe(false);
    });
  });

  describe('resetPaymentFlow', () => {
    beforeEach(() => {
      useStore.setState({
        cart: [mockProduct],
        currentOrder: { id: 123 },
        selectedCrypto: 'BTC',
        paymentStep: 'details',
        paymentWallet: 'bc1...',
        cryptoAmount: 0.005,
        invoiceExpiresAt: '2024-12-31T23:59:59Z',
        isCreatingOrder: true,
        isGeneratingInvoice: true,
        isVerifying: true,
        verifyError: 'Some error',
        pendingOrders: [{ id: 1 }],
      });
    });

    it('should reset to idle state by default', () => {
      useStore.getState().resetPaymentFlow();

      expect(useStore.getState().paymentStep).toBe('idle');
      expect(useStore.getState().selectedCrypto).toBe(null);
      expect(useStore.getState().paymentWallet).toBe(null);
      expect(useStore.getState().cryptoAmount).toBe(0);
      expect(useStore.getState().invoiceExpiresAt).toBe(null);
      expect(useStore.getState().verifyError).toBe(null);
    });

    it('should reset loading states', () => {
      useStore.getState().resetPaymentFlow();

      expect(useStore.getState().isCreatingOrder).toBe(false);
      expect(useStore.getState().isGeneratingInvoice).toBe(false);
      expect(useStore.getState().isVerifying).toBe(false);
    });

    it('should clear currentOrder by default', () => {
      useStore.getState().resetPaymentFlow();

      expect(useStore.getState().currentOrder).toBe(null);
    });

    it('should keep currentOrder with keepOrder option', () => {
      useStore.getState().resetPaymentFlow({ keepOrder: true });

      expect(useStore.getState().currentOrder).toEqual({ id: 123 });
    });

    it('should not clear cart by default', () => {
      useStore.getState().resetPaymentFlow();

      expect(useStore.getState().cart).toHaveLength(1);
    });

    it('should clear cart with clearCart option', () => {
      useStore.getState().resetPaymentFlow({ clearCart: true });

      expect(useStore.getState().cart).toEqual([]);
    });

    it('should not clear pendingOrders by default', () => {
      useStore.getState().resetPaymentFlow();

      expect(useStore.getState().pendingOrders).toHaveLength(1);
    });

    it('should clear pendingOrders with clearPendingOrders option', () => {
      useStore.getState().resetPaymentFlow({ clearPendingOrders: true });

      expect(useStore.getState().pendingOrders).toEqual([]);
    });
  });

  describe('clearCheckout', () => {
    it('should clear cart and reset payment flow', () => {
      useStore.setState({
        cart: [mockProduct],
        currentOrder: { id: 123 },
        paymentStep: 'method',
      });

      useStore.getState().clearCheckout();

      expect(useStore.getState().cart).toEqual([]);
      expect(useStore.getState().paymentStep).toBe('idle');
    });
  });

  describe('setPaymentStep', () => {
    it('should set payment step', () => {
      useStore.getState().setPaymentStep('details');
      expect(useStore.getState().paymentStep).toBe('details');
    });
  });

  describe('removePendingOrder', () => {
    it('should remove specific pending order', () => {
      useStore.setState({
        pendingOrders: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });

      useStore.getState().removePendingOrder(2);

      expect(useStore.getState().pendingOrders).toEqual([{ id: 1 }, { id: 3 }]);
    });

    it('should handle non-existent order id', () => {
      useStore.setState({
        pendingOrders: [{ id: 1 }],
      });

      useStore.getState().removePendingOrder(999);

      expect(useStore.getState().pendingOrders).toHaveLength(1);
    });
  });
});

// ============================================================================
// 7. WORKER MODE
// ============================================================================

describe('Worker Mode', () => {
  const mockShop = { id: 100, name: 'Employer Shop', tier: 'PRO' };
  const myShop = { id: 200, name: 'My Shop', tier: 'BASIC' };

  describe('switchToWorkspaceShop', () => {
    it('should enter worker mode', () => {
      useStore.getState().switchToWorkspaceShop(mockShop);

      expect(useStore.getState().isWorkerMode).toBe(true);
      expect(useStore.getState().workspaceShopId).toBe(100);
      expect(useStore.getState().workspaceShop).toEqual(mockShop);
    });

    it('should exit worker mode with null', () => {
      useStore.setState({
        isWorkerMode: true,
        workspaceShopId: 100,
        workspaceShop: mockShop,
      });

      useStore.getState().switchToWorkspaceShop(null);

      expect(useStore.getState().isWorkerMode).toBe(false);
      expect(useStore.getState().workspaceShopId).toBe(null);
      expect(useStore.getState().workspaceShop).toBe(null);
    });

    it('should exit worker mode with shop without id', () => {
      useStore.setState({
        isWorkerMode: true,
        workspaceShopId: 100,
        workspaceShop: mockShop,
      });

      useStore.getState().switchToWorkspaceShop({ name: 'No ID Shop' });

      expect(useStore.getState().isWorkerMode).toBe(false);
    });
  });

  describe('getEffectiveShopId', () => {
    it('should return workspaceShopId when in worker mode', () => {
      useStore.setState({
        isWorkerMode: true,
        workspaceShopId: 100,
        myShop: myShop,
      });

      expect(useStore.getState().getEffectiveShopId()).toBe(100);
    });

    it('should return myShop.id when not in worker mode', () => {
      useStore.setState({
        isWorkerMode: false,
        workspaceShopId: 100,
        myShop: myShop,
      });

      expect(useStore.getState().getEffectiveShopId()).toBe(200);
    });

    it('should return null when no shop available', () => {
      useStore.setState({
        isWorkerMode: false,
        workspaceShopId: null,
        myShop: null,
      });

      expect(useStore.getState().getEffectiveShopId()).toBe(null);
    });

    it('should return myShop.id when worker mode but no workspaceShopId', () => {
      useStore.setState({
        isWorkerMode: true,
        workspaceShopId: null,
        myShop: myShop,
      });

      expect(useStore.getState().getEffectiveShopId()).toBe(200);
    });
  });
});

// ============================================================================
// 8. PRODUCTS
// ============================================================================

describe('Products', () => {
  describe('setProducts', () => {
    it('should normalize and set products', () => {
      const rawProducts = [
        { id: 1, name: 'Product 1', price: '10.00', stock_quantity: 5 },
        { id: 2, name: 'Product 2', price: 25, stock: 0, is_available: true, is_preorder: true },
      ];

      useStore.getState().setProducts(rawProducts, 100);

      const products = useStore.getState().products;
      expect(products).toHaveLength(2);
      expect(products[0].price).toBe(10); // Normalized from string
      expect(products[1].isPreorder).toBe(true); // Detected preorder
      expect(useStore.getState().productsShopId).toBe(100);
    });

    it('should handle non-array input', () => {
      useStore.getState().setProducts(null, 100);
      expect(useStore.getState().products).toEqual([]);
    });

    it('should handle empty array', () => {
      useStore.setState({ products: [{ id: 1 }] });
      useStore.getState().setProducts([], 100);
      expect(useStore.getState().products).toEqual([]);
    });
  });
});

// ============================================================================
// 9. UI STATE
// ============================================================================

describe('UI State', () => {
  describe('setCartOpen', () => {
    it('should open cart', () => {
      useStore.getState().setCartOpen(true);
      expect(useStore.getState().isCartOpen).toBe(true);
    });

    it('should close cart', () => {
      useStore.setState({ isCartOpen: true });
      useStore.getState().setCartOpen(false);
      expect(useStore.getState().isCartOpen).toBe(false);
    });
  });

  describe('setActiveTab', () => {
    it('should set active tab', () => {
      useStore.getState().setActiveTab('orders');
      expect(useStore.getState().activeTab).toBe('orders');
    });
  });

  describe('setViewMode', () => {
    it('should set view mode to seller', () => {
      useStore.getState().setViewMode('seller');
      expect(useStore.getState().viewMode).toBe('seller');
    });

    it('should set view mode to buyer', () => {
      useStore.setState({ viewMode: 'seller' });
      useStore.getState().setViewMode('buyer');
      expect(useStore.getState().viewMode).toBe('buyer');
    });
  });

  describe('setHasFollows', () => {
    it('should set hasFollows to true', () => {
      useStore.getState().setHasFollows(true);
      expect(useStore.getState().hasFollows).toBe(true);
    });

    it('should convert truthy values to boolean', () => {
      useStore.getState().setHasFollows(1);
      expect(useStore.getState().hasFollows).toBe(true);
    });

    it('should convert falsy values to boolean', () => {
      useStore.getState().setHasFollows(0);
      expect(useStore.getState().hasFollows).toBe(false);
    });
  });

  describe('setLanguage', () => {
    it('should set language', () => {
      useStore.getState().setLanguage('en');
      expect(useStore.getState().language).toBe('en');
    });
  });
});

// ============================================================================
// 10. FOLLOW DETAIL
// ============================================================================

describe('Follow Detail', () => {
  describe('setFollowDetailId', () => {
    it('should set follow detail id', () => {
      useStore.getState().setFollowDetailId(123);
      expect(useStore.getState().followDetailId).toBe(123);
    });

    it('should clear follow detail id', () => {
      useStore.setState({ followDetailId: 123 });
      useStore.getState().setFollowDetailId(null);
      expect(useStore.getState().followDetailId).toBe(null);
    });
  });

  describe('setCurrentFollow', () => {
    it('should set current follow', () => {
      const follow = { id: 1, shop_id: 100, is_active: true };
      useStore.getState().setCurrentFollow(follow);
      expect(useStore.getState().currentFollow).toEqual(follow);
    });
  });

  describe('setFollowProducts', () => {
    it('should set follow products', () => {
      const products = [{ id: 1 }, { id: 2 }];
      useStore.getState().setFollowProducts(products);
      expect(useStore.getState().followProducts).toEqual(products);
    });
  });
});

// ============================================================================
// 11. SUBSCRIPTIONS
// ============================================================================

describe('Subscriptions', () => {
  describe('setSubscriptions', () => {
    it('should set subscriptions', () => {
      const subs = [{ id: 1 }, { id: 2 }];
      useStore.getState().setSubscriptions(subs);
      expect(useStore.getState().subscriptions).toEqual(subs);
    });
  });

  describe('incrementSubscribers', () => {
    it('should increment subscriber count', () => {
      useStore.setState({
        subscriptions: [
          { id: 100, subscriber_count: 5 },
          { id: 200, subscriber_count: 10 },
        ],
      });

      useStore.getState().incrementSubscribers(100);

      const subs = useStore.getState().subscriptions;
      expect(subs[0].subscriber_count).toBe(6);
      expect(subs[1].subscriber_count).toBe(10);
    });

    it('should handle undefined subscriber_count', () => {
      useStore.setState({
        subscriptions: [{ id: 100 }],
      });

      useStore.getState().incrementSubscribers(100);

      const subs = useStore.getState().subscriptions;
      expect(subs[0].subscriber_count).toBe(1);
    });
  });
});

// ============================================================================
// 12. WEBSOCKET ACTIONS
// ============================================================================

describe('WebSocket Actions', () => {
  const axios = require('axios').default;

  describe('refetchProducts', () => {
    it('should fetch and normalize products', async () => {
      const mockProducts = [
        { id: 1, price: '10.00', stock_quantity: 5 },
        { id: 2, price: '20.00', stock_quantity: 0, is_available: true, is_preorder: true },
      ];

      mockAxiosGet.mockResolvedValueOnce({ data: { data: mockProducts } });
      useStore.setState({ currentShop: { id: 100 } });

      await useStore.getState().refetchProducts(100);

      const products = useStore.getState().products;
      expect(products).toHaveLength(2);
      expect(products[0].price).toBe(10);
      expect(products[1].isPreorder).toBe(true);
    });

    it('should not update products if different shop', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { data: [{ id: 1 }] } });
      useStore.setState({
        currentShop: { id: 100 },
        products: [{ id: 99 }],
      });

      await useStore.getState().refetchProducts(200); // Different shop

      expect(useStore.getState().products).toEqual([{ id: 99 }]); // Unchanged
    });

    it('should handle API error silently', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network error'));
      useStore.setState({
        currentShop: { id: 100 },
        products: [{ id: 1 }],
      });

      // Should not throw
      await useStore.getState().refetchProducts(100);

      expect(useStore.getState().products).toEqual([{ id: 1 }]); // Unchanged
    });
  });

  describe('updateOrderStatus', () => {
    it('should update order status in orders array', () => {
      useStore.setState({
        orders: [
          { id: 1, status: 'pending' },
          { id: 2, status: 'pending' },
        ],
      });

      useStore.getState().updateOrderStatus(1, 'confirmed');

      const orders = useStore.getState().orders;
      expect(orders[0].status).toBe('confirmed');
      expect(orders[1].status).toBe('pending');
    });

    it('should update currentOrder if matching', () => {
      useStore.setState({
        orders: [],
        currentOrder: { id: 1, status: 'pending' },
      });

      useStore.getState().updateOrderStatus(1, 'confirmed');

      expect(useStore.getState().currentOrder.status).toBe('confirmed');
    });

    it('should not update currentOrder if not matching', () => {
      useStore.setState({
        orders: [],
        currentOrder: { id: 1, status: 'pending' },
      });

      useStore.getState().updateOrderStatus(2, 'confirmed');

      expect(useStore.getState().currentOrder.status).toBe('pending');
    });
  });
});

// ============================================================================
// 13. PERSISTENCE
// ============================================================================

describe('Persistence', () => {
  it('should persist token, pendingOrders, and cart', () => {
    // The persist middleware partialize function should only save these fields
    // This is a documentation test - actual persistence would need localStorage mock
    const _state = useStore.getState();

    // Verify the store has the persist config
    expect(useStore.persist).toBeDefined();
    expect(useStore.persist.getOptions().name).toBe('status-stock-storage');
  });
});

// ============================================================================
// TOTAL: 100+ test cases covering all major functionality
// ============================================================================
