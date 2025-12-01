import { Scenes, Markup } from 'telegraf';
import { successButtons } from '../keyboards/common.js';
import { walletApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import { validateCryptoAddress, detectCryptoType } from '../utils/validation.js';
import * as smartMessage from '../utils/smartMessage.js';
import { reply as cleanReply, replyPhoto as cleanReplyPhoto } from '../utils/cleanReply.js';
import { messages, buttons as buttonText } from '../texts/messages.js';
import { showSellerToolsMenu } from '../utils/sellerNavigation.js';
import { generateQRWithTimeout, getQRErrorMessage } from '../utils/qrHelper.js';

const { seller: sellerMessages, general: generalMessages } = messages;

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

const SUPPORTED_CRYPTOS = ['BTC', 'ETH', 'USDT', 'LTC'];

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
      await ctx.answerCbQuery(sellerMessages.walletsNotFound, { show_alert: true });
      return;
    }

    logger.info('wallet_qr_request', {
      userId: ctx.from.id,
      crypto,
      addressPrefix: address.substring(0, 10),
    });

    // Generate QR via backend API with timeout protection
    const response = await generateQRWithTimeout(
      () =>
        walletApi.generateQR(
          {
            address,
            amount: 0,
            currency: crypto,
          },
          ctx.session.token
        ),
      10000 // 10 second timeout
    );

    if (!response.success) {
      await cleanReply(ctx, sellerMessages.walletsQrError);
      return;
    }

    // Convert data URL to buffer
    const base64Data = response.data.qrCode.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Send QR code as photo
    await cleanReplyPhoto(
      ctx,
      { source: buffer },
      {
        caption: `${crypto} кошелёк\n\n\`${address}\``,
        parse_mode: 'Markdown',
      }
    );

    logger.info('wallet_qr_sent', {
      userId: ctx.from.id,
      crypto,
    });
  } catch (error) {
    logger.error('Error showing QR code:', error);

    // Provide user-friendly error message based on error type
    const errorMessage = getQRErrorMessage(error, sellerMessages.walletsQrError);
    await cleanReply(ctx, errorMessage);
  }
}

// ==========================================
// STEP 1: SHOW WALLETS
// ==========================================

/**
 * Silent version of showWallets - used for refresh after save
 * Doesn't show error message if fails (wallet was already saved)
 */
const showWalletsSilent = async (ctx) => {
  try {
    logger.info('wallet_manage_step:show_silent', { userId: ctx.from.id });

    if (!ctx.session.shopId || !ctx.session.token) {
      return; // Silently fail
    }

    const shop = await walletApi.getWallets(ctx.session.shopId, ctx.session.token);

    const wallets = {
      BTC: shop.wallet_btc || null,
      ETH: shop.wallet_eth || null,
      USDT: shop.wallet_usdt || null,
      LTC: shop.wallet_ltc || null,
    };

    const message = sellerMessages.walletsContext;

    const buttons = SUPPORTED_CRYPTOS.map((crypto) => {
      const address = wallets[crypto];
      const status = address
        ? formatAddress(address) || address
        : sellerMessages.walletsStatusEmpty;
      const action = address ? `wallet:view:${crypto}` : `wallet:add:${crypto}`;
      return [Markup.button.callback(`${crypto} • ${status}`, action)];
    });

    buttons.push([Markup.button.callback(buttonText.backToTools, 'seller:tools')]);

    await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    // Silent fail - don't show error to user, just log it
    logger.warn('Silent wallet refresh failed:', error.message);
    // Don't leave scene, user can tap "Back to wallets" manually
  }
};

