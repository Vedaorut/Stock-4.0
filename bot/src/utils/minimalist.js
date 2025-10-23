/**
 * Minimalist Design Utilities
 * 
 * Utility functions for implementing minimalist text patterns across the bot.
 * Based on research and patterns from BOT_MINIMALIST_DESIGN_GUIDE.md
 */

/**
 * Format products list for seller view
 * Compresses 8 lines → 3 lines (63% reduction)
 * 
 * @param {Array} products - Array of product objects
 * @param {string} shopName - Shop name for header
 * @returns {string} Formatted message
 */
export const formatProductsList = (products, shopName) => {
  if (!products || products.length === 0) {
    return `📦 Товары\n\nДобавьте товар чтобы он отображался в магазине`;
  }

  let msg = `📦 Товары (${products.length}) • ${shopName}\n`;
  
  const toShow = products.slice(0, 5);
  toShow.forEach((p, i) => {
    const price = parseFloat(p.price).toFixed(0);

    msg += `${i + 1}. ${p.name} — $${price}\n`;
  });

  if (products.length > 5) {
    msg += `\n+${products.length - 5} ещё`;
  }

  return msg;
};

/**
 * Format sales/orders list for seller view
 * Compresses 9 lines → 4 lines (56% reduction)
 * 
 * @param {Array} orders - Array of order objects
 * @param {string} shopName - Shop name for header
 * @returns {string} Formatted message
 */
export const formatSalesList = (orders, shopName) => {
  if (!orders || orders.length === 0) {
    return `💰 Продажи\n\nЗдесь будут ваши продажи`;
  }

  let msg = `💰 Продажи (${orders.length}) • ${shopName}\n`;

  const toShow = orders.slice(0, 5);
  toShow.forEach((o, i) => {
    const username = o.buyer_username
      ? (o.buyer_username.length > 15 ? o.buyer_username.slice(0, 15) : o.buyer_username)
      : (o.buyer_first_name || 'Покупатель');
    const status = getOrderStatusEmoji(o.status);
    const price = parseFloat(o.total_price || o.totalPrice || 0).toFixed(0);

    msg += `${i + 1}. ${status} @${username} — $${price}\n`;
  });

  if (orders.length > 5) {
    msg += `\n+${orders.length - 5} ещё`;
  }

  return msg;
};

/**
 * Format buyer orders list
 * Compresses 9 lines → 4 lines
 * 
 * @param {Array} orders - Array of order objects
 * @returns {string} Formatted message
 */
export const formatBuyerOrders = (orders) => {
  if (!orders || orders.length === 0) {
    return `🛒 Заказы\n\nЗдесь будут ваши заказы из магазинов`;
  }

  let msg = `🛒 Заказы (${orders.length})\n`;

  const toShow = orders.slice(0, 5);
  toShow.forEach((o, i) => {
    const shopName = o.shop_name || 'Магазин';
    const status = getOrderStatusEmoji(o.status);
    const price = parseFloat(o.total_price || o.totalPrice || 0).toFixed(0);

    msg += `${i + 1}. ${status} ${shopName} — $${price}\n`;
  });

  if (orders.length > 5) {
    msg += `\n+${orders.length - 5} ещё`;
  }

  return msg;
};

/**
 * Format subscriptions list
 * 
 * @param {Array} subscriptions - Array of subscription objects
 * @returns {string} Formatted message
 */
export const formatSubscriptions = (subscriptions) => {
  if (!subscriptions || subscriptions.length === 0) {
    return `📚 Подписки\n\nПодпишитесь на магазины чтобы следить за новинками`;
  }

  let msg = `📚 Подписки (${subscriptions.length})\n`;

  subscriptions.slice(0, 10).forEach((sub, i) => {
    const shopName = sub.shop_name || sub.shopName || 'Магазин';
    msg += `${i + 1}. ${shopName}\n`;
  });

  if (subscriptions.length > 10) {
    msg += `\n+${subscriptions.length - 10} ещё`;
  }

  return msg;
};

/**
 * Format shop info for buyer view
 * Compresses 13 lines → 7 lines (46% reduction)
 * 
 * @param {Object} shop - Shop object
 * @param {Array} products - Array of products
 * @returns {string} Formatted message
 */
