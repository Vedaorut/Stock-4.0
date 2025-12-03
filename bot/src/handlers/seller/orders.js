import { Markup } from 'telegraf';
import { orderApi } from '../../utils/api.js';
import { messages, buttons as buttonText } from '../../texts/messages.js';
import logger from '../../utils/logger.js';

const { general: generalMessages } = messages;

const backToMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(buttonText.backToMenu, 'seller:menu')],
]);

const formatPrice = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '0';
  }
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
};

const ensureShopSession = (ctx) => {
  // PRIORITY: Use shopId (current shop), then workspaceShopId (for workers), then currentShopId (legacy)
  const shopId = ctx.session.shopId ?? ctx.session.workspaceShopId ?? ctx.session.currentShopId ?? null;

  // Sync currentShopId with shopId to prevent stale values
  if (shopId && ctx.session.currentShopId !== shopId) {
    ctx.session.currentShopId = shopId;
  }

  return shopId;
};

/**
 * Show active orders (status = confirmed)
 */
export const handleActiveOrders = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const shopId = ensureShopSession(ctx);
    const token = ctx.session.token;

    if (!shopId) {
      await ctx.reply(generalMessages.shopRequired, backToMenuKeyboard);
      return;
    }

    if (!token) {
      await ctx.reply(generalMessages.authorizationRequired, backToMenuKeyboard);
      return;
    }

    const result = await orderApi.getShopOrders(shopId, token, { status: 'confirmed' });

    // Parse response correctly - API returns { success, data, pagination }
    const activeOrders = result.success && Array.isArray(result.data) ? result.data : [];

    if (activeOrders.length === 0) {
      const message = `📦 Активные заказы

Нет активных заказов.

Заказы появятся здесь после оплаты покупателем.`;
      await ctx.reply(message, backToMenuKeyboard);
      logger.info(`User ${ctx.from.id} - no active orders for shop ${shopId}`);
      return;
    }

    const ordersList = activeOrders
      .map((order, index) => {
        const buyer = order.buyer_username
          ? `@${order.buyer_username}`
          : order.buyer_first_name || 'Покупатель';
        const productName = order.product_name || order.productName || 'Товар';
        const quantity = order.quantity ?? 1;
        const totalPrice = formatPrice(order.total_price ?? order.totalPrice ?? 0);
        return `${index + 1}. ${buyer} • ${productName} (${quantity} шт) • $${totalPrice}`;
      })
      .join('\n');

    const total = activeOrders.reduce((sum, order) => {
      const price = Number(order.total_price ?? order.totalPrice ?? 0);
      return sum + (Number.isFinite(price) ? price : 0);
    }, 0);

    const message = `📦 Активные заказы (${activeOrders.length})

Заказы, ожидающие отправки:

${ordersList}

Итого: $${formatPrice(total)}`;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('Отметить выдачу', 'seller:mark_shipped')],
      [Markup.button.callback('Обновить', 'seller:active_orders')],
      [Markup.button.callback(buttonText.backToMenu, 'seller:menu')],
    ]);

    await ctx.reply(message, buttons);

    logger.info(
      `User ${ctx.from.id} viewed ${activeOrders.length} active orders for shop ${shopId}`
    );
  } catch (error) {
    logger.error('Error in handleActiveOrders:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
      shopId: ctx.session?.currentShopId ?? ctx.session?.shopId,
      hasToken: !!ctx.session?.token,
      stack: error.stack,
    });

    // ✅ P1-3 FIX: No second answerCbQuery, just show error message
    const errorMsg = 'Не удалось загрузить активные заказы. Попробуйте позже.';
    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(errorMsg, backToMenuKeyboard);
      } else {
        await ctx.reply(errorMsg, backToMenuKeyboard);
      }
    } catch (editError) {
      // Fallback to reply if edit fails
      logger.warn('Failed to edit message, falling back to reply:', { error: editError.message });
      try {
        await ctx.reply(errorMsg, backToMenuKeyboard);
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }
};

/**
 * Create order history keyboard with pagination
 */
