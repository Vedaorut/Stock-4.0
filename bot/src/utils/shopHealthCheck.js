import { walletApi, productApi } from './api.js';
import logger from './logger.js';

/**
 * Проверить состояние магазина (для статус-бара)
 * @param {number} shopId - ID магазина
 * @param {string} token - JWT токен
 * @returns {Promise<Object>} - { hasWallets: boolean, productsCount: number, tier: string }
 */
async function checkShopHealth(shopId, token) {
  try {
    // Проверка кошельков
    let hasWallets = false;
    try {
      const wallets = await walletApi.getWallets(shopId, token);
      // Проверяем есть ли хотя бы один непустой кошелек
      hasWallets = Object.values(wallets).some((addr) => addr && addr.trim() !== '');
    } catch (err) {
      logger.warn('Wallet health check failed', { error: err.message });
      // Если endpoint недоступен, считаем что кошельков нет
      hasWallets = false;
    }

    // Проверка товаров
    let productsCount = 0;
    try {
      const products = await productApi.getShopProducts(shopId);
      productsCount = Array.isArray(products) ? products.length : 0;
    } catch (err) {
      logger.warn('Product health check failed', { error: err.message });
      // Если endpoint недоступен, считаем что товаров нет
      productsCount = 0;
    }

    return {
      hasWallets,
      productsCount,
    };
  } catch (error) {
    logger.error('Error checking shop health', { error: error.message, stack: error.stack });
    // В случае ошибки возвращаем безопасные значения
    return {
      hasWallets: true, // Не показываем предупреждение если не уверены
      productsCount: 1, // Не показываем предупреждение если не уверены
    };
  }
}

export { checkShopHealth };
