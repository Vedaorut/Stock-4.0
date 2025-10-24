import { Scenes, Markup } from 'telegraf';
import { successButtons } from '../keyboards/common.js';
import { sellerMenu, sellerToolsMenu } from '../keyboards/seller.js';
import { walletApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import { validateCryptoAddress, detectCryptoType } from '../utils/validation.js';
import * as messageCleanup from '../utils/messageCleanup.js';
import * as smartMessage from '../utils/smartMessage.js';

/**
 * Manage Wallets Scene - Redesigned with logical flow
 * 
 * STATE 0 (no wallets): Show "Send wallet address" + [Назад]
 * STATE 1 (has wallets): Show wallet buttons + "Send to add more" + [Назад]
 * STATE 2 (wallet detail): Show QR/Edit/Delete/Back options
 */

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get emoji for cryptocurrency
 */
function getEmoji(crypto) {
  const emojis = {
    BTC: '₿',
    ETH: '⟠',
    USDT: '💲',
    TON: '💎'
  };
  return emojis[crypto] || '💰';
}

/**
 * Format wallet address for display (short version)
 */
function formatAddress(address) {
  if (!address || address === 'не указан') return null;
  if (address.length > 15) {
    return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
  }
  return address;
}

/**
 * Format wallets list as text
 */
function formatWalletsList(wallets) {
  const list = [];
  Object.entries(wallets).forEach(([crypto, address]) => {
    if (address) {
      const formatted = formatAddress(address);
      list.push(`${getEmoji(crypto)} ${crypto}: ${formatted}`);
    }
  });
  return list.length > 0 ? list.join('\n') : '';
}

/**
 * Check if user has any wallets
 */
function hasWallets(wallets) {
  return Object.values(wallets).some(address => address && address !== 'не указан');
}

// ==========================================
// QR CODE HANDLER
// ==========================================

async function showQRCode(ctx, crypto) {
  try {
    await ctx.answerCbQuery();

    // Get wallet address
    const shop = await walletApi.getWallets(ctx.session.shopId, ctx.session.token);
    const address = shop[`wallet_${crypto.toLowerCase()}`];

    if (!address) {
      await ctx.answerCbQuery('Кошелек не найден');
      return;
    }

    logger.info('wallet_qr_request', {
      userId: ctx.from.id,
      crypto,
      addressPrefix: address.substring(0, 10)
    });

    // Generate QR via backend API
    const response = await walletApi.generateQR({
      address,
      amount: 0,
      currency: crypto
    }, ctx.session.token);

    if (!response.success) {
      await ctx.reply('Ошибка генерации QR кода');
      return;
    }

    // Convert data URL to buffer
    const base64Data = response.data.qrCode.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Send QR code as photo
    await ctx.replyWithPhoto(
      { source: buffer },
      {
        caption: `💼 ${crypto} Кошелек\n\n\`${address}\``,
        parse_mode: 'Markdown'
      }
    );

    logger.info('wallet_qr_sent', {
      userId: ctx.from.id,
      crypto
    });

  } catch (error) {
    logger.error('Error showing QR code:', error);
    await ctx.reply('Ошибка отображения QR кода');
  }
}

// ==========================================
// STEP 1: SHOW WALLETS
// ==========================================

const showWallets = async (ctx) => {
  try {
    logger.info('wallet_manage_step:show', { userId: ctx.from.id });

    // Validate session
    if (!ctx.session.shopId) {
      await smartMessage.send(ctx, { text: 'Магазин не найден', keyboard: successButtons });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      await smartMessage.send(ctx, { text: 'Ошибка авторизации', keyboard: successButtons });
      return await ctx.scene.leave();
    }

    // Get current wallets
    const shop = await walletApi.getWallets(ctx.session.shopId, ctx.session.token);

    const wallets = {
      BTC: shop.wallet_btc || null,
      ETH: shop.wallet_eth || null,
      USDT: shop.wallet_usdt || null,
      TON: shop.wallet_ton || null
    };

    // Check if user has any wallets
    if (!hasWallets(wallets)) {
      // STATE 0: No wallets
      await ctx.editMessageText(
        '💳 Кошельки\n\n' +
        'У вас пока нет добавленных кошельков.\n\n' +
        'Отправьте адрес кошелька сюда.\n' +
        'Система автоматически определит тип (BTC/ETH/USDT/TON).',
        Markup.inlineKeyboard([[
          Markup.button.callback('◀️ Назад', 'cancel_scene')
        ]])
      );
    } else {
      // STATE 1: Has wallets
      const buttons = [];

      // Add button for each existing wallet
      Object.entries(wallets).forEach(([crypto, address]) => {
        if (address) {
          buttons.push([
            Markup.button.callback(
              `${getEmoji(crypto)} ${crypto} ${formatAddress(address)}`,
              `wallet:view:${crypto}`
            )
          ]);
        }
      });

      // Add back button
      buttons.push([Markup.button.callback('◀️ Назад', 'cancel_scene')]);

      await ctx.editMessageText(
        '💳 Кошельки\n\n' +
        'Ваши способы оплаты:\n\n' +
        formatWalletsList(wallets) + '\n\n' +
        'Нажмите на кошелек для управления.\n' +
        'Или отправьте новый адрес для добавления.',
        Markup.inlineKeyboard(buttons)
      );
    }

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error showing wallets:', error);
    await smartMessage.send(ctx, { text: 'Ошибка загрузки', keyboard: successButtons });
    return await ctx.scene.leave();
  }
};

// ==========================================
// STEP 2: HANDLE ACTIONS OR TEXT INPUT
// ==========================================

const handleInput = async (ctx) => {
  try {
    // Handle callback query (button click)
    if (ctx.callbackQuery) {
      const action = ctx.callbackQuery.data;

      // Cancel - exit scene
      if (action === 'cancel_scene') {
        await ctx.answerCbQuery();
        return await ctx.scene.leave();
      }

      // View wallet detail
      if (action.startsWith('wallet:view:')) {
        const crypto = action.replace('wallet:view:', '');
        await ctx.answerCbQuery();

        // Get wallet address
        const shop = await walletApi.getWallets(ctx.session.shopId, ctx.session.token);
        const address = shop[`wallet_${crypto.toLowerCase()}`];

        if (!address) {
          await ctx.editMessageText('Кошелек не найден');
          return;
        }

        // STATE 2: Wallet detail menu
        await ctx.editMessageText(
          `${getEmoji(crypto)} ${crypto} Кошелек\n\n` +
          `Адрес:\n\`${address}\`\n\n` +
          'Выберите действие:',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [Markup.button.callback('🔍 QR код', `wallet:qr:${crypto}`)],
                [Markup.button.callback('✏️ Изменить адрес', `wallet:change:${crypto}`)],
                [Markup.button.callback('🗑 Удалить кошелек', `wallet:delete:${crypto}`)],
                [Markup.button.callback('◀️ Назад', 'wallet:back')]
              ]
            }
          }
        );
        return;
      }

      // Show QR code
      if (action.startsWith('wallet:qr:')) {
        const crypto = action.replace('wallet:qr:', '');
        await showQRCode(ctx, crypto);
        return;
      }

      // Change wallet address
      if (action.startsWith('wallet:change:')) {
        const crypto = action.replace('wallet:change:', '');
        await ctx.answerCbQuery();

        ctx.wizard.state.editingWallet = crypto;

        await ctx.editMessageText(
          `Отправьте новый адрес ${crypto} для замены.`,
          Markup.inlineKeyboard([[
            Markup.button.callback('◀️ Назад', 'wallet:back')
          ]])
        );
        return;
      }

      // Delete wallet - show confirmation
      if (action.startsWith('wallet:delete:')) {
        const crypto = action.replace('wallet:delete:', '');
        await ctx.answerCbQuery();

        await ctx.editMessageText(
          `Удалить ${crypto} кошелек?`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Да, удалить', `wallet:delete_confirm:${crypto}`)],
            [Markup.button.callback('◀️ Назад', 'wallet:back')]
          ])
        );
        return;
      }

      // Confirm delete
      if (action.startsWith('wallet:delete_confirm:')) {
        const crypto = action.replace('wallet:delete_confirm:', '');
        await ctx.answerCbQuery();

        // Delete wallet by setting to null
        const walletField = `wallet_${crypto.toLowerCase()}`;
        await walletApi.updateWallets(
          ctx.session.shopId,
          { [walletField]: null },
          ctx.session.token
        );

        logger.info('wallet_deleted', {
          userId: ctx.from.id,
          crypto
        });

        await ctx.editMessageText(`✅ ${crypto} кошелек удален`);

        // Return to wallets list after 1 second
        setTimeout(async () => {
          ctx.wizard.selectStep(0);
          await showWallets(ctx);
        }, 1000);
        return;
      }

      // Back to wallets list
      if (action === 'wallet:back') {
        await ctx.answerCbQuery();
        ctx.wizard.state.editingWallet = null;
        ctx.wizard.selectStep(0);
        await showWallets(ctx);
        return;
      }

      // Unknown action
      await ctx.answerCbQuery('Неизвестная команда');
      return;
    }

    // Handle text input (wallet address)
    if (ctx.message && ctx.message.text) {
      const address = ctx.message.text.trim();

      // Detect crypto type
      const detectedType = detectCryptoType(address);

      if (!detectedType) {
        await smartMessage.send(ctx, {
          text: '❌ Неизвестный формат адреса\n\n' +
            'Поддерживаются:\n' +
            '• BTC (1..., 3..., bc1...)\n' +
            '• ETH (0x...)\n' +
            '• USDT (TR...)\n' +
            '• TON (EQ..., UQ...)'
        });
        return;
      }

      logger.info('wallet_address_detected', {
        userId: ctx.from.id,
        detectedType,
        addressPrefix: address.substring(0, 10)
      });

      // Validate address
      const isValid = validateCryptoAddress(address, detectedType);

      if (!isValid) {
        await smartMessage.send(ctx, { text: `❌ Неверный формат ${detectedType} адреса` });
        return;
      }

      // Check if editing existing wallet or adding new
      const crypto = ctx.wizard.state.editingWallet || detectedType;

      // Prepare wallet data
      const walletField = `wallet_${crypto.toLowerCase()}`;
      const walletData = { [walletField]: address };

      // Save wallet
      await walletApi.updateWallets(
        ctx.session.shopId,
        walletData,
        ctx.session.token
      );

      logger.info('wallet_saved', {
        shopId: ctx.session.shopId,
        crypto,
        userId: ctx.from.id,
        isEdit: !!ctx.wizard.state.editingWallet
      });

      const formatted = formatAddress(address);
      await smartMessage.send(ctx, {
        text: `✅ ${crypto} кошелек ${ctx.wizard.state.editingWallet ? 'обновлен' : 'добавлен'}\n\n${formatted}`
      });

      // Clear editing state
      ctx.wizard.state.editingWallet = null;

      // Refresh wallets view
      setTimeout(async () => {
        ctx.wizard.selectStep(0);
        await showWallets(ctx);
      }, 1000);
      return;
    }

    // No input
    await smartMessage.send(ctx, { text: 'Используйте кнопки или отправьте адрес кошелька' });

  } catch (error) {
    logger.error('Error in handleInput:', error);
    await smartMessage.send(ctx, { text: 'Ошибка. Попробуйте позже', keyboard: successButtons });
    return await ctx.scene.leave();
  }
};

// ==========================================
// CREATE WIZARD SCENE
// ==========================================

const manageWalletsScene = new Scenes.WizardScene(
  'manageWallets',
  showWallets,
  handleInput
);

// Handle scene leave
manageWalletsScene.leave(async (ctx) => {
  // Cleanup wizard messages (keep final message)
  await messageCleanup.cleanupWizard(ctx, {
    keepFinalMessage: true,
    keepWelcome: true
  });

  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left manageWallets scene`);
});

// Handle cancel action within scene
manageWalletsScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('wallet_manage_cancelled', { userId: ctx.from.id });

    // FIX BUG #3: Return to tools menu (parent), not main menu
    await ctx.editMessageText(
      '🔧 <b>Инструменты магазина</b>\n\nДополнительные функции для управления:',
      { parse_mode: 'HTML', ...sellerToolsMenu(true) }
    );

    await ctx.scene.leave();
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.editMessageText('Произошла ошибка', successButtons);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default manageWalletsScene;
