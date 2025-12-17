// DB constraint: pending, confirmed, shipped, delivered, cancelled
export const VALID_ORDER_STATUSES = new Set([
  'pending',
  'confirmed',  // Payment confirmed (buyer sees seller contact)
  'shipped',    // Optional intermediate (not used for digital goods)
  'delivered',  // Order completed / goods delivered
  'cancelled',
]);

export const STATUS_ALIASES = new Map([
  // Map old/code names → valid DB statuses
  ['paid', 'confirmed'],      // 'paid' in code → 'confirmed' in DB
  ['completed', 'delivered'], // 'completed' in code → 'delivered' in DB
  ['complete', 'delivered'],
  ['active', 'confirmed'],
  ['expired', 'cancelled'],   // Expired orders are cancelled
]);

export const VALID_PAYMENT_CURRENCIES = ['BTC', 'ETH', 'LTC', 'USDT_TRC20'];

export const MIN_CONFIRMATIONS = {
  BTC: 1, // Reduced for faster confirmation
  LTC: 6,
  ETH: 12,
  USDT: 19, // FIX: Added USDT alias - code uses currencyUpper which is 'USDT' not 'USDT_TRC20'
  USDT_TRC20: 19, // Keep for backwards compatibility
};

// Re-export from central config for backwards compatibility
export { INVOICE_EXPIRY_SECONDS } from '../../config/payments.js';
