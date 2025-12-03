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
import { t, DEFAULT_LANGUAGE } from '../../../i18n/index.js';
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
      const lang = owner.language || DEFAULT_LANGUAGE;
      const tierEmoji = subscription.tier === 'max' ? '👑' : '⭐';
      const tierLabel = (subscription.tier || 'pro').toUpperCase();
      const dateLocale = lang === 'en' ? 'en-US' : 'ru-RU';
      const nextDue = subscription.period_end
        ? new Date(subscription.period_end).toLocaleDateString(dateLocale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : null;

      const message = `${tierEmoji} <b>${t('subscription.activated.title', {}, lang)}</b>

<b>${shop.name}</b>
${t('subscription.activated.tier', { tier: tierLabel }, lang)}${nextDue ? `\n${t('subscription.activated.validUntil', { date: nextDue }, lang)}` : ''}`;

      const result = await sendNotificationWithRetry(
        async () => {
          await global.botInstance.telegram.sendMessage(owner.telegram_id, message.trim(), {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: t('subscription.activated.goToMenu', {}, lang), callback_data: 'back_to_main' }]],
            },
          });
        },
        { type: 'subscription_activated', subscriptionId, ownerTelegramId: owner.telegram_id }
      );

      if (!result.success) {
        logger.error('[InvoicePayment] Failed to notify subscription activation after retries', {
          subscriptionId,
          ownerTelegramId: owner.telegram_id,
          error: result.error?.message,
        });
      }
    }
  } catch (error) {
    logger.error('[InvoicePayment] Subscription notification error', { error: error.message });
  }
}
