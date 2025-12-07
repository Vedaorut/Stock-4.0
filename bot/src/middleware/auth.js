import { authApi } from '../utils/api.js';
import logger from '../utils/logger.js';
import { t, getLang } from '../i18n/index.js';

const LANGUAGE_SYNC_INTERVAL_MS = 0;

const shouldSyncLanguage = (session) => {
  if (!session.language) return true;
  if (!session.languageSyncedAt) return true;
  if (LANGUAGE_SYNC_INTERVAL_MS <= 0) return true;
  return Date.now() - session.languageSyncedAt > LANGUAGE_SYNC_INTERVAL_MS;
};

const syncLanguageFromBackend = async (ctx) => {
  if (!ctx.session?.token) {
    logger.debug(`[LangSync] No token for user ${ctx.from?.id}, skipping sync`);
    return;
  }
  try {
    const dbLang = await authApi.getLanguage(ctx.session.token);
    logger.info(`[LangSync] user=${ctx.from.id} session=${ctx.session.language} db=${dbLang}`);
    if (dbLang && dbLang !== ctx.session.language) {
      logger.info(
        `Language synced from DB: ${ctx.session.language} → ${dbLang} for user ${ctx.from.id}`
      );
      ctx.session.language = dbLang;
    }
  } catch (error) {
    logger.warn(`[LangSync] Failed for user ${ctx.from?.id}:`, error.message);
  } finally {
    ctx.session.languageSyncedAt = Date.now();
  }
};

/**
 * Authentication middleware
 * Automatically registers/logs in user via Backend API
 */
const authMiddleware = async (ctx, next) => {
  try {
    // Skip for non-user updates
    if (!ctx.from) {
      return next();
    }

    ctx.session = ctx.session || {};

    // Check if user already authenticated in session
    // Token must be truthy and not too old (refresh if older than 6 days)
    if (ctx.session.token) {
      // Old sessions may be missing tokenCreatedAt — backfill without forcing re-auth
      if (!ctx.session.tokenCreatedAt) {
        ctx.session.tokenCreatedAt = new Date().toISOString();
        logger.info(`Backfilled tokenCreatedAt for user ${ctx.from.id}`);
        if (shouldSyncLanguage(ctx.session)) {
          await syncLanguageFromBackend(ctx);
        }
        return next();
      }

      const tokenAge = Date.now() - new Date(ctx.session.tokenCreatedAt).getTime();
      const sixDays = 6 * 24 * 60 * 60 * 1000;
      if (tokenAge < sixDays) {
        // Миграция старой структуры session (user → language/role)
        if (ctx.session.user && !ctx.session.language) {
          // FIX: Don't set default 'ru' - let start.js show language selection
          ctx.session.language = ctx.session.user.language || null;
          ctx.session.role = ctx.session.role || ctx.session.user.selected_role;
          delete ctx.session.user;
          logger.info(`Migrated old session format for user ${ctx.from.id}`);
        }
        // FIX: Don't force re-auth if language is null - start.js will handle language selection
        // This prevents infinite re-auth loop when DB has no language set
        if (shouldSyncLanguage(ctx.session)) {
          await syncLanguageFromBackend(ctx);
        }
        return next(); // Token is valid and fresh
      }
      logger.info(
        `Token age ${Math.floor(tokenAge / (24 * 60 * 60 * 1000))} days, refreshing for user ${ctx.from.id}`
      );
    }

    // Force re-auth if token is missing
    if (!ctx.session?.token) {
      logger.info(`Authenticating user ${ctx.from.id} (no token in session)`);
    }

    // Extract user data from Telegram
    // Fallback for firstName: Telegram requires first_name, but just in case
    const userData = {
      username: ctx.from.username || null,
      firstName: ctx.from.first_name || ctx.from.username || 'User',
      lastName: ctx.from.last_name || null,
      languageCode: ctx.from.language_code,
    };

    // Authenticate with backend
    const authData = await authApi.authenticate(ctx.from.id, userData);

    if (!authData?.token || !authData?.user) {
      throw new Error('Invalid authentication response from backend');
    }

    // Store in session (preserve existing shopId/role if they exist)
    const existingShopId = ctx.session.shopId;
    const existingShopName = ctx.session.shopName;
    const existingRole = ctx.session.role;

    ctx.session.token = authData.token;
    ctx.session.tokenCreatedAt = new Date().toISOString(); // Track token creation time
    ctx.session.userId = authData.user?.id;
    // FIX: Don't set default 'ru' - let start.js show language selection for new users
    ctx.session.language = authData.user?.language || null;
    // FIX: Flag to track if language was explicitly set by user (not auto-detected by i18n)
    ctx.session.isLanguageConfirmed = !!authData.user?.language;
    ctx.session.role = existingRole || authData.user?.selected_role || null;
    ctx.session.shopId = existingShopId || null; // Preserve if exists
    ctx.session.shopName = existingShopName || null;
    ctx.session.languageSyncedAt = Date.now();

    logger.info(`User authenticated: ${ctx.from.id} (@${ctx.from.username})`);

    return next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    ctx.session.authError = error.message;

    // Surface a clear message without mutating token/user to null
    if (ctx.reply) {
      const lang = getLang(ctx);
      await ctx.reply(t('errors.authenticationFailed', {}, lang));
    }
    return;
  }
};

export default authMiddleware;
