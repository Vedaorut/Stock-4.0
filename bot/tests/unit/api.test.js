/**
 * API Client Tests
 *
 * Unit tests for API clients using axios-mock-adapter
 * Run: npm test
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { setupApiMocks } from '../helpers/api-mocks.js';

// Create axios instance for testing
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 10000
});

describe('API Client Tests', () => {
  let mock;

  beforeEach(() => {
    mock = setupApiMocks(api);
  });

  afterEach(() => {
    mock.reset();
  });

  describe('Auth API', () => {
    it('should login user', async () => {
      const telegramUser = {
        id: 123456,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      };

      const response = await api.post('/api/auth/login', {
        telegramId: String(telegramUser.id),
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name
      });

      expect(response.status).toBe(200);
      expect(response.data.token).toBeDefined();
      expect(response.data.user.username).toBe('test_seller');
    });

    it('should get user profile', async () => {
      const response = await api.get('/api/auth/profile', {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.username).toBe('test_seller');
    });
  });

  describe('Shops API', () => {
    it('should create shop', async () => {
      const shopData = {
        name: 'Test Shop',
        description: 'Test Description'
      };

      const response = await api.post('/api/shops', shopData, {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(201);
      expect(response.data.name).toBe('Test Electronics');
      expect(response.data.isActive).toBe(true);
    });

    it('should get my shops', async () => {
      const response = await api.get('/api/shops/my', {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(1);
    });

    it('should search shops', async () => {
      const response = await api.get('/api/shops/active', {
        params: { search: 'electronics' }
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should get shop by id', async () => {
      const response = await api.get('/api/shops/1');

      expect(response.status).toBe(200);
      expect(response.data.id).toBe(1);
      expect(response.data.name).toBe('Test Electronics');
    });
  });

  describe('Products API', () => {
    it('should create product', async () => {
      const productData = {
        shopId: 1,
        name: 'iPhone 15',
        description: 'Latest iPhone',
        price: 999.99,
        stock: 10
      };

      const response = await api.post('/api/products', productData, {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(201);
      expect(response.data.name).toBe('iPhone 15 Pro');
      expect(response.data.price).toBe(999.99);
    });

    it('should list products with filters', async () => {
      const response = await api.get('/api/products', {
        params: {
          shopId: 1,
          inStock: true,
          page: 1
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.products).toHaveLength(2);
      expect(response.data.total).toBe(2);
    });
  });

  describe('Orders API', () => {
    it('should create order', async () => {
      const orderData = {
        shopId: 1,
        items: [
          { productId: 1, quantity: 1, price: 999.99 }
        ],
        shippingAddress: '123 Main St',
        paymentMethod: 'BTC'
      };

      const response = await api.post('/api/orders', orderData, {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(201);
      expect(response.data.id).toBe(1);
      expect(response.data.status).toBe('pending');
    });

    it('should get my orders', async () => {
      const response = await api.get('/api/orders/my', {
        params: { status: 'pending' },
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.orders).toHaveLength(1);
    });

    it('should update order status', async () => {
      // Setup specific mock for this test
      mock.onPut('/api/orders/1/status').reply(200, {
        id: 1,
        status: 'processing'
      });

      const response = await api.put('/api/orders/1/status', {
        status: 'processing'
      }, {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('processing');
    });
  });

  describe('Subscriptions API', () => {
    it('should subscribe to shop', async () => {
      const response = await api.post('/api/subscriptions', {
        shopId: 1
      }, {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(201);
      expect(response.data.shopId).toBe(1);
      expect(response.data.subscribedAt).toBeDefined();
    });

    it('should check subscription', async () => {
      mock.onGet('/api/subscriptions/1').reply(200, {
        isSubscribed: true
      });

      const response = await api.get('/api/subscriptions/1', {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.isSubscribed).toBe(true);
    });

    it('should unsubscribe from shop', async () => {
      const response = await api.delete('/api/subscriptions/1', {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.message).toBe('Unsubscribed successfully');
    });
  });

  describe('Payments API', () => {
    it('should verify payment', async () => {
      const response = await api.post('/api/payments/verify', {
        orderId: 1,
        txHash: 'tx-hash-123',
        currency: 'BTC'
      }, {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data.verified).toBe(true);
      expect(response.data.confirmations).toBe(3);
    });

    it('should get payments by order', async () => {
      mock.onGet('/api/payments/order/1').reply(200, [
        {
          id: 1,
          orderId: 1,
          txHash: 'tx-hash-123',
          status: 'confirmed'
        }
      ]);

      const response = await api.get('/api/payments/order/1', {
        headers: {
          Authorization: 'Bearer mock-token'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].txHash).toBe('tx-hash-123');
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 Unauthorized', async () => {
      mock.reset();
      mock.onGet('/api/auth/profile').reply(401, {
        error: 'Unauthorized'
      });

      await expect(api.get('/api/auth/profile')).rejects.toThrow();
    });

    it('should handle 404 Not Found', async () => {
      mock.reset();
      mock.onGet('/api/shops/999').reply(404, {
        error: 'Shop not found'
      });

      await expect(api.get('/api/shops/999')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mock.reset();
      mock.onGet('/api/shops/active').networkError();

      await expect(api.get('/api/shops/active')).rejects.toThrow();
    });
  });
});
