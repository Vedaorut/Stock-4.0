import {
  getShopByName,
  subscribeToShop,
  unsubscribeFromShop,
  getSubscriptions,
  getOrdersByBuyer
} from '../utils/api.js';
import {
  buyerMenuKeyboard,
  shopDetailKeyboard,
  subscriptionsListKeyboard,
  buyerOrdersMenuKeyboard,
  backToBuyerMenuKeyboard,
  searchResultKeyboard
} from '../keyboards/buyerMenu.js';

// Show buyer menu
export async function handleBuyerMenu(ctx) {
  try {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      `🛍 Меню покупателя\n\n` +
      `Добро пожаловать в Status Stock!\n\n` +
      `Здесь вы можете:\n` +
      `• Находить интересные магазины\n` +
      `• Подписываться на любимые магазины\n` +
      `• Делать заказы\n` +
      `• Отслеживать доставку\n\n` +
      `Выберите действие:`,
      buyerMenuKeyboard()
    );
  } catch (error) {
    console.error('Error in handleBuyerMenu:', error);
    await ctx.reply('❌ Ошибка при загрузке меню покупателя.');
  }
}

// Handle search shop
export async function handleSearchShop(ctx) {
  try {
    await ctx.answerCbQuery();

    ctx.session.state = 'awaiting_shop_search';

    await ctx.editMessageText(
      `🔍 Поиск магазина\n\n` +
      `Введите название магазина или его часть:\n\n` +
      `Например: "sneakers", "fashion", "tech"`
    );
  } catch (error) {
    console.error('Error in handleSearchShop:', error);
    await ctx.reply('❌ Ошибка при поиске магазина.');
  }
}

// Handle shop search input
export async function handleShopSearchInput(ctx) {
  try {
    if (ctx.session.state !== 'awaiting_shop_search') {
      return;
    }

    const searchQuery = ctx.message.text.trim();

    if (searchQuery.length < 2) {
      await ctx.reply('❌ Запрос слишком короткий. Минимум 2 символа.');
      return;
    }

    await ctx.reply('🔍 Ищем магазины...');

    // Search for shops
    const searchResult = await getShopByName(searchQuery);

    // Clear search state
    ctx.session.state = null;

    if (searchResult.success && searchResult.data) {
      const shops = Array.isArray(searchResult.data) ? searchResult.data : [searchResult.data];

      if (shops.length === 0) {
        await ctx.reply(
          `😔 Магазины не найдены\n\n` +
          `Попробуйте изменить запрос.`,
          searchResultKeyboard([])
        );
      } else {
        await ctx.reply(
          `✅ Найдено магазинов: ${shops.length}\n\n` +
          `Выберите магазин для просмотра:`,
          searchResultKeyboard(shops)
        );
      }
    } else {
      await ctx.reply(
        `😔 Магазины не найдены\n\n` +
        `Попробуйте изменить запрос.`,
        searchResultKeyboard([])
      );
    }
  } catch (error) {
    console.error('Error in handleShopSearchInput:', error);
    await ctx.reply('❌ Ошибка при поиске магазинов.');
  }
}

// Handle view shop
export async function handleViewShop(ctx, shopId) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Get shop details
    const shopResult = await getShopByName(''); // This should be replaced with getShopById

    // For now, we'll use a placeholder
    // TODO: Implement getShopById in api.js

    // Check if user is subscribed
    const subsResult = await getSubscriptions(telegramId);
    let isSubscribed = false;

    if (subsResult.success && subsResult.data) {
      isSubscribed = subsResult.data.some(sub => sub.shopId === shopId);
    }

    // Mock shop data for now
    const shop = {
      id: shopId,
      name: 'Shop Name',
      description: 'Shop description',
      productsCount: 0,
      subscribersCount: 0
    };

    await ctx.editMessageText(
      `🏪 ${shop.name}\n\n` +
      `📝 ${shop.description || 'Описание отсутствует'}\n\n` +
      `📦 Товаров: ${shop.productsCount || 0}\n` +
      `⭐️ Подписчиков: ${shop.subscribersCount || 0}\n\n` +
      `${isSubscribed ? '✅ Вы подписаны на этот магазин' : ''}`,
      shopDetailKeyboard(shopId, isSubscribed)
    );
  } catch (error) {
    console.error('Error in handleViewShop:', error);
    await ctx.reply('❌ Ошибка при загрузке магазина.');
  }
}

// Handle subscribe to shop
export async function handleSubscribe(ctx, shopId) {
  try {
    await ctx.answerCbQuery('⏳ Подписываемся...');

    const telegramId = ctx.from.id;

    const result = await subscribeToShop(telegramId, shopId);

    if (result.success) {
      await ctx.answerCbQuery('✅ Вы подписались на магазин!');

      // Update the message to show subscribed state
      await handleViewShop(ctx, shopId);
    } else {
      await ctx.answerCbQuery(`❌ ${result.error}`);
    }
  } catch (error) {
    console.error('Error in handleSubscribe:', error);
    await ctx.answerCbQuery('❌ Ошибка при подписке.');
  }
}

