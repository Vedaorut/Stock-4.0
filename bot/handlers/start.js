import { createUser, getUser } from '../utils/api.js';
import { mainMenuKeyboard } from '../keyboards/mainMenu.js';

// Handle /start command
export async function handleStart(ctx) {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username || '';
    const firstName = ctx.from.first_name || 'User';

    // Check if user already exists
    const userResult = await getUser(telegramId);

    if (userResult.success && userResult.data) {
      // User already exists, show welcome back message
      const user = userResult.data;

      await ctx.reply(
        `👋 С возвращением, ${firstName}!\n\n` +
        `Выберите действие:`,
        mainMenuKeyboard()
      );
    } else {
      // New user, show welcome message
      await ctx.reply(
        `🎉 Добро пожаловать в Status Stock!\n\n` +
        `Status Stock - платформа для торговли цифровыми товарами.\n\n` +
        `✨ Вы можете:\n` +
        `🛍 Находить магазины и покупать товары\n` +
        `💼 Создать свой магазин и продавать (всего $25 один раз)\n\n` +
        `📌 Вы можете быть одновременно покупателем И продавцом!\n\n` +
        `Выберите действие:`,
        mainMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleStart:', error);
    await ctx.reply(
      '❌ Произошла ошибка при запуске бота. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
    );
  }
}

// Handle back to main menu
export async function handleBackToMain(ctx) {
  try {
    await ctx.answerCbQuery();

    const firstName = ctx.from.first_name || 'User';

    await ctx.editMessageText(
      `👋 Привет, ${firstName}!\n\n` +
      `Выберите действие:`,
      mainMenuKeyboard()
    );
  } catch (error) {
    console.error('Error in handleBackToMain:', error);
    await ctx.reply(
      '❌ Произошла ошибка. Используйте /start для перезапуска бота.'
    );
  }
}

// Handle help command
export async function handleHelp(ctx) {
  try {
    const helpText = `
ℹ️ **Помощь - Status Stock Bot**

**Для покупателей:**
🔍 Найти магазин - поиск магазинов по названию
⭐️ Мои подписки - список ваших подписок
📦 Мои заказы - история ваших заказов
🌐 Веб-приложение - полная версия платформы

**Для продавцов:**
🏪 Мой магазин - управление вашим магазином
➕ Добавить товар - добавить новый товар
📦 Мои заказы - заказы в вашем магазине
🌐 Веб-приложение - панель управления

**Создание магазина:**
Для создания магазина требуется оплата $25 в Bitcoin.
После оплаты вы сможете добавлять товары и получать заказы.

**Команды:**
/start - Начать работу с ботом
/help - Показать это сообщение
/cancel - Отменить текущее действие

**Поддержка:**
Если у вас возникли вопросы или проблемы, обратитесь в поддержку: @support
    `;

    await ctx.reply(helpText, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in handleHelp:', error);
    await ctx.reply('❌ Ошибка при загрузке справки.');
  }
}

// Handle cancel command
export async function handleCancel(ctx) {
  try {
    // Clear session state
    if (ctx.session) {
      ctx.session.state = null;
      ctx.session.data = {};
    }

    await ctx.reply(
      '❌ Действие отменено.\n\n' +
      'Используйте /start для возврата в главное меню.',
      mainMenuKeyboard()
    );
  } catch (error) {
    console.error('Error in handleCancel:', error);
    await ctx.reply('Действие отменено.');
  }
}
