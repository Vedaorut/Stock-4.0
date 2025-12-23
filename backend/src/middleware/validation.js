import { body, param, query, validationResult } from 'express-validator';
import { validateCryptoAddress, getCryptoValidationError } from '../utils/validation.js';
import { isValidPublicUrl } from '../utils/urlValidator.js';
import { PAGINATION } from '../utils/constants.js';
import logger from '../utils/logger.js';

/**
 * Validate request and return errors if any
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // ✅ FIX: Log validation errors for debugging intermittent issues
    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      body: req.body,
      errors: errors.array(),
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};

/**
 * Authentication validation schemas
 */
export const authValidation = {
  login: [
    body('telegramId').isInt({ min: 1 }).withMessage('Valid Telegram ID is required'),
    body('initData').notEmpty().withMessage('Telegram init data is required'),
    validate,
  ],

  // SECURITY: register endpoint now extracts user data from verified x-telegram-init-data header
  // Body validation removed - all user data comes from cryptographically verified initData
  register: [
    // No body validation needed - controller uses initData from header
    validate,
  ],

  updateRole: [
    body('role')
      .isIn(['buyer', 'seller', 'worker'])
      .withMessage('Role must be either "buyer", "seller", or "worker"'),
    validate,
  ],
};

/**
 * Shop validation schemas
 */
export const shopValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Shop name must be 3-100 characters')
      .matches(/^[a-zA-Z0-9 _-]+$/)
      .withMessage('Shop name must contain only Latin letters, numbers, spaces, underscore and dash'),
    body('description')
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('logo')
      .optional()
      .isURL()
      .withMessage('Logo must be a valid URL')
      .custom((value) => {
        if (!isValidPublicUrl(value)) {
          throw new Error('Logo URL must be a public http/https URL (private IPs not allowed)');
        }
        return true;
      }),
    body('promoCode')
      .optional()
      .trim()
      .isLength({ min: 0, max: 32 })
      .withMessage('Promo code must not exceed 32 characters'),
    validate,
  ],

  update: [
    param('id').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Shop name must be 3-100 characters')
      .matches(/^[a-zA-Z0-9 _-]+$/)
      .withMessage('Shop name must contain only Latin letters, numbers, spaces, underscore and dash'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('logo')
      .optional()
      .isURL()
      .withMessage('Logo must be a valid URL')
      .custom((value) => {
        if (!isValidPublicUrl(value)) {
          throw new Error('Logo URL must be a public http/https URL (private IPs not allowed)');
        }
        return true;
      }),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    validate,
  ],

  getById: [param('id').isInt({ min: 1 }).withMessage('Valid shop ID is required'), validate],
};

/**
 * Product validation schemas
 */
