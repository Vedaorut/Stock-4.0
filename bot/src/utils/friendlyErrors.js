/**
 * P1-BOT-009: User-Friendly Error Messages
 *
 * Converts technical errors to user-friendly messages
 */

import { t } from '../i18n/index.js';

/**
 * Get error messages map for a given language
 * @param {string} lang - Language code
 * @returns {Object} Error messages map
 */
const getErrorMessages = (lang = 'ru') => ({
  // Network errors
  ECONNREFUSED: t('friendlyErrors.econnrefused', {}, lang),
  ETIMEDOUT: t('friendlyErrors.etimedout', {}, lang),
  ENOTFOUND: t('friendlyErrors.enotfound', {}, lang),
  ENETUNREACH: t('friendlyErrors.enetunreach', {}, lang),

  // HTTP errors
  400: t('friendlyErrors.http400', {}, lang),
  401: t('friendlyErrors.http401', {}, lang),
  403: t('friendlyErrors.http403', {}, lang),
  404: t('friendlyErrors.http404', {}, lang),
  409: t('friendlyErrors.http409', {}, lang),
  429: t('friendlyErrors.http429', {}, lang),
  500: t('friendlyErrors.http500', {}, lang),
  502: t('friendlyErrors.http502', {}, lang),
  503: t('friendlyErrors.http503', {}, lang),
  504: t('friendlyErrors.http504', {}, lang),
});

/**
 * Convert error to user-friendly message
 * @param {Error} error - Error object
 * @param {string} lang - Language code
 * @returns {string} User-friendly error message
 */
export const toFriendlyError = (error, lang = 'ru') => {
  const errorMessages = getErrorMessages(lang);

  // Network errors
  if (error.code && errorMessages[error.code]) {
    return errorMessages[error.code];
  }

  // HTTP errors
  if (error.response?.status && errorMessages[error.response.status]) {
    return errorMessages[error.response.status];
  }

  // API error with custom message
  if (error.response?.data?.error && typeof error.response.data.error === 'string') {
    const apiError = error.response.data.error.toLowerCase();

    // Common API errors
    if (apiError.includes('not found')) {
      return t('friendlyErrors.notFound', {}, lang);
    }
    if (apiError.includes('unauthorized') || apiError.includes('invalid token')) {
      return t('friendlyErrors.sessionExpired', {}, lang);
    }
    if (apiError.includes('already exists')) {
      return t('friendlyErrors.alreadyExists', {}, lang);
    }
    if (apiError.includes('limit reached') || apiError.includes('tier limit')) {
      return t('friendlyErrors.tierLimit', {}, lang);
    }
    if (apiError.includes('circular')) {
      return t('friendlyErrors.circularFollow', {}, lang);
    }
  }

  // Validation errors
  if (error.response?.data?.details && Array.isArray(error.response.data.details)) {
    const validationErrors = error.response.data.details
      .map((d) => `• ${d.message || d.msg || d}`)
      .join('\n');
    return t('friendlyErrors.validationError', { errors: validationErrors }, lang);
  }

  // Default
  return t('friendlyErrors.default', {}, lang);
};

export default toFriendlyError;
