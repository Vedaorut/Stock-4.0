/**
 * Language Middleware
 *
 * Attaches t() translation function to request object
 * with user's preferred language from database
 */

import { t, DEFAULT_LANGUAGE } from '../i18n/index.js';

/**
 * Middleware that attaches translation function to req
 *
 * Usage:
 *   router.get('/endpoint', verifyToken, setUserLanguage, (req, res) => {
 *     const message = req.t('order.new.title');
 *   });
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
export function setUserLanguage(req, res, next) {
  // Get language from authenticated user or fallback to default
  const userLanguage = req.user?.language || DEFAULT_LANGUAGE;

  // Attach translation function bound to user's language
  req.t = (key, params = {}) => t(key, params, userLanguage);

  // Also expose raw language for direct use
  req.language = userLanguage;

  next();
}

/**
 * Create translation function for a specific user
 * Use this in services when you have user data but no req object
 *
 * @param {object} user - User object with language property
 * @returns {function} Translation function
 */
export function createTranslator(user) {
  const lang = user?.language || DEFAULT_LANGUAGE;
  return (key, params = {}) => t(key, params, lang);
}

/**
 * Get translation for specific language
 * Use this when you need to translate for a known language
 *
 * @param {string} lang - Language code
 * @returns {function} Translation function
 */
export function getTranslator(lang) {
  return (key, params = {}) => t(key, params, lang || DEFAULT_LANGUAGE);
}

export default setUserLanguage;
