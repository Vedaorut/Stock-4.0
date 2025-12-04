import { Markup } from 'telegraf';
import { t } from '../i18n/index.js';

/**
 * Language selection keyboard (shown once on first start)
 */
export const languageMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(t('settings.languageOptionRu', {}, lang), 'lang:ru'),
      Markup.button.callback(t('settings.languageOptionEn', {}, lang), 'lang:en'),
    ],
  ]);

/**
 * Main menu - role selection
 * @param {boolean} showWorkspace - Show workspace button if user is worker
 * @param {string} lang - Language code
 */
export const mainMenu = (showWorkspace = false, lang = 'ru') => {
  const rows = [
    [
      Markup.button.callback(t('buttons.buyerRole', {}, lang), 'role:buyer'),
      Markup.button.callback(t('buttons.sellerRole', {}, lang), 'role:seller'),
    ],
  ];

  if (showWorkspace) {
    rows.push([Markup.button.callback(t('buttons.workspace', {}, lang), 'role:workspace')]);
  }

  return Markup.inlineKeyboard(rows);
};

// Default main menu (backward compatible)
export const mainMenuDefault = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(t('buttons.buyerRole', {}, lang), 'role:buyer'),
      Markup.button.callback(t('buttons.sellerRole', {}, lang), 'role:seller'),
    ],
  ]);
