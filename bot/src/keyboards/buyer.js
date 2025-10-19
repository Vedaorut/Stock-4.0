import { Markup } from 'telegraf';
import config from '../config/index.js';

// Buyer menu
export const buyerMenu = Markup.inlineKeyboard([
  [Markup.button.callback('🔍 Найти магазин', 'buyer:search')],
  [Markup.button.callback('📚 Подписки', 'buyer:subscriptions')],
  [Markup.button.webApp('🛒 Заказы', `${config.webAppUrl}/orders`)],
  [Markup.button.webApp('📱 Приложение', config.webAppUrl)],
  [Markup.button.callback('« Назад', 'main_menu')]
]);

// Shop actions (subscribe/open)
export const shopActionsKeyboard = (shopId, isSubscribed = false) => {
  const buttons = [];

  if (!isSubscribed) {
    buttons.push([Markup.button.callback('✓ Подписаться', `subscribe:${shopId}`)]);
  }

  buttons.push(
    [Markup.button.webApp('📱 Открыть магазин', `${config.webAppUrl}/shop/${shopId}`)],
    [Markup.button.callback('« Назад', 'buyer:main')]
  );

  return Markup.inlineKeyboard(buttons);
};
