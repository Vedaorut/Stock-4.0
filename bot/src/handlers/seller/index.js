import { Markup } from 'telegraf';
import { sellerMenu, sellerMenuNoShop, sellerToolsMenu, productsMenu, subscriptionStatusMenu } from '../../keyboards/seller.js';
import { manageWorkersMenu } from '../../keyboards/workspace.js';
import { shopApi, authApi, productApi, orderApi, workerApi } from '../../utils/api.js';
import { formatPrice, formatOrderStatus } from '../../utils/format.js';
import { formatProductsList, formatSalesList } from '../../utils/minimalist.js';
import logger from '../../utils/logger.js';
import * as smartMessage from '../../utils/smartMessage.js';

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
      await smartMessage.send(ctx, {
        text: 'Создать магазин - $25',
        keyboard: sellerMenuNoShop
      });
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

        await smartMessage.send(ctx, {
          text: `Мой магазин: ${shop.name}\n\n`,
          keyboard: sellerMenu(shop.name)
        });
      } else {
        logger.info(`User ${ctx.from.id} has no shops, showing create shop menu`);
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await smartMessage.send(ctx, {
          text: 'Создать магазин — $25',
          keyboard: sellerMenuNoShop
        });
      }
    } catch (error) {
      logger.error('Error checking shop:', error);
      // БАГ #5: Better error handling
      if (error.response?.status === 404 || error.response?.status === 401) {
        // No shop found or auth failed
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await smartMessage.send(ctx, {
          text: 'Создать магазин - $25',
          keyboard: sellerMenuNoShop
        });
      } else {
        // Real error (network, server)
        ctx.session.shopId = null;
        ctx.session.shopName = null;
        await smartMessage.send(ctx, {
          text: 'Ошибка загрузки',
          keyboard: sellerMenuNoShop
        });
      }
    }
  } catch (error) {
    logger.error('Error in seller role handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await smartMessage.send(ctx, {
        text: 'Произошла ошибка\n\nПопробуйте позже',
        keyboard: sellerMenuNoShop
      });
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
      await smartMessage.send(ctx, {
        text: 'Произошла ошибка\n\nПопробуйте позже',
        keyboard: sellerMenuNoShop
      });
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
      await smartMessage.send(ctx, {
        text: 'Сначала создайте магазин',
        keyboard: sellerMenuNoShop
      });
      return;
    }

    // Enter addProduct scene
    await ctx.scene.enter('addProduct');
  } catch (error) {
    logger.error('Error entering addProduct scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const shopName = ctx.session.shopName || 'Магазин';
      await smartMessage.send(ctx, {
        text: 'Произошла ошибка\n\nПопробуйте позже',
        keyboard: sellerMenu(shopName)
      });
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
};

/**
 * Handle view products
 */
const handleProducts = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Check if user has shop
    if (!ctx.session.shopId) {
      await smartMessage.send(ctx, {
        text: 'Сначала создайте магазин',
        keyboard: sellerMenuNoShop
      });
      return;
    }

    // Check authentication (MEDIUM severity fix - add token check)
    if (!ctx.session.token) {
      const shopName = ctx.session.shopName || 'Магазин';
      await smartMessage.send(ctx, {
        text: 'Необходима авторизация. Перезапустите бота командой /start',
        keyboard: productsMenu(shopName)
      });
      return;
    }

    // Get shop products
    const products = await productApi.getShopProducts(ctx.session.shopId);
    const shopName = ctx.session.shopName || 'Магазин';

    // Use minimalist formatter (8 lines → 3 lines)
    const message = formatProductsList(products, shopName);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: productsMenu(shopName)
    });
    logger.info(`User ${ctx.from.id} viewed products (${products.length} total)`);
  } catch (error) {
    logger.error('Error fetching products:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await smartMessage.send(ctx, {
      text: 'Ошибка загрузки',
      keyboard: productsMenu(shopName)
    });
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
      await smartMessage.send(ctx, {
        text: 'Сначала создайте магазин',
        keyboard: sellerMenuNoShop
      });
      return;
    }

    // Check authentication
    if (!ctx.session.token) {
      const shopName = ctx.session.shopName || 'Магазин';
      await smartMessage.send(ctx, {
        text: 'Необходима авторизация. Перезапустите бота командой /start',
        keyboard: sellerMenu(shopName)
      });
      return;
    }

    // Get shop orders (sales)
    const orders = await orderApi.getShopOrders(ctx.session.shopId, ctx.session.token);
    const shopName = ctx.session.shopName || 'Магазин';

    // Use minimalist formatter (9 lines → 4 lines)
    const message = formatSalesList(orders, shopName);

    await smartMessage.send(ctx, {
      text: message,
      keyboard: sellerMenu(shopName)
    });
    logger.info(`User ${ctx.from.id} viewed sales (${orders.length} total)`);
  } catch (error) {
    logger.error('Error fetching sales:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await smartMessage.send(ctx, {
      text: 'Ошибка загрузки',
      keyboard: sellerMenu(shopName)
    });
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
      await smartMessage.send(ctx, {
        text: 'Сначала создайте магазин',
        keyboard: sellerMenuNoShop
      });
      return;
    }

    // Enter manageWallets scene
    await ctx.scene.enter('manageWallets');
  } catch (error) {
    logger.error('Error entering manageWallets scene:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      const shopName = ctx.session.shopName || 'Магазин';
      await smartMessage.send(ctx, {
        text: 'Произошла ошибка\n\nПопробуйте позже',
        keyboard: sellerMenu(shopName)
      });
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

  // View products
  bot.action('seller:products', handleProducts);

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
        await smartMessage.send(ctx, {
          text: 'Сначала создайте магазин',
          keyboard: sellerMenuNoShop
        });
        return;
      }

      if (!ctx.session.token) {
        await smartMessage.send(ctx, {
          text: 'Необходима авторизация. Перезапустите бота командой /start',
          keyboard: sellerMenu(ctx.session.shopName || 'Магазин')
        });
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
        const tier = status.tier === 'pro' ? 'PRO 💎' : 'FREE';
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

        if (status.tier === 'free') {
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
        message += `• FREE - $25/мес\n`;
        message += `• PRO 💎 - $35/мес\n`;
      }

      const canUpgrade = status.tier === 'free' && status.status === 'active';
      await smartMessage.send(ctx, {
        text: message,
        keyboard: {
          parse_mode: 'HTML',
          ...subscriptionStatusMenu(status.tier || 'free', canUpgrade)
        }
      });

      logger.info(`User ${ctx.from.id} viewed subscription status`);
    } catch (error) {
      logger.error('Error fetching subscription status:', error);
      await smartMessage.send(ctx, {
        text: '❌ Ошибка загрузки статуса подписки',
        keyboard: sellerMenu(ctx.session.shopName || 'Магазин')
      });
    }
  });

  // Tools Submenu - advanced features (Wallets, Follows, Workers)
  bot.action('seller:tools', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId || !ctx.session.token) {
        await smartMessage.send(ctx, {
          text: 'Необходима авторизация. Перезапустите бота командой /start',
          keyboard: sellerMenu(ctx.session.shopName || 'Магазин')
        });
        return;
      }

      // Check if user is shop owner
      const shopResponse = await shopApi.getShop(ctx.session.shopId, ctx.session.token);
      const isOwner = shopResponse.owner_id === ctx.from.id;

      await smartMessage.send(ctx, {
        text: '🔧 <b>Инструменты магазина</b>\n\nДополнительные функции для управления вашим магазином:',
        keyboard: { parse_mode: 'HTML', ...sellerToolsMenu(isOwner) }
      });

      logger.info(`User ${ctx.from.id} opened tools submenu`);
    } catch (error) {
      logger.error('Error in tools submenu handler:', error);
      await smartMessage.send(ctx, {
        text: '❌ Ошибка загрузки инструментов',
        keyboard: sellerMenu(ctx.session.shopName || 'Магазин')
      });
    }
  });

  // Subscription Hub - unified entry point for all subscription actions
  bot.action('subscription:hub', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId) {
        await smartMessage.send(ctx, {
          text: 'Сначала создайте магазин',
          keyboard: sellerMenuNoShop
        });
        return;
      }

      if (!ctx.session.token) {
        await smartMessage.send(ctx, {
          text: 'Необходима авторизация. Перезапустите бота командой /start',
          keyboard: sellerMenu(ctx.session.shopName || 'Магазин')
        });
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
        const tier = subscriptionData.tier === 'pro' ? 'PRO 💎' : 'FREE';
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

        if (subscriptionData.tier === 'free' && subscriptionData.status === 'active') {
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
        message += `• FREE - $25/мес\n`;
        message += `• PRO 💎 - $35/мес\n`;
        buttons.push([Markup.button.callback('💳 Оплатить подписку', 'subscription:pay')]);
      }

      // Add back button
      buttons.push([Markup.button.callback('◀️ Назад', 'seller:main')]);

      await smartMessage.send(ctx, {
        text: message,
        keyboard: { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
      });

      logger.info(`User ${ctx.from.id} opened subscription hub`);
    } catch (error) {
      logger.error('Error in subscription hub handler:', error);
      await smartMessage.send(ctx, {
        text: '❌ Ошибка загрузки подписки',
        keyboard: sellerMenu(ctx.session.shopName || 'Магазин')
      });
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
      await smartMessage.send(ctx, {
        text: 'Сначала создайте магазин',
        keyboard: sellerMenuNoShop
      });
      return;
    }

    const shopName = ctx.session.shopName || 'Магазин';
    await smartMessage.send(ctx, {
      text: `Работники магазина: ${shopName}`,
      keyboard: manageWorkersMenu(shopName)
    });

    logger.info(`User ${ctx.from.id} opened workers management`);
  } catch (error) {
    logger.error('Error in workers menu handler:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await smartMessage.send(ctx, {
      text: 'Ошибка загрузки',
      keyboard: sellerMenu(shopName)
    });
  }
};