const showWallets = async (ctx) => {
  try {
    logger.info('wallet_manage_step:show', { userId: ctx.from.id });

    // Validate session
    if (!ctx.session.shopId) {
      await smartMessage.send(ctx, {
        text: generalMessages.shopRequired,
        keyboard: successButtons,
      });
      return await ctx.scene.leave();
    }

    if (!ctx.session.token) {
      await smartMessage.send(ctx, {
        text: generalMessages.authorizationRequired,
        keyboard: successButtons,
      });
      return await ctx.scene.leave();
    }

    // Get current wallets
    const shop = await walletApi.getWallets(ctx.session.shopId, ctx.session.token);

    const wallets = {
      BTC: shop.wallet_btc || null,
      ETH: shop.wallet_eth || null,
      USDT: shop.wallet_usdt || null,
      LTC: shop.wallet_ltc || null,
    };

    const message = sellerMessages.walletsContext;

    const buttons = SUPPORTED_CRYPTOS.map((crypto) => {
      const address = wallets[crypto];
      const status = address
        ? formatAddress(address) || address
        : sellerMessages.walletsStatusEmpty;
      const action = address ? `wallet:view:${crypto}` : `wallet:add:${crypto}`;
      return [Markup.button.callback(`${crypto} • ${status}`, action)];
    });

    buttons.push([Markup.button.callback(buttonText.backToTools, 'seller:tools')]);

    await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error showing wallets:', error);
    await smartMessage.send(ctx, {
      text: sellerMessages.walletsLoadError,
      keyboard: successButtons,
    });
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

      if (action.startsWith('wallet:add:')) {
        const crypto = action.replace('wallet:add:', '');
        await ctx.answerCbQuery();

        // M21 FIX: Validate crypto type before using
        if (!SUPPORTED_CRYPTOS.includes(crypto)) {
          logger.warn('Invalid crypto type in wallet:add action', { crypto, userId: ctx.from.id });
          await ctx.editMessageText(
            'Неподдерживаемый тип кошелька.',
            Markup.inlineKeyboard([
              [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            ])
          );
          return;
        }

        ctx.wizard.state.editingWallet = crypto;

        await ctx.editMessageText(
          sellerMessages.walletsAddPromptSpecific(crypto),
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
          ])
        );
        return;
      }

      // View wallet detail
      if (action.startsWith('wallet:view:')) {
        const crypto = action.replace('wallet:view:', '');
        await ctx.answerCbQuery();

        // Get wallet address
        const shop = await walletApi.getWallets(ctx.session.shopId, ctx.session.token);
        const address = shop[`wallet_${crypto.toLowerCase()}`];

        if (!address) {
          await ctx.editMessageText(
            sellerMessages.walletsNotFound,
            Markup.inlineKeyboard([
              [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
              [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
            ])
          );
          return;
        }

        // STATE 2: Wallet detail menu
        await ctx.editMessageText(`${crypto} кошелёк.\n\nАдрес:\n\`${address}\``, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [Markup.button.callback(buttonText.viewQr, `wallet:qr:${crypto}`)],
              [Markup.button.callback(buttonText.changeWallet, `wallet:change:${crypto}`)],
              [Markup.button.callback(buttonText.deleteWallet, `wallet:delete:${crypto}`)],
              [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
              [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
            ],
          },
        });
        return;
      }

      if (action === 'wallet:add') {
        await ctx.answerCbQuery();
        ctx.wizard.state.editingWallet = null;
        await ctx.editMessageText(
          sellerMessages.walletsAddPrompt,
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
          ])
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

        // M21 FIX: Validate crypto type before using
        if (!SUPPORTED_CRYPTOS.includes(crypto)) {
          logger.warn('Invalid crypto type in wallet:change action', { crypto, userId: ctx.from.id });
          await ctx.editMessageText(
            'Неподдерживаемый тип кошелька.',
            Markup.inlineKeyboard([
              [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            ])
          );
          return;
        }

        ctx.wizard.state.editingWallet = crypto;

        // Crypto-specific examples
        const examples = {
          BTC: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          ETH: '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1',
          USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          LTC: 'LfzDoLYCJD4gYckYDqnNV1RWdY21VyPDqy',
        };

        await ctx.editMessageText(
          sellerMessages.walletsPromptReplace(crypto, examples[crypto] || 'адрес кошелька'),
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
          ])
        );
        return;
      }

      // Delete wallet - show confirmation
      if (action.startsWith('wallet:delete:')) {
        const crypto = action.replace('wallet:delete:', '');
        await ctx.answerCbQuery();

        await ctx.editMessageText(
          sellerMessages.walletsDeleteConfirm(crypto),
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.delete, `wallet:delete_confirm:${crypto}`)],
            [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
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
          crypto,
        });

        await ctx.editMessageText(
          sellerMessages.walletsDeleted(crypto),
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            [Markup.button.callback('↩️ В меню', 'seller:menu')],
          ])
        );

        // No timeout - user can navigate manually via button
        return;
      }

      // Back to wallets list
      if (action === 'wallet:back') {
        await ctx.answerCbQuery();
        // B6 FIX: Clear refreshTimer to prevent race condition after navigation
        if (ctx.wizard.state.refreshTimer) {
          clearTimeout(ctx.wizard.state.refreshTimer);
          delete ctx.wizard.state.refreshTimer;
        }
        ctx.wizard.state.editingWallet = null;
        ctx.wizard.selectStep(0);
        await showWallets(ctx);
        return;
      }

      // Unknown action
      await ctx.answerCbQuery(sellerMessages.walletsUnknownCommand, { show_alert: true });
      return;
    }

    // Handle text input (wallet address)
    if (ctx.message && ctx.message.text) {
      const userMessageId = ctx.message.message_id;
      const address = ctx.message.text.trim();
      // M20 FIX: Improved error logging for deleteMessage
      const deleteUserInput = async () => {
        if (userMessageId) {
          await ctx.deleteMessage(userMessageId).catch((err) => {
            const status = err.response?.error_code || err.code;
            if (status !== 400 && status !== 429) {
              logger.warn('Unexpected deleteMessage error (wallet input)', {
                messageId: userMessageId,
                error: err.message,
                status,
              });
            }
          });
        }
      };

      // Detect crypto type
      const detectedType = detectCryptoType(address);

      if (!detectedType) {
        await deleteUserInput();
        await cleanReply(
          ctx,
          `${sellerMessages.walletsUnknownAddress}\n${sellerMessages.walletsUseButtons}`,
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
          ])
        );
        return;
      }

      // Validate address
      const isValid = validateCryptoAddress(address, detectedType);

      if (!isValid) {
        await deleteUserInput();
        await cleanReply(
          ctx,
          sellerMessages.walletsInvalidAddress(detectedType),
          Markup.inlineKeyboard([
            [Markup.button.callback(buttonText.backToWallets, 'wallet:back')],
            [Markup.button.callback(buttonText.backToTools, 'seller:tools')],
          ])
        );
        return;
      }

      // Check if editing existing wallet or adding new
      const crypto = ctx.wizard.state.editingWallet || detectedType;

      // Prepare wallet data
      const walletField = `wallet_${crypto.toLowerCase()}`;
      const walletData = { [walletField]: address };

      // Save wallet
      await walletApi.updateWallets(ctx.session.shopId, walletData, ctx.session.token);

      await deleteUserInput();

      logger.info('wallet_saved', {
        shopId: ctx.session.shopId,
        crypto,
        userId: ctx.from.id,
        isEdit: !!ctx.wizard.state.editingWallet,
      });

      const formatted = formatAddress(address) || address;
      const successMessage = ctx.wizard.state.editingWallet
        ? sellerMessages.walletsUpdated(crypto)
        : sellerMessages.walletsSaved(crypto);
      await smartMessage.send(ctx, {
        text: `${successMessage}
${formatted}`,
      });

      // Clear editing state
      ctx.wizard.state.editingWallet = null;

      // P0-BOT-3 FIX: Store timeout in wizard state, not session
      // Clear any existing timeout first
      if (ctx.wizard.state.refreshTimer) {
        clearTimeout(ctx.wizard.state.refreshTimer);
      }

      // Set new timeout and store ID in wizard state
      ctx.wizard.state.refreshTimer = setTimeout(async () => {
        try {
          // Check if still in scene before refreshing
          if (ctx.scene && ctx.scene.current && ctx.scene.current.id === 'manageWallets') {
            ctx.wizard.selectStep(0);
            // Silent refresh - don't show error if refresh fails (wallet was already saved)
            await showWalletsSilent(ctx);
          }
        } catch (refreshError) {
          // Silent fail - wallet was saved successfully, just couldn't refresh UI
          logger.warn('Silent refresh failed (wallet saved ok):', refreshError.message);
        } finally {
          // Clear timer reference after execution
          if (ctx.wizard.state) {
            delete ctx.wizard.state.refreshTimer;
          }
        }
      }, 1000);
      return;
    }

    // No input - user sent non-text message
    await smartMessage.send(ctx, {
      text: 'Пожалуйста, отправьте адрес кошелька текстом.\n\n' + sellerMessages.walletsUseButtons,
    });
  } catch (error) {
    logger.error('Error in handleInput:', error);
    await smartMessage.send(ctx, {
      text: sellerMessages.walletsLoadError,
      keyboard: successButtons,
    });
    return await ctx.scene.leave();
  }
};

