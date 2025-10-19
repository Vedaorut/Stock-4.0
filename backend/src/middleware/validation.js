import { body, param, query, validationResult } from 'express-validator';

/**
 * Validate request and return errors if any
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }

  next();
};

/**
 * Authentication validation schemas
 */
export const authValidation = {
  login: [
    body('telegramId')
      .isInt({ min: 1 })
      .withMessage('Valid Telegram ID is required'),
    body('initData')
      .notEmpty()
      .withMessage('Telegram init data is required'),
    validate
  ],

  register: [
    body('telegramId')
      .isInt({ min: 1 })
      .withMessage('Valid Telegram ID is required'),
    body('username')
      .optional()
      .isLength({ min: 3, max: 32 })
      .withMessage('Username must be 3-32 characters'),
    body('firstName')
      .notEmpty()
      .isLength({ max: 64 })
      .withMessage('First name is required (max 64 characters)'),
    validate
  ]
};

/**
 * Shop validation schemas
 */
export const shopValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Shop name must be 3-100 characters'),
    body('description')
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('logo')
      .optional()
      .isURL()
      .withMessage('Logo must be a valid URL'),
    validate
  ],

  update: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid shop ID is required'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Shop name must be 3-100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must not exceed 500 characters'),
    body('logo')
      .optional()
      .isURL()
      .withMessage('Logo must be a valid URL'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    validate
  ],

  getById: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid shop ID is required'),
    validate
  ]
};

/**
 * Product validation schemas
 */
export const productValidation = {
  create: [
    body('shopId')
      .isInt({ min: 1 })
      .withMessage('Valid shop ID is required'),
    body('name')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Product name must be 3-200 characters'),
    body('description')
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must not exceed 1000 characters'),
    body('price')
      .isFloat({ min: 0.01 })
      .withMessage('Price must be greater than 0'),
    body('currency')
      .isIn(['BTC', 'ETH', 'USDT', 'TON'])
      .withMessage('Currency must be BTC, ETH, USDT, or TON'),
    body('stock')
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer'),
    body('images')
      .optional()
      .isArray()
      .withMessage('Images must be an array'),
    body('images.*')
      .optional()
      .isURL()
      .withMessage('Each image must be a valid URL'),
    body('category')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Category must not exceed 100 characters'),
    validate
  ],

  update: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid product ID is required'),
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
      .isFloat({ min: 0.01 })
      .withMessage('Price must be greater than 0'),
    body('stock')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Stock must be a non-negative integer'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    validate
  ],

  getById: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid product ID is required'),
    validate
  ],

  list: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('shopId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Shop ID must be a positive integer'),
    query('category')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Category must not exceed 100 characters'),
    validate
  ]
};

/**
 * Order validation schemas
 */
export const orderValidation = {
  create: [
    body('productId')
      .isInt({ min: 1 })
      .withMessage('Valid product ID is required'),
    body('quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    body('deliveryAddress')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Delivery address must not exceed 500 characters'),
    validate
  ],

  getById: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid order ID is required'),
    validate
  ],

  updateStatus: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Valid order ID is required'),
    body('status')
      .isIn(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
      .withMessage('Invalid order status'),
    validate
  ]
};

/**
 * Payment validation schemas
 */
export const paymentValidation = {
  verify: [
    body('orderId')
      .isInt({ min: 1 })
      .withMessage('Valid order ID is required'),
    body('txHash')
      .notEmpty()
      .trim()
      .withMessage('Transaction hash is required'),
    body('currency')
      .isIn(['BTC', 'ETH', 'USDT', 'TON'])
      .withMessage('Currency must be BTC, ETH, USDT, or TON'),
    validate
  ],

  getByOrder: [
    param('orderId')
      .isInt({ min: 1 })
      .withMessage('Valid order ID is required'),
    validate
  ]
};

export default {
  validate,
  authValidation,
  shopValidation,
  productValidation,
  orderValidation,
  paymentValidation
};
