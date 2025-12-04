import { t } from '../i18n/index.js';

/**
 * Minimalist Design Utilities
 *
 * Utility functions for implementing minimalist text patterns across the bot.
 * Based on research and patterns from BOT_MINIMALIST_DESIGN_GUIDE.md
 */

/**
 * Format products list for seller view
 * Compresses 8 lines -> 3 lines (63% reduction)
 *
 * @param {Array} products - Array of product objects
 * @param {string} shopName - Shop name for header
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export const formatProductsList = (products, shopName, lang = 'ru') => {
  if (!products || products.length === 0) {
    return t('minimalist.productsEmpty', { shop: shopName }, lang);
  }

  let msg = t('minimalist.productsHeader', { shop: shopName, count: products.length }, lang) + '\n';

  const toShow = products.slice(0, 5);
  toShow.forEach((p, i) => {
    const price = parseFloat(p.price).toFixed(0);
    msg += `${i + 1}. ${p.name} — $${price}\n`;
  });

  if (products.length > 5) {
    const remaining = products.length - 5;
    msg += `\n+${remaining} ${t('minimalist.productsMore', { count: remaining }, lang)}`;
  }

  return msg;
};

/**
 * Format sales/orders list for seller view
 * Compresses 9 lines -> 4 lines (56% reduction)
 *
 * @param {Array} orders - Array of order objects
 * @param {string} shopName - Shop name for header
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export const formatSalesList = (orders, shopName, lang = 'ru') => {
  if (!orders || orders.length === 0) {
    return t('minimalist.ordersEmpty', { shop: shopName }, lang);
  }

  let msg = t('minimalist.ordersHeader', { shop: shopName, count: orders.length }, lang) + '\n';

  const toShow = orders.slice(0, 5);
  toShow.forEach((o, i) => {
    const username = o.buyer_username
      ? o.buyer_username.length > 15
        ? o.buyer_username.slice(0, 15)
        : o.buyer_username
      : o.buyer_first_name || t('minimalist.buyer', {}, lang);
    const status = t(`minimalist.orderStatus.${o.status}`, {}, lang) || t('minimalist.orderStatus.processing', {}, lang);
    const price = parseFloat(o.total_price || o.totalPrice || 0).toFixed(0);

    msg += `${i + 1}. ${status} @${username} — $${price}\n`;
  });

  if (orders.length > 5) {
    const remaining = orders.length - 5;
    msg += `\n+${remaining} ${t('minimalist.ordersMore', { count: remaining }, lang)}`;
  }

  return msg;
};

/**
 * Format buyer orders list
 * Compresses 9 lines -> 4 lines
 *
 * @param {Array} orders - Array of order objects
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export const formatBuyerOrders = (orders, lang = 'ru') => {
  if (!orders || orders.length === 0) {
    return t('minimalist.buyerOrdersEmpty', {}, lang);
  }

  let msg = t('minimalist.buyerOrdersHeader', { count: orders.length }, lang) + '\n';

  const toShow = orders.slice(0, 5);
  toShow.forEach((o, i) => {
    const shopName = o.shop_name || t('minimalist.shop', {}, lang);
    const status = t(`minimalist.orderStatus.${o.status}`, {}, lang) || t('minimalist.orderStatus.processing', {}, lang);
    const price = parseFloat(o.total_price || o.totalPrice || 0).toFixed(0);

    msg += `${i + 1}. ${status} ${shopName} — $${price}\n`;
  });

  if (orders.length > 5) {
    const remaining = orders.length - 5;
    msg += `\n+${remaining} ${t('minimalist.ordersMore', { count: remaining }, lang)}`;
  }

  return msg;
};

/**
 * Format subscriptions list
 *
 * @param {Array} subscriptions - Array of subscription objects
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export const formatSubscriptions = (subscriptions, lang = 'ru') => {
  if (!subscriptions || subscriptions.length === 0) {
    return t('minimalist.subscriptionsEmpty', {}, lang);
  }

  let msg = t('minimalist.subscriptionsHeader', { count: subscriptions.length }, lang) + '\n';

  subscriptions.slice(0, 10).forEach((sub, i) => {
    const shopName = sub.shop_name || sub.shopName || t('minimalist.shop', {}, lang);
    msg += `${i + 1}. ${shopName}\n`;
  });

  if (subscriptions.length > 10) {
    const remaining = subscriptions.length - 10;
    msg += `\n+${remaining} ${t('minimalist.shopsMore', { count: remaining }, lang)}`;
  }

  return msg;
};

/**
 * Format shop info for buyer view
 * Compresses 13 lines -> 7 lines (46% reduction)
 *
 * @param {Object} shop - Shop object
 * @param {Array} products - Array of products
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export const formatShopInfo = (shop, products = [], lang = 'ru') => {
  const sellerUsername = shop.seller_username
    ? `@${shop.seller_username}`
    : shop.seller_first_name || t('minimalist.seller', {}, lang);

  const { stock: stockProducts, preorder: preorderProducts } =
    splitProductsByAvailability(products);

  let msg = `${shop.name} • ${sellerUsername}\n`;

  const defaultDesc = t('minimalist.shopDefaultDescription', { shop: shop.name }, lang);
  if (shop.description && shop.description !== defaultDesc) {
    msg += `\n${shop.description}\n`;
  }

  msg += `\n${t('minimalist.inStock', {}, lang)} — ${stockProducts.length}`;

  if (stockProducts.length === 0) {
    msg += `\n• ${t('minimalist.stockEmpty', {}, lang)}`;
  } else {
    stockProducts.slice(0, 3).forEach((product, index) => {
      const price = parseFloat(product.price).toFixed(0);
      msg += `\n${index + 1}. ${product.name} — $${price}`;
    });
    if (stockProducts.length > 3) {
      msg += `\n… ${t('minimalist.more', { count: stockProducts.length - 3 }, lang)}`;
    }
  }

  msg += `\n\n${t('minimalist.preorder', {}, lang)} — ${preorderProducts.length}`;

  if (preorderProducts.length === 0) {
    msg += `\n• ${t('minimalist.preorderEmpty', {}, lang)}`;
  } else {
    preorderProducts.slice(0, 3).forEach((product, index) => {
      const price = parseFloat(product.price).toFixed(0);
      msg += `\n${index + 1}. ${product.name} — $${price}`;
    });
    if (preorderProducts.length > 3) {
      msg += `\n… ${t('minimalist.more', { count: preorderProducts.length - 3 }, lang)}`;
    }
  }

  return msg;
};

export const splitProductsByAvailability = (products = []) => {
  const stock = [];
  const preorder = [];

  products.forEach((product) => {
    const quantity = product?.stock_quantity ?? product?.stock ?? 0;
    const available = product?.is_available ?? product?.isActive ?? true;

    if (!available) {
      return;
    }

    if (quantity > 0) {
      stock.push(product);
    } else {
      preorder.push(product);
    }
  });

  return { stock, preorder };
};

export const formatProductSectionList = (section, shopName, products = [], lang = 'ru') => {
  const isPreorder = section === 'preorder';
  const title = isPreorder ? t('minimalist.preorder', {}, lang) : t('minimalist.inStock', {}, lang);
  const header = `${title} • ${shopName}`;

  if (!products.length) {
    const emptyText = isPreorder
      ? t('minimalist.preorderSectionEmpty', {}, lang)
      : t('minimalist.stockSectionEmpty', {}, lang);
    return `${header}\n\n${emptyText}`;
  }

  const lines = products.slice(0, 8).map((product, index) => {
    const price = parseFloat(product.price).toFixed(0);
    const stockQty = product.stock_quantity ?? product.stock ?? 0;
    const stockLabel = isPreorder
      ? t('minimalist.preorderLabel', {}, lang)
      : stockQty > 0
        ? t('minimalist.inStockLabel', {}, lang)
        : t('minimalist.outOfStockLabel', {}, lang);
    return `${index + 1}. ${product.name} — $${price} (${stockLabel})`;
  });

  const extra = products.length > 8 ? `\n… ${t('minimalist.more', { count: products.length - 8 }, lang)}` : '';

  return `${header}\n\n${lines.join('\n')}${extra}`;
};

/**
 * Get smart stock status text
 *
 * @param {number} quantity - Stock quantity
 * @param {string} lang - Language code
 * @returns {string} Status text
 */
