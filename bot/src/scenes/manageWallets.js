import { Scenes, Markup } from 'telegraf';
import { cancelButton, successButtons } from '../keyboards/common.js';
import { walletApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import { validateCryptoAddress, getCryptoValidationError } from '../utils/validation.js';

/**
 * Manage Wallets Scene - Multi-step wizard
 * Steps:
 * 1. Show current wallets + select crypto to edit
 * 2. Enter wallet address
 * 3. Confirm and save
 */

// Crypto selection keyboard
const cryptoKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('₿ BTC', 'wallet:btc'),
    Markup.button.callback('Ξ ETH', 'wallet:eth')
  ],
  [
    Markup.button.callback('₮ USDT', 'wallet:usdt'),
    Markup.button.callback('🔷 TON', 'wallet:ton')
  ],
  [Markup.button.callback('« Отменить', 'cancel_scene')]
]);

// Step 1: Show wallets and select crypto
const showWallets = async (ctx) => {
  try {
    logger.info('wallet_manage_step:show', { userId: ctx.from.id });
    
    // Validate session
    if (!ctx.session.shopId) {
      await ctx.reply(
        'Магазин не найден',
        successButtons
      );
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      await ctx.reply(
        'Ошибка авторизации',
        successButtons
      );
      return await ctx.scene.leave();
    }

    // Get current wallets
    const shop = await walletApi.getWallets(ctx.session.shopId, ctx.session.token);

    // Format wallet display
    const btc = shop.wallet_btc || 'не указан';
    const eth = shop.wallet_eth || 'не указан';
    const usdt = shop.wallet_usdt || 'не указан';
    const ton = shop.wallet_ton || 'не указан';

    await ctx.editMessageText(
      `💼 Кошельки\n\n` +
      `₿ BTC: ${btc}\n` +
      `Ξ ETH: ${eth}\n` +
      `₮ USDT: ${usdt}\n` +
      `🔷 TON: ${ton}\n\n` +
      `Выберите криптовалюту:`,
      cryptoKeyboard
    );

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error showing wallets:', error);
    await ctx.reply(
      'Ошибка загрузки',
      successButtons
    );
    return await ctx.scene.leave();
  }
};

// Step 2: Handle crypto selection and enter address
const enterAddress = async (ctx) => {
  try {
    // Handle crypto selection
    if (ctx.callbackQuery) {
      const action = ctx.callbackQuery.data;

      if (action === 'cancel_scene') {
        await ctx.answerCbQuery();
        return await ctx.scene.leave();
      }

      // Extract crypto type
      const cryptoMap = {
        'wallet:btc': 'BTC',
        'wallet:eth': 'ETH',
        'wallet:usdt': 'USDT',
        'wallet:ton': 'TON'
      };

      const crypto = cryptoMap[action];

      if (!crypto) {
        await ctx.answerCbQuery('Неизвестная криптовалюта');
        return;
      }

      await ctx.answerCbQuery();
      ctx.wizard.state.crypto = crypto;

      logger.info('wallet_manage_step:crypto', {
        userId: ctx.from.id,
        crypto: crypto
      });

      const symbols = {
        'BTC': '₿',
        'ETH': 'Ξ',
        'USDT': '₮',
        'TON': '🔷'
      };

      await ctx.reply(
        `${symbols[crypto]} ${crypto} адрес:`,
        cancelButton
      );

      return ctx.wizard.next();
    }
  } catch (error) {
    logger.error('Error in enterAddress step:', error);
    throw error;
  }
};

// Step 3: Save wallet address
const saveWallet = async (ctx) => {
  try {
    // Get wallet address from message
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Отправьте адрес кошелька', cancelButton);
      return;
    }

    const address = ctx.message.text.trim();
    const crypto = ctx.wizard.state.crypto;

    if (!crypto) {
      logger.error('No crypto in wizard state');
      await ctx.reply('Ошибка. Попробуйте снова', successButtons);
      return await ctx.scene.leave();
    }

    // Basic validation
    if (address.length < 10) {
      await ctx.reply('Адрес слишком короткий', cancelButton);
      return;
    }

    // Validate crypto address format
    if (!validateCryptoAddress(address, crypto)) {
      await ctx.reply(
        getCryptoValidationError(crypto),
        cancelButton
      );
      return;
    }

    logger.info('wallet_manage_step:save', {
      userId: ctx.from.id,
      crypto: crypto,
      addressPrefix: address.substring(0, 10)
    });

    await ctx.reply('Сохраняем...');

    // Prepare wallet data
    const walletData = {
      wallet_btc: crypto === 'BTC' ? address : undefined,
      wallet_eth: crypto === 'ETH' ? address : undefined,
      wallet_usdt: crypto === 'USDT' ? address : undefined,
      wallet_ton: crypto === 'TON' ? address : undefined
    };

    // Remove undefined values
    Object.keys(walletData).forEach(key =>
      walletData[key] === undefined && delete walletData[key]
    );

    // Update wallet via backend
    await walletApi.updateWallets(
      ctx.session.shopId,
      walletData,
      ctx.session.token
    );

    logger.info('wallet_updated', {
      shopId: ctx.session.shopId,
      crypto: crypto,
      userId: ctx.from.id
    });

    const symbols = {
      'BTC': '₿',
      'ETH': 'Ξ',
      'USDT': '₮',
      'TON': '🔷'
    };

    await ctx.reply(
      `✓ ${symbols[crypto]} ${crypto}\n${address}`,
      successButtons
    );

    // Leave scene
    return await ctx.scene.leave();
  } catch (error) {
    logger.error('Error saving wallet:', error);
    await ctx.reply(
      'Ошибка. Попробуйте позже',
      successButtons
    );
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const manageWalletsScene = new Scenes.WizardScene(
  'manageWallets',
  showWallets,
  enterAddress,
  saveWallet
);

// Handle scene leave
manageWalletsScene.leave(async (ctx) => {
  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left manageWallets scene`);
});

// Handle cancel action within scene
manageWalletsScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('wallet_manage_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();
    await ctx.reply('Отменено', successButtons);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    // Local error handling - don't throw to avoid infinite spinner
    try {
      await ctx.editMessageText(
        'Произошла ошибка при отмене\n\nПопробуйте позже',
        successButtons
      );
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

export default manageWalletsScene;