export const formatShopInfo = (shop, products = []) => {
  const sellerUsername = shop.seller_username
    ? `@${shop.seller_username}`
    : (shop.seller_first_name || 'Продавец');

  let msg = `ℹ️ ${shop.name} • ${sellerUsername}\n`;

  // Description (if not default)
  if (shop.description && shop.description !== `Магазин ${shop.name}`) {
    msg += `\n${shop.description}\n`;
  }

  // Products count
  msg += `\n📦 ${products.length} товара\n`;

  // Show first 3 products
  if (products && products.length > 0) {
    const productsToShow = products.slice(0, 3);
    productsToShow.forEach((product, index) => {
      const price = parseFloat(product.price).toFixed(0);
      msg += `${index + 1}. ${product.name} — $${price}\n`;
    });

    if (products.length > 3) {
      msg += `\n+${products.length - 3} ещё`;
    }
  }

  return msg;
};

/**
 * Get smart stock status text
 * 
 * @param {number} quantity - Stock quantity
 * @returns {string} Status text
 */
export const getStockStatus = (quantity) => {
  if (quantity === 0) return 'нет';
  if (quantity <= 3) return `${quantity} шт`;
  return 'есть';
};

/**
 * Get order status emoji
 * 
 * @param {string} status - Order status
 * @returns {string} Emoji
 */
export const getOrderStatusEmoji = (status) => {
  const map = {
    'pending': '⏳',
    'completed': '✅',
    'cancelled': '❌',
    'processing': '📦',
    'failed': '❌'
  };
  return map[status] || '📦';
};

/**
 * Format success message
 * 
 * @param {string} title - Success title
 * @param {string} details - Optional details
 * @returns {string} Formatted message
 */
export const successMessage = (title, details = '') => {
  let msg = `✅ ${title}`;
  if (details) {
    msg += `\n${details}`;
  }
  return msg;
};

/**
 * Format error message
 * 
 * @param {string} action - Action that failed
 * @param {string} reason - Optional reason
 * @returns {string} Formatted message
 */
export const errorMessage = (action, reason = 'Попробуйте позже') => {
  return `❌ Не удалось ${action}\n${reason}`;
};

/**
 * Format wallet display (inline)
 * Compresses 9 lines → 3 lines (67% reduction)
 *
 * @param {Object} shop - Shop object with wallet fields
 * @returns {string} Formatted message
 */
export const formatWallets = (shop) => {
  const btc = shop.wallet_btc ? '✓' : '○';
  const eth = shop.wallet_eth ? '✓' : '○';
  const usdt = shop.wallet_usdt ? '✓' : '○';
  const ton = shop.wallet_ton ? '✓' : '○';

  let msg = `💼 Кошельки\n`;
  msg += `₿ ${btc} | Ξ ${eth} | ₮ ${usdt} | 🔷 ${ton}\n\n`;
  msg += `Выберите:`;

  return msg;
};

/**
 * Format follows list (minimalist - 3 lines max)
 *
 * @param {Array} follows - Array of follow objects
 * @param {string} shopName - Shop name for header
 * @returns {string} Formatted message
 */
export function formatFollowsList(follows, shopName) {
  if (!follows || follows.length === 0) {
    return `📡 Подписки (0)\n\nПодписок пока нет`;
  }

  const followsText = follows
    .map((f) => {
      const modeIcon = f.mode === 'resell' ? '💰' : '👀';
      const markup = f.mode === 'resell' ? ` +${f.markup_percentage}%` : '';
      return `${modeIcon} ${f.source_shop_name}${markup}`;
    })
    .join('\n');

  return `📡 Подписки (${follows.length})\n\n${followsText}`;
}

/**
 * Format follow detail (minimalist)
 *
 * @param {Object} follow - Follow object
 * @returns {string} Formatted message
 */
export function formatFollowDetail(follow) {
  const modeIcon = follow.mode === 'resell' ? '💰 Resell' : '👀 Monitor';
  const markupLine = follow.mode === 'resell'
    ? `\nНаценка: +${follow.markup_percentage}%`
    : '';

  return `${modeIcon}\n\n${follow.source_shop_name}${markupLine}`;
}
