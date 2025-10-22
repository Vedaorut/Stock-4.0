import { Markup } from 'telegraf';
import config from '../config/index.js';

// Buyer menu (minimalist labels)
export const buyerMenu = Markup.inlineKeyboard([
  [Markup.button.webApp('📱 Открыть', config.webAppUrl)],
  [Markup.button.callback('🔍 Найти', 'buyer:search')],
  [Markup.button.callback('📚 Подписки', 'buyer:subscriptions')],
  [Markup.button.callback('🛒 Заказы', 'buyer:orders')],
  [Markup.button.callback('🔄 Продавец', 'role:toggle')]
]);

// Buyer menu without shop (shows CTA to create shop)
export const buyerMenuNoShop = Markup.inlineKeyboard([
  [Markup.button.webApp('📱 Открыть', config.webAppUrl)],
  [Markup.button.callback('➕ Магазин ($25)', 'seller:create_shop')],
  [Markup.button.callback('🔍 Найти', 'buyer:search')],
  [Markup.button.callback('📚 Подписки', 'buyer:subscriptions')],
  [Markup.button.callback('🛒 Заказы', 'buyer:orders')],
  [Markup.button.callback('🔄 Продавец', 'role:toggle')]
]);

// Shop actions (subscribe/unsubscribe/open)
export const shopActionsKeyboard = (shopId, isSubscribed = false) => {
  const buttons = [];

  if (!isSubscribed) {
    buttons.push([Markup.button.callback('🔔 Подписаться', `subscribe:${shopId}`)]);
  } else {
    buttons.push(
      [Markup.button.callback('✅ Подписан', `noop:subscribed`)],
      [Markup.button.callback('🔕 Отписаться', `unsubscribe:${shopId}`)]
    );
  }

  buttons.push(
    [Markup.button.callback('ℹ️ О магазине', `shop:view:${shopId}`)],
    [Markup.button.callback('« Назад', 'buyer:main')]
  );

  return Markup.inlineKeyboard(buttons);
};
