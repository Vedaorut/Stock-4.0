import { getShopByOwner } from '../utils/api.js';
import {
  sellerMenuKeyboard,
  shopManagementKeyboard,
  backToSellerMenuKeyboard,
} from '../keyboards/sellerMenu.js';

// Show seller menu
export async function handleSellerMenu(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Check if seller has a shop
    const shopResult = await getShopByOwner(telegramId);

    if (shopResult.success && shopResult.data) {
      // Seller has a shop
      const shop = shopResult.data;
      ctx.session.shopId = shop.id;

      await ctx.editMessageText(
        `💼 Меню продавца\n\n` +
          `🏪 Ваш магазин: ${shop.name}\n` +
          `📊 Статус: ${shop.isActive ? '✅ Активен' : '⏸ Неактивен'}\n\n` +
          `Выберите действие:`,
        sellerMenuKeyboard()
      );
    } else {
      // Seller doesn't have a shop yet
      await ctx.editMessageText(
        `💼 Меню продавца\n\n` +
          `У вас еще нет магазина.\n\n` +
          `Для создания магазина требуется:\n` +
          `💰 Оплата: $25 в Bitcoin\n\n` +
          `Хотите создать магазин?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Создать магазин', callback_data: 'create_shop_start' }],
              [{ text: '⬅️ Назад', callback_data: 'back_to_main' }],
            ],
          },
        }
      );
    }
  } catch (error) {
    console.error('Error in handleSellerMenu:', error);
    await ctx.reply('❌ Ошибка при загрузке меню продавца.');
  }
}

// Show my shop
export async function handleMyShop(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const shopResult = await getShopByOwner(telegramId);

    if (shopResult.success && shopResult.data) {
      const shop = shopResult.data;

      await ctx.editMessageText(
        `🏪 Мой магазин\n\n` +
          `📛 Название: ${shop.name}\n` +
          `📊 Статус: ${shop.isActive ? '✅ Активен' : '⏸ Неактивен'}\n` +
          `📦 Товаров: ${shop.productsCount || 0}\n` +
          `🛍 Заказов: ${shop.ordersCount || 0}\n` +
          `⭐️ Подписчиков: ${shop.subscribersCount || 0}\n\n` +
          `Выберите действие:`,
        shopManagementKeyboard(shop.id)
      );
    } else {
      await ctx.editMessageText('❌ Магазин не найден.', backToSellerMenuKeyboard());
    }
  } catch (error) {
    console.error('Error in handleMyShop:', error);
    await ctx.reply('❌ Ошибка при загрузке магазина.');
  }
}
