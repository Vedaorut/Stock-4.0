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
import telegramService from '../../telegram.js';
import { alertCritical } from '../../../utils/alerts.js';

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
 * @param {Object} options - Notification options
 * @param {string} options.purpose - Invoice purpose (subscription_new, subscription_renewal, subscription_upgrade)
 */
export async function notifySubscriptionActivated(subscriptionId, options = {}) {
  const { purpose = 'subscription' } = options;

  try {
    const subscription = await subscriptionQueries.findShopSubscriptionById(subscriptionId);
    if (!subscription) {
      logger.warn('[InvoicePayment] Subscription not found for notification', { subscriptionId });
      return;
    }

    // For NEW subscriptions, shop_id may be null - find user directly from subscription
    let owner;
    let shop = null;

    if (subscription.shop_id) {
      // Has shop - get owner via shop
      shop = await shopQueries.findById(subscription.shop_id);
      owner = shop ? await userQueries.findById(shop.owner_id) : null;
    } else {
      // No shop yet (new subscription) - get user directly from subscription
      owner = await userQueries.findById(subscription.user_id);
    }

    if (!owner?.telegram_id) {
      logger.warn('[InvoicePayment] Cannot send notification - no telegram_id', {
        subscriptionId,
        hasOwner: !!owner,
        hasTelegramId: !!owner?.telegram_id,
      });
      return;
    }

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

    // Check if this is a NEW subscription (needs shop setup) or RENEWAL
    const isNewSubscription = purpose === 'subscription_new';
    // Also treat as "new" if no shop exists yet
    const needsShopSetup = isNewSubscription || !subscription.shop_id;

    let message;
    let keyboard;

    if (needsShopSetup) {
      // NEW SUBSCRIPTION or NO SHOP: Show setup prompt with button to create shop
      message = `${tierEmoji} <b>${t('subscription.new.title', {}, lang)}</b>

${t('subscription.new.thankYou', { tier: tierLabel }, lang)}
${nextDue ? t('subscription.new.validUntil', { date: nextDue }, lang) : ''}

${t('subscription.new.nextStep', {}, lang)}`;

      keyboard = {
        inline_keyboard: [
          [{ text: t('subscription.new.setupShopButton', {}, lang), callback_data: `start_create_shop:${subscription.tier || 'pro'}` }],
        ],
      };

      logger.info('[InvoicePayment] Sending NEW subscription notification with shop setup button', {
        subscriptionId,
        userId: owner.id,
        telegramId: owner.telegram_id,
        tier: subscription.tier,
        hasShop: !!subscription.shop_id,
      });
    } else {
      // RENEWAL / UPGRADE: Show confirmation with date extended
      message = `${tierEmoji} <b>${t('subscription.renewed.title', {}, lang)}</b>

<b>${shop?.name || 'Shop'}</b>
${t('subscription.renewed.tier', { tier: tierLabel }, lang)}
${nextDue ? t('subscription.renewed.extendedUntil', { date: nextDue }, lang) : ''}`;

      keyboard = {
        inline_keyboard: [[{ text: t('subscription.activated.goToMenu', {}, lang), callback_data: 'back_to_main' }]],
      };

      logger.info('[InvoicePayment] Sending RENEWAL subscription notification', {
        subscriptionId,
        shopId: subscription.shop_id,
        shopName: shop?.name,
      });
    }

    const result = await sendNotificationWithRetry(
      async () => {
        await telegramService.sendMessage(owner.telegram_id, message.trim(), {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      },
      { type: 'subscription_activated', subscriptionId, ownerTelegramId: owner.telegram_id, purpose }
    );

    if (!result.success) {
      logger.error('[InvoicePayment] Failed to notify subscription activation after retries', {
        subscriptionId,
        ownerTelegramId: owner.telegram_id,
        error: result.error?.message,
      });

      // CRITICAL: Alert admin - user paid but didn't receive notification with shop creation button
      alertCritical(
        '🚨 Subscription notification FAILED',
        `User paid for subscription but notification failed!\n\n` +
        `Subscription ID: ${subscriptionId}\n` +
        `Telegram ID: ${owner.telegram_id}\n` +
        `Tier: ${subscription.tier}\n` +
        `Has Shop: ${!!subscription.shop_id}\n` +
        `Error: ${result.error?.message || 'Unknown'}\n\n` +
        `ACTION REQUIRED: Manually send shop creation link to user`,
        `sub_notif_fail_${subscriptionId}`
      );
    }
  } catch (error) {
    logger.error('[InvoicePayment] Subscription notification error', { error: error.message, stack: error.stack });
  }
}
