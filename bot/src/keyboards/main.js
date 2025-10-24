import { Markup } from 'telegraf';

/**
 * Main menu - role selection
 * @param {boolean} showWorkspace - Show workspace button if user is worker
 */
export const mainMenu = (showWorkspace = false) => {
  const buttons = [
    [Markup.button.callback('🛍 Покупатель', 'role:buyer')],
    [Markup.button.callback('💼 Продавец', 'role:seller')]
  ];
  
  if (showWorkspace) {
    buttons.push([Markup.button.callback('🧑\u200d💼 Workspace', 'role:workspace')]);
  }
  
  return Markup.inlineKeyboard(buttons);
};

// Default main menu (backward compatible)
export const mainMenuDefault = Markup.inlineKeyboard([
  [Markup.button.callback('🛍 Покупатель', 'role:buyer')],
  [Markup.button.callback('💼 Продавец', 'role:seller')]
]);
