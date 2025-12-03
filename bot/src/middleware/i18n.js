import { t, getLang } from '../i18n/index.js';

/**
 * i18n middleware - adds ctx.t() and ctx.lang to context
 * Must be registered AFTER session middleware
 */
export function i18nMiddleware() {
  return async (ctx, next) => {
    const lang = getLang(ctx);

    // Add translation function to context
    ctx.t = (key, params = {}) => t(key, params, lang);

    // Add current language to context
    ctx.lang = lang;

    return next();
  };
}

export default i18nMiddleware;
