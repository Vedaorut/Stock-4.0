import { Markup } from 'telegraf';
import { sellerMenu, sellerMenuNoShop, sellerToolsMenu, productsMenu, subscriptionStatusMenu } from '../../keyboards/seller.js';
import { manageWorkersMenu } from '../../keyboards/workspace.js';
import { shopApi, authApi, productApi, orderApi, workerApi } from '../../utils/api.js';
import { formatProductsList, formatSalesList } from '../../utils/minimalist.js';
import logger from '../../utils/logger.js';
const editOrReply = async (ctx, text, markup, extra = {}) => {
  const options = { ...extra };

  if (markup) {
    if (markup.reply_markup) {
      options.reply_markup = markup.reply_markup;
    } else {
      Object.assign(options, markup);
    }
  }

  try {
    const edited = await ctx.editMessageText(text, options);
    return edited;
  } catch (error) {
    const description = error?.response?.description || '';

    if (description.includes('message is not modified')) {
      return null;
    }

    logger.warn('edit_message_fallback', {
      userId: ctx.from?.id,
      description
    });

    const sent = await ctx.reply(text, options);
    return sent;
  }
};

// Export follows handlers
export * from './follows.js';

/**
 * Handle seller role selection
 */
export const handleSellerRole = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    ctx.session.role = 'seller';
    logger.info(`User ${ctx.from.id} selected seller role`);

    // Save role to database
    try {
      if (ctx.session.token) {
        await authApi.updateRole('seller', ctx.session.token);
        if (ctx.session.user) {
          ctx.session.user.selectedRole = 'seller'; // Update session cache
        }
        logger.info(`Saved seller role for user ${ctx.from.id}`);
      }
    } catch (error) {
      logger.error('Failed to save role:', error);
    }

    // Check if user has a shop
    try {
      // БАГ #9: Check if token exists
    if (!ctx.session.token) {
      logger.warn(`User ${ctx.from.id} has no token, cannot check shop`);
      ctx.session.shopId = null;
      ctx.session.shopName = null;
      await editOrReply(ctx, 'Создать магазин - $25', sellerMenuNoShop);
      return;
      }

      // Backend returns array, get first shop
      const shops = await shopApi.getMyShop(ctx.session.token);

      logger.debug('Fetched user shops:', {
        userId: ctx.from.id,
        isArray: Array.isArray(shops),
        shopsCount: Array.isArray(shops) ? shops.length : 'not array',
        shops: shops
      });

      if (shops && Array.isArray(shops) && shops.length > 0) {
        const shop = shops[0];  // Get first shop
        ctx.session.shopId = shop.id;
        ctx.session.shopName = shop.name;

        logger.info('User shop loaded:', {
          userId: ctx.from.id,
          shopId: shop.id,
          shopName: shop.name,
          savedToSession: ctx.session.shopId === shop.id
        });

        await editOrReply(ctx, `Мой магазин: ${shop.name}\n\n`, sellerMenu(shop.name));
      } else {
        logger.info(`User ${ctx.from.id} has no shops, showing create shop menu`);
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await editOrReply(ctx, 'Создать магазин — $25', sellerMenuNoShop);
      }
    } catch (error) {
      logger.error('Error checking shop:', error);
      // БАГ #5: Better error handling
      if (error.response?.status === 404 || error.response?.status === 401) {
        // No shop found or auth failed
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await editOrReply(ctx, 'Создать магазин - $25', sellerMenuNoShop);
      } else {
        // Real error (network, server)
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await editOrReply(ctx, 'Ошибка загрузки', sellerMenuNoShop);
      }
    }
  } catch (error) {
    logger.error('Error in seller role handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await editOrReply(ctx, 'Произошла ошибка\n\nПопробуйте позже', sellerMenuNoShop);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle create shop action
 */
const handleCreateShop = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Enter createShop scene
    await ctx.scene.enter('createShop');
  } catch (error) {
    logger.error('Error entering createShop scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await editOrReply(ctx, 'Произошла ошибка\n\nПопробуйте позже', sellerMenuNoShop);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle add product action
 */
const handleAddProduct = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    // Enter addProduct scene
    await ctx.scene.enter('addProduct');
  } catch (error) {
    logger.error('Error entering addProduct scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const shopName = ctx.session.shopName || 'Магазин';
      await editOrReply(ctx, 'Произошла ошибка\n\nПопробуйте позже', sellerMenu(shopName));
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle view sales
 */
const handleSales = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    // Check authentication
    if (!ctx.session.token) {
      const shopName = ctx.session.shopName || 'Магазин';
      await editOrReply(ctx, 'Необходима авторизация. Перезапустите бота командой /start', sellerMenu(shopName));
      return;
    }

    // Get shop orders (sales)
    const orders = await orderApi.getShopOrders(ctx.session.shopId, ctx.session.token);
    const shopName = ctx.session.shopName || 'Магазин';

    // Use minimalist formatter (9 lines → 4 lines)
    const message = formatSalesList(orders, shopName);

    await editOrReply(ctx, message, sellerMenu(shopName));
    logger.info(`User ${ctx.from.id} viewed sales (${orders.length} total)`);
  } catch (error) {
    logger.error('Error fetching sales:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, 'Ошибка загрузки', sellerMenu(shopName));
  }
};

/**
 * Handle manage wallets action
 */
const handleWallets = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    // Enter manageWallets scene
    await ctx.scene.enter('manageWallets');
  } catch (error) {
    logger.error('Error entering manageWallets scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const shopName = ctx.session.shopName || 'Магазин';
      await editOrReply(ctx, 'Произошла ошибка\n\nПопробуйте позже', sellerMenu(shopName));
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Setup seller-related handlers
 */
export const setupSellerHandlers = (bot) => {
  // Seller role selected
  bot.action('role:seller', handleSellerRole);

  // Create shop action
  bot.action('seller:create_shop', handleCreateShop);

  // Add product action
  bot.action('seller:add_product', handleAddProduct);

  // View sales
  bot.action('seller:sales', handleSales);

  // Manage wallets
  bot.action('seller:wallets', handleWallets);

  // Workers management
  bot.action('seller:workers', handleWorkers);
  bot.action('workers:add', handleWorkersAdd);
  bot.action('workers:list', handleWorkersList);
  bot.action(/^workers:remove:(\d+)$/, handleWorkerRemove);
  bot.action(/^workers:remove:confirm:(\d+)$/, handleWorkerRemoveConfirm);

  // Channel migration (PRO feature)
  bot.action('seller:migrate_channel', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.scene.enter('migrate_channel');
    } catch (error) {
      logger.error('Error entering migrate_channel scene:', error);
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    }
  });

  // Subscription management
  bot.action('subscription:pay', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.scene.enter('pay_subscription');
    } catch (error) {
      logger.error('Error entering pay_subscription scene:', error);
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    }
  });

  bot.action('subscription:upgrade', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await ctx.scene.enter('upgrade_shop');
    } catch (error) {
      logger.error('Error entering upgrade_shop scene:', error);
      await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
    }
  });

  bot.action('subscription:status', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId) {
        await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
        return;
      }

      if (!ctx.session.token) {
        await editOrReply(
          ctx,
          'Необходима авторизация. Перезапустите бота командой /start',
          sellerMenu(ctx.session.shopName || 'Магазин')
        );
        return;
      }

      // Get subscription status from backend
      const api = await import('../../utils/api.js');
      const response = await api.default.get(
        `/subscriptions/status/${ctx.session.shopId}`,
        { headers: { Authorization: `Bearer ${ctx.session.token}` } }
      );

      // FIX BUG #2: Backend returns flat object, NOT { subscription, shop }
      const status = response.data;

      let message = `📊 <b>Статус подписки</b>\n\n`;
      // Use shop name from session (already available)
      const shopName = ctx.session.shopName || 'Магазин';
      message += `🏪 Магазин: ${shopName}\n\n`;

      // FIX BUG #2: Use status object from backend response
      if (status.currentSubscription) {
        const tier = status.tier === 'pro' ? 'PRO 💎' : 'BASIC';
        const statusEmoji = status.status === 'active' ? '✅' :
                            status.status === 'grace_period' ? '⚠️' : '❌';

        message += `📌 <b>Тариф:</b> ${tier}\n`;
        message += `${statusEmoji} <b>Статус:</b> ${status.status}\n`;

        if (status.nextPaymentDue) {
          message += `📅 <b>Действует до:</b> ${new Date(status.nextPaymentDue).toLocaleDateString('ru-RU')}\n\n`;
        }

        if (status.status === 'grace_period') {
          message += `⚠️ <b>Льготный период</b>\n`;
          message += `Магазин будет деактивирован после окончания периода.\n\n`;
        }

        if (status.tier === 'basic') {
          message += `💎 <b>Апгрейд на PRO:</b>\n`;
          message += `• Безлимитные подписчики\n`;
          message += `• Рассылка при смене канала (2/мес)\n`;
          message += `• Приоритетная поддержка\n`;
        } else {
          message += `✨ <b>PRO функции активны:</b>\n`;
          message += `• ♾ Безлимитные подписчики\n`;
          message += `• 📢 Рассылка при смене канала\n`;
          message += `• ⭐️ Приоритетная поддержка\n`;
        }
      } else {
        message += `❌ <b>Нет активной подписки</b>\n\n`;
        message += `Оплатите подписку для активации магазина.\n\n`;
        message += `<b>Тарифы (ежемесячно):</b>\n`;
        message += `• BASIC - $25/мес (до 4 товаров)\n`;
        message += `• PRO 💎 - $35/мес\n`;
      }

      const canUpgrade = status.tier === 'basic' && status.status === 'active';
      await editOrReply(
        ctx,
        message,
        subscriptionStatusMenu(status.tier || 'basic', canUpgrade),
        { parse_mode: 'HTML' }
      );

      logger.info(`User ${ctx.from.id} viewed subscription status`);
    } catch (error) {
      logger.error('Error fetching subscription status:', error);
      await editOrReply(
        ctx,
        '❌ Ошибка загрузки статуса подписки',
        sellerMenu(ctx.session.shopName || 'Магазин')
      );
    }
  });

  // Tools Submenu - advanced features (Wallets, Follows, Workers)
  bot.action('seller:tools', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId || !ctx.session.token) {
        await editOrReply(
          ctx,
          'Необходима авторизация. Перезапустите бота командой /start',
          sellerMenu(ctx.session.shopName || 'Магазин')
        );
        return;
      }

      // Check if user is shop owner
      const shopResponse = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
      const isOwner = shopResponse.owner_id === ctx.from.id;

      await editOrReply(
        ctx,
        '🔧 <b>Инструменты магазина</b>\n\nДополнительные функции для управления вашим магазином:',
        sellerToolsMenu(isOwner),
        { parse_mode: 'HTML' }
      );

      logger.info(`User ${ctx.from.id} opened tools submenu`);
    } catch (error) {
      logger.error('Error in tools submenu handler:', error);
      await editOrReply(
        ctx,
        '❌ Ошибка загрузки инструментов',
        sellerMenu(ctx.session.shopName || 'Магазин')
      );
    }
  });

  // Subscription Hub - unified entry point for all subscription actions
  bot.action('subscription:hub', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId) {
        await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
        return;
      }

      if (!ctx.session.token) {
        await editOrReply(
          ctx,
          'Необходима авторизация. Перезапустите бота командой /start',
          sellerMenu(ctx.session.shopName || 'Магазин')
        );
        return;
      }

      // Get subscription status from backend
      const api = await import('../../utils/api.js');
      const response = await api.default.get(
        `/subscriptions/status/${ctx.session.shopId}`,
        { headers: { Authorization: `Bearer ${ctx.session.token}` } }
      );

      // FIX BUG #1: Backend returns FLAT object without 'shop' field
      const subscriptionData = response.data;
      const shopName = ctx.session.shopName || 'Магазин';

      // Build message with subscription status
      let message = `📊 <b>Подписка магазина</b>\n\n`;
      message += `🏪 <b>${shopName}</b>\n\n`;

      const buttons = [];

      if (subscriptionData.currentSubscription) {
        const tier = subscriptionData.tier === 'pro' ? 'PRO 💎' : 'BASIC';
        const statusEmoji = subscriptionData.status === 'active' ? '✅' :
                            subscriptionData.status === 'grace_period' ? '⚠️' : '❌';

        message += `📌 <b>Тариф:</b> ${tier}\n`;
        message += `${statusEmoji} <b>Статус:</b> ${subscriptionData.status}\n`;
        message += `📅 <b>Действует до:</b> ${new Date(subscriptionData.nextPaymentDue || subscriptionData.periodEnd).toLocaleDateString('ru-RU')}\n\n`;

        // Show appropriate action buttons based on status
        if (subscriptionData.status === 'inactive' || subscriptionData.status === 'grace_period') {
          message += `⚠️ <b>Требуется оплата</b>\n`;
          message += `Оплатите подписку для продления активации магазина.\n\n`;
          buttons.push([Markup.button.callback('💳 Оплатить подписку', 'subscription:pay')]);
        }

        if (subscriptionData.tier === 'basic' && subscriptionData.status === 'active') {
          message += `💎 <b>Доступен апгрейд на PRO:</b>\n`;
          message += `• Безлимитные подписчики\n`;
          message += `• Рассылка при смене канала (2/мес)\n`;
          message += `• Приоритетная поддержка\n\n`;
          buttons.push([Markup.button.callback('💎 Апгрейд на PRO ($35)', 'subscription:upgrade')]);
        }

        if (subscriptionData.tier === 'pro') {
          message += `✨ <b>PRO функции активны:</b>\n`;
          message += `• ♾ Безлимитные подписчики\n`;
          message += `• 📢 Рассылка при смене канала\n`;
          message += `• ⭐️ Приоритетная поддержка\n\n`;
          buttons.push([Markup.button.callback('🔄 Миграция канала', 'seller:migrate_channel')]);
        }
      } else {
        message += `❌ <b>Нет активной подписки</b>\n\n`;
        message += `Оплатите подписку для активации магазина.\n\n`;
        message += `<b>Тарифы (ежемесячно):</b>\n`;
        message += `• BASIC - $25/мес (до 4 товаров)\n`;
        message += `• PRO 💎 - $35/мес\n`;
        buttons.push([Markup.button.callback('💳 Оплатить подписку', 'subscription:pay')]);
      }

      // Add back button
      buttons.push([Markup.button.callback('◀️ Назад', 'seller:main')]);

      await editOrReply(
        ctx,
        message,
        Markup.inlineKeyboard(buttons),
        { parse_mode: 'HTML' }
      );

      logger.info(`User ${ctx.from.id} opened subscription hub`);
    } catch (error) {
      logger.error('Error in subscription hub handler:', error);
      await editOrReply(
        ctx,
        '❌ Ошибка загрузки подписки',
        sellerMenu(ctx.session.shopName || 'Магазин')
      );
    }
  });

  // Back to seller menu
  bot.action('seller:main', handleSellerRole);
};

