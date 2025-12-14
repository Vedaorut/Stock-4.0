/**
 * @fileoverview CrystalPay Service Tests
 * @description Tests for CrystalPay payment gateway integration
 * 
 * Tests cover:
 * - Webhook signature verification (security critical)
 * - Invoice creation
 * - Invoice status retrieval
 * - Payment state helper functions
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';

// Mock axios BEFORE importing service
jest.unstable_mockModule('axios', () => ({
  default: {
    post: jest.fn(),
  },
}));

// Mock logger
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after all mocks
const axios = (await import('axios')).default;
const crystalPayService = await import('../../src/services/crystalPayService.js');

describe('CrystalPay Service', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up test credentials
    process.env.CRYSTALPAY_LOGIN = 'test_login';
    process.env.CRYSTALPAY_SECRET = 'test_secret';
    process.env.CRYSTALPAY_SALT = 'test_salt';
    process.env.CRYSTALPAY_CALLBACK_URL = 'https://example.com/webhook';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('verifySignature()', () => {
    test('should return true for valid signature', () => {
      const invoiceId = 'test_invoice_123';
      const salt = 'test_salt';
      
      // Calculate expected signature: SHA1(id:salt)
      const expectedSignature = crypto
        .createHash('sha1')
        .update(`${invoiceId}:${salt}`)
        .digest('hex');

      const payload = {
        id: invoiceId,
        signature: expectedSignature,
        state: 'payed',
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(true);
    });

    test('should return false for invalid signature', () => {
      const payload = {
        id: 'test_invoice_123',
        signature: 'invalid_signature_abc123',
        state: 'payed',
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(false);
    });

    test('should return false when signature is missing', () => {
      const payload = {
        id: 'test_invoice_123',
        state: 'payed',
        // no signature
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(false);
    });

    test('should return false when id is missing', () => {
      const payload = {
        signature: 'some_signature',
        state: 'payed',
        // no id
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(false);
    });

    test('should return true in dev/test mode when salt not configured', () => {
      // Remove salt
      delete process.env.CRYSTALPAY_SALT;
      process.env.NODE_ENV = 'test';

      const payload = {
        id: 'test_invoice_123',
        signature: 'any_signature',
        state: 'payed',
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(true);
    });

    test('should return false in production when salt not configured', () => {
      // Remove salt and set production
      delete process.env.CRYSTALPAY_SALT;
      process.env.NODE_ENV = 'production';

      const payload = {
        id: 'test_invoice_123',
        signature: 'any_signature',
        state: 'payed',
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(false);
    });

    test('should handle empty signature', () => {
      const payload = {
        id: 'test_invoice_123',
        signature: '',
        state: 'payed',
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(false);
    });

    test('should handle empty id', () => {
      const payload = {
        id: '',
        signature: 'some_signature',
        state: 'payed',
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(false);
    });
  });

  describe('createInvoice()', () => {
    test('should create invoice successfully', async () => {
      const mockResponse = {
        data: {
          error: false,
          id: 'crystal_invoice_123',
          url: 'https://pay.crystalpay.io/crystal_invoice_123',
          amount: '100.00',
          currency: 'USD',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await crystalPayService.createInvoice({
        amount: 100,
        method: 'BITCOIN',
        description: 'Test payment',
        extra: 'order_123',
        lifetime: 3600,
      });

      expect(result).toEqual({
        id: 'crystal_invoice_123',
        url: 'https://pay.crystalpay.io/crystal_invoice_123',
        amount: '100.00',
        currency: 'USD',
      });

      // Verify API was called correctly
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.crystalpay.io/v3/invoice/create/',
        expect.objectContaining({
          auth_login: 'test_login',
          auth_secret: 'test_secret',
          amount: '100',
          type: 'purchase',
          lifetime: 3600,
          currency: 'USD',
          required_method: 'BITCOIN',
          description: 'Test payment',
          extra: 'order_123',
        })
      );
    });

    test('should throw error on API error response', async () => {
      const mockResponse = {
        data: {
          error: true,
          errors: ['Invalid amount', 'Method not supported'],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await expect(
        crystalPayService.createInvoice({
          amount: -100,
          method: 'INVALID',
          description: 'Test',
        })
      ).rejects.toThrow('CrystalPay error: Invalid amount, Method not supported');
    });

    test('should throw error when credentials not configured', async () => {
      // Remove credentials
      delete process.env.CRYSTALPAY_LOGIN;
      delete process.env.CRYSTALPAY_SECRET;

      await expect(
        crystalPayService.createInvoice({
          amount: 100,
          method: 'BITCOIN',
          description: 'Test',
        })
      ).rejects.toThrow('CrystalPay credentials not configured');

      // Verify API was NOT called
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('should handle network error', async () => {
      axios.post.mockRejectedValue(new Error('Network Error'));

      await expect(
        crystalPayService.createInvoice({
          amount: 100,
          method: 'BITCOIN',
          description: 'Test',
        })
      ).rejects.toThrow('Network Error');
    });

    test('should handle API HTTP error response', async () => {
      const error = new Error('Request failed');
      error.response = {
        status: 500,
        data: { message: 'Internal Server Error' },
      };

      axios.post.mockRejectedValue(error);

      await expect(
        crystalPayService.createInvoice({
          amount: 100,
          method: 'BITCOIN',
          description: 'Test',
        })
      ).rejects.toThrow('Request failed');
    });

    test('should use default lifetime when not provided', async () => {
      const mockResponse = {
        data: {
          error: false,
          id: 'crystal_invoice_123',
          url: 'https://pay.crystalpay.io/crystal_invoice_123',
          amount: '100.00',
          currency: 'USD',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await crystalPayService.createInvoice({
        amount: 100,
        method: 'LITECOIN',
        description: 'Test payment',
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          lifetime: 3600, // Default value
        })
      );
    });

    test('should handle undefined extra parameter', async () => {
      const mockResponse = {
        data: {
          error: false,
          id: 'crystal_invoice_123',
          url: 'https://pay.crystalpay.io/crystal_invoice_123',
          amount: '100.00',
          currency: 'USD',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await crystalPayService.createInvoice({
        amount: 100,
        method: 'BITCOIN',
        description: 'Test payment',
        // extra is undefined
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          extra: undefined,
        })
      );
    });
  });

  describe('getInvoiceInfo()', () => {
    test('should get invoice info successfully', async () => {
      const mockResponse = {
        data: {
          error: false,
          id: 'crystal_invoice_123',
          state: 'payed',
          amount: '100.00',
          currency: 'USD',
          method: 'BITCOIN',
          created_at: '2024-01-15T10:00:00Z',
          expired_at: '2024-01-15T11:00:00Z',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await crystalPayService.getInvoiceInfo('crystal_invoice_123');

      expect(result).toEqual({
        id: 'crystal_invoice_123',
        state: 'payed',
        amount: '100.00',
        currency: 'USD',
        method: 'BITCOIN',
        createdAt: '2024-01-15T10:00:00Z',
        expiredAt: '2024-01-15T11:00:00Z',
      });

      // Verify API was called correctly
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.crystalpay.io/v3/invoice/info/',
        {
          auth_login: 'test_login',
          auth_secret: 'test_secret',
          id: 'crystal_invoice_123',
        }
      );
    });

    test('should throw error when invoice not found', async () => {
      const mockResponse = {
        data: {
          error: true,
          errors: ['Invoice not found'],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await expect(
        crystalPayService.getInvoiceInfo('nonexistent_invoice')
      ).rejects.toThrow('CrystalPay error: Invoice not found');
    });

    test('should throw error when credentials not configured', async () => {
      // Remove credentials
      delete process.env.CRYSTALPAY_LOGIN;
      delete process.env.CRYSTALPAY_SECRET;

      await expect(
        crystalPayService.getInvoiceInfo('crystal_invoice_123')
      ).rejects.toThrow('CrystalPay credentials not configured');

      // Verify API was NOT called
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('should handle network error', async () => {
      axios.post.mockRejectedValue(new Error('Connection timeout'));

      await expect(
        crystalPayService.getInvoiceInfo('crystal_invoice_123')
      ).rejects.toThrow('Connection timeout');
    });
  });

  describe('isPaymentSuccessful()', () => {
    test('should return true for "payed" state', () => {
      expect(crystalPayService.isPaymentSuccessful('payed')).toBe(true);
    });

    test('should return false for non-payed states', () => {
      expect(crystalPayService.isPaymentSuccessful('created')).toBe(false);
      expect(crystalPayService.isPaymentSuccessful('notpayed')).toBe(false);
      expect(crystalPayService.isPaymentSuccessful('processing')).toBe(false);
      expect(crystalPayService.isPaymentSuccessful('failed')).toBe(false);
      expect(crystalPayService.isPaymentSuccessful('wrongamount')).toBe(false);
      expect(crystalPayService.isPaymentSuccessful('unavailable')).toBe(false);
    });

    test('should return false for undefined/null', () => {
      expect(crystalPayService.isPaymentSuccessful(undefined)).toBe(false);
      expect(crystalPayService.isPaymentSuccessful(null)).toBe(false);
    });
  });

  describe('isPaymentPending()', () => {
    test('should return true for pending states', () => {
      expect(crystalPayService.isPaymentPending('created')).toBe(true);
      expect(crystalPayService.isPaymentPending('notpayed')).toBe(true);
      expect(crystalPayService.isPaymentPending('processing')).toBe(true);
    });

    test('should return false for non-pending states', () => {
      expect(crystalPayService.isPaymentPending('payed')).toBe(false);
      expect(crystalPayService.isPaymentPending('failed')).toBe(false);
      expect(crystalPayService.isPaymentPending('wrongamount')).toBe(false);
      expect(crystalPayService.isPaymentPending('unavailable')).toBe(false);
    });

    test('should return false for undefined/null', () => {
      expect(crystalPayService.isPaymentPending(undefined)).toBe(false);
      expect(crystalPayService.isPaymentPending(null)).toBe(false);
    });
  });

  describe('isPaymentFailed()', () => {
    test('should return true for failed states', () => {
      expect(crystalPayService.isPaymentFailed('failed')).toBe(true);
      expect(crystalPayService.isPaymentFailed('wrongamount')).toBe(true);
      expect(crystalPayService.isPaymentFailed('unavailable')).toBe(true);
    });

    test('should return false for non-failed states', () => {
      expect(crystalPayService.isPaymentFailed('created')).toBe(false);
      expect(crystalPayService.isPaymentFailed('notpayed')).toBe(false);
      expect(crystalPayService.isPaymentFailed('processing')).toBe(false);
      expect(crystalPayService.isPaymentFailed('payed')).toBe(false);
    });

    test('should return false for undefined/null', () => {
      expect(crystalPayService.isPaymentFailed(undefined)).toBe(false);
      expect(crystalPayService.isPaymentFailed(null)).toBe(false);
    });
  });

  describe('INVOICE_STATES constants', () => {
    test('should export all expected states', () => {
      expect(crystalPayService.INVOICE_STATES).toEqual({
        CREATED: 'created',
        NOT_PAYED: 'notpayed',
        PROCESSING: 'processing',
        WRONG_AMOUNT: 'wrongamount',
        FAILED: 'failed',
        PAYED: 'payed',
        UNAVAILABLE: 'unavailable',
      });
    });
  });

  describe('PAYMENT_METHODS constants', () => {
    test('should export supported payment methods', () => {
      expect(crystalPayService.PAYMENT_METHODS).toEqual({
        BITCOIN: 'BITCOIN',
        LITECOIN: 'LITECOIN',
      });
    });
  });

  describe('Edge Cases', () => {
    test('verifySignature should handle special characters in id', () => {
      const invoiceId = 'invoice-123_test!@#$%';
      const salt = 'test_salt';
      
      const expectedSignature = crypto
        .createHash('sha1')
        .update(`${invoiceId}:${salt}`)
        .digest('hex');

      const payload = {
        id: invoiceId,
        signature: expectedSignature,
      };

      const result = crystalPayService.verifySignature(payload);
      expect(result).toBe(true);
    });

    test('createInvoice should convert amount to string', async () => {
      const mockResponse = {
        data: {
          error: false,
          id: 'crystal_invoice_123',
          url: 'https://pay.crystalpay.io/crystal_invoice_123',
          amount: '99.99',
          currency: 'USD',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await crystalPayService.createInvoice({
        amount: 99.99, // Float number
        method: 'BITCOIN',
        description: 'Test',
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          amount: '99.99', // Should be string
        })
      );
    });

    test('createInvoice should convert extra to string', async () => {
      const mockResponse = {
        data: {
          error: false,
          id: 'crystal_invoice_123',
          url: 'https://pay.crystalpay.io/crystal_invoice_123',
          amount: '100.00',
          currency: 'USD',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await crystalPayService.createInvoice({
        amount: 100,
        method: 'BITCOIN',
        description: 'Test',
        extra: 12345, // Numeric extra
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          extra: '12345', // Should be string
        })
      );
    });
  });
});
