/**
 * Subscription payment notifications
 * Called AFTER transaction commit - errors are logged but not thrown
 */

import {
  subscriptionQueries,
  shopQueries,
  userQueries,
} from '../../../database/queries/index.js';
import logger from '../../../utils/logger.js';

/**
 * Notify shop owner about activated subscription
 * @param {number} subscriptionId - Subscription ID to notify about
 */
export async function notifySubscriptionActivated(subscriptionId) {
  try {
    const subscription = await subscriptionQueries.findShopSubscriptionById(subscriptionId);
    if (!subscription || !subscription.shop_id) {
      return;
    }

    const shop = await shopQueries.findById(subscription.shop_id);
    const owner = shop ? await userQueries.findById(shop.owner_id) : null;

    if (owner?.telegram_id && shop && global.botInstance) {
      const tierEmoji = subscription.tier === 'pro' ? '***' : '***';
      const tierLabel = (subscription.tier || 'basic').toUpperCase();
      const nextDue = subscription.period_end
        ? new Date(subscription.period_end).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : null;

      const message = `${tierEmoji} <b>Магазин активирован</b>

<b>${shop.name}</b>
Тариф: ${tierLabel}${nextDue ? `\nДействует до: ${nextDue}` : ''}`;

      try {
        await global.botInstance.telegram.sendMessage(owner.telegram_id, message.trim(), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: 'Перейти в меню', callback_data: 'back_to_main' }]],
          },
        });
      } catch (err) {
        logger.error('[InvoicePayment] Failed to notify subscription owner', {
          error: err.message,
          subscriptionId,
        });
      }
    }
  } catch (error) {
    logger.error('[InvoicePayment] Subscription notification error', { error: error.message });
  }
}
