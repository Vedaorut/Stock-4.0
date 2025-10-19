import { Markup } from 'telegraf';

// Main menu - role selection
export const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('🛍 Покупатель', 'role:buyer')],
  [Markup.button.callback('💼 Продавец', 'role:seller')]
]);
