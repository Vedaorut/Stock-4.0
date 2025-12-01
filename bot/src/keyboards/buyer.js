import { Markup } from 'telegraf';
import { getWebAppUrl } from '../utils/webappUrl.js';
import { buttons as buttonText } from '../texts/messages.js';

// Buyer menu (minimalist labels)
export const buyerMenu = Markup.inlineKeyboard([
  [Markup.button.webApp(buttonText.openCatalog, getWebAppUrl())],
  [Markup.button.callback(buttonText.findShop, 'buyer:search')],
  [Markup.button.callback(buttonText.mySubscriptions, 'buyer:subscriptions')],
  [Markup.button.callback(buttonText.myOrders, 'buyer:orders')],
  [Markup.button.callback(buttonText.switchRole, 'role:toggle')],
]);

// Buyer menu without shop (shows CTA to create shop)
export const buyerMenuNoShop = Markup.inlineKeyboard([
  [Markup.button.webApp(buttonText.openCatalog, getWebAppUrl())],
  [Markup.button.callback(buttonText.createShop, 'seller:create_shop')],
  [Markup.button.callback(buttonText.findShop, 'buyer:search')],
  [Markup.button.callback(buttonText.mySubscriptions, 'buyer:subscriptions')],
  [Markup.button.callback(buttonText.myOrders, 'buyer:orders')],
  [Markup.button.callback(buttonText.switchRole, 'role:toggle')],
]);

// Shop actions (subscribe/unsubscribe/open)
export const shopActionsKeyboard = (
  shopId,
  isSubscribed = false,
  counts = { stock: 0, preorder: 0 }
) => {
  const { stock = 0, preorder = 0 } = counts;
  const buttons = [];

  if (!isSubscribed) {
    buttons.push([Markup.button.callback(buttonText.subscribe, `subscribe:${shopId}`)]);
  } else {
    buttons.push(
      [Markup.button.callback(buttonText.subscribed, `noop:subscribed`)],
      [Markup.button.callback(buttonText.unsubscribe, `unsubscribe:${shopId}`)]
    );
  }

  buttons.push(
    [Markup.button.callback(`${buttonText.stockSection} (${stock})`, `shop:stock:${shopId}`)],
    [
      Markup.button.callback(
        `${buttonText.preorderSection} (${preorder})`,
        `shop:preorder:${shopId}`
      ),
    ],
    [Markup.button.callback(buttonText.aboutShop, `shop:view:${shopId}`)],
    [Markup.button.callback(buttonText.back, 'buyer:main')]
  );

  return Markup.inlineKeyboard(buttons);
};

// Shop search results keyboard (all shops in one message)
export const shopResultsKeyboard = (shops) => {
  const buttons = [];

  // Add button for each shop (max 10 for clean display)
  const shopsToShow = shops.slice(0, 10);

  for (const shop of shopsToShow) {
    const suffix = shop.is_subscribed ? ' (в подписках)' : '';
    buttons.push([Markup.button.callback(`${shop.name}${suffix}`, `shop:view:${shop.id}`)]);
  }

  buttons.push([Markup.button.callback(buttonText.back, 'buyer:main')]);

  return Markup.inlineKeyboard(buttons);
};