export const getStockStatus = (quantity, lang = 'ru') => {
  if (quantity === 0) return t('minimalist.stockNone', {}, lang);
  if (quantity <= 10) return `${quantity} ${t('minimalist.pcs', {}, lang)}`;
  return `10+ ${t('minimalist.pcs', {}, lang)}`;
};

/**
 * Get order status emoji
 *
 * @param {string} status - Order status
 * @returns {string} Emoji
 */
export const getOrderStatusEmoji = (status) => {
  const map = {
    pending: '⏳',
    completed: '✅',
    cancelled: '❌',
    processing: '📦',
    failed: '❌',
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
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export const errorMessage = (action, reason = null, lang = 'ru') => {
  const defaultReason = t('minimalist.tryLater', {}, lang);
  return t('minimalist.errorFormat', { action, reason: reason || defaultReason }, lang);
};

/**
 * Format wallet display (inline)
 * Compresses 9 lines -> 3 lines (67% reduction)
 *
 * @param {Object} shop - Shop object with wallet fields
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export const formatWallets = (shop, lang = 'ru') => {
  const wallets = [];

  if (shop.wallet_btc) wallets.push('BTC');
  if (shop.wallet_eth) wallets.push('ETH');
  if (shop.wallet_usdt) wallets.push('USDT');
  if (shop.wallet_ltc) wallets.push('LTC');

  let msg = t('minimalist.walletsTitle', {}, lang) + '\n';

  if (wallets.length === 0) {
    msg += `\n${t('minimalist.walletsEmpty', {}, lang)}`;
  } else {
    msg += `\n${wallets.join(' • ')}`;
  }

  msg += `\n\n${t('minimalist.walletsSelect', {}, lang)}`;

  return msg;
};

/**
 * Format follows list (minimalist - 3 lines max)
 *
 * @param {Array} follows - Array of follow objects
 * @param {string} lang - Language code
 * @returns {string} Formatted message
 */
export function formatFollowsList(follows, lang = 'ru') {
  if (!Array.isArray(follows) || follows.length === 0) {
    return t('follows.listEmpty', {}, lang);
  }
  const header = t('follows.listHeader', { count: follows.length ? ` (${follows.length})` : '' }, lang);
  const lines = follows.map((follow, index) => {
    const markupType = follow.markup_type || 'percentage';
    const markupPercentage = follow.markup_percentage ?? follow.markup ?? 0;
    const markupFixed = follow.markup_fixed ?? 0;
    const name = follow.source_shop_name || follow.sourceShopName || follow.name || t('minimalist.shop', {}, lang);
    const mode = follow.mode === 'resell' ? t('formatters.modeResell', {}, lang) : t('formatters.modeMonitor', {}, lang);

    let suffix = '';
    if (follow.mode === 'resell') {
      if (markupType === 'fixed' && Number.isFinite(markupFixed) && markupFixed > 0) {
        suffix = `, +$${Number(markupFixed).toFixed(0)}`;
      } else if (Number.isFinite(Number(markupPercentage)) && markupPercentage > 0) {
        suffix = `, +${Number(markupPercentage).toFixed(0)}%`;
      }
    }
    return `${index + 1}. ${name} (${mode}${suffix})`;
  });
  return `${header}\n\n${lines.join('\n')}\n\n${t('follows.listManageHint', {}, lang)}`;
}

/**
 * Format follow detail (minimalist)
 *
 * @param {Object} follow - Follow object
 * @param {string} lang - Language code ('ru' or 'en')
 * @returns {string} Formatted message
 */
export function formatFollowDetail(follow, lang = 'ru') {
  const markupType = follow.markup_type || 'percentage';
  const markupPercentage = follow.markup_percentage ?? follow.markup ?? 0;
  const markupFixed = follow.markup_fixed ?? 0;
  const sourceProducts =
    follow.source_products_count ?? follow.products_count ?? follow.productsCount ?? 0;
  const syncedProducts =
    follow.synced_products_count ?? follow.synced_count ?? follow.syncedProducts ?? sourceProducts;

  const name = follow.source_shop_name || follow.name || t('minimalist.shop', {}, lang);
  const isResell = follow.mode === 'resell';
  let markupValue = '-';
  if (isResell) {
    if (markupType === 'fixed') {
      markupValue = `+$${Number(markupFixed ?? 0).toFixed(0)}`;
    } else {
      markupValue = `${Number(markupPercentage ?? 0).toFixed(0)}%`;
    }
  }
  const modeLabel = isResell
    ? t('formatters.modeResell', {}, lang)
    : t('formatters.modeMonitor', {}, lang);

  const lines = [
    `${t('formatters.followShop', {}, lang)}: ${name}`,
    `${t('formatters.followMode', {}, lang)}: ${modeLabel}`,
    `${t('formatters.followMarkup', {}, lang)}: ${markupValue}`,
    `${t('formatters.followProducts', {}, lang)}: ${sourceProducts}`,
    `${t('formatters.followCopied', {}, lang)}: ${syncedProducts}`,
  ];

  return lines.join('\n');
}