function createOrderHistoryKeyboard(page, totalPages) {
  const buttons = [];

  // Row 1: Navigation (only if multiple pages)
  if (totalPages > 1) {
    const navRow = [];
    if (page > 1) {
      navRow.push(Markup.button.callback('◀️ Назад', `seller:order_history:${page - 1}`));
    }
    navRow.push(Markup.button.callback(`Стр. ${page}/${totalPages}`, 'seller:order_history:jump'));
    if (page < totalPages) {
      navRow.push(Markup.button.callback('Вперед ▶️', `seller:order_history:${page + 1}`));
    }
    buttons.push(navRow);
  }

  // Row 2: Additional features (placeholders)
  buttons.push([
    Markup.button.callback('📊 Статистика', 'seller:order_stats'),
    Markup.button.callback('🔍 Поиск', 'seller:order_search'),
    Markup.button.callback('📥 Экспорт', 'seller:order_export'),
  ]);

  // Row 3: Utilities
  buttons.push([
    Markup.button.callback('Обновить', `seller:order_history:${page}`),
    Markup.button.callback(buttonText.backToMenu, 'seller:menu'),
  ]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Show delivered order history with pagination
 */
export const handleOrderHistory = async (ctx, page = 1) => {
  try {
    // Answer callback query if exists
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const PER_PAGE = 5;
    const shopId = ensureShopSession(ctx);
    const token = ctx.session.token;

    logger.debug('handleOrderHistory called:', {
      userId: ctx.from?.id,
      shopId,
      hasToken: !!token,
      sessionKeys: Object.keys(ctx.session || {}),
      page,
    });

    if (!shopId) {
      logger.warn('handleOrderHistory: No shopId in session', {
        userId: ctx.from?.id,
        session: {
          shopId: ctx.session?.shopId,
          workspaceShopId: ctx.session?.workspaceShopId,
          currentShopId: ctx.session?.currentShopId,
        },
      });
      await ctx.reply(generalMessages.shopRequired, backToMenuKeyboard);
      return;
    }

    if (!token) {
      await ctx.reply(generalMessages.authorizationRequired, backToMenuKeyboard);
      return;
    }

    // Fetch orders with pagination
    const result = await orderApi.getShopOrders(shopId, token, {
      status: 'confirmed,shipped,delivered',
      page: page,
      limit: PER_PAGE,
    });

    // Parse response correctly
    let deliveredOrders = [];
    let totalOrders = 0;
    let totalPages = 1;

    if (result.success && result.data) {
      // New format: { success, data: [...], pagination: { total, totalPages, ... } }
      deliveredOrders = result.data;
      totalOrders = result.pagination?.total || deliveredOrders.length;
      totalPages = result.pagination?.totalPages || Math.ceil(totalOrders / PER_PAGE);
    } else if (Array.isArray(result)) {
      // Legacy format: direct array
      deliveredOrders = result;
      totalOrders = deliveredOrders.length;
    } else if (result.data) {
      // Wrapped format: { data: [...] }
      deliveredOrders = Array.isArray(result.data) ? result.data : [];
      totalOrders = result.total || deliveredOrders.length;
      totalPages = Math.ceil(totalOrders / PER_PAGE);
    }

    if (!Array.isArray(deliveredOrders) || deliveredOrders.length === 0) {
      const emptyMessage = `📋 История заказов

Нет завершённых заказов.

Как только заказ будет выдан, он появится в истории.`;
      await ctx.reply(emptyMessage, backToMenuKeyboard);
      logger.info(`User ${ctx.from.id} - no delivered orders for shop ${shopId}`);
      return;
    }

    // Format order list with global numbering
    const startNum = (page - 1) * PER_PAGE + 1;
    const endNum = Math.min(startNum + deliveredOrders.length - 1, totalOrders);

    const ordersList = deliveredOrders
      .map((order, index) => {
        const globalNum = startNum + index;
        const buyer = order.buyer_username
          ? `@${order.buyer_username}`
          : order.buyer_first_name || 'Покупатель';
        const productName = order.product_name || order.productName || 'Товар';
        const quantity = order.quantity ?? 1;
        const totalPrice = formatPrice(order.total_price ?? order.totalPrice ?? 0);
        const deliveredAt =
          order.updated_at || order.delivered_at || order.completed_at || order.paid_at;
        const dateLabel = deliveredAt ? new Date(deliveredAt).toLocaleDateString('ru-RU') : '';
        return `${globalNum}. ${buyer} • ${productName} (${quantity} шт) • $${totalPrice} • ${dateLabel}`;
      })
      .join('\n');

    // Calculate revenue for current page
    const pageRevenue = deliveredOrders.reduce((sum, order) => {
      const price = Number(order.total_price ?? order.totalPrice ?? 0);
      return sum + (Number.isFinite(price) ? price : 0);
    }, 0);

    // Get total revenue (from meta or use page revenue as fallback)
    const totalRevenue = result.data?.totalRevenue || pageRevenue;

    const historyMessage = `📋 История заказов (${startNum}-${endNum} из ${totalOrders})

${ordersList}

Выручка на странице: $${formatPrice(pageRevenue)}
Общая выручка: $${formatPrice(totalRevenue)}`;

    const keyboard = createOrderHistoryKeyboard(page, totalPages);

    // Use edit for callback queries, reply for initial call
    if (ctx.callbackQuery) {
      await ctx.editMessageText(historyMessage, keyboard);
    } else {
      await ctx.reply(historyMessage, keyboard);
    }

    logger.info(
      `User ${ctx.from.id} viewed order history page ${page}/${totalPages} for shop ${shopId}`
    );
  } catch (error) {
    logger.error('Error in handleOrderHistory:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
      shopId: ctx.session?.currentShopId ?? ctx.session?.shopId,
      hasToken: !!ctx.session?.token,
      page,
      stack: error.stack,
    });

    // ✅ P1-3 FIX: No second answerCbQuery, just show error message
    const errorMsg = 'Не удалось загрузить историю заказов. Попробуйте позже.';
    try {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(errorMsg, backToMenuKeyboard);
      } else {
        await ctx.reply(errorMsg, backToMenuKeyboard);
      }
    } catch (editError) {
      // Fallback to reply if edit fails
      logger.warn('Failed to edit message, falling back to reply:', { error: editError.message });
      try {
        await ctx.reply(errorMsg, backToMenuKeyboard);
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  }
};

/**
 * Mark order as shipped
 * SECURITY FIX: Verify order belongs to user's shop via backend before update
 */
export const handleMarkShipped = async (ctx) => {
  try {
    const orderId = ctx.match[1];
    const token = ctx.session.token;

    if (!token) {
      await ctx.answerCbQuery('Требуется авторизация');
      return;
    }

    // SECURITY FIX: Verify order access via backend (checks owner/worker)
    try {
      await orderApi.getOrder(orderId, token);
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403 || status === 404) {
        await ctx.answerCbQuery('Заказ не найден или нет доступа');
        return;
      }
      throw error;
    }

    await orderApi.updateOrderStatus(orderId, 'shipped', token);

    await ctx.answerCbQuery('✅ Заказ отмечен как отправленный');

    // Update message with new status
    const newMessage = ctx.callbackQuery.message.text + '\n\n✅ Отправлено';
    await ctx.editMessageText(
      newMessage,
      Markup.inlineKeyboard([[Markup.button.callback('✓ Доставлено', `order:deliver:${orderId}`)]])
    );

    logger.info(`Order ${orderId} marked as shipped by user ${ctx.from.id}`);
  } catch (error) {
    logger.error('Error marking order as shipped:', error);
    await ctx.answerCbQuery('Не удалось обновить статус');
  }
};

/**
 * Mark order as delivered (complete)
 * SECURITY FIX: Verify order belongs to user's shop via backend before update
 */
export const handleMarkDelivered = async (ctx) => {
  try {
    const orderId = ctx.match[1];
    const token = ctx.session.token;

    if (!token) {
      await ctx.answerCbQuery('Требуется авторизация');
      return;
    }

    // SECURITY FIX: Verify order access via backend (checks owner/worker)
    try {
      await orderApi.getOrder(orderId, token);
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403 || status === 404) {
        await ctx.answerCbQuery('Заказ не найден или нет доступа');
        return;
      }
      throw error;
    }

    await orderApi.updateOrderStatus(orderId, 'delivered', token);

    await ctx.answerCbQuery('✅ Заказ завершён');

    // Final message - no more buttons
    const newMessage =
      ctx.callbackQuery.message.text.replace('\n\n✅ Отправлено', '') + '\n\n✅ Доставлено';
    await ctx.editMessageText(newMessage);

    logger.info(`Order ${orderId} marked as delivered by user ${ctx.from.id}`);
  } catch (error) {
    logger.error('Error marking order as delivered:', error);
    await ctx.answerCbQuery('Не удалось обновить статус');
  }
};

