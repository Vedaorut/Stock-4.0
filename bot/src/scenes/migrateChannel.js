/**
 * Channel Migration Wizard Scene
 * 
 * Multi-step wizard for PRO shop owners to migrate their Telegram channel
 * when the old one gets blocked/banned.
 * 
 * Steps:
 * 1. Check eligibility and show confirmation (subscriber count, limits)
 * 2. Enter new channel URL (with optional old URL)
 * 3. Start broadcast and show progress
 */

import { Scenes, Markup } from 'telegraf';
import api from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply, replyHTML as cleanReplyHTML } from '../utils/cleanReply.js';

const migrateChannelScene = new Scenes.WizardScene(
  'migrate_channel',
  
  // Step 1: Check eligibility and confirmation
  async (ctx) => {
    try {
      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: '❌ Магазин не найден. Вернитесь в главное меню.' });
        return ctx.scene.leave();
      }

      // Check eligibility via API
      const token = ctx.session.token;
      const response = await api.get(`/shops/${shopId}/migration/check`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.data.eligible) {
        const { error, message } = response.data;
        
        let errorMessage = '❌ Миграция канала недоступна.\n\n';
        
        if (error === 'UPGRADE_REQUIRED') {
          errorMessage += '💎 Это функция для PRO подписчиков.\n\n';
          errorMessage += 'Подключите PRO при создании магазина (+$10) чтобы получить:\n';
          errorMessage += '• Безлимитные подписки на магазины\n';
          errorMessage += '• Рассылка при смене канала (2 раза/месяц)\n';
        } else if (error === 'LIMIT_EXCEEDED') {
          errorMessage += message;
        } else {
          errorMessage += message || 'Неизвестная ошибка.';
        }

        await cleanReply(ctx, errorMessage, Markup.inlineKeyboard([
          [Markup.button.callback('◀️ Назад', 'seller:main')]
        ]));
        return ctx.scene.leave();
      }

      // Show confirmation with stats
      const { limits, subscriberCount, shop } = response.data;
      
      let confirmMessage = `⚠️ <b>Миграция Telegram канала</b>\n\n`;
      confirmMessage += `📊 <b>Статистика:</b>\n`;
      confirmMessage += `• Магазин: ${shop.name}\n`;
      confirmMessage += `• Подписчиков: ${subscriberCount}\n`;
      confirmMessage += `• Использовано рассылок: ${limits.used}/${limits.limit} в этом месяце\n`;
      confirmMessage += `• Осталось: ${limits.remaining}\n\n`;
      
      confirmMessage += `📅 Следующий сброс: ${new Date(limits.resetDate).toLocaleDateString('ru-RU')}\n\n`;
      
      confirmMessage += `<b>Как это работает:</b>\n`;
      confirmMessage += `1. Вы укажете новый канал\n`;
      confirmMessage += `2. Всем ${subscriberCount} подписчикам придёт уведомление\n`;
      confirmMessage += `3. Рассылка займёт ~${Math.ceil(subscriberCount * 0.1)} секунд\n\n`;
      
      confirmMessage += `Продолжить?`;

      await cleanReplyHTML(
        ctx,
        confirmMessage,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Продолжить', 'migration:proceed')],
          [Markup.button.callback('❌ Отмена', 'seller:main')]
        ])
      );

      // Save data for next step
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.shopName = shop.name;
      ctx.wizard.state.subscriberCount = subscriberCount;

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[MigrateChannel] Step 1 error:', error);
      
      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(ctx, `❌ Ошибка проверки: ${errorMsg}`, Markup.inlineKeyboard([
        [Markup.button.callback('◀️ Назад', 'seller:main')]
      ]));
      
      return ctx.scene.leave();
    }
  },

  // Step 2: Enter new channel URL
  async (ctx) => {
    // Handle callback from confirmation
    if (ctx.callbackQuery?.data === 'migration:proceed') {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        '📝 Отлично! Теперь отправьте ссылку на <b>новый канал</b>.\n\n' +
        'Формат: https://t.me/your_new_channel\n\n' +
        'Или просто отправьте @username канала',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Отмена', 'seller:main')]
          ])
        }
      );
      return;
    }

    // Cancel button
    if (ctx.callbackQuery?.data === 'seller:main') {
      await ctx.answerCbQuery('Миграция отменена');
      return ctx.scene.leave();
    }

    // Handle text input (new channel URL)
    if (!ctx.message?.text) {
      await smartMessage.send(ctx, { text: '❌ Пожалуйста, отправьте ссылку на канал текстом.' });
      return;
    }

    const newChannelUrl = ctx.message.text.trim();

    // Basic validation
    if (!newChannelUrl.includes('t.me/') && !newChannelUrl.startsWith('@')) {
      await smartMessage.send(ctx, { text: '❌ Некорректная ссылка. Используйте формат:\n• https://t.me/channel\n• @channel' });
      return;
    }

    // Save new channel URL
    ctx.wizard.state.newChannelUrl = newChannelUrl;

    // Ask if there was an old channel
    await cleanReply(
      '📌 Хотите указать старую ссылку на канал? (опционально)\n\n' +
      'Это будет упомянуто в уведомлении подписчикам.\n\n' +
      'Отправьте старую ссылку или нажмите "Пропустить"',
      Markup.inlineKeyboard([
        [Markup.button.callback('⏭ Пропустить', 'migration:skip_old')],
        [Markup.button.callback('❌ Отмена', 'seller:main')]
      ])
    );

    return ctx.wizard.next();
  },

  // Step 3: Handle old URL (optional) and start broadcast
  async (ctx) => {
    let oldChannelUrl = null;

    // Handle skip button
    if (ctx.callbackQuery?.data === 'migration:skip_old') {
      await ctx.answerCbQuery();
      oldChannelUrl = null;
    } 
    // Handle cancel
    else if (ctx.callbackQuery?.data === 'seller:main') {
      await ctx.answerCbQuery('Миграция отменена');
      return ctx.scene.leave();
    }
    // Handle text input (old channel URL)
    else if (ctx.message?.text) {
      oldChannelUrl = ctx.message.text.trim();

      // Basic validation
      if (!oldChannelUrl.includes('t.me/') && !oldChannelUrl.startsWith('@')) {
        await smartMessage.send(ctx, { text: '❌ Некорректная ссылка. Нажмите "Пропустить" если не хотите указывать старый канал.' });
        return;
      }
    } else {
      return; // Waiting for input
    }

    try {
      // Show loading message
      const loadingMsg = await smartMessage.send(ctx, { text: '⏳ Запускаю рассылку...' });

      const { shopId, shopName, newChannelUrl, subscriberCount } = ctx.wizard.state;
      const token = ctx.session.token;

      // Initiate broadcast via API (non-blocking)
      const migrationResponse = await api.post(
        `/shops/${shopId}/migration`,
        {
          newChannelUrl,
          oldChannelUrl: oldChannelUrl || undefined
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const { estimatedDuration, message } = migrationResponse.data;

      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

      // Show success message
      await cleanReplyHTML(
        ctx,
        `✅ <b>Рассылка запущена!</b>\n\n` +
        `📊 Подписчиков: ${subscriberCount}\n` +
        `⏱ Примерное время: ~${estimatedDuration} сек\n\n` +
        `📢 Новый канал: ${newChannelUrl}\n\n` +
        `Все подписчики получат уведомление в течение нескольких минут.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('◀️ В главное меню', 'seller:main')]
        ])
      );

      logger.info(`[MigrateChannel] Broadcast initiated for shop ${shopId}, ${subscriberCount} subscribers, ~${estimatedDuration}s`);

      return ctx.scene.leave();
    } catch (error) {
      logger.error('[MigrateChannel] Broadcast error:', error);
      
      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(
        ctx,
        `❌ Ошибка при рассылке: ${errorMsg}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('◀️ Назад', 'seller:main')]
        ])
      );
      
      return ctx.scene.leave();
    }
  }
);

// Leave handler
migrateChannelScene.leave(async (ctx) => {
  ctx.wizard.state = {};
  logger.info('[MigrateChannel] Scene left');
});

export default migrateChannelScene;
