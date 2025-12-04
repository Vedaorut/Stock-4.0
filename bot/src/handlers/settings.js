import logger from '../utils/logger.js';
import { authApi, shopApi } from '../utils/api.js';
import { settingsMenu, languageSelectMenu } from '../keyboards/settings.js';
import { t } from '../i18n/index.js';
import * as smartMessage from '../utils/smartMessage.js';

/**
 * Get shop info for settings context
 * Note: Subscription options are only shown for sellers, not buyers
 */
async function getShopContext(ctx) {
  // Buyers should NOT see subscription options - that's seller-only functionality
  const role = ctx.session?.role;
  if (role === 'buyer') {
    return { hasShop: false };
  }

  if (!ctx.session.token) return { hasShop: false };

  try {
    const shops = await shopApi.getMyShop(ctx.session.token);
    if (shops && shops.length > 0) {
      const shop = shops[0];
      return {
        hasShop: true,
        isTrial: shop.is_trial || false,
        tier: shop.tier || 'pro',
        trialEndsAt: shop.trial_ends_at,
      };
    }
  } catch (error) {
    logger.debug('No shop found for settings:', error.message);
  }
  return { hasShop: false };
}

/**
 * Setup settings handlers
 */
export function setupSettingsHandlers(bot) {
  // Show settings menu
  bot.action('settings', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const lang = ctx.session.language || 'ru';
      const shopContext = await getShopContext(ctx);

      let text = t('settings.title', {}, lang);

      if (shopContext.isTrial && shopContext.trialEndsAt) {
        const trialDate = new Date(shopContext.trialEndsAt).toLocaleDateString(
          lang === 'ru' ? 'ru-RU' : 'en-US'
        );
        text += '\n\n' + t('settings.trialInfo', { date: trialDate }, lang);
      }

      await smartMessage.send(ctx, {
        text,
        keyboard: settingsMenu(shopContext, lang),
      });
    } catch (error) {
      logger.error('Error in settings handler:', error);
    }
  });

  // Show language selection
  bot.action('settings:language', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const lang = ctx.session.language || 'ru';

      await smartMessage.send(ctx, {
        text: t('settings.selectLanguage', {}, lang),
        keyboard: languageSelectMenu(lang),
      });
    } catch (error) {
      logger.error('Error in language selection:', error);
    }
  });

  // Change language
  bot.action(/^settings:lang:(ru|en)$/, async (ctx) => {
    try {
      const newLang = ctx.match[1];
      await ctx.answerCbQuery();

      // Update session
      ctx.session.language = newLang;
      ctx.session.languageSyncedAt = Date.now();

      // Save to database
      if (ctx.session.token) {
        try {
          await authApi.updateLanguage(newLang, ctx.session.token);
        } catch (error) {
          logger.error('Failed to save language to DB:', error);
        }
      }

      // Show confirmation and redirect to main menu (role-based)
      await smartMessage.send(ctx, {
        text: t('settings.languageChanged', {}, newLang),
      });

      // Small delay for user to see confirmation
      await new Promise((r) => setTimeout(r, 500));

      // Redirect to role-based main menu
      const role = ctx.session.role;
      if (role === 'seller') {
        const { handleSellerRole } = await import('./seller/index.js');
        await handleSellerRole(ctx, { skipRoleUpdate: true });
      } else if (role === 'buyer') {
        const { handleBuyerRole } = await import('./buyer/index.js');
        await handleBuyerRole(ctx, { skipRoleUpdate: true });
      } else {
        const { handleStart } = await import('./start.js');
        await handleStart(ctx);
      }
    } catch (error) {
      logger.error('Error changing language:', error);
    }
  });

  // Back to settings from language
  bot.action('settings:main', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const lang = ctx.session.language || 'ru';
      const shopContext = await getShopContext(ctx);

      await ctx.editMessageText(t('settings.title', {}, lang), settingsMenu(shopContext, lang));
    } catch (error) {
      logger.error('Error returning to settings:', error);
    }
  });

  // Renew subscription
  bot.action('settings:renew', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      if (!ctx.session.shopId) {
        const lang = ctx.session.language || 'ru';
        await smartMessage.send(ctx, {
          text: t('errors.shopRequired', {}, lang),
        });
        return;
      }

      // Enter payment scene with renewal flag
      await ctx.scene.enter('pay_subscription', { renewal: true });
    } catch (error) {
      logger.error('Error in renew subscription:', error);
    }
  });

  // Exit trial (pay to continue)
  bot.action('settings:exit_trial', async (ctx) => {
    try {
      await ctx.answerCbQuery();

      // Enter payment scene with exit trial flag
      await ctx.scene.enter('pay_subscription', { exitTrial: true });
    } catch (error) {
      logger.error('Error in exit trial:', error);
    }
  });

  // Back to main menu (role-based)
  bot.action('settings:back', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const role = ctx.session.role;

      if (role === 'seller') {
        // Import dynamically to avoid circular deps
        const { handleSellerRole } = await import('./seller/index.js');
        // PERF: Role already saved, skip redundant API call
        await handleSellerRole(ctx, { skipRoleUpdate: true });
      } else if (role === 'buyer') {
        const { handleBuyerRole } = await import('./buyer/index.js');
        // PERF: Role already saved, skip redundant API call
        await handleBuyerRole(ctx, { skipRoleUpdate: true });
      } else {
        // Default: show role selection
        const { handleStart } = await import('./start.js');
        await handleStart(ctx);
      }
    } catch (error) {
      logger.error('Error in settings back:', error);
    }
  });

  logger.info('Settings handlers registered');
}