// Handle unsubscribe from shop
export async function handleUnsubscribe(ctx, shopId) {
  try {
    await ctx.answerCbQuery('⏳ Отписываемся...');

    const telegramId = ctx.from.id;

    const result = await unsubscribeFromShop(telegramId, shopId);

    if (result.success) {
      await ctx.answerCbQuery('✅ Вы отписались от магазина');

      // Update the message to show unsubscribed state
      await handleViewShop(ctx, shopId);
    } else {
      await ctx.answerCbQuery(`❌ ${result.error}`);
    }
  } catch (error) {
    console.error('Error in handleUnsubscribe:', error);
    await ctx.answerCbQuery('❌ Ошибка при отписке.');
  }
}

// Handle my subscriptions
export async function handleMySubscriptions(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    await ctx.editMessageText('⏳ Загружаем ваши подписки...');

    const result = await getSubscriptions(telegramId);

    if (result.success && result.data) {
      const subscriptions = result.data;

      if (subscriptions.length === 0) {
        await ctx.editMessageText(
          `⭐️ Мои подписки\n\n` +
          `У вас пока нет подписок.\n\n` +
          `Найдите интересные магазины и подпишитесь на них!`,
          subscriptionsListKeyboard([])
        );
      } else {
        await ctx.editMessageText(
          `⭐️ Мои подписки (${subscriptions.length})\n\n` +
          `Выберите магазин:`,
          subscriptionsListKeyboard(subscriptions)
        );
      }
    } else {
      await ctx.editMessageText(
        `❌ Ошибка загрузки подписок: ${result.error}`,
        backToBuyerMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleMySubscriptions:', error);
    await ctx.reply('❌ Ошибка при загрузке подписок.');
  }
}

// Handle buyer orders
export async function handleBuyerOrders(ctx) {
  try {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      `📦 Мои заказы\n\n` +
      `Выберите категорию заказов:`,
      buyerOrdersMenuKeyboard()
    );
  } catch (error) {
    console.error('Error in handleBuyerOrders:', error);
    await ctx.reply('❌ Ошибка при загрузке заказов.');
  }
}

// Handle buyer orders by status
export async function handleBuyerOrdersByStatus(ctx, status) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    await ctx.editMessageText('⏳ Загружаем заказы...');

    const result = await getOrdersByBuyer(telegramId);

    if (result.success && result.data) {
      let orders = result.data;

      // Filter by status
      if (status === 'active') {
        orders = orders.filter(o => ['new', 'processing', 'shipped'].includes(o.status));
      } else {
        orders = orders.filter(o => o.status === status);
      }

      if (orders.length === 0) {
        const statusText = status === 'active' ? 'активных' :
                          status === 'completed' ? 'завершенных' :
                          'отмененных';

        await ctx.editMessageText(
          `📦 Заказы\n\n` +
          `У вас нет ${statusText} заказов.`,
          buyerOrdersMenuKeyboard()
        );
      } else {
        let ordersList = `📦 Заказы (${orders.length})\n\n`;

        orders.slice(0, 10).forEach((order, index) => {
          const statusEmoji = order.status === 'new' ? '🆕' :
                             order.status === 'processing' ? '⏳' :
                             order.status === 'shipped' ? '📦' :
                             order.status === 'completed' ? '✅' : '❌';

          ordersList += `${index + 1}. ${statusEmoji} Заказ #${order.id}\n`;
          ordersList += `   Магазин: ${order.shop?.name || 'N/A'}\n`;
          ordersList += `   Сумма: $${order.total}\n\n`;
        });

        if (orders.length > 10) {
          ordersList += `\n... и еще ${orders.length - 10} заказов\n`;
          ordersList += `\nОткройте веб-приложение для просмотра всех заказов.`;
        }

        await ctx.editMessageText(ordersList, buyerOrdersMenuKeyboard());
      }
    } else {
      await ctx.editMessageText(
        `❌ Ошибка загрузки заказов: ${result.error}`,
        buyerOrdersMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleBuyerOrdersByStatus:', error);
    await ctx.reply('❌ Ошибка при загрузке заказов.');
  }
}

// Handle open webapp for buyer
export async function handleOpenWebappBuyer(ctx) {
  try {
    await ctx.answerCbQuery();

    const webappUrl = process.env.WEBAPP_URL || 'https://your-webapp-url.com';

    await ctx.editMessageText(
      `🌐 Веб-приложение\n\n` +
      `Откройте полную версию платформы для:\n` +
      `• Удобного просмотра товаров\n` +
      `• Оформления заказов\n` +
      `• Управления профилем\n\n` +
      `🔗 [Открыть веб-приложение](${webappUrl})`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Открыть', url: webappUrl }],
            [{ text: '⬅️ Назад', callback_data: 'buyer_menu' }],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Error in handleOpenWebappBuyer:', error);
    await ctx.reply('❌ Ошибка при открытии веб-приложения.');
  }
}