// ==========================================
// CREATE WIZARD SCENE
// ==========================================

const manageWalletsScene = new Scenes.WizardScene('manageWallets', showWallets, handleInput);

// Handle scene leave
manageWalletsScene.leave(async (ctx) => {
  // P0-BOT-3 FIX: Clear timeout from wizard state
  if (ctx.wizard.state.refreshTimer) {
    clearTimeout(ctx.wizard.state.refreshTimer);
    delete ctx.wizard.state.refreshTimer;
  }

  // Clean up wizard state
  ctx.wizard.state = {};
  logger.info(`User ${ctx.from?.id} left manageWallets scene`);
});

// Handle cancel action within scene
const exitToTools = async (ctx) => {
  await ctx.scene.leave();
  await showSellerToolsMenu(ctx);
};

manageWalletsScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('wallet_manage_cancelled', { userId: ctx.from.id });
    await exitToTools(ctx);
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.editMessageText(generalMessages.actionFailed, successButtons);
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
    }
  }
});

manageWalletsScene.action('seller:tools', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('wallet_manage_back_to_tools', { userId: ctx.from.id });
    await exitToTools(ctx);
  } catch (error) {
    logger.error('Error handling seller:tools in wallets scene:', error);
    await showSellerToolsMenu(ctx);
  }
});

export default manageWalletsScene;
