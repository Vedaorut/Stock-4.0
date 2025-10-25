import { Markup } from 'telegraf';
import config from '../config/index.js';

// Seller menu (with active shop) - redesigned hierarchical structure
export const sellerMenu = (shopName) => {
  return Markup.inlineKeyboard([
    // PRIMARY: WebApp button
    [Markup.button.webApp('📱 Открыть Menu', config.webAppUrl)],

    // CORE: Main actions
    [Markup.button.callback('💰 Продажи', 'seller:sales')],

    // SUBSCRIPTION HUB: Single entry point for all subscription actions
    [Markup.button.callback('📊 Подписка', 'subscription:hub')],

    // TOOLS: Advanced features in submenu
    [Markup.button.callback('🔧 Инструменты', 'seller:tools')],

    // NAVIGATION: Role toggle
    [Markup.button.callback('🔄 Покупатель', 'role:toggle')]
  ]);
};

// Seller Tools Submenu - advanced features (Wallets, Follows, Workers)
export const sellerToolsMenu = (isOwner = false) => {
  const buttons = [
    [Markup.button.callback('💼 Кошельки', 'seller:wallets')],
    [Markup.button.callback('👀 Следить', 'seller:follows')]
  ];

  // Workers management is owner-only
  if (isOwner) {
    buttons.push([Markup.button.callback('👥 Работники', 'seller:workers')]);
  }

  // Back button
  buttons.push([Markup.button.callback('◀️ Назад', 'seller:main')]);

  return Markup.inlineKeyboard(buttons);
};

// Products menu (inside "Товары" screen) - minimalist
export const productsMenu = (shopName) => Markup.inlineKeyboard([
  [Markup.button.callback('➕ Добавить', 'seller:add_product')],
  [Markup.button.callback('◀️ Назад', 'seller:main')]
]);

// Follows menu - minimalist
export const followsMenu = (shopName) => Markup.inlineKeyboard([
  [Markup.button.callback('➕ Подписаться', 'follows:create')],
  [Markup.button.callback('◀️ Назад', 'seller:main')]
]);

// Follow detail menu
export const followDetailMenu = (followId) => Markup.inlineKeyboard([
  [Markup.button.callback('✏️ Наценка', `follow_edit:${followId}`)],
  [Markup.button.callback('🔄 Режим', `follow_mode:${followId}`)],
  [Markup.button.callback('🗑 Удалить', `follow_delete:${followId}`)],
  [Markup.button.callback('◀️ Назад', 'follows:list')]
]);

// Seller menu (no shop - need registration) - minimalist
export const sellerMenuNoShop = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Магазин ($25/мес)', 'seller:create_shop')],
  [Markup.button.callback('◀️ Назад', 'main_menu')]
]);

// Subscription status menu
export const subscriptionStatusMenu = (tier, canUpgrade = false) => {
  const buttons = [];

  if (canUpgrade && tier === 'basic') {
    buttons.push([Markup.button.callback('💎 Апгрейд на PRO', 'subscription:upgrade')]);
  }

  buttons.push(
    [Markup.button.callback('💳 Оплатить подписку', 'subscription:pay')],
    [Markup.button.callback('◀️ Назад', 'seller:main')]
  );

  return Markup.inlineKeyboard(buttons);
};
