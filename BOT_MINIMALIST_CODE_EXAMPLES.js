/**
 * BOT_MINIMALIST_IMPL_UTILS.js
 * 
 * Ready-to-use utility functions for implementing minimalist design patterns
 * in the Status Stock Telegram bot.
 */

export const formatProductsList = (products, shopName) => {
  if (!products || products.length === 0) {
    return `📦 Товары\nПусто`;
  }

  let msg = `📦 Товары (${products.length}) • ${shopName}\n`;
  
  const toShow = products.slice(0, 5);
  toShow.forEach((p, i) => {
    const stock = p.stock_quantity || p.stockQuantity || 0;
    const stockStatus = getStockStatus(stock);
    msg += `${i + 1}. ${p.name} — \$${parseFloat(p.price).toFixed(0)} | ${stockStatus}\n`;
  });

  if (products.length > 5) {
    msg += `\n+${products.length - 5} ещё`;
  }

  return msg;
};

export const formatSalesList = (orders, shopName) => {
  if (!orders || orders.length === 0) {
    return `💰 Продажи\nПусто`;
  }

  let msg = `💰 Продажи (${orders.length}) • ${shopName}\n`;

  const toShow = orders.slice(0, 5);
  toShow.forEach((o, i) => {
    const username = o.buyer_username
      ? o.buyer_username.slice(0, 15)
      : (o.buyer_first_name || 'Покупатель');
    const status = getOrderStatusEmoji(o.status);
    const price = parseFloat(o.total_price || o.totalPrice || 0).toFixed(0);

    msg += `${i + 1}. ${status} @${username} — \$${price}\n`;
  });

  if (orders.length > 5) {
    msg += `\n+${orders.length - 5} ещё`;
  }

  return msg;
};

export const formatBuyerOrders = (orders) => {
  if (!orders || orders.length === 0) {
    return `🛒 Заказы\nПусто`;
  }

  let msg = `🛒 Заказы (${orders.length})\n`;

  const toShow = orders.slice(0, 5);
  toShow.forEach((o, i) => {
    const shopName = o.shop_name || 'Магазин';
    const status = getOrderStatusEmoji(o.status);
    const price = parseFloat(o.total_price || o.totalPrice || 0).toFixed(0);

    msg += `${i + 1}. ${status} ${shopName} — \$${price}\n`;
  });

  if (orders.length > 5) {
    msg += `\n+${orders.length - 5} ещё`;
  }

  return msg;
};

export const formatSubscriptions = (subscriptions) => {
  if (!subscriptions || subscriptions.length === 0) {
    return `📚 Подписки\nПусто`;
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

export const getStockStatus = (quantity) => {
  if (quantity === 0) return 'нет';
  if (quantity <= 3) return `${quantity} шт`;
  return 'есть';
};

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

export const successMessage = (title, details = '') => {
  let msg = `✅ ${title}`;
  if (details) {
    msg += `\n${details}`;
  }
  return msg;
};

export const errorMessage = (action, reason = 'Попробуйте позже') => {
  return `❌ Не удалось ${action}\n${reason}`;
};
