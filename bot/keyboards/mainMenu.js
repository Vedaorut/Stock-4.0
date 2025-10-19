import { Markup } from 'telegraf';

// Main menu - actions for all users
export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛍 Каталог магазинов', 'catalog')],
    [Markup.button.callback('⭐️ Мои подписки', 'subscriptions')],
    [Markup.button.callback('🏪 Мой магазин', 'my_shop')],
    [Markup.button.callback('🌐 Открыть приложение', 'open_webapp')]
  ]);
}

// Back to main menu
export function backToMainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад в главное меню', 'back_to_main')],
  ]);
}

// Confirmation keyboard
export function confirmationKeyboard(confirmAction, cancelAction = 'cancel') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Подтвердить', confirmAction),
      Markup.button.callback('❌ Отмена', cancelAction),
    ],
  ]);
}

// Yes/No keyboard
export function yesNoKeyboard(yesAction, noAction) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Да', yesAction),
      Markup.button.callback('❌ Нет', noAction),
    ],
  ]);
}
