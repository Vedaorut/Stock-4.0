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
import telegramService from '../../telegram.js';
import logger from '../../../utils/logger.js';

/**
 * Notify seller and buyer about confirmed order payment
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

  // Notify seller
  if (seller?.telegram_id && product && shop) {
    try {
      await telegramService.notifyPaymentConfirmedSeller(seller.telegram_id, {
        orderId: order.id,
        productName: product.name,
        quantity: order.quantity,
        totalPrice: order.total_price,
        currency: order.currency,
        buyerUsername: buyer?.username || 'Anonymous',
        buyerTelegramId: buyer?.telegram_id,
      });
    } catch (error) {
      logger.error('[InvoicePayment] Seller notification error', { error: error.message });
    }
  }

  // Notify buyer
  if (order.buyer_telegram_id && product && shop && seller) {
    try {
      await telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
        id: order.id,
        product_name: product.name,
        quantity: order.quantity,
        total_price: order.total_price,
        currency: order.currency,
        seller_username: seller.username,
        shop_name: shop.name,
      });
    } catch (error) {
      logger.error('[InvoicePayment] Buyer notification error', { error: error.message });
    }
  }

  // Notify workers (only those who haven't muted notifications)
  if (product && shop) {
    try {
      const workers = await workerQueries.getWorkersForNotification(shop.id);

      for (const worker of workers) {
        try {
          await telegramService.notifyPaymentConfirmedSeller(worker.telegram_id, {
            orderId: order.id,
            productName: product.name,
            quantity: order.quantity,
            totalPrice: order.total_price,
            currency: order.currency,
            buyerUsername: buyer?.username || 'Anonymous',
            buyerTelegramId: buyer?.telegram_id,
          });
        } catch (workerError) {
          logger.error('[InvoicePayment] Worker notification error', {
            workerId: worker.id,
            telegramId: worker.telegram_id,
            error: workerError.message,
          });
        }
      }

      if (workers.length > 0) {
        logger.info('[InvoicePayment] Workers notified', {
          orderId: order.id,
          shopId: shop.id,
          workerCount: workers.length,
        });
      }
    } catch (error) {
      logger.error('[InvoicePayment] Workers notification fetch error', { error: error.message });
    }
  }
}
