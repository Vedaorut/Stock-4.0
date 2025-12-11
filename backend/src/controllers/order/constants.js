export const VALID_ORDER_STATUSES = new Set([
  'pending',
  'paid',
  'completed',
  'cancelled',
  'expired',
  // Legacy statuses for backward compatibility
  'confirmed',
  'shipped',
  'delivered',
]);

export const STATUS_ALIASES = new Map([
  // Legacy → new mapping
  ['confirmed', 'paid'],
  ['shipped', 'paid'],
  ['delivered', 'completed'],
  // Common aliases
  ['complete', 'completed'],
  ['active', 'paid'],
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
