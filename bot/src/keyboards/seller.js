import { Markup } from 'telegraf';
import { getWebAppUrl } from '../utils/webappUrl.js';
import { buttons as buttonText } from '../texts/messages.js';

// Seller menu (with active shop) - redesigned hierarchical structure
export const sellerMenu = (activeOrdersCount = 0) => {
  const buttons = [
    [Markup.button.webApp(buttonText.openCatalog, getWebAppUrl())],
    [
      Markup.button.callback(
        `${buttonText.activeOrders}${activeOrdersCount > 0 ? ` (${activeOrdersCount})` : ''}`,
        'seller:active_orders'
      ),
    ],
  ];

  // P2-7 FIX: Always show "Manage Follows" button regardless of hasFollows
  // This ensures sellers can always add their FIRST follow
  buttons.push([Markup.button.callback(buttonText.manageFollows, 'seller:follows')]);

  buttons.push([Markup.button.callback(buttonText.orderHistory, 'seller:order_history')]);
  buttons.push([Markup.button.callback(buttonText.tools, 'seller:tools')]);
  buttons.push([Markup.button.callback(buttonText.switchRole, 'role:toggle')]);

  return Markup.inlineKeyboard(buttons);
};

// Seller Tools Submenu - advanced features (Wallets, Follows, Workers)
export const sellerToolsMenu = (isOwner = false) => {
  const buttons = [
    [Markup.button.callback(buttonText.manageWallets, 'seller:wallets')],
    [Markup.button.callback(buttonText.manageFollows, 'seller:follows')],
  ];

  if (isOwner) {
    buttons.push([Markup.button.callback(buttonText.manageWorkers, 'seller:workers')]);
  }

  if (isOwner) {
    buttons.push([Markup.button.callback(buttonText.changeChannel, 'seller:migrate_channel')]);
  }
  buttons.push([Markup.button.callback(buttonText.backToMenu, 'seller:menu')]);

  return Markup.inlineKeyboard(buttons);
};

// Products menu (inside "Товары" screen) - minimalist
export const productsMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback(buttonText.addProduct, 'seller:add_product')],
    [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
  ]);

// Follows menu - minimalist
export const followsMenu = (hasFollows = false, followButtons = []) => {
  const keyboard = [...followButtons];

  keyboard.push([
    Markup.button.callback(
      hasFollows ? buttonText.addFollowMore : buttonText.addFollow,
      'follows:create'
    ),
  ]);
  keyboard.push([Markup.button.callback(buttonText.backSimple, 'seller:menu')]);

  return Markup.inlineKeyboard(keyboard);
};

// Follow detail menu
export const followDetailMenu = (followId, mode = 'monitor') => {
  const modeButtonText =
    mode === 'resell' ? 'Переключить на Мониторинг' : 'Переключить на Перепродажу';

  const buttons = [[Markup.button.callback('Каталог', `follow_detail:${followId}`)]];

  if (mode === 'resell') {
    buttons.push([Markup.button.callback(buttonText.editMarkup, `follow_edit:${followId}`)]);
  }

  buttons.push([Markup.button.callback(modeButtonText, `follow_mode:${followId}`)]);
  buttons.push([Markup.button.callback(buttonText.delete, `follow_delete:${followId}`)]);
  buttons.push([Markup.button.callback(buttonText.backToFollows, 'follows:list')]);

  return Markup.inlineKeyboard(buttons);
};

export const followCatalogMenu = (followId) =>
  Markup.inlineKeyboard([
    [Markup.button.callback(buttonText.refresh, `follow_detail:${followId}`)],
    [Markup.button.callback(buttonText.followSettings, `follow_settings:${followId}`)],
    [Markup.button.callback(buttonText.backSimple, 'follows:list')],
  ]);

// Seller menu (no shop - need registration) - minimalist
export const sellerMenuNoShop = Markup.inlineKeyboard([
  [Markup.button.callback(buttonText.createShop, 'seller:create_shop')],
  [Markup.button.callback(buttonText.mainMenu, 'main_menu')],
]);

// Subscription status menu
export const subscriptionStatusMenu = () =>
  Markup.inlineKeyboard([[Markup.button.callback(buttonText.backToTools, 'seller:tools')]]);