/**
 * Cancel order
 * SECURITY FIX: Verify order belongs to user's shop via backend before update
 */
export const handleCancelOrder = async (ctx) => {
  try {
    const orderId = ctx.match[1];
    const token = ctx.session.token;

    if (!token) {
      await ctx.answerCbQuery('Требуется авторизация');
      return;
    }

    // SECURITY FIX: Verify order access via backend (checks owner/worker)
    try {
      await orderApi.getOrder(orderId, token);
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403 || status === 404) {
        await ctx.answerCbQuery('Заказ не найден или нет доступа');
        return;
      }
      throw error;
    }

    await orderApi.updateOrderStatus(orderId, 'cancelled', token);

    await ctx.answerCbQuery('❌ Заказ отменён');

    const newMessage = ctx.callbackQuery.message.text + '\n\n❌ Отменён';
    await ctx.editMessageText(newMessage);

    logger.info(`Order ${orderId} cancelled by user ${ctx.from.id}`);
  } catch (error) {
    logger.error('Error cancelling order:', error);
    await ctx.answerCbQuery('Не удалось отменить заказ');
  }
};

/**
 * Handle order history pagination
 */
export const handleOrderHistoryPage = async (ctx) => {
  try {
    const MAX_PAGE = 1000; // M19 FIX: Upper limit to prevent DoS
    const page = parseInt(ctx.match[1], 10);

    // Validate page number (M19 FIX: added upper limit)
    if (!page || page < 1 || page > MAX_PAGE) {
      await ctx.answerCbQuery('❌ Некорректная страница');
      return;
    }

    // Debounce check (1 second)
    const now = Date.now();
    const lastClick = ctx.session.lastHistoryClick || 0;
    if (now - lastClick < 1000) {
      await ctx.answerCbQuery('⏱️ Пожалуйста, подождите');
      return;
    }
    ctx.session.lastHistoryClick = now;

    // Auto-cleanup after 60 seconds (TTL for debounce state)
    setTimeout(() => {
      if (ctx.session?.lastHistoryClick === now) {
        delete ctx.session.lastHistoryClick;
      }
    }, 60000);

    await ctx.answerCbQuery(); // Remove spinner

    // Reuse main handler
    return handleOrderHistory(ctx, page);
  } catch (error) {
    logger.error('Error in handleOrderHistoryPage:', error);
    await ctx.answerCbQuery('❌ Ошибка загрузки страницы');
  }
};

/**
 * Handle order statistics (placeholder)
 */
export const handleOrderStats = async (ctx) => {
  await ctx.answerCbQuery('📊 Статистика заказов в разработке');
};

/**
 * Handle order search (placeholder)
 */
export const handleOrderSearch = async (ctx) => {
  await ctx.answerCbQuery('🔍 Поиск по заказам в разработке');
};

/**
 * Handle order export (placeholder)
 */
export const handleOrderExport = async (ctx) => {
  await ctx.answerCbQuery('📥 Экспорт истории в разработке');
};

/**
 * Handle jump to page (placeholder)
 */
export const handleOrderHistoryJump = async (ctx) => {
  await ctx.answerCbQuery('🔢 Переход на страницу в разработке');
};
