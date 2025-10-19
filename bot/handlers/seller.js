import {
  getShopByOwner,
  createShop,
  generateBitcoinAddress,
  verifyPayment
} from '../utils/api.js';
import {
  sellerMenuKeyboard,
  shopManagementKeyboard,
  paymentInstructionsKeyboard,
  verifyPaymentKeyboard,
  backToSellerMenuKeyboard
} from '../keyboards/sellerMenu.js';

// Show seller menu
export async function handleSellerMenu(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Check if seller has a shop
    const shopResult = await getShopByOwner(telegramId);

    if (shopResult.success && shopResult.data) {
      // Seller has a shop
      const shop = shopResult.data;
      ctx.session.shopId = shop.id;

      await ctx.editMessageText(
        `💼 Меню продавца\n\n` +
        `🏪 Ваш магазин: ${shop.name}\n` +
        `📊 Статус: ${shop.isActive ? '✅ Активен' : '⏸ Неактивен'}\n\n` +
        `Выберите действие:`,
        sellerMenuKeyboard()
      );
    } else {
      // Seller doesn't have a shop yet
      await ctx.editMessageText(
        `💼 Меню продавца\n\n` +
        `У вас еще нет магазина.\n\n` +
        `Для создания магазина требуется:\n` +
        `💰 Оплата: $25 в Bitcoin\n\n` +
        `Хотите создать магазин?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Создать магазин', callback_data: 'create_shop_start' }],
              [{ text: '⬅️ Назад', callback_data: 'back_to_main' }],
            ],
          },
        }
      );
    }
  } catch (error) {
    console.error('Error in handleSellerMenu:', error);
    await ctx.reply('❌ Ошибка при загрузке меню продавца.');
  }
}

// Start shop creation process
export async function handleCreateShopStart(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Generate Bitcoin address for payment
    const addressResult = await generateBitcoinAddress(telegramId);

    if (addressResult.success) {
      const { address, amount } = addressResult.data;

      // Store payment info in session
      ctx.session.state = 'awaiting_payment';
      ctx.session.data = {
        bitcoinAddress: address,
        paymentAmount: amount,
      };

      await ctx.editMessageText(
        `💳 Оплата создания магазина\n\n` +
        `Стоимость: $${amount}\n\n` +
        `📍 Bitcoin адрес для оплаты:\n` +
        `\`${address}\`\n\n` +
        `⚠️ Важно:\n` +
        `1. Отправьте точную сумму на указанный адрес\n` +
        `2. Дождитесь подтверждения транзакции\n` +
        `3. После оплаты нажмите "Я оплатил"\n\n` +
        `Ваш магазин будет создан после подтверждения платежа.`,
        {
          parse_mode: 'Markdown',
          ...paymentInstructionsKeyboard()
        }
      );
    } else {
      await ctx.editMessageText(
        `❌ Ошибка генерации Bitcoin адреса: ${addressResult.error}\n\n` +
        `Пожалуйста, попробуйте позже.`,
        backToSellerMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleCreateShopStart:', error);
    await ctx.reply('❌ Ошибка при создании магазина.');
  }
}

// Handle payment confirmation button
export async function handlePaymentConfirm(ctx) {
  try {
    await ctx.answerCbQuery();

    // Check if user is in payment state
    if (ctx.session.state !== 'awaiting_payment') {
      await ctx.reply('❌ Сессия оплаты истекла. Начните заново.');
      return;
    }

    ctx.session.state = 'awaiting_payment_hash';

    await ctx.editMessageText(
      `✅ Отлично!\n\n` +
      `Теперь отправьте хэш транзакции (Transaction Hash) для проверки.\n\n` +
      `Хэш транзакции можно найти в вашем Bitcoin кошельке или blockchain explorer.\n\n` +
      `Пример: \`a1b2c3d4e5f6...\``,
      {
        parse_mode: 'Markdown',
        ...verifyPaymentKeyboard()
      }
    );
  } catch (error) {
    console.error('Error in handlePaymentConfirm:', error);
    await ctx.reply('❌ Ошибка при подтверждении оплаты.');
  }
}

// Handle payment hash input
export async function handlePaymentHashInput(ctx) {
  try {
    if (ctx.session.state !== 'awaiting_payment_hash') {
      return;
    }

    const paymentHash = ctx.message.text.trim();

    // Validate hash format (basic check)
    if (paymentHash.length < 10) {
      await ctx.reply(
        '❌ Неверный формат хэша транзакции.\n\n' +
        'Хэш должен быть длинным буквенно-цифровым кодом.\n\n' +
        'Попробуйте еще раз.'
      );
      return;
    }

    // Store hash in session
    ctx.session.data.paymentHash = paymentHash;

    await ctx.reply(
      `⏳ Проверяем платеж...\n\n` +
      `Это может занять несколько секунд.`
    );

    // Verify payment
    const verifyResult = await verifyPayment(paymentHash);

    if (verifyResult.success && verifyResult.data.verified) {
      // Payment verified, ask for shop name
      ctx.session.state = 'awaiting_shop_name';

      await ctx.reply(
        `✅ Платеж подтвержден!\n\n` +
        `Теперь введите название вашего магазина:\n\n` +
        `⚠️ Требования:\n` +
        `• Минимум 3 символа\n` +
        `• Максимум 50 символов\n` +
        `• Только буквы, цифры, пробелы`
      );
    } else {
      await ctx.reply(
        `❌ Платеж не найден или не подтвержден.\n\n` +
        `Возможные причины:\n` +
        `• Транзакция еще не подтверждена в сети\n` +
        `• Неверный хэш транзакции\n` +
        `• Неверная сумма\n\n` +
        `Попробуйте еще раз через несколько минут.`,
        verifyPaymentKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handlePaymentHashInput:', error);
    await ctx.reply('❌ Ошибка при проверке платежа.');
  }
}

// Handle shop name input
export async function handleShopNameInput(ctx) {
  try {
    if (ctx.session.state !== 'awaiting_shop_name') {
      return;
    }

    const shopName = ctx.message.text.trim();

    // Validate shop name
    if (shopName.length < 3) {
      await ctx.reply('❌ Название слишком короткое. Минимум 3 символа.');
      return;
    }

    if (shopName.length > 50) {
      await ctx.reply('❌ Название слишком длинное. Максимум 50 символов.');
      return;
    }

    // Check for valid characters
    const validName = /^[a-zA-Zа-яА-Я0-9\s]+$/.test(shopName);
    if (!validName) {
      await ctx.reply('❌ Название содержит недопустимые символы. Используйте только буквы, цифры и пробелы.');
      return;
    }

    await ctx.reply('⏳ Создаем ваш магазин...');

    // Create shop
    const telegramId = ctx.from.id;
    const paymentHash = ctx.session.data.paymentHash;

    const shopResult = await createShop(telegramId, shopName, paymentHash);

    if (shopResult.success) {
      const shop = shopResult.data;

      // Clear session state
      ctx.session.state = null;
      ctx.session.data = {};
      ctx.session.shopId = shop.id;

      await ctx.reply(
        `🎉 Поздравляем! Ваш магазин создан!\n\n` +
        `🏪 Название: ${shop.name}\n` +
        `📊 Статус: Активен\n\n` +
        `Теперь вы можете:\n` +
        `• Добавлять товары\n` +
        `• Получать заказы\n` +
        `• Управлять магазином\n\n` +
        `Начните с добавления первого товара!`,
        sellerMenuKeyboard()
      );
    } else {
      await ctx.reply(
        `❌ Ошибка создания магазина: ${shopResult.error}\n\n` +
        `Пожалуйста, обратитесь в поддержку.`,
        backToSellerMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleShopNameInput:', error);
    await ctx.reply('❌ Ошибка при создании магазина.');
  }
}

// Cancel shop creation
export async function handleCancelShopCreation(ctx) {
  try {
    await ctx.answerCbQuery();

    // Clear session
    ctx.session.state = null;
    ctx.session.data = {};

    await ctx.editMessageText(
      '❌ Создание магазина отменено.\n\n' +
      'Вы можете создать магазин позже.',
      backToSellerMenuKeyboard()
    );
  } catch (error) {
    console.error('Error in handleCancelShopCreation:', error);
    await ctx.reply('Создание магазина отменено.');
  }
}

// Show my shop
export async function handleMyShop(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const shopResult = await getShopByOwner(telegramId);

    if (shopResult.success && shopResult.data) {
      const shop = shopResult.data;

      await ctx.editMessageText(
        `🏪 Мой магазин\n\n` +
        `📛 Название: ${shop.name}\n` +
        `📊 Статус: ${shop.isActive ? '✅ Активен' : '⏸ Неактивен'}\n` +
        `📦 Товаров: ${shop.productsCount || 0}\n` +
        `🛍 Заказов: ${shop.ordersCount || 0}\n` +
        `⭐️ Подписчиков: ${shop.subscribersCount || 0}\n\n` +
        `Выберите действие:`,
        shopManagementKeyboard(shop.id)
      );
    } else {
      await ctx.editMessageText(
        '❌ Магазин не найден.',
        backToSellerMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleMyShop:', error);
    await ctx.reply('❌ Ошибка при загрузке магазина.');
  }
}

// Handle verify payment button
export async function handleVerifyPaymentButton(ctx) {
  try {
    await ctx.answerCbQuery('Отправьте хэш транзакции в чат');
  } catch (error) {
    console.error('Error in handleVerifyPaymentButton:', error);
  }
}
