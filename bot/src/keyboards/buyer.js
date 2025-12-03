import { Markup } from 'telegraf';
import { getWebAppUrl } from '../utils/webappUrl.js';
import { t } from '../i18n/index.js';

// Buyer menu (minimalist labels)
export const buyerMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.webApp(t('buttons.openCatalog', {}, lang), getWebAppUrl())],
    [Markup.button.callback(t('buttons.findShop', {}, lang), 'buyer:search')],
    [Markup.button.callback(t('buttons.mySubscriptions', {}, lang), 'buyer:subscriptions')],
    [Markup.button.callback(t('buttons.myOrders', {}, lang), 'buyer:orders')],
    [Markup.button.callback(t('buttons.settings', {}, lang), 'settings')],
    [Markup.button.callback(t('buttons.switchRole', {}, lang), 'role:toggle')],
  ]);

// Buyer menu without shop (shows CTA to create shop)
export const buyerMenuNoShop = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.webApp(t('buttons.openCatalog', {}, lang), getWebAppUrl())],
    [Markup.button.callback(t('buttons.createShop', {}, lang), 'seller:create_shop')],
    [Markup.button.callback(t('buttons.findShop', {}, lang), 'buyer:search')],
    [Markup.button.callback(t('buttons.mySubscriptions', {}, lang), 'buyer:subscriptions')],
    [Markup.button.callback(t('buttons.myOrders', {}, lang), 'buyer:orders')],
    [Markup.button.callback(t('buttons.settings', {}, lang), 'settings')],
    [Markup.button.callback(t('buttons.switchRole', {}, lang), 'role:toggle')],
  ]);

// Shop actions (subscribe/unsubscribe/open)
export const shopActionsKeyboard = (
  shopId,
  isSubscribed = false,
  counts = { stock: 0, preorder: 0 },
  lang = 'ru'
) => {
  const { stock = 0, preorder = 0 } = counts;
  const buttons = [];

  if (!isSubscribed) {
    buttons.push([Markup.button.callback(t('buttons.subscribe', {}, lang), `subscribe:${shopId}`)]);
  } else {
    buttons.push(
      [Markup.button.callback(t('buttons.subscribed', {}, lang), `noop:subscribed`)],
      [Markup.button.callback(t('buttons.unsubscribe', {}, lang), `unsubscribe:${shopId}`)]
    );
  }

  buttons.push(
    [
      Markup.button.callback(
        `${t('buttons.stockSection', {}, lang)} (${stock})`,
        `shop:stock:${shopId}`
      ),
    ],
    [
      Markup.button.callback(
        `${t('buttons.preorderSection', {}, lang)} (${preorder})`,
        `shop:preorder:${shopId}`
      ),
    ],
    [Markup.button.callback(t('buttons.aboutShop', {}, lang), `shop:view:${shopId}`)],
    [Markup.button.callback(t('buttons.back', {}, lang), 'buyer:main')]
  );

  return Markup.inlineKeyboard(buttons);
};

// Shop search results keyboard (all shops in one message)
export const shopResultsKeyboard = (shops, lang = 'ru') => {
  const buttons = [];

  // Add button for each shop (max 10 for clean display)
  const shopsToShow = shops.slice(0, 10);

  for (const shop of shopsToShow) {
    const suffix = shop.is_subscribed ? ` (${t('formatters.subscribed', {}, lang)})` : '';
    buttons.push([Markup.button.callback(`${shop.name}${suffix}`, `shop:view:${shop.id}`)]);
  }

  buttons.push([Markup.button.callback(t('buttons.back', {}, lang), 'buyer:main')]);

  return Markup.inlineKeyboard(buttons);
};
