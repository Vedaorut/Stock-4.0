/**
 * Утилиты для форматирования цен и чисел
 */

/**
 * Форматирует цену в USD
 * @param {number|string} price - Цена
 * @returns {string} Отформатированная цена с символом $ (например "$25" или "$25.50")
 */
export const formatPrice = (price) => {
  const num = parseFloat(price);

  if (isNaN(num) || num < 0) {
    return '$0';
  }

  // Всегда 2 знака после запятой для USD
  const formatted = num.toFixed(2);

  // Убираем .00 если це число целое
  if (formatted.endsWith('.00')) {
    return `$${parseInt(num)}`;
  }

  // Убираем trailing zero если есть (25.50 → 25.5)
  return `$${parseFloat(formatted)}`;
};

/**
 * Форматирует цену в USD (всегда с 2 decimals)
 * @param {number|string} price - Цена
 * @returns {string} Отформатированная цена (например "$25.00" или "$25.50")
 */
export const formatPriceFixed = (price) => {
  const num = parseFloat(price);

  if (isNaN(num) || num < 0) {
    return '$0.00';
  }

  return `$${num.toFixed(2)}`;
};

/**
 * Форматирует число, убирая trailing zeros
 * @param {number|string} value - Число
 * @param {number} maxDecimals - Максимум знаков после запятой
 * @returns {string} Отформатированное число
 */
export const formatNumber = (value, maxDecimals = 2) => {
  const num = parseFloat(value);

  if (isNaN(num)) {
    return '0';
  }

  return parseFloat(num.toFixed(maxDecimals)).toString();
};

/**
 * Форматирует статус заказа в эмодзи
 * @param {string} status - Статус заказа
 * @returns {string} Эмодзи статуса
 */
export const formatOrderStatus = (status) => {
  const statusMap = {
    'pending': '⏳',
    'completed': '✅',
    'cancelled': '❌',
    'processing': '📦'
  };

  return statusMap[status] || '📦';
};
