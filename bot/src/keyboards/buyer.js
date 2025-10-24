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
    [Markup.button.callback('◀️ Назад', 'buyer:main')]
  );

  return Markup.inlineKeyboard(buttons);
};

// Shop search results keyboard (all shops in one message)
export const shopResultsKeyboard = (shops) => {
  const buttons = [];

  // Add button for each shop (max 10 for clean display)
  const shopsToShow = shops.slice(0, 10);

  for (const shop of shopsToShow) {
    buttons.push([
      Markup.button.callback(`${shop.name}${shop.is_subscribed ? ' ✅' : ''}`, `shop:view:${shop.id}`)
    ]);
  }

  // Show "and X more" if there are more results
  if (shops.length > 10) {
    buttons.push([Markup.button.callback(`... и ещё ${shops.length - 10}`, 'noop:more')]);
  }

  buttons.push([Markup.button.callback('◀️ Назад', 'buyer:main')]);

  return Markup.inlineKeyboard(buttons);
};
