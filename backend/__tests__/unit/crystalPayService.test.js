import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Unit tests for CrystalPay Service
 *
 * Tests cover:
 * - createInvoice: Invoice creation with API validation
 * - getInvoiceInfo: Invoice status retrieval
 * - verifySignature: Webhook signature verification
 * - isPaymentSuccessful/Pending/Failed: State helpers
 *
 * CRITICAL: All external API calls are mocked
 */

// Mock axios
const mockAxiosPost = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    post: mockAxiosPost,
  },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Store original env
const originalEnv = { ...process.env };

// Import after mocking
const logger = (await import('../../src/utils/logger.js')).default;
const {
  createInvoice,
  getInvoiceInfo,
  verifySignature,
  isPaymentSuccessful,
  isPaymentPending,
  isPaymentFailed,
  INVOICE_STATES,
  PAYMENT_METHODS,
} = await import('../../src/services/crystalPayService.js');

describe('CrystalPay Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosPost.mockClear();

    // Setup default env
    process.env.CRYSTALPAY_LOGIN = 'test_login';
    process.env.CRYSTALPAY_SECRET = 'test_secret';
    process.env.CRYSTALPAY_SALT = 'test_salt';
    process.env.CRYSTALPAY_CALLBACK_URL = 'https://test.com/callback';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  // ============================================================================
  // createInvoice - CRITICAL (P0)
  // ============================================================================
  describe('createInvoice', () => {
    describe('Happy Path', () => {
      it('should create invoice successfully with all parameters', async () => {
        const mockResponse = {
          data: {
            id: 'crystal_inv_123',
            url: 'https://pay.crystalpay.io/crystal_inv_123',
            amount: '25.00',
            currency: 'USD',
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        const result = await createInvoice({
          amount: 25,
          method: PAYMENT_METHODS.BITCOIN,
          description: 'Test subscription payment',
          extra: '12345',
          lifetime: 3600,
        });

        expect(result).toEqual({
          id: 'crystal_inv_123',
          url: 'https://pay.crystalpay.io/crystal_inv_123',
          amount: '25.00',
          currency: 'USD',
        });

        expect(mockAxiosPost).toHaveBeenCalledWith(
          'https://api.crystalpay.io/v3/invoice/create/',
          expect.objectContaining({
            auth_login: 'test_login',
            auth_secret: 'test_secret',
            amount: '25',
            type: 'purchase',
            lifetime: 3600,
            currency: 'USD',
            required_method: 'BITCOIN',
            callback_url: 'https://test.com/callback',
            description: 'Test subscription payment',
            extra: '12345',
          })
        );

        expect(logger.info).toHaveBeenCalledWith(
          '[CrystalPay] Creating invoice',
          expect.objectContaining({ amount: 25, method: 'BITCOIN' })
        );
      });

      it('should use default lifetime of 3600 seconds', async () => {
        const mockResponse = {
          data: {
            id: 'inv_123',
            url: 'https://pay.crystalpay.io/inv_123',
            amount: '35.00',
            currency: 'USD',
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        await createInvoice({
          amount: 35,
          method: PAYMENT_METHODS.LITECOIN,
          description: 'Pro subscription',
        });

        expect(mockAxiosPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            lifetime: 3600,
          })
        );
      });

      it('should handle undefined extra parameter', async () => {
        const mockResponse = {
          data: {
            id: 'inv_456',
            url: 'https://pay.crystalpay.io/inv_456',
            amount: '25.00',
            currency: 'USD',
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        await createInvoice({
          amount: 25,
          method: PAYMENT_METHODS.BITCOIN,
          description: 'Test',
        });

        expect(mockAxiosPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            extra: undefined,
          })
        );
      });

      it('should convert extra to string', async () => {
        const mockResponse = {
          data: {
            id: 'inv_789',
            url: 'https://pay.crystalpay.io/inv_789',
            amount: '25.00',
            currency: 'USD',
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        await createInvoice({
          amount: 25,
          method: PAYMENT_METHODS.BITCOIN,
          description: 'Test',
          extra: 12345, // Number passed, should become string
        });

        expect(mockAxiosPost).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            extra: '12345',
          })
        );
      });
    });

    describe('Error Handling', () => {
      it('should throw error if credentials not configured', async () => {
        delete process.env.CRYSTALPAY_LOGIN;
        delete process.env.CRYSTALPAY_SECRET;

        await expect(
          createInvoice({
            amount: 25,
            method: PAYMENT_METHODS.BITCOIN,
            description: 'Test',
          })
        ).rejects.toThrow('CrystalPay credentials not configured');
      });

      it('should throw error if only login is missing', async () => {
        delete process.env.CRYSTALPAY_LOGIN;

        await expect(
          createInvoice({
            amount: 25,
            method: PAYMENT_METHODS.BITCOIN,
            description: 'Test',
          })
        ).rejects.toThrow('CrystalPay credentials not configured');
      });

      it('should throw error if API returns error flag', async () => {
        const mockResponse = {
          data: {
            error: true,
            errors: ['Invalid method', 'Amount too low'],
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        await expect(
          createInvoice({
            amount: 25,
            method: 'INVALID',
            description: 'Test',
          })
        ).rejects.toThrow('CrystalPay error: Invalid method, Amount too low');

        expect(logger.error).toHaveBeenCalledWith(
          '[CrystalPay] Create invoice error',
          expect.objectContaining({
            errors: ['Invalid method', 'Amount too low'],
          })
        );
      });

      it('should handle API network error with response data', async () => {
        const networkError = new Error('Request failed');
        networkError.response = {
          status: 500,
          data: { message: 'Internal server error' },
        };

        mockAxiosPost.mockRejectedValueOnce(networkError);

        await expect(
          createInvoice({
            amount: 25,
            method: PAYMENT_METHODS.BITCOIN,
            description: 'Test',
          })
        ).rejects.toThrow('Request failed');

        expect(logger.error).toHaveBeenCalledWith(
          '[CrystalPay] API error',
          expect.objectContaining({
            status: 500,
            data: { message: 'Internal server error' },
          })
        );
      });

      it('should rethrow errors without response', async () => {
        const networkError = new Error('Network timeout');

        mockAxiosPost.mockRejectedValueOnce(networkError);

        await expect(
          createInvoice({
            amount: 25,
            method: PAYMENT_METHODS.BITCOIN,
            description: 'Test',
          })
        ).rejects.toThrow('Network timeout');
      });
    });
  });

  // ============================================================================
  // getInvoiceInfo - CRITICAL (P0)
  // ============================================================================
  describe('getInvoiceInfo', () => {
    describe('Happy Path', () => {
      it('should return invoice info successfully', async () => {
        const mockResponse = {
          data: {
            id: 'crystal_inv_123',
            state: 'payed',
            amount: '25.00',
            currency: 'USD',
            method: 'BITCOIN',
            created_at: '2024-01-15T10:00:00Z',
            expired_at: '2024-01-15T11:00:00Z',
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        const result = await getInvoiceInfo('crystal_inv_123');

        expect(result).toEqual({
          id: 'crystal_inv_123',
          state: 'payed',
          amount: '25.00',
          currency: 'USD',
          method: 'BITCOIN',
          createdAt: '2024-01-15T10:00:00Z',
          expiredAt: '2024-01-15T11:00:00Z',
        });

        expect(mockAxiosPost).toHaveBeenCalledWith(
          'https://api.crystalpay.io/v3/invoice/info/',
          {
            auth_login: 'test_login',
            auth_secret: 'test_secret',
            id: 'crystal_inv_123',
          }
        );
      });

      it('should handle pending invoice state', async () => {
        const mockResponse = {
          data: {
            id: 'pending_inv',
            state: 'notpayed',
            amount: '35.00',
            currency: 'USD',
            method: 'LITECOIN',
            created_at: '2024-01-15T10:00:00Z',
            expired_at: '2024-01-15T11:00:00Z',
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        const result = await getInvoiceInfo('pending_inv');

        expect(result.state).toBe('notpayed');
      });

      it('should handle processing invoice state', async () => {
        const mockResponse = {
          data: {
            id: 'processing_inv',
            state: 'processing',
            amount: '25.00',
            currency: 'USD',
            method: 'BITCOIN',
            created_at: '2024-01-15T10:00:00Z',
            expired_at: '2024-01-15T11:00:00Z',
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        const result = await getInvoiceInfo('processing_inv');

        expect(result.state).toBe('processing');
      });
    });

    describe('Error Handling', () => {
      it('should throw error if credentials not configured', async () => {
        delete process.env.CRYSTALPAY_LOGIN;
        delete process.env.CRYSTALPAY_SECRET;

        await expect(getInvoiceInfo('inv_123')).rejects.toThrow(
          'CrystalPay credentials not configured'
        );
      });

      it('should throw error if API returns error flag', async () => {
        const mockResponse = {
          data: {
            error: true,
            errors: ['Invoice not found'],
          },
        };

        mockAxiosPost.mockResolvedValueOnce(mockResponse);

        await expect(getInvoiceInfo('invalid_inv')).rejects.toThrow(
          'CrystalPay error: Invoice not found'
        );
      });

      it('should log and rethrow on API error', async () => {
        const apiError = new Error('API timeout');
        mockAxiosPost.mockRejectedValueOnce(apiError);

        await expect(getInvoiceInfo('inv_123')).rejects.toThrow('API timeout');

        expect(logger.error).toHaveBeenCalledWith(
          '[CrystalPay] Get invoice info error',
          expect.objectContaining({
            invoiceId: 'inv_123',
            error: 'API timeout',
          })
        );
      });
    });
  });

  // ============================================================================
  // verifySignature - CRITICAL (P0 Security)
  // ============================================================================
  describe('verifySignature', () => {
    describe('Happy Path', () => {
      it('should return true for valid signature', async () => {
        // SHA1(inv_123:test_salt) = expected hash
        // Using crypto module to calculate expected signature
        const crypto = await import('crypto');
        const expectedSignature = crypto.default
          .createHash('sha1')
          .update('inv_123:test_salt')
          .digest('hex');

        const payload = {
          id: 'inv_123',
          signature: expectedSignature,
        };

        const result = verifySignature(payload);

        expect(result).toBe(true);
      });

      it('should return false for invalid signature', () => {
        const payload = {
          id: 'inv_123',
          signature: 'invalid_signature_hash',
        };

        const result = verifySignature(payload);

        expect(result).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith(
          '[CrystalPay] Invalid signature',
          expect.objectContaining({
            received: expect.any(String),
            expected: expect.any(String),
          })
        );
      });
    });

    describe('Edge Cases - Missing Data', () => {
      it('should return false if signature is missing', () => {
        const payload = {
          id: 'inv_123',
        };

        const result = verifySignature(payload);

        expect(result).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('[CrystalPay] Missing signature or id');
      });

      it('should return false if id is missing', () => {
        const payload = {
          signature: 'some_signature',
        };

        const result = verifySignature(payload);

        expect(result).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('[CrystalPay] Missing signature or id');
      });

      it('should return false if both signature and id are missing', () => {
        const payload = {};

        const result = verifySignature(payload);

        expect(result).toBe(false);
      });
    });

    describe('Security - Salt Configuration', () => {
      it('should return false in production if salt not configured', () => {
        delete process.env.CRYSTALPAY_SALT;
        process.env.NODE_ENV = 'production';

        const payload = {
          id: 'inv_123',
          signature: 'any_signature',
        };

        const result = verifySignature(payload);

        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
          '[CrystalPay] CRITICAL: Salt not configured in production! Rejecting webhook.'
        );
      });

      it('should return true in development mode if salt not configured', () => {
        delete process.env.CRYSTALPAY_SALT;
        process.env.NODE_ENV = 'development';

        const payload = {
          id: 'inv_123',
          signature: 'any_signature',
        };

        const result = verifySignature(payload);

        expect(result).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
          '[CrystalPay] Salt not configured, allowing in dev mode'
        );
      });

      it('should return true in test mode if salt not configured', () => {
        delete process.env.CRYSTALPAY_SALT;
        process.env.NODE_ENV = 'test';

        const payload = {
          id: 'inv_123',
          signature: 'any_signature',
        };

        const result = verifySignature(payload);

        expect(result).toBe(true);
      });
    });
  });

  // ============================================================================
  // State Helper Functions
  // ============================================================================
  describe('isPaymentSuccessful', () => {
    it('should return true for payed state', () => {
      expect(isPaymentSuccessful(INVOICE_STATES.PAYED)).toBe(true);
    });

    it('should return false for other states', () => {
      expect(isPaymentSuccessful(INVOICE_STATES.CREATED)).toBe(false);
      expect(isPaymentSuccessful(INVOICE_STATES.NOT_PAYED)).toBe(false);
      expect(isPaymentSuccessful(INVOICE_STATES.PROCESSING)).toBe(false);
      expect(isPaymentSuccessful(INVOICE_STATES.FAILED)).toBe(false);
      expect(isPaymentSuccessful(INVOICE_STATES.WRONG_AMOUNT)).toBe(false);
    });
  });

  describe('isPaymentPending', () => {
    it('should return true for created state', () => {
      expect(isPaymentPending(INVOICE_STATES.CREATED)).toBe(true);
    });

    it('should return true for notpayed state', () => {
      expect(isPaymentPending(INVOICE_STATES.NOT_PAYED)).toBe(true);
    });

    it('should return true for processing state', () => {
      expect(isPaymentPending(INVOICE_STATES.PROCESSING)).toBe(true);
    });

    it('should return false for terminal states', () => {
      expect(isPaymentPending(INVOICE_STATES.PAYED)).toBe(false);
      expect(isPaymentPending(INVOICE_STATES.FAILED)).toBe(false);
      expect(isPaymentPending(INVOICE_STATES.WRONG_AMOUNT)).toBe(false);
    });
  });

  describe('isPaymentFailed', () => {
    it('should return true for failed state', () => {
      expect(isPaymentFailed(INVOICE_STATES.FAILED)).toBe(true);
    });

    it('should return true for wrong_amount state', () => {
      expect(isPaymentFailed(INVOICE_STATES.WRONG_AMOUNT)).toBe(true);
    });

    it('should return true for unavailable state', () => {
      expect(isPaymentFailed(INVOICE_STATES.UNAVAILABLE)).toBe(true);
    });

    it('should return false for other states', () => {
      expect(isPaymentFailed(INVOICE_STATES.CREATED)).toBe(false);
      expect(isPaymentFailed(INVOICE_STATES.PAYED)).toBe(false);
      expect(isPaymentFailed(INVOICE_STATES.PROCESSING)).toBe(false);
    });
  });

  // ============================================================================
  // Constants Validation
  // ============================================================================
  describe('Constants', () => {
    it('should export correct PAYMENT_METHODS', () => {
      expect(PAYMENT_METHODS).toEqual({
        BITCOIN: 'BITCOIN',
        LITECOIN: 'LITECOIN',
      });
    });

    it('should export correct INVOICE_STATES', () => {
      expect(INVOICE_STATES).toEqual({
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
});
