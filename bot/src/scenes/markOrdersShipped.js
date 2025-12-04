import { Scenes, Markup } from 'telegraf';
import { orderApi } from '../utils/api.js';
import { parseOrderNumbers } from '../utils/orderParser.js';
import logger from '../utils/logger.js';
import { getMessages } from '../texts/messages.js';
import { t } from '../i18n/index.js';

/**
 * Mark Orders Shipped Scene - Bulk management of order shipments
 *
 * Flow:
 * 1. Show prompt for order numbers
 * 2. Parse and validate input
 * 3. Show confirmation with order details
 * 4. Update orders and send notifications to buyers
 */

// ==========================================
// STEP 1: SHOW PROMPT
// ==========================================

const showPrompt = async (ctx) => {
  try {
    logger.info('mark_orders_shipped:step:prompt', { userId: ctx.from.id });

    const lang = ctx.lang || ctx.session?.user?.language || 'ru';
    const { general: generalMessages } = getMessages(lang);

    // Validate session
    if (!ctx.session.shopId || !ctx.session.token) {
      await ctx.editMessageText(generalMessages.authorizationRequired);
      return await ctx.scene.leave();
    }

    // Get active orders to show count
    const result = await orderApi.getShopOrders(ctx.session.shopId, ctx.session.token, {
      status: 'confirmed',
    });
    // Parse response correctly - API returns { success, data, pagination }
    const orders = result.success && Array.isArray(result.data) ? result.data : [];
    const activeOrders = orders.filter((order) =>
      ['confirmed', 'processing'].includes(order.status)
    );

    if (activeOrders.length === 0) {
      await ctx.editMessageText(
        ctx.t('seller.noActiveOrders'),
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
          : order.buyer_first_name || ctx.t('orders.buyerDefault');
        const productName = order.product_name || order.productName || ctx.t('orders.productDefault');
        const quantity = order.quantity ?? 1;
        const totalPrice = formatPrice(order.total_price ?? order.totalPrice ?? 0);
        return `${index + 1}. ${buyer} — ${productName} (${quantity} ${ctx.t('orders.pcs')}) — $${totalPrice}`;
      })
      .join('\n');

    const message = ctx.t('orders.bulkShipList', {
      count: activeOrders.length,
      list: ordersList,
    });

    await ctx.editMessageText(
      message,
      Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_scene')]])
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in markOrdersShipped showPrompt:', error);
    const langErr = ctx.lang || ctx.session?.user?.language || 'ru';
    const { general: generalMsgs } = getMessages(langErr);
    await ctx.editMessageText(generalMsgs.actionFailed);
    return await ctx.scene.leave();
  }
};

// ==========================================
// STEP 2: HANDLE INPUT AND SHOW CONFIRMATION
// ==========================================

const handleInput = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.user?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    // Handle cancel button
    if (ctx.callbackQuery?.data === 'cancel_scene') {
      await ctx.answerCbQuery();
      await ctx.editMessageText(sellerMessages.bulkShip.cancelled);
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
      await ctx.reply(ctx.t('seller.noActiveOrders'));
      return await ctx.scene.leave();
    }

    // Parse order numbers
    const parseResult = parseOrderNumbers(userInput, activeOrders.length);

    if (!parseResult.valid) {
      await ctx.reply(
        `${sellerMessages.bulkShip.invalidInput}\n\n${ctx.t('orders.error')}: ${parseResult.error}`,
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
        sellerMessages.bulkShip.invalidNumbers(invalidIndexes, lang),
        Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_scene')]])
      );
      return;
    }

    // Store selected orders for confirmation
    ctx.wizard.state.selectedOrders = selectedOrders;

    // Format confirmation message
    const ordersList = sellerMessages.bulkShip.confirmList(selectedOrders, lang);
    const confirmMessage = ctx.t('orders.confirmBulkShip', { count: selectedOrders.length }) +
      '\n\n' + ordersList;

    // Show confirmation
    await ctx.reply(
      confirmMessage,
      Markup.inlineKeyboard([
        [Markup.button.callback(t('buttons.confirm', {}, lang), 'confirm_ship')],
        [Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_ship')],
      ])
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in markOrdersShipped handleInput:', error);
    const langErr = ctx.lang || ctx.session?.user?.language || 'ru';
    const { general: generalMsgs } = getMessages(langErr);
    await ctx.reply(generalMsgs.actionFailed);
    return await ctx.scene.leave();
  }
};

// ==========================================
// STEP 3: HANDLE CONFIRMATION
// ==========================================

const handleConfirmation = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.user?.language || 'ru';
    const { seller: sellerMessages, general: generalMessages } = getMessages(lang);

    await ctx.answerCbQuery();

    const action = ctx.callbackQuery.data;

    // Cancel
    if (action === 'cancel_ship') {
      await ctx.editMessageText(sellerMessages.bulkShip.cancelled);
      return await ctx.scene.leave();
    }

    // Confirm
    if (action === 'confirm_ship') {
      const selectedOrders = ctx.wizard.state.selectedOrders || [];
      const token = ctx.session.token;

      if (selectedOrders.length === 0) {
        await ctx.editMessageText(ctx.t('seller.noOrdersSelected'));
        return await ctx.scene.leave();
      }

      // Get order IDs
      const orderIds = selectedOrders.map((o) => o.id);

      // Update orders via API
      try {
        await orderApi.bulkUpdateOrderStatus(orderIds, 'shipped', token);

        logger.info('mark_orders_shipped:success', {
          userId: ctx.from.id,
          orderIds,
          count: orderIds.length,
        });

        // Send notifications to buyers
        await sendBuyerNotifications(ctx, selectedOrders);

        // Show success message with navigation buttons
        await ctx.editMessageText(
          sellerMessages.bulkShip.success(selectedOrders.length, lang),
          Markup.inlineKeyboard([
            [Markup.button.callback(ctx.t('buttons.activeOrders'), 'seller:active_orders')],
            [Markup.button.callback(ctx.t('buttons.backToMenu'), 'seller:menu')],
          ])
        );

        return await ctx.scene.leave();
      } catch (error) {
        logger.error('Error bulk updating orders:', error);
        const errorMsg = error.response?.data?.error || generalMessages.actionFailed;
        await ctx.editMessageText(errorMsg);
        return await ctx.scene.leave();
      }
    }
  } catch (error) {
    logger.error('Error in markOrdersShipped handleConfirmation:', error);
    const langErr = ctx.lang || ctx.session?.user?.language || 'ru';
    const { general: generalMsgs } = getMessages(langErr);
    await ctx.editMessageText(generalMsgs.actionFailed);
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
        logger.warn('mark_orders_shipped:no_buyer_id', { orderId: order.id });
        continue;
      }

      // Get buyer's language preference (fallback to 'ru' if not set)
      const buyerLang = order.buyer_language || 'ru';
      const { t } = await import('../i18n/index.js');
      const message = t('orders.shipConfirmation', {
        orderId: order.id,
        productName: order.product_name,
        quantity: order.quantity,
        totalPrice: order.total_price,
        shopName: order.shop_name || ctx.session.shopName || t('ai.shopDefault', {}, buyerLang),
      }, buyerLang);

      await bot.sendMessage(order.buyer_telegram_id, message);

      logger.info('mark_orders_shipped:buyer_notified', {
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

const markOrdersShippedScene = new Scenes.WizardScene(
  'markOrdersShipped',
  showPrompt,
  handleInput,
  handleConfirmation
);

// Handle scene leave
markOrdersShippedScene.leave(async (ctx) => {
  // P1-BOT-007: Delete user messages
  const userMsgIds = ctx.wizard?.state?.userMessageIds || [];
  for (const msgId of userMsgIds) {
    try {
      await ctx.deleteMessage(msgId);
    } catch (error) {
      logger.debug(`Could not delete user message ${msgId}:`, error.message);
    }
  }

  // P1-2 FIX: Clear wizard state to prevent memory leak
  if (ctx.wizard) {
    delete ctx.wizard.state;
  }
  ctx.scene.state = {};

  // Clear __scenes from Redis session to prevent scene sticking
  if (ctx.session && ctx.session.__scenes) {
    delete ctx.session.__scenes;
  }

  logger.info(`User ${ctx.from?.id} left markOrdersShipped scene`);
});

// Handle cancel action within scene
markOrdersShippedScene.action('cancel_scene', async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.user?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    await ctx.answerCbQuery();
    logger.info('mark_orders_shipped:cancelled', { userId: ctx.from.id });

    await ctx.editMessageText(sellerMessages.bulkShip.cancelled);
    await ctx.scene.leave();
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      const lang = ctx.lang || ctx.session?.user?.language || 'ru';
      const { general: generalMessages } = getMessages(lang);
      await ctx.editMessageText(generalMessages.actionFailed);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

// Also handle 'cancel' action (some buttons use this)
markOrdersShippedScene.action('cancel', async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.user?.language || 'ru';
    const { seller: sellerMessages } = getMessages(lang);

    await ctx.answerCbQuery();
    logger.info('mark_orders_shipped:cancelled', { userId: ctx.from.id });

    await ctx.editMessageText(sellerMessages.bulkShip.cancelled);
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

export default markOrdersShippedScene;
