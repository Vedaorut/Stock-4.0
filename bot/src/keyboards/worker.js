import { Markup } from 'telegraf';
import { t } from '../i18n/index.js';

/**
 * Worker dashboard menu - simplified (3 buttons)
 * AI handles product management via text commands
 */
export const workerMenu = (_shopName = 'Shop', lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('buttons.products', {}, lang), 'worker:products')],
    [Markup.button.callback(t('buttons.statistics', {}, lang), 'worker:stats')],
    [Markup.button.callback(t('buttons.switchRole', {}, lang), 'role:toggle')],
  ]);
};

export default {
  workerMenu,
};
