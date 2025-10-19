import { Markup } from 'telegraf';

// Back button
export const backButton = Markup.inlineKeyboard([
  [Markup.button.callback('« Назад', 'back')]
]);

// Cancel button (for scenes)
export const cancelButton = Markup.inlineKeyboard([
  [Markup.button.callback('« Отменить', 'cancel_scene')]
]);

// Main menu button
export const mainMenuButton = Markup.inlineKeyboard([
  [Markup.button.callback('🏠 Главное меню', 'main_menu')]
]);

// Back and cancel
export const backAndCancelButtons = Markup.inlineKeyboard([
  [Markup.button.callback('« Назад', 'back')],
  [Markup.button.callback('« Отменить', 'cancel_scene')]
]);

// Success with main menu
export const successButtons = Markup.inlineKeyboard([
  [Markup.button.callback('🏠 Главное меню', 'main_menu')]
]);