export const productValidation = {
  create: [
    body('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    body('name')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Product name must be 3-200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters'),
    body('price')
      .isFloat({ min: 0.01, max: 999999.99 })
      .withMessage('Price must be between 0.01 and 999999.99'),
    body('currency')
      .optional()
      .isIn(['BTC', 'ETH', 'USDT', 'LTC', 'USD'])
      .withMessage('Currency must be BTC, ETH, USDT, LTC, or USD'),
    body('stockQuantity')
      .optional()
      .isInt({ min: 0 })
      .withMessage('stockQuantity must be a non-negative integer'),
    body('stock').optional().isInt({ min: 0 }).withMessage('stock must be a non-negative integer'),
    body('images').optional().isArray().withMessage('Images must be an array'),
    body('images.*').optional().isURL().withMessage('Each image must be a valid URL'),
    body('category')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Category must not exceed 100 characters'),
    body('is_preorder').optional().isBoolean().withMessage('is_preorder must be a boolean value'),
    validate,
  ],

  update: [
    param('id').isInt({ min: 1 }).withMessage('Valid product ID is required'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Product name must be 3-200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters'),
    body('price')
      .optional()
      .isFloat({ min: 0.01, max: 999999.99 })
      .withMessage('Price must be between 0.01 and 999999.99'),
    body('currency')
      .optional()
      .isIn(['BTC', 'ETH', 'USDT', 'LTC', 'USD'])
      .withMessage('Currency must be BTC, ETH, USDT, LTC, or USD'),
    body('stockQuantity')
      .optional()
      .isInt({ min: 0 })
      .withMessage('stockQuantity must be a non-negative integer'),
    body('stock').optional().isInt({ min: 0 }).withMessage('stock must be a non-negative integer'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
    body('is_preorder').optional().isBoolean().withMessage('is_preorder must be a boolean value'),
    validate,
  ],

  getById: [param('id').isInt({ min: 1 }).withMessage('Valid product ID is required'), validate],

  list: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: PAGINATION.MAX_LIMIT })
      .withMessage(`Limit must be between 1 and ${PAGINATION.MAX_LIMIT}`),
    query('shopId').optional().isInt({ min: 1 }).withMessage('Shop ID must be a positive integer'),
    query('category')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Category must not exceed 100 characters'),
    validate,
  ],

  bulkDeleteAll: [
    body('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    validate,
  ],

  bulkDeleteByIds: [
    body('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    body('productIds').isArray({ min: 1 }).withMessage('productIds must be a non-empty array'),
    body('productIds.*')
      .isInt({ min: 1 })
      .withMessage('Each product ID must be a positive integer'),
    validate,
  ],
};

/**
 * Order validation schemas
 */
export const orderValidation = {
  create: [
    // Support new multi-item format
    body('items').optional().isArray({ min: 1 }).withMessage('items must be a non-empty array'),
    body('items.*.productId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Each item must have a valid productId'),
    body('items.*.quantity')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Each item must have quantity >= 1'),

    // Support legacy single-item format (backward compatible)
    body('productId').optional().isInt({ min: 1 }).withMessage('Valid product ID is required'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),

    // Common fields
    body('deliveryAddress')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Delivery address must not exceed 500 characters'),

    // Custom validator: ensure either items or productId+quantity provided
    body().custom((body) => {
      const hasItems = body.items && Array.isArray(body.items) && body.items.length > 0;
      const hasLegacy = body.productId && body.quantity;

      if (!hasItems && !hasLegacy) {
        throw new Error('Either items array or productId+quantity required');
      }
      return true;
    }),

    validate,
  ],

  getById: [param('id').isInt({ min: 1 }).withMessage('Valid order ID is required'), validate],

  updateStatus: [
    param('id').isInt({ min: 1 }).withMessage('Valid order ID is required'),
    body('status')
      .isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Invalid order status'),
    validate,
  ],

  bulkUpdateStatus: [
    body('order_ids').isArray({ min: 1 }).withMessage('order_ids must be a non-empty array'),
    body('order_ids.*').isInt({ min: 1 }).withMessage('Each order ID must be a positive integer'),
    body('status')
      .isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Invalid order status'),
    validate,
  ],
};

/**
 * Payment validation schemas
 */
export const paymentValidation = {
  verify: [
    body('orderId').isInt({ min: 1 }).withMessage('Valid order ID is required'),
    body('txHash')
      .optional({ nullable: true })
      .trim(),
    body('paymentLink')
      .optional({ nullable: true })
      .trim(),
    body('txLink')
      .optional({ nullable: true })
      .trim(),
    body('transactionUrl')
      .optional({ nullable: true })
      .trim(),
    body('txHash').custom((value, { req }) => {
      const proof = value || req.body.paymentLink || req.body.txLink || req.body.transactionUrl;
      if (!proof) {
        throw new Error('Transaction hash or payment link is required');
      }
      return true;
    }),
    body('currency')
      .isIn(['BTC', 'ETH', 'USDT', 'USDT_TRC20', 'LTC'])
      .withMessage('Currency must be BTC, ETH, USDT, USDT_TRC20, or LTC'),
    validate,
  ],

  getByOrder: [
    param('orderId').isInt({ min: 1 }).withMessage('Valid order ID is required'),
    validate,
  ],
};

/**
 * Wallet validation schemas
 */
export const walletValidation = {
  getWallets: [
    param('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    validate,
  ],

  updateWallets: [
    param('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    body('walletBtc')
      .optional()
      .trim()
      .custom((value) => {
        if (value && !validateCryptoAddress(value, 'BTC')) {
          throw new Error(getCryptoValidationError('BTC'));
        }
        return true;
      }),
    body('walletEth')
      .optional()
      .trim()
      .custom((value) => {
        if (value && !validateCryptoAddress(value, 'ETH')) {
          throw new Error(getCryptoValidationError('ETH'));
        }
        return true;
      }),
    body('walletUsdt')
      .optional()
      .trim()
      .custom((value) => {
        if (value && !validateCryptoAddress(value, 'USDT')) {
          throw new Error(getCryptoValidationError('USDT'));
        }
        return true;
      }),
    body('walletLtc')
      .optional()
      .trim()
      .custom((value) => {
        if (value && !validateCryptoAddress(value, 'LTC')) {
          throw new Error(getCryptoValidationError('LTC'));
        }
        return true;
      }),
    validate,
  ],
};

/**
 * Bulk operation validation middleware
 * Prevents DoS attacks via excessively large bulk operations
 */
export const validateBulkOperation = [
  body('productIds')
    .optional()
    .isArray({ max: 100 })
    .withMessage('Cannot process more than 100 items in bulk operation'),
  body('productIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Each product ID must be a positive integer'),
  body('order_ids')
    .optional()
    .isArray({ max: 100 })
    .withMessage('Cannot process more than 100 orders in bulk operation'),
  body('order_ids.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Each order ID must be a positive integer'),
  validate,
];

/**
 * AI prompt validation middleware
 * Prevents excessive AI usage and prompt injection
 */
export const aiValidation = {
  chat: [
    body('message')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('shopId').optional().isInt({ min: 1 }).withMessage('Shop ID must be a positive integer'),
    body('conversationHistory')
      .optional()
      .isArray({ max: 50 })
      .withMessage('Conversation history cannot exceed 50 messages'),
    validate,
  ],
};

/**
 * Query parameter validation for list/pagination endpoints (P1-PERF-005)
 * Enforces MAX_LIMIT globally to prevent unbounded queries
 */
export const validateQueryParams = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: PAGINATION.MAX_LIMIT })
    .withMessage(`Limit must be between 1 and ${PAGINATION.MAX_LIMIT}`)
    .customSanitizer((value) => Math.min(parseInt(value, 10), PAGINATION.MAX_LIMIT)),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
  validate,
];

export default {
  validate,
  authValidation,
  shopValidation,
  productValidation,
  orderValidation,
  paymentValidation,
  walletValidation,
  validateBulkOperation,
  aiValidation,
  validateQueryParams,
};
