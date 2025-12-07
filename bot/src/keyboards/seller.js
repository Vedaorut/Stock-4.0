import { Markup } from 'telegraf';
import { getWebAppUrl } from '../utils/webappUrl.js';
import { t } from '../i18n/index.js';

// Seller menu (with active shop) - redesigned hierarchical structure
export const sellerMenu = (activeOrdersCount = 0, options = {}, lang = 'ru') => {
  const { hasFollows = false } = options;
  const buttons = [
    [Markup.button.webApp(t('buttons.openCatalog', {}, lang), getWebAppUrl())],
    [
      Markup.button.callback(
        `${t('buttons.activeOrders', {}, lang)}${activeOrdersCount > 0 ? ` (${activeOrdersCount})` : ''}`,
        'seller:active_orders'
      ),
    ],
  ];

  // Show "Manage Follows" button only if hasFollows is true
  if (hasFollows) {
    buttons.push([Markup.button.callback(t('buttons.manageFollows', {}, lang), 'seller:follows')]);
  }

  buttons.push([Markup.button.callback(t('buttons.orderHistory', {}, lang), 'seller:order_history')]);
  buttons.push([Markup.button.callback(t('buttons.tools', {}, lang), 'seller:tools')]);
  buttons.push([Markup.button.callback(t('buttons.settings', {}, lang), 'settings')]);
  buttons.push([Markup.button.callback(t('buttons.switchToBuyer', {}, lang), 'role:toggle')]);

  return Markup.inlineKeyboard(buttons);
};

// Seller Tools Submenu - advanced features (Wallets, Follows, Workers)
export const sellerToolsMenu = (isOwner = false, lang = 'ru') => {
  const buttons = [
    [Markup.button.callback(t('buttons.manageWallets', {}, lang), 'seller:wallets')],
    [Markup.button.callback(t('buttons.manageFollows', {}, lang), 'seller:follows')],
  ];

  if (isOwner) {
    buttons.push([Markup.button.callback(t('buttons.manageWorkers', {}, lang), 'seller:workers')]);
  }

  // Invite link - available for all sellers with shop
  buttons.push([Markup.button.callback(t('buttons.inviteLink', {}, lang), 'seller:invite_link')]);

  if (isOwner) {
    buttons.push([Markup.button.callback(t('buttons.renameShop', {}, lang), 'seller:rename_shop')]);
    buttons.push([Markup.button.callback(t('buttons.changeChannel', {}, lang), 'seller:migrate_channel')]);
  }

  // Feedback button - always available
  buttons.push([Markup.button.callback(t('buttons.feedback', {}, lang), 'feedback:start')]);

  buttons.push([Markup.button.callback(t('buttons.backToMenu', {}, lang), 'seller:menu')]);

  return Markup.inlineKeyboard(buttons);
};

// Products menu (inside "Products" screen) - minimalist
export const productsMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.callback(t('buttons.addProduct', {}, lang), 'seller:add_product')],
    [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
  ]);

// Follows menu - minimalist
export const followsMenu = (hasFollows = false, followButtons = [], lang = 'ru') => {
  const keyboard = [...followButtons];

  keyboard.push([
    Markup.button.callback(
      hasFollows ? t('buttons.addFollowMore', {}, lang) : t('buttons.addFollow', {}, lang),
      'follows:create'
    ),
  ]);
  keyboard.push([Markup.button.callback(t('buttons.backSimple', {}, lang), 'seller:menu')]);

  return Markup.inlineKeyboard(keyboard);
};

// Follow detail menu
export const followDetailMenu = (followId, mode = 'monitor', lang = 'ru') => {
  const modeButtonText =
    mode === 'resell'
      ? t('buttons.switchToMonitor', {}, lang)
      : t('buttons.switchToResell', {}, lang);

  const buttons = [[Markup.button.callback(t('buttons.catalog', {}, lang), `follow_detail:${followId}`)]];

  if (mode === 'resell') {
    buttons.push([Markup.button.callback(t('buttons.editMarkup', {}, lang), `follow_edit:${followId}`)]);
  }

  buttons.push([Markup.button.callback(modeButtonText, `follow_mode:${followId}`)]);
  buttons.push([Markup.button.callback(t('buttons.delete', {}, lang), `follow_delete:${followId}`)]);
  buttons.push([Markup.button.callback(t('buttons.backToFollows', {}, lang), 'follows:list')]);

  return Markup.inlineKeyboard(buttons);
};

export const followCatalogMenu = (followId, lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.callback(t('buttons.refresh', {}, lang), `follow_detail:${followId}`)],
    [Markup.button.callback(t('buttons.followSettings', {}, lang), `follow_settings:${followId}`)],
    [Markup.button.callback(t('buttons.backSimple', {}, lang), 'follows:list')],
  ]);

// Seller menu (no shop - need registration) - minimalist
// Use 'buyer:main' instead of 'main_menu' to avoid loop (main_menu → seller role → no shop → main_menu)
export const sellerMenuNoShop = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.callback(t('buttons.createShop', {}, lang), 'seller:create_shop')],
    [Markup.button.callback(t('buttons.mainMenu', {}, lang), 'buyer:main')],
  ]);

// Subscription status menu
export const subscriptionStatusMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([[Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')]]);
