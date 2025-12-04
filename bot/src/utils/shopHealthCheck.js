import { walletApi, productApi } from './api.js';
import logger from './logger.js';

/**
 * Check shop state (for status bar)
 * @param {number} shopId - Shop ID
 * @param {string} token - JWT token
 * @returns {Promise<Object>} - { hasWallets: boolean, productsCount: number, tier: string }
 */
async function checkShopHealth(shopId, token) {
  try {
    // Check wallets
    let hasWallets = false;
    try {
      const wallets = await walletApi.getWallets(shopId, token);
      // Check if there's at least one non-empty wallet
      hasWallets = Object.values(wallets).some((addr) => addr && addr.trim() !== '');
    } catch (err) {
      logger.warn('Wallet health check failed', { error: err.message });
      // If endpoint unavailable, assume no wallets
      hasWallets = false;
    }

    // Check products
    let productsCount = 0;
    try {
      const products = await productApi.getShopProducts(shopId);
      productsCount = Array.isArray(products) ? products.length : 0;
    } catch (err) {
      logger.warn('Product health check failed', { error: err.message });
      // If endpoint unavailable, assume no products
      productsCount = 0;
    }

    return {
      hasWallets,
      productsCount,
    };
  } catch (error) {
    logger.error('Error checking shop health', { error: error.message, stack: error.stack });
    // In case of error return safe values
    return {
      hasWallets: true, // Don't show warning if uncertain
      productsCount: 1, // Don't show warning if uncertain
    };
  }
}

export { checkShopHealth };