/**
 * Handle add worker action
 */
const handleWorkersAdd = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await smartMessage.send(ctx, {
        text: 'Сначала создайте магазин',
        keyboard: sellerMenuNoShop
      });
      return;
    }

    // Enter manageWorkers scene
    await ctx.scene.enter('manageWorkers');
  } catch (error) {
    logger.error('Error entering manageWorkers scene:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await smartMessage.send(ctx, {
      text: 'Произошла ошибка\n\nПопробуйте позже',
      keyboard: manageWorkersMenu(shopName)
    });
  }
};

/**
 * Handle list workers action
 */
const handleWorkersList = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await smartMessage.send(ctx, {
        text: 'Сначала создайте магазин',
        keyboard: sellerMenuNoShop
      });
      return;
    }

    if (!ctx.session.token) {
      const shopName = ctx.session.shopName || 'Магазин';
      await smartMessage.send(ctx, {
        text: 'Необходима авторизация. Перезапустите бота командой /start',
        keyboard: manageWorkersMenu(shopName)
      });
      return;
    }

    // Get workers list
    const workers = await workerApi.listWorkers(ctx.session.shopId, ctx.session.token);
    const shopName = ctx.session.shopName || 'Магазин';

    if (workers.length === 0) {
      await smartMessage.send(ctx, {
        text: `Работники магазина: ${shopName}\n\nПока нет работников`,
        keyboard: manageWorkersMenu(shopName)
      });
      return;
    }

    // Format workers list
    const workersList = workers.map((w, index) => {
      const name = w.username ? `@${w.username}` : w.first_name || `ID:${w.telegram_id}`;
      return `${index + 1}. ${name} (ID: ${w.telegram_id})`;
    }).join('\n');

    await smartMessage.send(ctx, {
      text: `Работники магазина: ${shopName}\n\n${workersList}`,
      keyboard: manageWorkersMenu(shopName)
    });

    logger.info(`User ${ctx.from.id} viewed workers list (${workers.length} total)`);
  } catch (error) {
    logger.error('Error fetching workers:', error);
    const shopName = ctx.session.shopName || 'Магазин';
    await smartMessage.send(ctx, {
      text: 'Ошибка загрузки',
      keyboard: manageWorkersMenu(shopName)
    });
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
