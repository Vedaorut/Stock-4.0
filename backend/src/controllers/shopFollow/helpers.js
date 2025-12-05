/**
 * Shop Follow Controller Helpers
 * Shared utilities and formatters
 */

import { TIER_LIMITS } from '../../config/subscriptionPricing.js';

/**
 * Get follow limit for tier
 * @param {string} tier - 'pro' or 'max'
 * @returns {number} Follow limit (Infinity for max)
 */
export const getFollowLimit = (tier) => {
  const limits = TIER_LIMITS[tier];
  return limits ? limits.follows : TIER_LIMITS.pro.follows;
};

// PRO tier follow limit constant
export const PRO_TIER_FOLLOW_LIMIT = TIER_LIMITS.pro.follows;

/**
 * Normalize numeric values from PostgreSQL
 */
export const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Convert raw follow row into API response format
 */
export const formatFollowResponse = (follow) => {
  if (!follow) {
    return null;
  }

  const markupType = follow.markup_type || 'percentage';
  const markupPercentage = follow.mode === 'resell' && markupType === 'percentage'
    ? toNumber(follow.markup_percentage, 0) : 0;
  const markupFixed = follow.mode === 'resell' && markupType === 'fixed'
    ? toNumber(follow.markup_fixed, 0) : 0;

  return {
    id: follow.id,
    follower_shop_id: follow.follower_shop_id,
    target_shop_id: follow.source_shop_id,
    follower_shop_name: follow.follower_shop_name || null,
    source_shop_id: follow.source_shop_id,
    source_shop_name: follow.source_shop_name || null,
    source_shop_logo: follow.source_shop_logo || null,
    source_owner_id: follow.source_owner_id || null,
    source_username: follow.source_username || null,
    mode: follow.mode,
    markup_type: markupType,
    markup_percentage: markupPercentage,
    markup_fixed: markupFixed,
    status: follow.status,
    synced_products_count: toNumber(follow.synced_products_count, 0),
    source_products_count: toNumber(follow.source_products_count, 0),
    created_at: follow.created_at,
    updated_at: follow.updated_at,
  };
};

/**
 * Format product for monitor mode
 */
export const formatMonitorProduct = (product) => ({
  id: product.id,
  name: product.name,
  description: product.description,
  price: Number(product.price),
  currency: product.currency,
  stock_quantity: Number(product.stock_quantity),
  is_active: product.is_active,
  image: product.image || product.images?.[0] || null,
  updated_at: product.updated_at,
  created_at: product.created_at,
});

/**
 * Format product for resell mode with markup info
 */
export const formatResellProduct = (row, globalMarkupPercentage, globalMarkupType = 'percentage', globalMarkupFixed = 0) => {
  const sourcePrice = Number(row.source_product_price) || 0;
  const syncedPrice = Number(row.synced_product_price) || 0;

  const hasCustomMarkup = row.custom_markup_type !== null;
  const effectiveMarkupType = hasCustomMarkup ? row.custom_markup_type : globalMarkupType;
  const effectiveMarkupPercentage = hasCustomMarkup
    ? Number(row.custom_markup_percentage) || 0
    : Number(globalMarkupPercentage) || 0;
  const effectiveMarkupFixed = hasCustomMarkup
    ? Number(row.custom_markup_fixed) || 0
    : Number(globalMarkupFixed) || 0;

  let expectedPrice;
  if (effectiveMarkupType === 'fixed') {
    expectedPrice = sourcePrice + effectiveMarkupFixed;
  } else {
    const markupMultiplier = 1 + effectiveMarkupPercentage / 100;
    expectedPrice = sourcePrice * markupMultiplier;
  }
  expectedPrice = Number(expectedPrice.toFixed(2));

  return {
    id: row.id,
    follow_id: row.follow_id,
    source_product: {
      id: row.source_product_id,
      name: row.source_product_name,
      price: sourcePrice,
      stock_quantity: Number(row.source_product_stock),
      is_active: row.source_product_active,
      is_preorder: row.source_product_preorder || false,
    },
    synced_product: {
      id: row.synced_product_id,
      name: row.synced_product_name,
      price: syncedPrice,
      stock_quantity: Number(row.synced_product_stock),
      is_active: row.synced_product_active,
      is_preorder: row.synced_product_preorder || false,
    },
    pricing: {
      markup_type: effectiveMarkupType,
      markup_percentage: effectiveMarkupPercentage,
      markup_fixed: effectiveMarkupFixed,
      expected_price: expectedPrice,
      deviation: syncedPrice
        ? Number((syncedPrice - expectedPrice).toFixed(2))
        : null,
      has_custom_markup: hasCustomMarkup,
    },
    custom_markup: hasCustomMarkup ? {
      type: row.custom_markup_type,
      percentage: Number(row.custom_markup_percentage) || 0,
      fixed: Number(row.custom_markup_fixed) || 0,
    } : null,
    conflict_status: row.conflict_status,
    last_synced_at: row.last_synced_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};
