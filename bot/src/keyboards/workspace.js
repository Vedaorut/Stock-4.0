import { Markup } from 'telegraf';
import config from '../config/index.js';

/**
 * Workspace menu (restricted seller menu for workers)
 * Workers can: manage products, use AI, view sales
 * Workers cannot: wallets, subscriptions, workers management, shop settings
 */
export const workspaceMenu = (shopName) => Markup.inlineKeyboard([
  [Markup.button.webApp('📱 Открыть Menu', config.webAppUrl)],
  [Markup.button.callback('💰 Продажи', 'seller:sales')], // Read-only for workers
  [Markup.button.callback('◀️ Назад', 'workspace:back')],
  [Markup.button.callback('🔄 Покупатель', 'role:toggle')]
]);

/**
 * Workspace shop selection keyboard
 * Shows list of shops where user is worker
 */
export const workspaceShopSelection = (shops) => {
  const buttons = shops.map(shop => 
    [Markup.button.callback(`${shop.name}`, `workspace:select:${shop.id}`)]
  );
  buttons.push([Markup.button.callback('◀️ Главное меню', 'main_menu')]);
  return Markup.inlineKeyboard(buttons);
};

/**
 * Worker management menu (for shop owners)
 */
export const manageWorkersMenu = (shopName) => Markup.inlineKeyboard([
  [Markup.button.callback('➕ Добавить', 'workers:add')],
  [Markup.button.callback('📋 Список', 'workers:list')],
  [Markup.button.callback('◀️ Назад', 'seller:main')]
]);

/**
 * Worker list item keyboard
 */
export const workerItemMenu = (workerId) => Markup.inlineKeyboard([
  [Markup.button.callback('🗑 Удалить', `workers:remove:${workerId}`)]
]);

/**
 * Confirm worker removal keyboard
 */
export const confirmWorkerRemoval = (workerId) => Markup.inlineKeyboard([
  [Markup.button.callback('✅ Да, удалить', `workers:remove:confirm:${workerId}`)],
  [Markup.button.callback('❌ Отмена', 'workers:list')]
]);

export default {
  workspaceMenu,
  workspaceShopSelection,
  manageWorkersMenu,
  workerItemMenu,
  confirmWorkerRemoval
};
