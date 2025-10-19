/**
 * Format currency amount
 */
export const formatCurrency = (amount, currency) => {
  const decimals = {
    'BTC': 8,
    'ETH': 6,
    'USDT': 2,
    'TON': 6
  };

  return parseFloat(amount).toFixed(decimals[currency] || 2);
};

/**
 * Format date to readable string
 */
export const formatDate = (date) => {
  return new Date(date).toISOString().split('T')[0];
};

/**
 * Generate unique order ID
 */
export const generateOrderId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `ORD-${timestamp}-${random}`.toUpperCase();
};

/**
 * Validate cryptocurrency wallet address
 */
export const validateWalletAddress = (address, currency) => {
  const patterns = {
    'BTC': /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
    'ETH': /^0x[a-fA-F0-9]{40}$/,
    'USDT': /^0x[a-fA-F0-9]{40}$/,
    'TON': /^[UE][Qf][a-zA-Z0-9_-]{46}$/
  };

  return patterns[currency]?.test(address) || false;
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;

  return str
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 1000);
};

/**
 * Calculate pagination
 */
export const getPagination = (page = 1, limit = 50) => {
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = Math.min(parseInt(limit, 10) || 50, 100);
  const offset = (parsedPage - 1) * parsedLimit;

  return { page: parsedPage, limit: parsedLimit, offset };
};

/**
 * Create success response
 */
export const successResponse = (data, message = null) => {
  return {
    success: true,
    ...(message && { message }),
    data
  };
};

/**
 * Create error response
 */
export const errorResponse = (error, details = null) => {
  return {
    success: false,
    error,
    ...(details && { details })
  };
};

/**
 * Generate transaction hash (for testing/mock purposes)
 */
export const generateTxHash = (currency = 'ETH') => {
  const hashLength = {
    'BTC': 64,
    'ETH': 66, // 0x + 64
    'USDT': 66,
    'TON': 44
  };

  const length = hashLength[currency] || 64;
  const prefix = ['ETH', 'USDT'].includes(currency) ? '0x' : '';
  const chars = '0123456789abcdef';
  let hash = prefix;

  const targetLength = length - prefix.length;
  for (let i = 0; i < targetLength; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return hash;
};

/**
 * Sleep/delay function
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Safe JSON parse
 */
export const safeJSONParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    return defaultValue;
  }
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return ((value / total) * 100).toFixed(2);
};

/**
 * Validate email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Mask sensitive data
 */
export const maskString = (str, visibleChars = 4) => {
  if (!str || str.length <= visibleChars * 2) return str;

  const start = str.substring(0, visibleChars);
  const end = str.substring(str.length - visibleChars);
  const masked = '*'.repeat(Math.min(str.length - visibleChars * 2, 10));

  return `${start}${masked}${end}`;
};

/**
 * Convert timestamp to relative time
 */
export const getRelativeTime = (timestamp) => {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
};

export default {
  formatCurrency,
  formatDate,
  generateOrderId,
  validateWalletAddress,
  sanitizeInput,
  getPagination,
  successResponse,
  errorResponse,
  generateTxHash,
  sleep,
  safeJSONParse,
  calculatePercentage,
  isValidEmail,
  maskString,
  getRelativeTime
};
