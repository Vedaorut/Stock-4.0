import { Markup } from 'telegraf';
import { getWebAppUrl } from '../utils/webappUrl.js';
import { t } from '../i18n/index.js';

/**
 * Workspace menu (restricted seller menu for workers)
 * Workers can: manage products, use AI, view sales
 * Workers cannot: wallets, subscriptions, workers management, shop settings
 */
export const workspaceMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.webApp(t('buttons.openCatalog', {}, lang), getWebAppUrl())],
    [Markup.button.callback(t('buttons.viewSales', {}, lang), 'seller:sales')],
    [Markup.button.callback(t('buttons.back', {}, lang), 'workspace:back')],
    [Markup.button.callback(t('buttons.switchRole', {}, lang), 'role:toggle')],
  ]);

/**
 * Workspace shop selection keyboard
 * Shows list of shops where user is worker
 */
export const workspaceShopSelection = (shops, lang = 'ru') => {
  const buttons = shops.map((shop) => [
    Markup.button.callback(`${shop.name}`, `workspace:select:${shop.id}`),
  ]);
  buttons.push([Markup.button.callback(t('buttons.mainMenu', {}, lang), 'main_menu')]);
  return Markup.inlineKeyboard(buttons);
};

/**
 * Worker management menu (for shop owners)
 */
export const manageWorkersMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.callback(t('buttons.addWorker', {}, lang), 'workers:add')],
    [Markup.button.callback(t('buttons.listWorkers', {}, lang), 'workers:list')],
    [Markup.button.callback(t('buttons.backToTools', {}, lang), 'seller:tools')],
  ]);

/**
 * Worker list item keyboard
 */
export const workerItemMenu = (workerId, lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.callback(t('buttons.delete', {}, lang), `workers:remove:${workerId}`)],
  ]);

/**
 * Confirm worker removal keyboard
 */
export const confirmWorkerRemoval = (workerId, lang = 'ru') =>
  Markup.inlineKeyboard([
    [Markup.button.callback(t('buttons.delete', {}, lang), `workers:remove:confirm:${workerId}`)],
    [Markup.button.callback(t('buttons.cancel', {}, lang), 'workers:list')],
  ]);

export default {
  workspaceMenu,
  workspaceShopSelection,
  manageWorkersMenu,
  workerItemMenu,
  confirmWorkerRemoval,
};
