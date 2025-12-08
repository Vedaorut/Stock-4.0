import { Scenes } from 'telegraf';
import { sellerToolsMenu } from '../keyboards/seller.js';
import { cancelButton } from '../keyboards/common.js';
import { shopApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import * as smartMessage from '../utils/smartMessage.js';
import { t } from '../i18n/index.js';

/**
 * Rename Shop Scene
 * Steps:
 * 1. Show current name, ask for new name
 * 2. Validate and save
 */

// Validation regex (same as createShop)
const validNamePattern = /^[a-zA-Z0-9 _-]+$/;

// Step 1: Ask for new name
const askNewName = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';
    const shopName = ctx.session?.shopName || 'Shop';

    logger.info('rename_shop_started', { userId: ctx.from.id, currentName: shopName });

    await smartMessage.send(ctx, {
      text: t('renameShop.currentName', { name: shopName }, lang) + '\n\n' +
            t('renameShop.enterNewName', {}, lang),
      keyboard: cancelButton(lang),
    });

    return ctx.wizard.next();
  } catch (error) {
    logger.error('Error in askNewName step:', error);
    throw error;
  }
};

// Step 2: Validate and save
const saveNewName = async (ctx) => {
  try {
    const lang = ctx.lang || ctx.session?.language || 'ru';

    // Check text message
    if (!ctx.message || !ctx.message.text) {
      await smartMessage.send(ctx, {
        text: t('scenes.sendShopNameText', {}, lang),
      });
      return;
    }

    const newName = ctx.message.text.trim();
    const oldName = ctx.session?.shopName || 'Shop';

    // Delete user message
    await ctx.deleteMessage(ctx.message.message_id).catch(() => {});

    // Validate length
    if (newName.length < 3 || newName.length > 100) {
      await smartMessage.send(ctx, {
        text: t('createShopNameInvalidLength', {}, lang),
        keyboard: cancelButton(lang),
      });
      return;
    }

    // Validate characters
    if (!validNamePattern.test(newName)) {
      await smartMessage.send(ctx, {
        text: t('renameShop.invalidName', {}, lang),
        keyboard: cancelButton(lang),
      });
      return;
    }

    // Same name check
    if (newName === oldName) {
      await smartMessage.send(ctx, {
        text: t('renameShop.enterNewName', {}, lang),
        keyboard: cancelButton(lang),
      });
      return;
    }

    logger.info('rename_shop_attempt', { userId: ctx.from.id, oldName, newName });

    // Call API to rename
    try {
      await shopApi.updateShop(ctx.session.shopId, { name: newName }, ctx.session.token);

      // Update session
      ctx.session.shopName = newName;

      logger.info('rename_shop_success', { userId: ctx.from.id, oldName, newName });

      await smartMessage.send(ctx, {
        text: t('renameShop.success', { oldName, newName }, lang),
        keyboard: sellerToolsMenu(true, lang),
      });

      return await ctx.scene.leave();
    } catch (apiError) {
      logger.error('rename_shop_error', { error: apiError.message, userId: ctx.from.id });

      // Check for name taken error
      if (apiError.response?.status === 409 || apiError.message?.includes('taken')) {
        await smartMessage.send(ctx, {
          text: t('renameShop.nameTaken', {}, lang),
          keyboard: cancelButton(lang),
        });
        return;
      }

      await smartMessage.send(ctx, {
        text: t('renameShop.error', {}, lang),
        keyboard: sellerToolsMenu(true, lang),
      });

      return await ctx.scene.leave();
    }
  } catch (error) {
    logger.error('Error in saveNewName step:', error);
    const langErr = ctx.lang || ctx.session?.language || 'ru';
    await smartMessage.send(ctx, {
      text: t('renameShop.error', {}, langErr),
      keyboard: sellerToolsMenu(true, langErr),
    });
    return await ctx.scene.leave();
  }
};

// Create wizard scene
const renameShopScene = new Scenes.WizardScene('renameShop', askNewName, saveNewName);

// Handle scene leave
renameShopScene.leave(async (ctx) => {
  // P0 FIX: Use assignment instead of delete to prevent TypeError
  if (ctx.wizard) {
    ctx.wizard.state = {};
  }
  ctx.scene.state = {};

  // P0 FIX: REMOVED delete ctx.session.__scenes
  // Telegraf manages __scenes automatically. Deleting it here can cause
  // race condition when scene.leave() is followed by scene.enter()

  logger.info(`User ${ctx.from?.id} left renameShop scene`);
});

// Handle cancel
renameShopScene.action('cancel_scene', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('rename_shop_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    const lang = ctx.lang || ctx.session?.language || 'ru';
    await ctx.editMessageText(t('general.actionCancelled', {}, lang), sellerToolsMenu(true, lang));
  } catch (error) {
    logger.error('Error in cancel_scene handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

renameShopScene.action('cancel', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    logger.info('rename_shop_cancelled', { userId: ctx.from.id });
    await ctx.scene.leave();

    const lang = ctx.lang || ctx.session?.language || 'ru';
    await ctx.editMessageText(t('general.actionCancelled', {}, lang), sellerToolsMenu(true, lang));
  } catch (error) {
    logger.error('Error in cancel handler:', error);
    try {
      await ctx.scene.leave();
    } catch (leaveError) {
      logger.error('Failed to leave scene:', leaveError);
    }
  }
});

export default renameShopScene;
