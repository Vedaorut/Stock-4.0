/**
 * Pay Subscription Scene
 * 
 * Multi-step wizard for paying monthly shop subscription
 * 
 * Steps:
 * 1. Show pricing and select tier (free $25 or pro $35)
 * 2. Select cryptocurrency
 * 3. Show payment address and amount
 * 4. User sends tx_hash
 * 5. Verify payment and activate subscription
 */

import { Scenes, Markup } from 'telegraf';
import api from '../utils/api.js';
import logger from '../utils/logger.js';
import * as messageCleanup from '../utils/messageCleanup.js';
import * as smartMessage from '../utils/smartMessage.js';

// Crypto payment addresses (should match backend)
const PAYMENT_ADDRESSES = {
  BTC: process.env.BTC_PAYMENT_ADDRESS || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  ETH: process.env.ETH_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  USDT: process.env.USDT_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  TON: process.env.TON_PAYMENT_ADDRESS || 'EQD...'
};

const paySubscriptionScene = new Scenes.WizardScene(
  'pay_subscription',
  
  // Step 1: Show pricing and tier selection
  async (ctx) => {
    try {
      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: '❌ Магазин не найден. Создайте магазин сначала.' });
        return ctx.scene.leave();
      }

      // Get current subscription status
      const token = ctx.session.token;
      const statusResponse = await api.get(`/subscriptions/status/${shopId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { subscription, shop } = statusResponse.data;

      let message = `💳 <b>Оплата подписки магазина</b>\n\n`;
      message += `🏪 Магазин: ${shop.name}\n\n`;

      // Show current status
      if (subscription) {
        message += `📊 <b>Текущая подписка:</b>\n`;
        message += `• Тариф: ${subscription.tier === 'pro' ? 'PRO 💎' : 'FREE'}\n`;
        message += `• Статус: ${subscription.status}\n`;
        message += `• Действует до: ${new Date(subscription.periodEnd).toLocaleDateString('ru-RU')}\n\n`;
      } else {
        message += `⚠️ Нет активной подписки\n\n`;
      }

      // Show pricing
      message += `💰 <b>Тарифы (ежемесячно):</b>\n\n`;
      message += `<b>FREE</b> - $25/месяц\n`;
      message += `• Безлимитные товары\n`;
      message += `• Базовая поддержка\n`;
      message += `• Заказы и платежи\n\n`;
      
      message += `<b>PRO 💎</b> - $35/месяц\n`;
      message += `• Всё из FREE\n`;
      message += `• Безлимитные подписчики\n`;
      message += `• Рассылка при смене канала (2/мес)\n`;
      message += `• Приоритетная поддержка\n\n`;
      
      message += `Выберите тариф для оплаты:`;

      await ctx.replyWithHTML(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback('FREE - $25', 'subscription:tier:free')],
          [Markup.button.callback('PRO 💎 - $35', 'subscription:tier:pro')],
          [Markup.button.callback('❌ Отмена', 'seller:main')]
        ])
      );

      // Save shop info for next steps
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.shopName = shop.name;

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[PaySubscription] Step 1 error:', error);
      
      const errorMsg = error.response?.data?.error || error.message;
      await ctx.reply(`❌ Ошибка: ${errorMsg}`, Markup.inlineKeyboard([
        [Markup.button.callback('◀️ Назад', 'seller:main')]
      ]));
      
      return ctx.scene.leave();
    }
  },

  // Step 2: Handle tier selection and show crypto options
  async (ctx) => {
    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:main') {
      await ctx.answerCbQuery('Оплата отменена');
      return ctx.scene.leave();
    }

    // Parse tier selection
    if (!data.startsWith('subscription:tier:')) {
      await ctx.answerCbQuery('❌ Неверный выбор');
      return;
    }

    const tier = data.replace('subscription:tier:', '');
    if (tier !== 'free' && tier !== 'pro') {
      await ctx.answerCbQuery('❌ Неверный тариф');
      return;
    }

    await ctx.answerCbQuery();

    const amount = tier === 'pro' ? 35 : 25;
    ctx.wizard.state.tier = tier;
    ctx.wizard.state.amount = amount;

    let message = `💎 <b>Выбран тариф: ${tier.toUpperCase()}</b>\n\n`;
    message += `💵 Сумма: $${amount}\n\n`;
    message += `Выберите криптовалюту для оплаты:`;

    await ctx.editMessageText(
      message,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('₿ Bitcoin (BTC)', 'subscription:crypto:BTC')],
          [Markup.button.callback('Ξ Ethereum (ETH)', 'subscription:crypto:ETH')],
          [Markup.button.callback('💵 USDT (ERC-20)', 'subscription:crypto:USDT')],
          [Markup.button.callback('💎 TON', 'subscription:crypto:TON')],
          [Markup.button.callback('◀️ Назад', 'subscription:back')]
        ])
      }
    );

    return ctx.wizard.next();
  },

  // Step 3: Handle crypto selection and show payment address
  async (ctx) => {
    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle back
    if (data === 'subscription:back') {
      await ctx.answerCbQuery();
      return ctx.wizard.back();
    }

    // Handle cancel
    if (data === 'seller:main') {
      await ctx.answerCbQuery('Оплата отменена');
      return ctx.scene.leave();
    }

    // Parse crypto selection
    if (!data.startsWith('subscription:crypto:')) {
      await ctx.answerCbQuery('❌ Неверный выбор');
      return;
    }

    const currency = data.replace('subscription:crypto:', '');
    if (!['BTC', 'ETH', 'USDT', 'TON'].includes(currency)) {
      await ctx.answerCbQuery('❌ Неверная криптовалюта');
      return;
    }

    await ctx.answerCbQuery();

    const { tier, amount } = ctx.wizard.state;
    const paymentAddress = PAYMENT_ADDRESSES[currency];

    ctx.wizard.state.currency = currency;
    ctx.wizard.state.paymentAddress = paymentAddress;

    let message = `💳 <b>Детали оплаты</b>\n\n`;
    message += `💎 Тариф: ${tier.toUpperCase()}\n`;
    message += `💵 Сумма: $${amount}\n`;
    message += `🪙 Криптовалюта: ${currency}\n\n`;
    message += `📬 <b>Адрес для оплаты:</b>\n`;
    message += `<code>${paymentAddress}</code>\n\n`;
    message += `⚠️ <b>Важно:</b>\n`;
    message += `1. Отправьте точную сумму в ${currency}\n`;
    message += `2. После оплаты скопируйте Transaction Hash (TX Hash)\n`;
    message += `3. Отправьте его следующим сообщением\n\n`;
    message += `📝 Отправьте TX Hash для верификации:`;

    await ctx.editMessageText(
      message,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'seller:main')]
        ])
      }
    );

    return ctx.wizard.next();
  },

  // Step 4: Handle tx_hash and verify payment
  async (ctx) => {
    // Handle cancel button
    if (ctx.callbackQuery?.data === 'seller:main') {
      await ctx.answerCbQuery('Оплата отменена');
      return ctx.scene.leave();
    }

    // Wait for text message with tx_hash
    if (!ctx.message?.text) {
      await smartMessage.send(ctx, { text: '❌ Пожалуйста, отправьте Transaction Hash текстом.' });
      return;
    }

    const txHash = ctx.message.text.trim();

    // Basic validation
    if (txHash.length < 10) {
      await smartMessage.send(ctx, { text: '❌ TX Hash слишком короткий. Проверьте и отправьте снова.' });
      return;
    }

    try {
      const loadingMsg = await smartMessage.send(ctx, { text: '⏳ Проверяем транзакцию...\n\nЭто может занять до 30 секунд.' });

      const { shopId, tier, currency, paymentAddress } = ctx.wizard.state;
      const token = ctx.session.token;

      // Verify payment via backend
      const paymentResponse = await api.post(
        '/subscriptions/pay',
        {
          shopId,
          tier,
          txHash,
          currency,
          paymentAddress
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const { subscription, message } = paymentResponse.data;

      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

      // Show success
      let successMessage = `✅ <b>Оплата подтверждена!</b>\n\n`;
      successMessage += `💎 Тариф: ${tier.toUpperCase()}\n`;
      successMessage += `📅 Действует до: ${new Date(subscription.periodEnd).toLocaleDateString('ru-RU')}\n`;
      successMessage += `🆔 ID подписки: ${subscription.id}\n\n`;
      
      if (tier === 'pro') {
        successMessage += `🎉 <b>PRO функции активированы:</b>\n`;
        successMessage += `• Безлимитные подписчики\n`;
        successMessage += `• Рассылка при смене канала (2/мес)\n`;
        successMessage += `• Приоритетная поддержка\n\n`;
      }
      
      successMessage += `Спасибо за оплату! Ваш магазин активен.`;

      await ctx.replyWithHTML(
        successMessage,
        Markup.inlineKeyboard([
          [Markup.button.callback('◀️ В главное меню', 'seller:main')]
        ])
      );

      logger.info(`[PaySubscription] Payment successful: shop ${shopId}, tier ${tier}, tx ${txHash}`);

      return ctx.scene.leave();
    } catch (error) {
      logger.error('[PaySubscription] Payment verification error:', error);
      
      let errorMessage = '❌ <b>Ошибка верификации</b>\n\n';
      
      const errorData = error.response?.data;
      if (errorData?.error === 'DUPLICATE_TX_HASH') {
        errorMessage += '⚠️ Эта транзакция уже была использована.\n\n';
        errorMessage += 'Попробуйте другой TX Hash или создайте новый платёж.';
      } else if (errorData?.error === 'PAYMENT_VERIFICATION_FAILED') {
        errorMessage += '⚠️ Не удалось подтвердить платёж.\n\n';
        errorMessage += 'Возможные причины:\n';
        errorMessage += '• Транзакция ещё не подтверждена в блокчейне\n';
        errorMessage += '• Неверная сумма или адрес\n';
        errorMessage += '• Неверный TX Hash\n\n';
        errorMessage += 'Подождите несколько минут и попробуйте снова.';
      } else {
        errorMessage += errorData?.message || error.message;
      }

      await ctx.replyWithHTML(
        errorMessage,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Попробовать снова', 'subscription:retry')],
          [Markup.button.callback('❌ Отмена', 'seller:main')]
        ])
      );

      return; // Stay in this step for retry
    }
  }
);

// Leave handler
paySubscriptionScene.leave(async (ctx) => {
  // Cleanup wizard messages (keep final message)
  await messageCleanup.cleanupWizard(ctx, {
    keepFinalMessage: true,
    keepWelcome: true
  });

  ctx.wizard.state = {};
  logger.info('[PaySubscription] Scene left');
});

export default paySubscriptionScene;
