/**
 * Tier Limits Configuration
 * Single source of truth for subscription tier privileges in webapp.
 * MUST match backend/src/config/subscriptionPricing.js
 */

export const TIER_LIMITS = {
  pro: {
    products: 50,
    follows: 2,
    workers: 0,
    analyticsDays: 30,
    canMigrate: false,
  },
  max: {
    products: Infinity,
    follows: Infinity,
    workers: 5,
    analyticsDays: 365,
    canMigrate: true,
  },
};

/**
 * Check if tier has access to workers feature
 */
export function canUseWorkers(tier) {
  const normalizedTier = (tier || '').toLowerCase();
  const limits = TIER_LIMITS[normalizedTier];
  return limits ? limits.workers > 0 : false;
}

/**
 * Check if tier is MAX
 */
export function isMaxTier(tier) {
  return (tier || '').toLowerCase() === 'max';
}

/**
 * Check if tier is PRO
 */
export function isProTier(tier) {
  return (tier || '').toLowerCase() === 'pro';
}

/**
 * Get tier limits
 */
export function getTierLimits(tier) {
  const normalizedTier = (tier || '').toLowerCase();
  return TIER_LIMITS[normalizedTier] || TIER_LIMITS.pro;
}

export default TIER_LIMITS;
