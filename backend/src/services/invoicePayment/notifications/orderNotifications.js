/**
 * Order payment notifications
 * Called AFTER transaction commit - errors are logged but not thrown
 */

import {
  orderQueries,
  productQueries,
  shopQueries,
  userQueries,
} from '../../../database/queries/index.js';
import { workerQueries } from '../../../models/workerQueries.js';
import { syncedProductQueries } from '../../../models/syncedProductQueries.js';
import telegramService from '../../telegram.js';
import logger from '../../../utils/logger.js';
import { DEFAULT_LANGUAGE } from '../../../i18n/index.js';
import { sleep } from '../../../utils/helpers.js';

const MAX_NOTIFICATION_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 9000]; // exponential backoff

/**
 * Send notification with retry mechanism
 * @param {Function} sendFn - Async function to send notification
 * @param {Object} context - Context for logging
 * @returns {Promise<{success: boolean, error?: Error}>}
 */
async function sendNotificationWithRetry(sendFn, context) {
  let lastError;
  for (let attempt = 0; attempt < MAX_NOTIFICATION_RETRIES; attempt++) {
    try {
      await sendFn();
      return { success: true };
    } catch (error) {
      lastError = error;
      logger.warn(`[InvoicePayment] Notification attempt ${attempt + 1}/${MAX_NOTIFICATION_RETRIES} failed`, {
        error: error.message,
        ...context,
      });
      if (attempt < MAX_NOTIFICATION_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  logger.error('[InvoicePayment] All notification attempts failed', {
    error: lastError?.message,
    ...context,
    action: 'MANUAL_INTERVENTION_REQUIRED',
  });

  return { success: false, error: lastError };
}

/**
 * Notify entire shop team (owner + workers)
 * @param {number} shopId - Shop ID
 * @param {Function} notifyFn - Async function(telegramId, lang) to send notification
 * @param {Object} options - { excludeUserId: number } - user to exclude from notifications
 * @returns {Promise<{successCount: number, totalCount: number}>}
 */
async function notifyShopTeam(shopId, notifyFn, options = {}) {
  const { excludeUserId } = options;

  const shop = await shopQueries.findById(shopId);
  if (!shop) {
    logger.error('[Notifications] Shop not found for team notification', { shopId });
    return { successCount: 0, totalCount: 0 };
  }

  const owner = await userQueries.findById(shop.owner_id);
  const ownerLang = owner?.language || DEFAULT_LANGUAGE;
  let successCount = 0;
  let totalCount = 0;

  // Notify owner (unless excluded)
  if (owner?.telegram_id && shop.owner_id !== excludeUserId) {
    totalCount++;
    const result = await sendNotificationWithRetry(
      async () => notifyFn(owner.telegram_id, ownerLang),
      { type: 'shop_team_owner', shopId, ownerTelegramId: owner.telegram_id }
    );
    if (result.success) {successCount++;}
  }

  // Notify workers
  try {
    const workers = await workerQueries.getWorkersForNotification(shopId);
    for (const worker of workers) {
      if (worker.user_id === excludeUserId) {continue;}

      totalCount++;
      const result = await sendNotificationWithRetry(
        async () => notifyFn(worker.telegram_id, ownerLang),
        { type: 'shop_team_worker', shopId, workerId: worker.id, workerTelegramId: worker.telegram_id }
      );
      if (result.success) {successCount++;}
    }
  } catch (error) {
    logger.error('[Notifications] Error fetching workers for team notification', { error: error.message, shopId });
  }

  if (totalCount > 0) {
    logger.info('[Notifications] Shop team notified', { shopId, totalCount, successCount });
  }

  return { successCount, totalCount };
}

/**
 * Notify seller and buyer about paid order (confirmed payment)
 * Buyer receives seller contact immediately!
 * @param {number} orderId - Order ID to notify about
 */
export async function notifyOrderConfirmed(orderId) {
  // Fetch fresh order/product/shop data outside the transaction for notifications
  const order = await orderQueries.findById(orderId);
  if (!order) {
    return;
  }

  const product = await productQueries.findById(order.product_id);
  const shop = product ? await shopQueries.findById(product.shop_id) : null;
  const buyer = await userQueries.findById(order.buyer_id);
  const seller = shop ? await userQueries.findById(shop.owner_id) : null;

  // Check if this is a synced product (resell) - get source shop info
  let sourceInfo = null;
  if (product) {
    try {
      const syncedProduct = await syncedProductQueries.findWithSourceInfo(product.id);
      if (syncedProduct && syncedProduct.mode === 'resell') {
        sourceInfo = {
          shopName: syncedProduct.source_shop_name,
          ownerUsername: syncedProduct.source_owner_username,
          shopId: syncedProduct.source_shop_id,
        };
      }
    } catch (error) {
      logger.error('[InvoicePayment] Error fetching source info', { error: error.message, productId: product.id });
    }
  }

  // Notify seller
  if (seller?.telegram_id && product && shop) {
    const sellerLang = seller.language || DEFAULT_LANGUAGE;
    const result = await sendNotificationWithRetry(
      async () => {
        await telegramService.notifyPaymentConfirmedSeller(seller.telegram_id, {
          orderId: order.id,
          productName: product.name,
          quantity: order.quantity,
          totalPrice: order.total_price,
          currency: order.currency,
          buyerUsername: buyer?.username || 'Anonymous',
          buyerTelegramId: buyer?.telegram_id,
          sourceInfo, // Include source shop info for resell products
        }, sellerLang);
      },
      { type: 'order_confirmed_seller', orderId: order.id, sellerTelegramId: seller.telegram_id }
    );

    if (!result.success) {
      logger.error('[InvoicePayment] Failed to notify seller after retries', {
        orderId: order.id,
        sellerTelegramId: seller.telegram_id,
        error: result.error?.message,
      });
    }
  }

  // Notify buyer
  if (order.buyer_telegram_id && product && shop && seller) {
    const buyerLang = buyer?.language || DEFAULT_LANGUAGE;
    const result = await sendNotificationWithRetry(
      async () => {
        await telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
          id: order.id,
          product_name: product.name,
          quantity: order.quantity,
          total_price: order.total_price,
          currency: order.currency,
          seller_username: seller.username,
          shop_name: shop.name,
        }, buyerLang);
      },
      { type: 'order_confirmed_buyer', orderId: order.id, buyerTelegramId: order.buyer_telegram_id }
    );

    if (!result.success) {
      logger.error('[InvoicePayment] Failed to notify buyer after retries', {
        orderId: order.id,
        buyerTelegramId: order.buyer_telegram_id,
        error: result.error?.message,
      });
    }
  }

  // Notify workers (only those who haven't muted notifications)
  if (product && shop) {
    try {
      const workers = await workerQueries.getWorkersForNotification(shop.id);
      const workerLang = seller?.language || DEFAULT_LANGUAGE;
      let successCount = 0;

      for (const worker of workers) {
        const result = await sendNotificationWithRetry(
          async () => {
            await telegramService.notifyPaymentConfirmedSeller(worker.telegram_id, {
              orderId: order.id,
              productName: product.name,
              quantity: order.quantity,
              totalPrice: order.total_price,
              currency: order.currency,
              buyerUsername: buyer?.username || 'Anonymous',
              buyerTelegramId: buyer?.telegram_id,
            }, workerLang);
          },
          { type: 'order_confirmed_worker', orderId: order.id, workerId: worker.id, workerTelegramId: worker.telegram_id }
        );

        if (result.success) {
          successCount++;
        } else {
          logger.error('[InvoicePayment] Failed to notify worker after retries', {
            orderId: order.id,
            workerId: worker.id,
            workerTelegramId: worker.telegram_id,
            error: result.error?.message,
          });
        }
      }

      if (workers.length > 0) {
        logger.info('[InvoicePayment] Workers notified', {
          orderId: order.id,
          shopId: shop.id,
          workerCount: workers.length,
          successCount,
        });
      }
    } catch (error) {
      logger.error('[InvoicePayment] Workers notification fetch error', { error: error.message });
    }
  }
}

/**
 * Notify shop team about completed order (выдан)
 * NOTE: Does NOT notify buyer - this is internal status for shop team only!
 * @param {number} orderId - Order ID to notify about
 * @param {number} completedByUserId - User ID who marked order as completed
 */
export async function notifyOrderCompleted(orderId, completedByUserId) {
  const order = await orderQueries.findById(orderId);
  if (!order) {
    logger.error('[Notifications] Order not found for completion notification', { orderId });
    return;
  }

  const product = await productQueries.findById(order.product_id);
  const shop = product ? await shopQueries.findById(product.shop_id) : null;
  const buyer = await userQueries.findById(order.buyer_id);
  const completedByUser = completedByUserId ? await userQueries.findById(completedByUserId) : null;

  if (!shop) {
    logger.error('[Notifications] Shop not found for completion notification', { orderId, productId: order.product_id });
    return;
  }

  const orderData = {
    orderId: order.id,
    productName: product?.name || 'Unknown',
    quantity: order.quantity,
    totalPrice: order.total_price,
    buyerUsername: buyer?.username || 'Anonymous',
    completedByUsername: completedByUser?.username,
  };

  // Notify shop team (owner + workers) but NOT the person who marked it completed
  await notifyShopTeam(
    shop.id,
    async (telegramId, lang) => {
      await telegramService.notifyOrderCompleted(telegramId, orderData, lang);
    },
    { excludeUserId: completedByUserId }
  );

  logger.info('[Notifications] Order completion notification sent to shop team', {
    orderId,
    shopId: shop.id,
    completedByUserId,
  });
}
