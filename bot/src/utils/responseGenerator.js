import { t } from '../i18n/index.js';

/**
 * Deterministic response generator for AI bot
 *
 * Used as fallback when:
 * - AI is unavailable (timeout, API error)
 * - Operation failed (success: false)
 *
 * Ensures HONEST response to user about operation result
 */

/**
 * Format USD price
 */
function formatPrice(price) {
  return `$${Number(price).toFixed(2)}`;
}

/**
 * Format discount text
 */
function formatDiscount(percentage, originalPrice, newPrice, lang = 'ru') {
  if (!originalPrice || !newPrice) {
    return `${percentage}%`;
  }
  return t('responseGenerator.discountFormat', {
    percentage,
    original: formatPrice(originalPrice),
    current: formatPrice(newPrice),
  }, lang);
}

/**
 * Clean error message from technical details
 */
function cleanErrorMessage(errorMsg) {
  if (!errorMsg) return '';

  // Remove technical prefixes
  let cleaned = errorMsg
    .replace(/^Error:\s*/i, '')
    .replace(/^ValidationError:\s*/i, '')
    .replace(/^Database error:\s*/i, '')
    .replace(/^\[.*?\]\s*/, '') // [ERROR] prefix
    .trim();

  // Limit length
  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 147) + '...';
  }

  return cleaned;
}

/**
 * Get random variation for error message
 */
function getRandomVariation(variations) {
  if (!variations || variations.length === 0) return '';
  const randomIndex = Math.floor(Math.random() * variations.length);
  return variations[randomIndex];
}

/**
 * Generate natural response based on operation result
 *
 * @param {Object} result - Function execution result
 * @param {boolean} result.success - Operation success
 * @param {string} result.message - Error message (if success: false)
 * @param {Object} result.data - Result data
 * @param {string} result.data.action - Action type
 * @param {string} lang - Language code
 * @returns {string} - Human-readable response
 */
