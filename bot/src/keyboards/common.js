import { Markup } from 'telegraf';

// Back button
export const backButton = Markup.inlineKeyboard([
  [Markup.button.callback('◀️ Назад', 'back')]
]);

// Cancel button
export const cancelButton = Markup.inlineKeyboard([
  [Markup.button.callback('◀️ Назад', 'cancel_scene')]
]);

// Main menu button
export const mainMenuButton = Markup.inlineKeyboard([
  [Markup.button.callback('🏠 Главное меню', 'main_menu')]
]);

// Success with main menu
export const successButtons = Markup.inlineKeyboard([
  [Markup.button.callback('🏠 Главное меню', 'main_menu')]
]);
