import { Markup } from 'telegraf';
import { t } from '../i18n/index.js';

/**
 * Settings menu keyboard
 * @param {Object} options - { hasShop, isTrial, tier }
 * @param {string} lang - Language code
 */
export const settingsMenu = (options = {}, lang = 'ru') => {
  const buttons = [
    [Markup.button.callback(t('settings.language', {}, lang), 'settings:language')],
  ];

  // Show subscription renewal for shop owners not on trial
  if (options.hasShop && !options.isTrial) {
    const tierLabel = (options.tier || 'pro').toUpperCase();
    buttons.push([
      Markup.button.callback(
        t('settings.renewSubscription', { tier: tierLabel }, lang),
        'settings:renew'
      ),
    ]);
  }

  // Show exit trial option for users on trial
  if (options.isTrial) {
    buttons.push([
      Markup.button.callback(t('settings.exitTrial', {}, lang), 'settings:exit_trial'),
    ]);
  }

  buttons.push([Markup.button.callback(t('buttons.back', {}, lang), 'settings:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Language selection keyboard
 */
export const languageSelectMenu = (lang = 'ru') =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(t('settings.languageOptionRu', {}, lang), 'settings:lang:ru'),
      Markup.button.callback(t('settings.languageOptionEn', {}, lang), 'settings:lang:en'),
    ],
    [Markup.button.callback(t('buttons.back', {}, lang), 'settings:main')],
  ]);
