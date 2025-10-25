/**
 * Upgrade Shop Scene
 * 
 * Multi-step wizard for upgrading from BASIC to PRO tier
 * 
 * Steps:
 * 1. Show current subscription and upgrade cost (prorated)
 * 2. Select cryptocurrency
 * 3. Show payment address and amount
 * 4. User sends tx_hash
 * 5. Verify payment and upgrade subscription
 */

import { Scenes, Markup } from 'telegraf';
import api from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply, replyHTML as cleanReplyHTML } from '../utils/cleanReply.js';

// Crypto payment addresses (should match backend)
const PAYMENT_ADDRESSES = {
  BTC: process.env.BTC_PAYMENT_ADDRESS || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  ETH: process.env.ETH_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  USDT: process.env.USDT_PAYMENT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  LTC: process.env.LTC_PAYMENT_ADDRESS || 'LTC1A2B3C4D5E6F7G8H9J0K1L2M3N4P5Q6R'
};

const upgradeShopScene = new Scenes.WizardScene(
  'upgrade_shop',
  
  // Step 1: Show current subscription and upgrade cost
  async (ctx) => {
    try {
      const shopId = ctx.session.shopId;

      if (!shopId) {
        await smartMessage.send(ctx, { text: '❌ Магазин не найден.' });
        return ctx.scene.leave();
      }

      const token = ctx.session.token;

      // Get current subscription status
      const statusResponse = await api.get(`/subscriptions/status/${shopId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { subscription, shop } = statusResponse.data;

      // Check if already PRO
      if (subscription?.tier === 'pro') {
        await cleanReply(
          '✅ Ваш магазин уже на тарифе PRO 💎',
          Markup.inlineKeyboard([
            [Markup.button.callback('◀️ Назад', 'seller:main')]
          ])
        );
        return ctx.scene.leave();
      }

      // Check if has active BASIC subscription
      if (!subscription || subscription.tier !== 'basic' || subscription.status !== 'active') {
        await cleanReply(
          '❌ Апгрейд доступен только для активных BASIC подписок.\n\n' +
          'Сначала оплатите базовую подписку.',
          Markup.inlineKeyboard([
            [Markup.button.callback('💳 Оплатить подписку', 'subscription:pay')],
            [Markup.button.callback('◀️ Назад', 'seller:main')]
          ])
        );
        return ctx.scene.leave();
      }

      // Get upgrade cost
      const costResponse = await api.get(`/subscriptions/upgrade-cost/${shopId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { upgradeCost, remainingDays, periodEnd } = costResponse.data;

      let message = `💎 <b>Апгрейд на PRO</b>\n\n`;
      message += `🏪 Магазин: ${shop.name}\n\n`;
      message += `📊 <b>Текущая подписка:</b>\n`;
      message += `• Тариф: BASIC\n`;
      message += `• Действует до: ${new Date(periodEnd).toLocaleDateString('ru-RU')}\n`;
      message += `• Осталось дней: ${remainingDays}\n\n`;
      message += `💰 <b>Стоимость апгрейда:</b>\n`;
      message += `<b>$${upgradeCost.toFixed(2)}</b> (пропорционально)\n\n`;
      message += `🎁 <b>Вы получите:</b>\n`;
      message += `• Безлимитные подписчики\n`;
      message += `• Рассылка при смене канала (2/мес)\n`;
      message += `• Приоритетная поддержка\n\n`;
      message += `Продолжить апгрейд?`;

      await cleanReplyHTML(
        ctx,
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Продолжить', 'upgrade:confirm')],
          [Markup.button.callback('❌ Отмена', 'seller:main')]
        ])
      );

      // Save data for next steps
      ctx.wizard.state.shopId = shopId;
      ctx.wizard.state.shopName = shop.name;
      ctx.wizard.state.upgradeCost = upgradeCost;
      ctx.wizard.state.remainingDays = remainingDays;

      return ctx.wizard.next();
    } catch (error) {
      logger.error('[UpgradeShop] Step 1 error:', error);
      
      const errorMsg = error.response?.data?.error || error.message;
      await cleanReply(ctx, `❌ Ошибка: ${errorMsg}`, Markup.inlineKeyboard([
        [Markup.button.callback('◀️ Назад', 'seller:main')]
      ]));
      
      return ctx.scene.leave();
    }
  },

  // Step 2: Handle confirmation and show crypto options
  async (ctx) => {
    if (!ctx.callbackQuery) {
      return;
    }

    const data = ctx.callbackQuery.data;

    // Handle cancel
    if (data === 'seller:main') {
      await ctx.answerCbQuery('Апгрейд отменён');
      return ctx.scene.leave();
    }

    if (data !== 'upgrade:confirm') {
      await ctx.answerCbQuery('❌ Неверный выбор');
      return;
    }

    await ctx.answerCbQuery();

    const { upgradeCost } = ctx.wizard.state;

    let message = `💎 <b>Апгрейд на PRO</b>\n\n`;
    message += `💵 Сумма: $${upgradeCost.toFixed(2)}\n\n`;
    message += `Выберите криптовалюту для оплаты:`;

    await ctx.editMessageText(
      message,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('₿ Bitcoin (BTC)', 'upgrade:crypto:BTC')],
          [Markup.button.callback('Ξ Ethereum (ETH)', 'upgrade:crypto:ETH')],
          [Markup.button.callback('💵 USDT (TRC-20)', 'upgrade:crypto:USDT')],
          [Markup.button.callback('Ł Litecoin (LTC)', 'upgrade:crypto:LTC')],
          [Markup.button.callback('◀️ Назад', 'upgrade:back')],
          [Markup.button.callback('❌ Отмена', 'seller:main')]
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
    if (data === 'upgrade:back') {
      await ctx.answerCbQuery();
      return ctx.wizard.back();
    }

    // Handle cancel
    if (data === 'seller:main') {
      await ctx.answerCbQuery('Апгрейд отменён');
      return ctx.scene.leave();
    }

    // Parse crypto selection
    if (!data.startsWith('upgrade:crypto:')) {
      await ctx.answerCbQuery('❌ Неверный выбор');
      return;
    }

    const currency = data.replace('upgrade:crypto:', '');
    if (!['BTC', 'ETH', 'USDT', 'LTC'].includes(currency)) {
      await ctx.answerCbQuery('❌ Неверная криптовалюта');
      return;
    }

    await ctx.answerCbQuery();

    const { upgradeCost } = ctx.wizard.state;
    const paymentAddress = PAYMENT_ADDRESSES[currency];

    ctx.wizard.state.currency = currency;
    ctx.wizard.state.paymentAddress = paymentAddress;

    let message = `💳 <b>Детали оплаты апгрейда</b>\n\n`;
    message += `💎 Апгрейд: BASIC → PRO\n`;
    message += `💵 Сумма: $${upgradeCost.toFixed(2)}\n`;
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

  // Step 4: Handle tx_hash and verify upgrade payment
  async (ctx) => {
    // Handle cancel button
    if (ctx.callbackQuery?.data === 'seller:main') {
      await ctx.answerCbQuery('Апгрейд отменён');
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
      const loadingMsg = await smartMessage.send(ctx, { text: '⏳ Проверяем транзакцию и выполняем апгрейд...\n\nЭто может занять до 30 секунд.' });

      const { shopId, currency, paymentAddress } = ctx.wizard.state;
      const token = ctx.session.token;

      // Verify and upgrade via backend
      const upgradeResponse = await api.post(
        '/subscriptions/upgrade',
        {
          shopId,
          txHash,
          currency,
          paymentAddress
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const { subscription, upgradedAmount, message } = upgradeResponse.data;

      // Delete loading message
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

      // Show success
      let successMessage = `🎉 <b>Апгрейд выполнен успешно!</b>\n\n`;
      successMessage += `💎 Новый тариф: PRO\n`;
      successMessage += `💵 Оплачено: $${upgradedAmount.toFixed(2)}\n`;
      successMessage += `📅 Действует до: ${new Date(subscription.periodEnd).toLocaleDateString('ru-RU')}\n\n`;
      successMessage += `✨ <b>Активированные функции:</b>\n`;
      successMessage += `• ♾ Безлимитные подписчики\n`;
      successMessage += `• 📢 Рассылка при смене канала (2/мес)\n`;
      successMessage += `• ⭐️ Приоритетная поддержка\n\n`;
      successMessage += `Спасибо! Ваш магазин теперь PRO 💎`;

      await cleanReplyHTML(
        ctx,
        successMessage,
        Markup.inlineKeyboard([
          [Markup.button.callback('◀️ В главное меню', 'seller:main')]
        ])
      );

      logger.info(`[UpgradeShop] Upgrade successful: shop ${shopId}, tx ${txHash}, amount $${upgradedAmount}`);

      return ctx.scene.leave();
    } catch (error) {
      logger.error('[UpgradeShop] Upgrade verification error:', error);
      
      let errorMessage = '❌ <b>Ошибка апгрейда</b>\n\n';
      
      const errorData = error.response?.data;
      if (errorData?.error === 'NOT_FREE_TIER' || errorData?.error === 'NOT_BASIC_TIER') {
        errorMessage += '⚠️ Апгрейд доступен только для BASIC тарифа.\n\n';
        errorMessage += 'Ваша текущая подписка не подходит для апгрейда.';
      } else if (errorData?.error === 'DUPLICATE_TX_HASH') {
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

      await cleanReplyHTML(
        ctx,
        errorMessage,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Попробовать снова', 'upgrade:retry')],
          [Markup.button.callback('❌ Отмена', 'seller:main')]
        ])
      );

      return; // Stay in this step for retry
    }
  }
);

// Leave handler
upgradeShopScene.leave(async (ctx) => {
  ctx.wizard.state = {};
  logger.info('[UpgradeShop] Scene left');
});

export default upgradeShopScene;
