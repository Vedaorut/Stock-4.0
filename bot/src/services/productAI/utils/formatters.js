/**
 * ProductAI Formatters
 * Functions for formatting prices, products, and durations
 */

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
 * @returns {string} Formatted product line
 */
export function formatProductLine(product, index = null) {
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
      const formatted = expiresDate.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      line += `, до ${formatted}`;
    } else {
      line += `, постоянная`;
    }

    line += `)`;
  }

  // Stock quantity
  const stock = product.stock_quantity ?? product.stock ?? 0;
  line += ` — остаток ${stock} шт`;

  return line;
}

/**
 * Format duration from milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Human-readable duration (e.g., "6 часов", "3 дня")
 */
export function formatDuration(ms) {
  if (!ms || !Number.isFinite(ms)) {
    return 'постоянная';
  }

  const hours = ms / (60 * 60 * 1000);
  const days = ms / (24 * 60 * 60 * 1000);

  if (days >= 1 && days % 1 === 0) {
    // Days
    if (days === 1) return '1 день';
    if (days >= 2 && days <= 4) return `${days} дня`;
    return `${days} дней`;
  }

  if (hours >= 1 && hours % 1 === 0) {
    // Hours
    if (hours === 1) return '1 час';
    if (hours >= 2 && hours <= 4) return `${hours} часа`;
    return `${hours} часов`;
  }

  // Fallback
  return `${Math.round(hours)} часов`;
}
