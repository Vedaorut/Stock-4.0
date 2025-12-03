import { Markup } from 'telegraf';
import { t } from '../i18n/index.js';

// Back button
export const backButton = (lang = 'ru') =>
  Markup.inlineKeyboard([[Markup.button.callback(t('buttons.back', {}, lang), 'back')]]);

// Cancel button
export const cancelButton = (lang = 'ru') =>
  Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), 'cancel_scene')]]);

// Main menu button
export const mainMenuButton = (lang = 'ru') =>
  Markup.inlineKeyboard([[Markup.button.callback(t('buttons.mainMenu', {}, lang), 'main_menu')]]);

// Success with main menu
export const successButtons = (lang = 'ru') =>
  Markup.inlineKeyboard([[Markup.button.callback(t('buttons.mainMenu', {}, lang), 'main_menu')]]);
