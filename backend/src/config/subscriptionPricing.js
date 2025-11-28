/**
 * Subscription Pricing Configuration
 * 
 * Single source of truth for subscription prices across all services.
 * This prevents pricing mismatches between subscriptionService.js and subscriptionInvoiceService.js
 * 
 * Price structure:
 * - Basic tier: $25/month
 * - Pro tier: $35/month
 * - Grace period: 2 days after expiration
 * - Subscription period: 30 days
 * 
 * Used by:
 * - subscriptionService.js - for subscription creation and renewals
 * - subscriptionInvoiceService.js - for crypto invoice generation
 * - subscriptionController.js - for price display in API responses
 */

const DEFAULT_SUBSCRIPTION_PRICES = {
  basic: 25.0,
  pro: 35.0,
};

const parsePrice = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Monthly subscription prices (USD)
 *
 * Production defaults: basic $25, pro $35.
 * Can be overridden via env (SUBSCRIPTION_PRICE_BASIC / SUBSCRIPTION_PRICE_PRO) for testing.
 */
export const SUBSCRIPTION_PRICES = {
  basic: parsePrice(process.env.SUBSCRIPTION_PRICE_BASIC, DEFAULT_SUBSCRIPTION_PRICES.basic),
  pro: parsePrice(process.env.SUBSCRIPTION_PRICE_PRO, DEFAULT_SUBSCRIPTION_PRICES.pro),
};

/**
 * Yearly subscription prices (USD)
 * ~17% discount compared to monthly billing
 */
export const SUBSCRIPTION_PRICES_YEARLY = {
  basic: 250.0,  // $25/month * 12 = $300, discounted to $250 (17% off)
  pro: 350.0,    // $35/month * 12 = $420, discounted to $350 (17% off)
};

/**
 * Available subscription tiers
 */
export const SUBSCRIPTION_TIERS = ['basic', 'pro'];

/**
 * Subscription period in days (monthly)
 */
export const SUBSCRIPTION_PERIOD_DAYS = 30;

/**
 * Grace period after subscription expiration (days)
 * After grace period expires, shop is deactivated
 */
export const GRACE_PERIOD_DAYS = 2;

/**
 * Invoice expiration time for subscription payments (minutes)
 * Payment must be completed within this timeframe
 */
export const INVOICE_EXPIRATION_MINUTES = 30;

/**
 * Validate subscription tier
 * @param {string} tier - Subscription tier to validate
 * @returns {boolean} True if tier is valid
 */
export function isValidTier(tier) {
  return SUBSCRIPTION_TIERS.includes(tier);
}

/**
 * Get price for subscription tier
 * @param {string} tier - Subscription tier ('basic' or 'pro')
 * @param {boolean} yearly - If true, return yearly price
 * @returns {number} Price in USD
 * @throws {Error} If tier is invalid
 */
export function getPrice(tier, yearly = false) {
  const prices = yearly ? SUBSCRIPTION_PRICES_YEARLY : SUBSCRIPTION_PRICES;
  const price = prices[tier];
  
  if (price === undefined) {
    throw new Error(`Invalid subscription tier: ${tier}. Valid tiers: ${SUBSCRIPTION_TIERS.join(', ')}`);
  }
  
  return price;
}

/**
 * Calculate prorated price for tier upgrade
 * @param {Date} periodStart - Current subscription period start
 * @param {Date} periodEnd - Current subscription period end
 * @param {string} fromTier - Current tier
 * @param {string} toTier - Target tier
 * @returns {number} Prorated upgrade amount in USD
 */
export function calculateProratedUpgrade(periodStart, periodEnd, fromTier, toTier) {
  const now = new Date();
  const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
  const remainingDays = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
  
  const fromPrice = getPrice(fromTier);
  const toPrice = getPrice(toTier);
  
  // Daily price difference
  const dailyDifference = (toPrice - fromPrice) / totalDays;
  const upgradeAmount = dailyDifference * remainingDays;
  
  // Round to 2 decimal places, minimum $0.01
  return Math.max(0.01, Math.round(upgradeAmount * 100) / 100);
}

export default {
  SUBSCRIPTION_PRICES,
  SUBSCRIPTION_PRICES_YEARLY,
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PERIOD_DAYS,
  GRACE_PERIOD_DAYS,
  INVOICE_EXPIRATION_MINUTES,
  isValidTier,
  getPrice,
  calculateProratedUpgrade,
};
