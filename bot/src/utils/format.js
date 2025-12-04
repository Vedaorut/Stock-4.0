/**
 * Utilities for formatting prices and numbers
 */

/**
 * Escapes special HTML characters for safe sending with parse_mode HTML
 * @param {string} value - Arbitrary string
 * @returns {string} Escaped string
 */
export const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Formats price in USD
 * @param {number|string} price - Price
 * @returns {string} Formatted price with $ symbol (e.g., "$25" or "$25.50")
 */
export const formatPrice = (price) => {
  const num = parseFloat(price);

  if (isNaN(num) || num < 0) {
    return '$0';
  }

  // Always 2 decimal places for USD
  const formatted = num.toFixed(2);

  // Remove .00 if the number is integer
  if (formatted.endsWith('.00')) {
    return `$${parseInt(num)}`;
  }

  // Remove trailing zero if present (25.50 -> 25.5)
  return `$${parseFloat(formatted)}`;
};

/**
 * Formats price in USD (always with 2 decimals)
 * @param {number|string} price - Price
 * @returns {string} Formatted price (e.g., "$25.00" or "$25.50")
 */
export const formatPriceFixed = (price) => {
  const num = parseFloat(price);

  if (isNaN(num) || num < 0) {
    return '$0.00';
  }

  return `$${num.toFixed(2)}`;
};

/**
 * Formats number, removing trailing zeros
 * @param {number|string} value - Number
 * @param {number} maxDecimals - Maximum decimal places
 * @returns {string} Formatted number
 */
export const formatNumber = (value, maxDecimals = 2) => {
  const num = parseFloat(value);

  if (isNaN(num)) {
    return '0';
  }

  return parseFloat(num.toFixed(maxDecimals)).toString();
};

/**
 * Formats order status to emoji
 * @param {string} status - Order status
 * @returns {string} Status emoji
 */
export const formatOrderStatus = (status) => {
  const statusMap = {
    pending: '⏳',
    completed: '✅',
    cancelled: '❌',
    processing: '📦',
  };

  return statusMap[status] || '📦';
};
