import { Markup } from 'telegraf';

/**
 * Worker dashboard menu - simplified (3 buttons)
 * AI handles product management via text commands
 */
export const workerMenu = (_shopName = 'Магазин') =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📦 Товары', 'worker:products')],
    [Markup.button.callback('📊 Статистика', 'worker:stats')],
    [Markup.button.callback('🔄 Сменить роль', 'role:toggle')],
  ]);

export default {
  workerMenu,
};
