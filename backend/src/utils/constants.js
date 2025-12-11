/**
 * Application-wide constants
 */

// Order statuses (align with database constraint & validation)
// Simplified flow: pending → paid → completed
export const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',           // Was 'confirmed' - buyer sees seller contact
  COMPLETED: 'completed', // Was 'delivered' - internal "выдан" status
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  // Legacy aliases for backward compatibility
  CONFIRMED: 'paid',      // Alias → paid
  DELIVERED: 'completed', // Alias → completed
  SHIPPED: 'completed',   // Alias → completed (removed status)
};

// Payment statuses (align with database constraint)
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
};

const LTC_CONFIRMATIONS = 6; // Align with standard 6 confirmations for LTC security

// Supported cryptocurrencies
export const SUPPORTED_CURRENCIES = {
  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    confirmations: 1, // Reduced for faster confirmation
    network: 'bitcoin',
  },
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    confirmations: 12,
    network: 'ethereum',
  },
  USDT: {
    name: 'Tether (TRC20)',
    symbol: 'USDT',
    decimals: 6,
    confirmations: 19,
    network: 'tron',
  },
  LTC: {
    name: 'Litecoin',
    symbol: 'LTC',
    decimals: 8,
    confirmations: LTC_CONFIRMATIONS,
    network: 'litecoin',
  },
};

// Product categories
export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Fashion',
  'Home & Garden',
  'Sports',
  'Books',
  'Beauty',
  'Toys',
  'Food',
  'Other',
];

// User roles (deprecated - role is now determined by shop ownership)
// A user becomes a seller by creating a shop
export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

// Pagination defaults (P1-PERF-005: MAX_LIMIT reduced to 50 to prevent unbounded queries)
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50, // P1-PERF-005: Reduced from 100 to 50 to prevent large result sets
};

// Rate limiting - Production-safe values (P0-SEC)
// Use environment variable to increase for local development
const isDev = process.env.NODE_ENV !== 'production';
export const RATE_LIMITS = {
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: isDev ? 1000 : 15, // Production: 15 login attempts per 15 min (brute force protection)
  },
  API: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: isDev ? 1000 : 300, // Production: 300 requests per 15 min
  },
  PAYMENT: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: isDev ? 50 : 10, // Production: 10 payment attempts per minute
  },
  WEBHOOK: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 20, // Reduced - payment webhooks shouldn't be this frequent, prevents DoS
  },
  SHOP_CREATION: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 5, // Max 5 shops per hour per user
  },
  PRODUCT_CREATION: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 50, // Max 50 products per hour per user
  },
};

// Payment expiration time
export const PAYMENT_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes

// Token expiration
export const TOKEN_EXPIRATION = {
  ACCESS: '7d',
  REFRESH: '30d',
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Blockchain explorer URLs
export const EXPLORER_URLS = {
  BTC: 'https://blockchair.com/bitcoin/transaction',
  ETH: 'https://etherscan.io/tx',
  USDT: 'https://tronscan.org/#/transaction',
  LTC: 'https://blockchair.com/litecoin/transaction',
};

// Error messages
export const ERROR_MESSAGES = {
  // Auth
  INVALID_CREDENTIALS: 'Invalid credentials',
  TOKEN_EXPIRED: 'Token expired',
  TOKEN_INVALID: 'Invalid token',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',

  // Users
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User already exists',

  // Products
  PRODUCT_NOT_FOUND: 'Product not found',
  INSUFFICIENT_STOCK: 'Insufficient stock',

  // Orders
  ORDER_NOT_FOUND: 'Order not found',
  ORDER_ALREADY_PAID: 'Order already paid',

  // Payments
  PAYMENT_NOT_FOUND: 'Payment not found',
  PAYMENT_EXPIRED: 'Payment expired',
  INVALID_WALLET_ADDRESS: 'Invalid wallet address',
  UNSUPPORTED_CURRENCY: 'Unsupported currency',

  // General
  VALIDATION_ERROR: 'Validation error',
  INTERNAL_ERROR: 'Internal server error',
  NOT_FOUND: 'Resource not found',
  RATE_LIMIT_EXCEEDED: 'Too many requests',
};

// Success messages
export const SUCCESS_MESSAGES = {
  // Auth
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  REGISTER_SUCCESS: 'Registration successful',

  // Products
  PRODUCT_CREATED: 'Product created successfully',
  PRODUCT_UPDATED: 'Product updated successfully',
  PRODUCT_DELETED: 'Product deleted successfully',

  // Orders
  ORDER_CREATED: 'Order created successfully',
  ORDER_UPDATED: 'Order updated successfully',
  ORDER_CANCELLED: 'Order cancelled successfully',

  // Payments
  PAYMENT_CONFIRMED: 'Payment confirmed successfully',
};

export default {
  ORDER_STATUS,
  PAYMENT_STATUS,
  SUPPORTED_CURRENCIES,
  PRODUCT_CATEGORIES,
  USER_ROLES,
  PAGINATION,
  RATE_LIMITS,
  PAYMENT_EXPIRATION_TIME,
  TOKEN_EXPIRATION,
  HTTP_STATUS,
  EXPLORER_URLS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
};
