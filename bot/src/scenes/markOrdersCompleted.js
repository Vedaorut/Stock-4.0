import { Scenes, Markup } from 'telegraf';
import { orderApi } from '../utils/api.js';
import { parseOrderNumbers } from '../utils/orderParser.js';
import logger from '../utils/logger.js';
import { getMessages } from '../texts/messages.js';
import { t } from '../i18n/index.js';

/**
 * Mark Orders Completed Scene - Bulk management of order completions
 *
 * Flow:
 * 1. Show prompt for order numbers
 * 2. Parse and validate input
 * 3. Show confirmation with order details
 * 4. Update orders and send notifications to buyers
 *
 * Status flow: paid -> completed (replaces old confirmed -> shipped -> delivered)
 */

// ==========================================
// STEP 1: SHOW PROMPT
// ==========================================

const showPrompt = async (ctx) => {
  try {
    logger.info('mark_orders_completed:step:prompt', { userId: ctx.from.id });

    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMessages } = getMessages(lang);

    // Validate session
    if (!ctx.session.shopId || !ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired(lang));
      return await ctx.scene.leave();
    }

    // Get paid orders (new status) - also check for 'confirmed' for backward compatibility
    const result = await orderApi.getShopOrders(ctx.session.shopId, ctx.session.token, {
      status: 'confirmed',  // DB status for paid orders awaiting delivery
    });
    // Parse response correctly - API returns { success, data, pagination }
    const orders = result.success && Array.isArray(result.data) ? result.data : [];
    // DB constraint: pending, confirmed, shipped, delivered, cancelled
    const activeOrders = orders.filter((order) => order.status === 'confirmed');

    if (activeOrders.length === 0) {
      await ctx.editMessageText(
        t('seller.noActiveOrders', {}, lang),
        Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back', {}, lang), 'cancel_scene')]])
      );
      return;
    }

    // Store active orders in wizard state for validation
    ctx.wizard.state.activeOrders = activeOrders;

    // Helper function to format price
    const formatPrice = (value) => {
      const amount = Number(value);
      if (!Number.isFinite(amount)) {
        return '0';
      }
      return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
    };

    // Format orders list (same logic as in orders.js)
    const ordersList = activeOrders
      .map((order, index) => {
        const buyer = order.buyer_username
          ? `@${order.buyer_username}`
          : order.buyer_first_name || t('orders.buyerDefault', {}, lang);
        const productName = order.product_name || order.productName || t('orders.productDefault', {}, lang);
        const quantity = order.quantity ?? 1;
        const totalPrice = formatPrice(order.total_price ?? order.totalPrice ?? 0);
        return `${index + 1}. ${buyer} — ${productName} (${quantity} ${t('orders.pcs', {}, lang)}) — $${totalPrice}`;
      })
      .join('\n');

    const message = t('orders.bulkCompleteList', {
      count: activeOrders.length,
      list: ordersList,
    }, lang);

    await ctx.editMessageText(
      message,
      Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_scene')]])
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in markOrdersCompleted showPrompt:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMsgs } = getMessages(langErr);
    await ctx.editMessageText(generalMsgs.actionFailed(langErr));
    return await ctx.scene.leave();
  }
};

// ==========================================
// STEP 2: HANDLE INPUT AND SHOW CONFIRMATION
// ==========================================

const handleInput = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    // Handle cancel button
    if (ctx.callbackQuery?.data === 'cancel_scene') {
      await ctx.answerCbQuery();
      await ctx.editMessageText(sellerMessages.bulkComplete.cancelled(lang));
      return await ctx.scene.leave();
    }

    // Only accept text input
    if (!ctx.message?.text) {
      return; // Ignore non-text messages
    }

    // P1-BOT-007: Track user message ID for cleanup
    if (!ctx.wizard.state.userMessageIds) {
      ctx.wizard.state.userMessageIds = [];
    }
    ctx.wizard.state.userMessageIds.push(ctx.message.message_id);

    const userInput = ctx.message.text.trim();
    const activeOrders = ctx.wizard.state.activeOrders || [];

    if (activeOrders.length === 0) {
      await ctx.reply(t('seller.noActiveOrders', {}, lang));
      return await ctx.scene.leave();
    }

    // Parse order numbers
    const parseResult = parseOrderNumbers(userInput, activeOrders.length);

    if (!parseResult.valid) {
      await ctx.reply(
        `${sellerMessages.bulkComplete.invalidInput(lang)}\n\n${t('orders.error', {}, lang)}: ${parseResult.error}`,
        Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_scene')]])
      );
      return; // Stay in scene, let user try again
    }

    // Map parsed numbers to actual order IDs
    const selectedOrders = parseResult.numbers.map((num) => activeOrders[num - 1]);

    // Check if all orders exist
    const invalidIndexes = parseResult.numbers.filter((num) => num > activeOrders.length);
    if (invalidIndexes.length > 0) {
      await ctx.reply(
        sellerMessages.bulkComplete.invalidNumbers(invalidIndexes, lang),
        Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_scene')]])
      );
      return;
    }

    // Store selected orders for confirmation
    ctx.wizard.state.selectedOrders = selectedOrders;

    // Format confirmation message
    const ordersList = sellerMessages.bulkComplete.confirmList(selectedOrders, lang);
    const confirmMessage = t('orders.confirmBulkComplete', { count: selectedOrders.length }, lang) +
      '\n\n' + ordersList;

    // Show confirmation
    await ctx.reply(
      confirmMessage,
      Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.confirm', {}, lang), 'confirm_complete')],
        [Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_complete')],
      ])
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in markOrdersCompleted handleInput:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMsgs } = getMessages(langErr);
    await ctx.reply(generalMsgs.actionFailed(langErr));
    return await ctx.scene.leave();
  }
};

