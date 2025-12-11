import { walletApi, productApi, subscriptionApi } from './api.js';
import logger from './logger.js';

/**
 * Calculate days remaining until subscription expires
 * @param {string|Date} periodEnd - Subscription end date
 * @returns {number|null} - Days remaining (null if invalid date)
 */
function calculateDaysRemaining(periodEnd) {
  if (!periodEnd) return null;

  const endDate = new Date(periodEnd);
  if (Number.isNaN(endDate.getTime())) return null;

  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check shop state (for status bar)
 * @param {number} shopId - Shop ID
 * @param {string} token - JWT token
 * @returns {Promise<Object>} - { hasWallets, productsCount, subscriptionDaysRemaining, subscriptionStatus }
 */
async function checkShopHealth(shopId, token) {
  try {
    // Run all checks in parallel for performance
    const [walletsResult, productsResult, subscriptionResult] = await Promise.all([
      // Check wallets
      walletApi.getWallets(shopId, token).catch((err) => {
        logger.warn('Wallet health check failed', { error: err.message });
        return null;
      }),
      // Check products
      productApi.getShopProducts(shopId).catch((err) => {
        logger.warn('Product health check failed', { error: err.message });
        return null;
      }),
      // Check subscription status
      subscriptionApi.getStatus(shopId, token).catch((err) => {
        logger.warn('Subscription health check failed', { error: err.message });
        return null;
      }),
    ]);

    // Process wallets
    let hasWallets = false;
    if (walletsResult) {
      hasWallets = Object.values(walletsResult).some((addr) => addr && addr.trim() !== '');
    }

    // Process products
    const productsCount = Array.isArray(productsResult) ? productsResult.length : 0;

    // Process subscription
    let subscriptionDaysRemaining = null;
    let subscriptionStatus = null;

    if (subscriptionResult) {
      const periodEnd =
        subscriptionResult.nextPaymentDue ||
        subscriptionResult.periodEnd ||
        subscriptionResult.currentSubscription?.period_end;

      subscriptionDaysRemaining = calculateDaysRemaining(periodEnd);
      subscriptionStatus = subscriptionResult.status || (subscriptionResult.currentSubscription ? 'active' : 'inactive');
    }

    return {
      hasWallets,
      productsCount,
      subscriptionDaysRemaining,
      subscriptionStatus,
    };
  } catch (error) {
    logger.error('Error checking shop health', { error: error.message, stack: error.stack });
    // In case of error return safe values
    return {
      hasWallets: true, // Don't show warning if uncertain
      productsCount: 1, // Don't show warning if uncertain
      subscriptionDaysRemaining: null,
      subscriptionStatus: null,
    };
  }
}

export { checkShopHealth, calculateDaysRemaining };