export function generateDeterministicResponse(result, lang = 'ru') {
  // ERROR - report honestly
  if (!result.success) {
    const rawError =
      result.message || result.data?.error?.message || t('responseGenerator.unknownError', {}, lang);
    const errorMessage = cleanErrorMessage(rawError);

    // Special error cases with variations
    if (errorMessage.toLowerCase().includes('not found')) {
      const variations = [
        t('responseGenerator.notFoundVariant1', {}, lang),
        t('responseGenerator.notFoundVariant2', {}, lang),
        t('responseGenerator.notFoundVariant3', {}, lang),
      ];
      return getRandomVariation(variations);
    }

    if (errorMessage.toLowerCase().includes('already exists')) {
      const variations = [
        t('responseGenerator.alreadyExistsVariant1', {}, lang),
        t('responseGenerator.alreadyExistsVariant2', {}, lang),
        t('responseGenerator.alreadyExistsVariant3', {}, lang),
      ];
      return getRandomVariation(variations);
    }

    if (errorMessage.toLowerCase().includes('validation')) {
      return t('responseGenerator.validationError', { error: errorMessage }, lang);
    }

    if (errorMessage.toLowerCase().includes('authorization') || errorMessage.toLowerCase().includes('auth')) {
      const variations = [
        t('responseGenerator.authErrorVariant1', {}, lang),
        t('responseGenerator.authErrorVariant2', {}, lang),
        t('responseGenerator.authErrorVariant3', {}, lang),
      ];
      return getRandomVariation(variations);
    }

    if (errorMessage.toLowerCase().includes('server')) {
      return t('responseGenerator.serverError', { error: errorMessage }, lang);
    }

    // General error
    return t('responseGenerator.genericError', { error: errorMessage }, lang);
  }

  const data = result.data;

  // No data - basic success response
  if (!data || !data.action) {
    return t('responseGenerator.done', {}, lang);
  }

  // SUCCESS OPERATIONS - generate informative response

  switch (data.action) {
    // Create single product
    case 'product_created': {
      const { product } = data;
      if (!product) return t('responseGenerator.productAdded', {}, lang);

      const name = product.name || t('responseGenerator.product', {}, lang);
      const price = product.price ? formatPrice(product.price) : '';
      const stock =
        product.stock_quantity !== undefined
          ? ` (${t('responseGenerator.stock', { count: product.stock_quantity }, lang)})`
          : '';

      return t('responseGenerator.added', { name, price, stock }, lang);
    }

    // Bulk create
    case 'products_bulk_created': {
      const count = data.products?.length || data.count || 0;
      if (count === 0) return t('responseGenerator.bulkAddFailed', {}, lang);
      if (count === 1) {
        const product = data.products[0];
        return t('responseGenerator.added', { name: product.name, price: formatPrice(product.price), stock: '' }, lang);
      }
      return t('responseGenerator.bulkAdded', { count }, lang);
    }

    // Update single product
    case 'product_updated': {
      const { product } = data;
      if (!product) return t('responseGenerator.productUpdated', {}, lang);

      const name = product.name || t('responseGenerator.product', {}, lang);
      const details = [];

      if (product.price !== undefined) {
        details.push(t('responseGenerator.detailPrice', { price: formatPrice(product.price) }, lang));
      }
      if (product.stock_quantity !== undefined) {
        details.push(t('responseGenerator.detailStock', { count: product.stock_quantity }, lang));
      }
      if (product.discount_percentage > 0) {
        details.push(t('responseGenerator.detailDiscount', { percentage: product.discount_percentage }, lang));
      }

      const detailsStr = details.length > 0 ? ` (${details.join(', ')})` : '';
      return t('responseGenerator.updated', { name, details: detailsStr }, lang);
    }

    // Bulk update
    case 'products_bulk_updated':
    case 'bulk_operation': {
      const count = data.products?.length || data.productsUpdated || data.count || 0;
      const productNames = data.products?.map((p) => p.name).filter(Boolean);

      if (count === 0) return t('responseGenerator.bulkUpdateFailed', {}, lang);

      if (count === 1 && productNames && productNames[0]) {
        return t('responseGenerator.updated', { name: productNames[0], details: '' }, lang);
      }

      if (count <= 3 && productNames && productNames.length > 0) {
        return t('responseGenerator.updatedList', { names: productNames.join(', ') }, lang);
      }

      return t('responseGenerator.bulkUpdated', { count }, lang);
    }

    // Discount applied
    case 'discount_applied': {
      const { product } = data;
      if (!product) return t('responseGenerator.discountApplied', {}, lang);

      const name = product.name || t('responseGenerator.product', {}, lang);
      const discountInfo = formatDiscount(
        product.discount_percentage,
        product.original_price,
        product.price,
        lang
      );

      const dateLocale = lang === 'en' ? 'en-US' : 'ru-RU';
      const duration = product.discount_expires_at
        ? ` (${t('responseGenerator.validUntil', { date: new Date(product.discount_expires_at).toLocaleString(dateLocale, { day: 'numeric', month: 'short' }) }, lang)})`
        : '';

      return t('responseGenerator.discountSet', { discount: discountInfo, name, duration }, lang);
    }

    // Discount removed
    case 'discount_removed': {
      const { product } = data;
      if (!product) return t('responseGenerator.discountRemoved', {}, lang);

      const name = product.name || t('responseGenerator.product', {}, lang);
      const price = product.price ? ` ${t('responseGenerator.priceRestored', { price: formatPrice(product.price) }, lang)}` : '';

      return t('responseGenerator.discountRemovedFrom', { name, price }, lang);
    }

    // Bulk price change
    case 'prices_bulk_updated': {
      const { percentage, operation, productsUpdated, excludedProducts } = data;
      const count = productsUpdated || 0;

      if (count === 0) return t('responseGenerator.bulkPriceFailed', {}, lang);

      const action = operation === 'increase'
        ? t('responseGenerator.priceIncreased', {}, lang)
        : t('responseGenerator.priceDecreased', {}, lang);
      const excludeNote =
        excludedProducts && excludedProducts.length > 0
          ? ` (${t('responseGenerator.except', { names: excludedProducts.join(', ') }, lang)})`
          : '';

      return t('responseGenerator.bulkPriceChanged', { action, percentage: Math.abs(percentage), count, excludeNote }, lang);
    }

    // Delete single product
    case 'product_deleted': {
      const name = data.product?.name || data.productName || t('responseGenerator.product', {}, lang);
      return t('responseGenerator.deleted', { name }, lang);
    }

    // Bulk delete
    case 'products_bulk_deleted': {
      const count = data.deletedCount || data.count || 0;
      const deletedNames = data.deletedProducts?.map((p) => p.name || p).filter(Boolean);

      if (count === 0) return t('responseGenerator.bulkDeleteFailed', {}, lang);

      if (count === 1 && deletedNames && deletedNames[0]) {
        return t('responseGenerator.deleted', { name: deletedNames[0] }, lang);
      }

      if (count <= 3 && deletedNames && deletedNames.length > 0) {
        return t('responseGenerator.deletedList', { names: deletedNames.join(', ') }, lang);
      }

      return t('responseGenerator.bulkDeleted', { count }, lang);
    }

    // Delete all
    case 'products_all_deleted': {
      const count = data.deletedCount || data.count || 0;
      if (count === 0) return t('responseGenerator.catalogEmpty', {}, lang);
      return t('responseGenerator.allDeleted', { count }, lang);
    }

    // Record sale
    case 'sale_recorded': {
      const { product, quantity } = data;
      if (!product) return t('responseGenerator.saleRecorded', {}, lang);

      const name = product.name || t('responseGenerator.product', {}, lang);
      const qty = quantity || 1;
      const remaining =
        product.stock_quantity !== undefined
          ? ` ${t('responseGenerator.remainingStock', { count: product.stock_quantity }, lang)}`
          : '';

      return t('responseGenerator.saleRecordedDetails', { name, qty, remaining }, lang);
    }

    // List products
    case 'products_listed': {
      const count = data.products?.length || data.count || 0;
      if (count === 0) return t('responseGenerator.catalogEmptyAdd', {}, lang);
      return t('responseGenerator.catalogCount', { count }, lang);
    }

    // Find product
    case 'product_found': {
      const { product } = data;
      if (!product) return t('responseGenerator.productNotFound', {}, lang);

      const name = product.name;
      const price = formatPrice(product.price);
      const stock = product.stock_quantity || 0;
      const discount =
        product.discount_percentage > 0
          ? ` (${t('responseGenerator.discountLabel', { percentage: product.discount_percentage }, lang)})`
          : '';

      return t('responseGenerator.found', { name, price, stock, discount }, lang);
    }

    // Product info
    case 'product_info': {
      const { product } = data;
      if (!product) return t('responseGenerator.infoUnavailable', {}, lang);

      const name = product.name;
      const price = formatPrice(product.price);
      const stock = product.stock_quantity || 0;

      let info = t('responseGenerator.productInfo', { name, price, stock }, lang);

      if (product.discount_percentage > 0) {
        info += `\n${t('responseGenerator.discountLabel', { percentage: product.discount_percentage }, lang)}`;
        if (product.original_price) {
          info += ` (${t('responseGenerator.wasPrice', { price: formatPrice(product.original_price) }, lang)})`;
        }
      }

      return info;
    }

    // Confirmation required
    case 'confirmation_required': {
      return data.message || t('responseGenerator.confirmationNeeded', {}, lang);
    }

    // Clarification required
    case 'clarification_required': {
      return data.message || t('responseGenerator.clarificationNeeded', {}, lang);
    }

    // Unknown action type
    default:
      return t('responseGenerator.operationSuccess', {}, lang);
  }
}

/**
 * Success prefix variations (for future use)
 */
const SUCCESS_PREFIXES = ['checkmark', 'thumbsup', 'check', 'done', 'completed', 'ok'];

/**
 * Get random success prefix
 * @param {string} lang - Language code
 * @returns {string} Random success prefix
 */
export function getRandomSuccessPrefix(lang = 'ru') {
  const key = SUCCESS_PREFIXES[Math.floor(Math.random() * SUCCESS_PREFIXES.length)];
  return t(`responseGenerator.successPrefix.${key}`, {}, lang);
}
