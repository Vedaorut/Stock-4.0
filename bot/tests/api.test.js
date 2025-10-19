/**
 * API Client Tests
 *
 * Unit tests for API clients
 * Run: npm test
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';

// Mock axios
jest.mock('axios');

// Import API clients
import { authApi } from '../api/auth.js';
import { shopsApi } from '../api/shops.js';
import { productsApi } from '../api/products.js';
import { ordersApi } from '../api/orders.js';
import { subscriptionsApi } from '../api/subscriptions.js';
import { paymentsApi } from '../api/payments.js';

describe('API Client Tests', () => {
  let mockAxiosInstance;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock axios instance
    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn()
        }
      }
    };

    axios.create.mockReturnValue(mockAxiosInstance);
  });

  describe('Auth API', () => {
    it('should login user', async () => {
      const mockResponse = {
        data: {
          token: 'mock-jwt-token',
          user: {
            id: 1,
            telegramId: '123456',
            username: 'testuser'
          }
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const telegramUser = {
        id: 123456,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      };

      const result = await authApi.login(telegramUser);

      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.username).toBe('testuser');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/auth/login',
          data: {
            telegramId: '123456',
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User',
            initData: null
          }
        })
      );
    });

    it('should get user profile', async () => {
      const mockResponse = {
        data: {
          id: 1,
          telegramId: '123456',
          username: 'testuser',
          firstName: 'Test'
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await authApi.getProfile('mock-token');

      expect(result.username).toBe('testuser');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/api/auth/profile',
          headers: {
            Authorization: 'Bearer mock-token'
          }
        })
      );
    });
  });

  describe('Shops API', () => {
    it('should create shop', async () => {
      const mockResponse = {
        data: {
          id: 1,
          name: 'Test Shop',
          isActive: false
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const shopData = {
        name: 'Test Shop',
        description: 'Test Description',
        currency: 'BTC'
      };

      const result = await shopsApi.create('mock-token', shopData);

      expect(result.name).toBe('Test Shop');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/shops',
          data: shopData
        })
      );
    });

    it('should get my shops', async () => {
      const mockResponse = {
        data: [
          { id: 1, name: 'Shop 1' },
          { id: 2, name: 'Shop 2' }
        ]
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await shopsApi.getMyShops('mock-token');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Shop 1');
    });

    it('should search shops', async () => {
      const mockResponse = {
        data: [
          { id: 1, name: 'Electronics Shop' }
        ]
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await shopsApi.search('electronics');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/shops/active?search=electronics'
        })
      );
    });
  });

  describe('Products API', () => {
    it('should create product', async () => {
      const mockResponse = {
        data: {
          id: 1,
          name: 'iPhone 15',
          price: 999.99,
          stock: 10
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const productData = {
        shopId: 1,
        name: 'iPhone 15',
        description: 'Latest iPhone',
        price: 999.99,
        stock: 10
      };

      const result = await productsApi.create('mock-token', productData);

      expect(result.name).toBe('iPhone 15');
      expect(result.price).toBe(999.99);
    });

    it('should list products with filters', async () => {
      const mockResponse = {
        data: {
          products: [
            { id: 1, name: 'Product 1' },
            { id: 2, name: 'Product 2' }
          ],
          total: 2,
          page: 1,
          limit: 20
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await productsApi.list({
        shopId: 1,
        inStock: true,
        page: 1
      });

      expect(result.products).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('shopId=1')
        })
      );
    });
  });

  describe('Orders API', () => {
    it('should create order', async () => {
      const mockResponse = {
        data: {
          id: 1,
          totalAmount: 999.99,
          status: 'pending',
          items: [
            { productId: 1, quantity: 1, price: 999.99 }
          ]
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const orderData = {
        shopId: 1,
        items: [
          { productId: 1, quantity: 1, price: 999.99 }
        ],
        shippingAddress: '123 Main St',
        paymentMethod: 'BTC'
      };

      const result = await ordersApi.create('mock-token', orderData);

      expect(result.id).toBe(1);
      expect(result.status).toBe('pending');
    });

    it('should get my orders', async () => {
      const mockResponse = {
        data: {
          orders: [
            { id: 1, status: 'pending' },
            { id: 2, status: 'completed' }
          ],
          total: 2
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await ordersApi.getMyOrders('mock-token', {
        status: 'pending'
      });

      expect(result.orders).toHaveLength(2);
    });

    it('should update order status', async () => {
      const mockResponse = {
        data: {
          id: 1,
          status: 'processing'
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await ordersApi.updateStatus('mock-token', 1, 'processing');

      expect(result.status).toBe('processing');
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/api/orders/1/status',
          data: { status: 'processing' }
        })
      );
    });
  });

  describe('Subscriptions API', () => {
    it('should subscribe to shop', async () => {
      const mockResponse = {
        data: {
          shopId: 1,
          subscribedAt: new Date().toISOString()
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await subscriptionsApi.subscribe('mock-token', 1);

      expect(result.shopId).toBe(1);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/subscriptions',
          data: { shopId: 1 }
        })
      );
    });

    it('should check subscription', async () => {
      const mockResponse = {
        data: {
          isSubscribed: true
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await subscriptionsApi.checkSubscription('mock-token', 1);

      expect(result.isSubscribed).toBe(true);
    });

    it('should unsubscribe from shop', async () => {
      const mockResponse = {
        data: {
          message: 'Unsubscribed successfully'
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      await subscriptionsApi.unsubscribe('mock-token', 1);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/api/subscriptions/1'
        })
      );
    });
  });

  describe('Payments API', () => {
    it('should verify payment', async () => {
      const mockResponse = {
        data: {
          verified: true,
          confirmations: 3,
          confirmationsRequired: 3,
          amount: 0.001
        }
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await paymentsApi.verify(
        'mock-token',
        1,
        'tx-hash-123',
        'BTC'
      );

      expect(result.verified).toBe(true);
      expect(result.confirmations).toBe(3);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/payments/verify',
          data: {
            orderId: 1,
            txHash: 'tx-hash-123',
            currency: 'BTC'
          }
        })
      );
    });

    it('should get payments by order', async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            orderId: 1,
            txHash: 'tx-hash-123',
            status: 'confirmed'
          }
        ]
      };

      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await paymentsApi.getByOrder('mock-token', 1);

      expect(result).toHaveLength(1);
      expect(result[0].txHash).toBe('tx-hash-123');
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 Unauthorized', async () => {
      const errorResponse = {
        response: {
          status: 401,
          data: { error: 'Unauthorized' }
        }
      };

      mockAxiosInstance.request.mockRejectedValue(errorResponse);

      await expect(authApi.getProfile('invalid-token')).rejects.toThrow(
        'Ошибка авторизации'
      );
    });

    it('should handle 404 Not Found', async () => {
      const errorResponse = {
        response: {
          status: 404,
          data: { error: 'Shop not found' }
        }
      };

      mockAxiosInstance.request.mockRejectedValue(errorResponse);

      await expect(shopsApi.getById(999)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const errorResponse = {
        request: {},
        message: 'Network Error'
      };

      mockAxiosInstance.request.mockRejectedValue(errorResponse);

      await expect(shopsApi.listActive()).rejects.toThrow('Ошибка сети');
    });
  });
});
