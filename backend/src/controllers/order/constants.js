export const VALID_ORDER_STATUSES = new Set([
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
]);

export const STATUS_ALIASES = new Map([
  ['completed', 'delivered'],
  ['complete', 'delivered'],
  ['active', 'confirmed'],
]);

export const VALID_PAYMENT_CURRENCIES = ['BTC', 'ETH', 'LTC', 'USDT_TRC20'];

export const MIN_CONFIRMATIONS = {
  BTC: 3,
  LTC: 6,
  ETH: 12,
  USDT: 19, // FIX: Added USDT alias - code uses currencyUpper which is 'USDT' not 'USDT_TRC20'
  USDT_TRC20: 19, // Keep for backwards compatibility
};

// Re-export from central config for backwards compatibility
export { INVOICE_EXPIRY_SECONDS } from '../../config/payments.js';