/**
 * Handle workers management menu
 */
const handleWorkers = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, `Работники магазина: ${shopName}`, manageWorkersMenu(shopName));

    logger.info(`User ${ctx.from.id} opened workers management`);
  } catch (error) {
    logger.error('Error in workers menu handler:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, 'Ошибка загрузки', sellerMenu(shopName));
  }
};

/**
 * Handle add worker action
 */
const handleWorkersAdd = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    // Enter manageWorkers scene
    await ctx.scene.enter('manageWorkers');
  } catch (error) {
    logger.error('Error entering manageWorkers scene:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, 'Произошла ошибка\n\nПопробуйте позже', manageWorkersMenu(shopName));
  }
};

/**
 * Handle list workers action
 */
const handleWorkersList = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await editOrReply(ctx, 'Сначала создайте магазин', sellerMenuNoShop);
      return;
    }

    if (!ctx.session.token) {
      const shopName = ctx.session.shopName || 'Магазин';
      await editOrReply(
        ctx,
        'Необходима авторизация. Перезапустите бота командой /start',
        manageWorkersMenu(shopName)
      );
      return;
    }

    // Get workers list
    const workers = await workerApi.listWorkers(ctx.session.shopId, ctx.session.token);
    const shopName = ctx.session.shopName || 'Магазин';

    if (workers.length === 0) {
      await editOrReply(
        ctx,
        `Работники магазина: ${shopName}\n\nПока нет работников`,
        manageWorkersMenu(shopName)
      );
      return;
    }

    // Format workers list
    const workersList = workers.map((w, index) => {
      const name = w.username ? `@${w.username}` : w.first_name || `ID:${w.telegram_id}`;
      return `${index + 1}. ${name} (ID: ${w.telegram_id})`;
    }).join('\n');

    await editOrReply(
      ctx,
      `Работники магазина: ${shopName}\n\n${workersList}`,
      manageWorkersMenu(shopName)
    );

    logger.info(`User ${ctx.from.id} viewed workers list (${workers.length} total)`);
  } catch (error) {
    logger.error('Error fetching workers:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await editOrReply(ctx, 'Ошибка загрузки', manageWorkersMenu(shopName));
  }
};

/**
 * Handle remove worker action
 */
const handleWorkerRemove = async (ctx) => {
  try {
    await ctx.answerCbQuery('Функция в разработке');
    // TODO: Implement worker removal with confirmation
  } catch (error) {
    logger.error('Error in worker remove handler:', error);
  }
};

/**
 * Handle confirm worker removal
 */
const handleWorkerRemoveConfirm = async (ctx) => {
  try {
    await ctx.answerCbQuery('Функция в разработке');
    // TODO: Implement worker removal confirmation
  } catch (error) {
    logger.error('Error in worker remove confirm handler:', error);
  }
};