// ==========================================
// STEP 3: HANDLE CONFIRMATION
// ==========================================

const handleConfirmation = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages, general: generalMessages } = getMessages(lang);

    await ctx.answerCbQuery();

    const action = ctx.callbackQuery.data;

    // Cancel
    if (action === 'cancel_complete') {
      await ctx.editMessageText(sellerMessages.bulkComplete.cancelled(lang));
      return await ctx.scene.leave();
    }

    // Confirm
    if (action === 'confirm_complete') {
      const selectedOrders = ctx.wizard.state.selectedOrders || [];
      const token = ctx.session.token;

      if (selectedOrders.length === 0) {
        await ctx.editMessageText(t('seller.noOrdersSelected', {}, lang));
        return await ctx.scene.leave();
      }

      // Get order IDs
      const orderIds = selectedOrders.map((o) => o.id);

      // Update orders via API - use 'delivered' status (DB constraint valid)
      try {
        await orderApi.bulkUpdateOrderStatus(orderIds, 'delivered', token);

        logger.info('mark_orders_completed:success', {
          userId: ctx.from.id,
          orderIds,
          count: orderIds.length,
        });

        // Send notifications to buyers
        await sendBuyerNotifications(ctx, selectedOrders);

        // Show success message with navigation buttons
        await ctx.editMessageText(
          sellerMessages.bulkComplete.success(selectedOrders.length, lang),
          Markup.inlineKeyboard([
            [Markup.button.callback(t('buttons.activeOrders', {}, lang), 'seller:active_orders')],
            [Markup.button.callback(t('buttons.backToMenu', {}, lang), 'seller:menu')],
          ])
        );

        return await ctx.scene.leave();
      } catch (error) {
        logger.error('Error bulk updating orders:', error);
        const errorMsg = error.response?.data?.error || generalMessages.actionFailed(lang);
        await ctx.editMessageText(errorMsg);
        return await ctx.scene.leave();
      }
    }
  } catch (error) {
    logger.error('Error in markOrdersCompleted handleConfirmation:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    const { general: generalMsgs } = getMessages(langErr);
    await ctx.editMessageText(generalMsgs.actionFailed(langErr));
    return await ctx.scene.leave();
  }
};

// ==========================================
// HELPER: SEND BUYER NOTIFICATIONS
// ==========================================

async function sendBuyerNotifications(ctx, orders) {
  const bot = ctx.telegram;

  for (const order of orders) {
    try {
      if (!order.buyer_telegram_id) {
        logger.warn('mark_orders_completed:no_buyer_id', { orderId: order.id });
        continue;
      }

      // Get buyer's language preference (fallback to 'ru' if not set)
      const buyerLang = order.buyer_language || 'ru';
      const { t } = await import('../i18n/index.js');
      const message = t('orders.completeConfirmation', {
        orderId: order.id,
        productName: order.product_name,
        quantity: order.quantity,
        totalPrice: order.total_price,
        shopName: order.shop_name || ctx.session.shopName || t('ai.shopDefault', {}, buyerLang),
      }, buyerLang);

      await bot.sendMessage(order.buyer_telegram_id, message);

      logger.info('mark_orders_completed:buyer_notified', {
        orderId: order.id,
        buyerId: order.buyer_telegram_id,
      });
    } catch (error) {
      logger.error('Error sending buyer notification:', {
        orderId: order.id,
        buyerId: order.buyer_telegram_id,
        error: error.message,
      });
      // Continue with other notifications even if one fails
    }
  }
}

// ==========================================
// CREATE WIZARD SCENE
// ==========================================

const markOrdersCompletedScene = new Scenes.WizardScene(
  'markOrdersCompleted',
  showPrompt,
  handleInput,
  handleConfirmation
);

// Handle scene leave
markOrdersCompletedScene.leave(async (ctx) => {
  // P1-BOT-007: Delete user messages
  const userMsgIds = ctx.wizard?.state?.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (error) {
      logger.debug(`Could not delete user message ${msgId}:`, error.message);
    }
  }

  // P0 FIX: Use assignment instead of delete to prevent TypeError
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  // P0 FIX: REMOVED delete ctx.session.__scenes
  // Telegraf manages __scenes automatically. Deleting it here can cause
  // race condition when scene.leave() is followed by scene.enter()

  logger.info(`User ${ctx.from?.id} left markOrdersCompleted scene`);
});

// Handle cancel action within scene
markOrdersCompletedScene.action('cancel_scene', async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    await ctx.answerCbQuery();
    logger.info('mark_orders_completed:cancelled', { userId: ctx.from.id });

    await ctx.editMessageText(sellerMessages.bulkComplete.cancelled(lang));
    await ctx.scene.leave();
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      const lang = ctx.lang || ctx.session?.language || 'ru';
      const { general: generalMessages } = getMessages(lang);
      await ctx.editMessageText(generalMessages.actionFailed(lang));
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

// Also handle 'cancel' action (some buttons use this)
markOrdersCompletedScene.action('cancel', async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    await ctx.answerCbQuery();
    logger.info('mark_orders_completed:cancelled', { userId: ctx.from.id });

    await ctx.editMessageText(sellerMessages.bulkComplete.cancelled(lang));
    await ctx.scene.leave();
  } catch (error) {
    logger.error('Error in cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

export default markOrdersCompletedScene;
