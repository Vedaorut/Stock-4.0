import { t } from './index.js';
import { escapeHtml } from '../utils/format.js';

const safe = (value) => escapeHtml(String(value ?? ''));

/**
 * Format shop panel with stats
 */
export function formatShopPanelWithStats(shop, revenue, activeOrders, statusBar = null, lang = 'ru') {
  let message = '';

  // Status bar at the top
  if (statusBar) {
    message += `${safe(statusBar)}\n\n`;
  }

  const formattedRevenue =
    revenue > 0
      ? `$${Number(revenue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      : '$0';

  const ordersText = formatActiveOrdersCount(activeOrders, lang);

  message += `${safe(shop)}\n\n`;
  message += `$${formattedRevenue} ${t('formatters.revenueLabel', {}, lang)} ${ordersText}`;

  return message;
}

/**
 * Format active orders count with proper pluralization
 */
export function formatActiveOrdersCount(count, lang = 'ru') {
  if (count <= 0) {
    return t('formatters.ordersActiveNone', {}, lang);
  }

  if (lang === 'ru') {
    // Russian pluralization
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return t('formatters.ordersActive1', { count }, lang);
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
      return t('formatters.ordersActive24', { count }, lang);
    }
    return t('formatters.ordersActive5', { count }, lang);
  }

  // English pluralization
  return count === 1
    ? t('formatters.ordersActive1', { count }, lang)
    : t('formatters.ordersActive5', { count }, lang);
}

/**
 * Format shop list for search results
 */
export function formatShopList(shops, lang = 'ru') {
  return shops
    .map((shop) => {
      const seller = shop.seller_username
        ? `@${safe(shop.seller_username)}`
        : safe(shop.seller_first_name) || t('formatters.seller', {}, lang);
      const mark = shop.is_subscribed ? ` - ${t('formatters.subscribed', {}, lang)}` : '';
      return `${safe(shop.name)} ${seller}${mark}`;
    })
    .join('\n');
}

/**
 * Format orders list
 */
export function formatOrders(orders, lang = 'ru') {
  const statusMap = {
    pending: t('formatters.orderStatusPending', {}, lang),
    processing: t('formatters.orderStatusProcessing', {}, lang),
    // New statuses
    paid: t('formatters.orderStatusPaid', {}, lang),
    completed: t('formatters.orderStatusCompleted', {}, lang),
    cancelled: t('formatters.orderStatusCancelled', {}, lang),
    // Legacy statuses for backward compatibility
    confirmed: t('formatters.orderStatusConfirmed', {}, lang),
    shipped: t('formatters.orderStatusShipped', {}, lang),
    delivered: t('formatters.orderStatusDelivered', {}, lang),
  };

  return orders
    .map((o) => {
      const price = o.total_price || o.totalPrice;
      const status = statusMap[o.status] || o.status;
      const shopName = o.shop_name || 'Shop';
      return `${safe(status)} ${safe(shopName)} - $${Number(price || 0).toFixed(0)}`;
    })
    .join('\n');
}

/**
 * Format subscriptions list
 */
export function formatSubscriptions(subscriptions) {
  return subscriptions
    .map((sub) => {
      const name = sub.shop_name || sub.shopName || 'Shop';
      return `${safe(name)}`;
    })
    .join('\n');
}

/**
 * Format follows list
 */
export function formatFollowsList(follows, lang = 'ru') {
  return follows
    .map((follow) => {
      const name = follow.source_shop_name || follow.sourceShopName || follow.name || 'Shop';
      const mode =
        follow.mode === 'resell'
          ? t('formatters.modeResell', {}, lang)
          : t('formatters.modeMonitor', {}, lang);
      const markupValue = follow.markup_percentage ?? follow.markup ?? 0;
      const markup = Number.isFinite(Number(markupValue))
        ? `${Number(markupValue).toFixed(0)}%`
        : `${markupValue}`;
      const markupText = follow.mode === 'resell' ? `, +${markup}` : '';
      return `${safe(name)} - ${mode}${markupText}`;
    })
    .join('\n');
}

/**
 * Format products list
 */
export function formatProductsList(products, shopName, lang = 'ru') {
  if (!products.length) {
    return t('buyer.stockSectionEmpty', { shop: shopName }, lang);
  }
  const lines = products
    .slice(0, 5)
    .map((product) => `${safe(product.name)} - $${Number(product.price ?? 0).toFixed(0)}`);
  const extra = products.length > 5 ? `\n... +${products.length - 5}` : '';
  return `${shopName} (${products.length}).\n${lines.join('\n')}${extra}`;
}

/**
 * Format sales list
 */
export function formatSalesList(orders, shopName, lang = 'ru') {
  if (!orders.length) {
    return `${safe(shopName)} - ${t('formatters.noSales', {}, lang)}`;
  }
  const lines = orders.slice(0, 5).map((order) => {
    const buyer = order.buyer_username
      ? `@${safe(order.buyer_username)}`
      : safe(order.buyer_first_name) || 'Buyer';
    const status = safe(order.status || 'processing');
    const price = Number(order.total_price || order.totalPrice || 0).toFixed(0);
    return `${buyer} - ${status} - $${price}`;
  });
  const extra = orders.length > 5 ? `\n... +${orders.length - 5}` : '';
  return `${safe(shopName)} (${orders.length}).\n${lines.join('\n')}${extra}`;
}

/**
 * Format product section (stock/preorder)
 */
export function formatProductSection(section, shopName, products, lang = 'ru') {
  const isPreorder = section === 'preorder';
  const count = products.length;

  if (count === 0) {
    return isPreorder
      ? t('buyer.preorderSectionEmpty', { shop: shopName }, lang)
      : t('buyer.stockSectionEmpty', { shop: shopName }, lang);
  }

  const title = isPreorder
    ? t('buyer.preorderSectionTitle', { shop: shopName, count }, lang)
    : t('buyer.stockSectionTitle', { shop: shopName, count }, lang);

  const lines = products
    .slice(0, 5)
    .map((product) => `${safe(product.name)} - $${Number(product.price ?? 0).toFixed(0)}`);
  const extra = count > 5 ? `\n... +${count - 5}` : '';

  return `${title}\n${lines.join('\n')}${extra}`;
}

/**
 * Format shop info with sections
 */
export function formatShopInfo(shop, sections, lang = 'ru') {
  const seller = shop.seller_username
    ? `@${safe(shop.seller_username)}`
    : safe(shop.seller_first_name) || t('formatters.seller', {}, lang);
  const stock = sections.stock || [];
  const preorder = sections.preorder || [];

  const stockLines = stock
    .slice(0, 3)
    .map((p) => `${safe(p.name)} - $${Number(p.price || 0).toFixed(0)}`);
  const preorderLines = preorder
    .slice(0, 3)
    .map((p) => `${safe(p.name)} - $${Number(p.price || 0).toFixed(0)}`);

  const extraStock = stock.length > 3 ? `\n... +${stock.length - 3}` : '';
  const extraPreorder = preorder.length > 3 ? `\n... +${preorder.length - 3}` : '';

  const stockSection = stock.length ? `${stockLines.join('\n')}${extraStock}` : 'empty';
  const preorderSection = preorder.length
    ? `${preorderLines.join('\n')}${extraPreorder}`
    : 'awaiting';

  return `${safe(shop.name)} ${seller}\n\nStock - ${stock.length || 0}\n${stockSection}\n\nPreorder - ${preorder.length || 0}\n${preorderSection}`;
}

/**
 * Format follow list item
 */
export function formatFollowListItem(
  { index, name, mode, markupType, markupPercentage, markupFixed },
  lang = 'ru'
) {
  const icon = mode === 'resell' ? '' : '';
  let suffix = '';
  if (mode === 'resell') {
    if (markupType === 'fixed' && Number.isFinite(markupFixed) && markupFixed > 0) {
      suffix = `, +$${Number(markupFixed).toFixed(0)}`;
    } else if (Number.isFinite(markupPercentage) && markupPercentage > 0) {
      suffix = `, +${Number(markupPercentage).toFixed(0)}%`;
    }
  }
  const modeText =
    mode === 'resell' ? t('formatters.modeResell', {}, lang) : t('formatters.modeMonitor', {}, lang);
  return `${index}. ${safe(name)} (${icon} ${modeText}${suffix})`;
}

/**
 * Format follow detail view
 */
export function formatFollowDetail(
  { name, mode, markupType, markupPercentage, markupFixed, sourceProducts = 0, syncedProducts = 0 },
  lang = 'ru'
) {
  const isResell = mode === 'resell';
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
    `${t('formatters.followShop', {}, lang)}: ${safe(name)}`,
    `${t('formatters.followMode', {}, lang)}: ${modeLabel}`,
    `${t('formatters.followMarkup', {}, lang)}: ${markupValue}`,
    `${t('formatters.followProducts', {}, lang)}: ${sourceProducts}`,
    `${t('formatters.followCopied', {}, lang)}: ${syncedProducts}`,
  ];

  if (isResell) {
    lines.push(
      '',
      t('formatters.followHowItWorks', {}, lang),
      t('formatters.followResellDesc', { markup: markupValue }, lang),
      t('formatters.followResellPriceUpdate', {}, lang)
    );
  } else {
    lines.push(
      '',
      t('formatters.followHowItWorks', {}, lang),
      t('formatters.followMonitorDesc', {}, lang)
    );
  }

  return lines.join('\n');
}

/**
 * Format monitor product line
 */
export function formatMonitorProductLine({ index, name, price, stock }) {
  const stockText = Number.isFinite(stock) ? `${safe(stock)} pcs` : '-';
  return `${safe(index)}. ${safe(name)} - ${safe(price)} (${stockText})`;
}

/**
 * Format resell product line
 */
export function formatResellProductLine({ index, name, sourcePrice, syncedPrice, diff }) {
  const diffText = diff > 0 ? ` (+${safe(diff)})` : diff < 0 ? ` (-${safe(Math.abs(diff))})` : '';
  return `${safe(index)}. ${safe(name)}\n   Supplier: ${safe(sourcePrice)}\n   Your shop: ${safe(syncedPrice)}${diffText}`;
}

/**
 * Format bulk ship confirm list
 */
export function formatBulkShipConfirmList(orders) {
  return orders
    .map((o, i) => {
      const buyer = o.buyer_username ? `@${safe(o.buyer_username)}` : 'Buyer';
      return `${i + 1}. ${buyer} - ${safe(o.product_name)} (${safe(o.quantity)} pcs) - $${safe(o.total_price)}`;
    })
    .join('\n');
}

/**
 * Format subscription status
 */
export function formatSubscriptionStatus(status, lang = 'ru') {
  return status === 'active'
    ? t('formatters.statusActive', {}, lang)
    : t('formatters.statusInactive', {}, lang);
}

export default {
  formatShopPanelWithStats,
  formatActiveOrdersCount,
  formatShopList,
  formatOrders,
  formatSubscriptions,
  formatFollowsList,
  formatProductsList,
  formatSalesList,
  formatProductSection,
  formatShopInfo,
  formatFollowListItem,
  formatFollowDetail,
  formatMonitorProductLine,
  formatResellProductLine,
  formatBulkShipConfirmList,
  formatSubscriptionStatus,
};
