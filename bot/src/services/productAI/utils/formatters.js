/**
 * ProductAI Formatters
 * Functions for formatting prices, products, and durations
 */

import { t } from '../../../i18n/index.js';

/**
 * Format price in USD
 * @param {number} price - Price value
 * @returns {string} Formatted price string (e.g., "$10" or "$10.50")
 */
export function formatUsd(price) {
  const num = Number(price);
  if (!Number.isFinite(num)) {
    return '$0';
  }
  const formatted = num % 1 === 0 ? num.toFixed(0) : num.toFixed(2).replace(/\.?0+$/, '');
  return `$${formatted}`;
}

/**
 * Format product line for display
 * @param {Object} product - Product object
 * @param {number|null} index - Product index (optional, for numbered lists)
 * @param {string} lang - Language code ('ru' or 'en')
 * @returns {string} Formatted product line
 */
export function formatProductLine(product, index = null, lang = 'ru') {
  const prefix = index !== null ? `${index + 1}. ` : '';
  let line = `${prefix}**${product.name}**`;

  // Price with discount consideration
  line += ` — ${formatUsd(product.price ?? 0)}`;

  // ALWAYS show discount if present
  if (product.discount_percentage && product.discount_percentage > 0) {
    line += ` (-${product.discount_percentage}%`;

    // Discount expiration date
    if (product.discount_expires_at) {
      const expiresDate = new Date(product.discount_expires_at);
      const locale = lang === 'en' ? 'en-US' : 'ru-RU';
      const formatted = expiresDate.toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      line += `, ${t('aiProducts.until', {}, lang)} ${formatted}`;
    } else {
      line += `, ${t('aiProducts.permanent', {}, lang)}`;
    }

    line += `)`;
  }

  // Stock quantity
  const stock = product.stock_quantity ?? product.stock ?? 0;
  line += ` — ${t('aiProducts.remaining', {}, lang)} ${stock} ${t('aiProducts.pcs', {}, lang)}`;

  return line;
}

/**
 * Format duration from milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @param {string} lang - Language code ('ru' or 'en')
 * @returns {string} Human-readable duration (e.g., "6 hours", "3 days")
 */
export function formatDuration(ms, lang = 'ru') {
  if (!ms || !Number.isFinite(ms)) {
    return t('aiProducts.permanent', {}, lang);
  }

  const hours = ms / (60 * 60 * 1000);
  const days = ms / (24 * 60 * 60 * 1000);

  if (days >= 1 && days % 1 === 0) {
    // Days - pluralization
    if (days === 1) return t('aiProducts.day1', { count: 1 }, lang);
    if (days >= 2 && days <= 4) return t('aiProducts.day24', { count: days }, lang);
    return t('aiProducts.day5', { count: days }, lang);
  }

  if (hours >= 1 && hours % 1 === 0) {
    // Hours - pluralization
    if (hours === 1) return t('aiProducts.hour1', { count: 1 }, lang);
    if (hours >= 2 && hours <= 4) return t('aiProducts.hour24', { count: hours }, lang);
    return t('aiProducts.hour5', { count: hours }, lang);
  }

  // Fallback
  return t('aiProducts.hour5', { count: Math.round(hours) }, lang);
}
