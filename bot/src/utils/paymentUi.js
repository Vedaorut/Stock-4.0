import { Markup } from 'telegraf';
import { t } from '../i18n/index.js';

/**
 * Get payment state labels for a language
 * @param {string} lang - Language code
 * @returns {Object} State labels map
 */
const getStateLabels = (lang = 'ru') => ({
  pending: t('paymentUi.pending', {}, lang),
  processing: t('paymentUi.processing', {}, lang),
  // New status (paid replaces confirmed)
  paid: t('paymentUi.paid', {}, lang),
  // Legacy status kept for backward compatibility
  confirmed: t('paymentUi.confirmed', {}, lang),
  // completed is the new final status
  completed: t('paymentUi.completed', {}, lang),
  failed: t('paymentUi.failed', {}, lang),
  expired: t('paymentUi.expired', {}, lang),
});

export function normalizePaymentState(result, fallback = 'pending') {
  if (!result) return fallback;
  if (result.state) return result.state;
  if (result.status) return result.status;
  if (result.confirmations) return 'confirmed';
  return fallback;
}

export function paymentStateMessage(state, extra = {}, lang = 'ru') {
  const stateLabels = getStateLabels(lang);
  const label = stateLabels[state] || stateLabels.pending;

  switch (state) {
    // New statuses
    case 'paid':
    case 'completed':
    // Legacy statuses for backward compatibility
    // falls through
    case 'confirmed':
      return `${label}\n\n${t('paymentUi.allDone', {}, lang)}`;
    case 'expired':
      return `${label}\n${t('paymentUi.expiredHint', {}, lang)}`;
    case 'failed':
      return `${label}\n${t('paymentUi.failedHint', {}, lang)}`;
    default:
      return `${label}\n${extra.hint || t('paymentUi.pendingHint', {}, lang)}`;
  }
}

export function paymentStateKeyboard(state, { retryCb = 'payment:retry', cancelCb = 'seller:menu', lang = 'ru' } = {}) {
  switch (state) {
    // New statuses
    case 'paid':
    case 'completed':
    // Legacy status for backward compatibility
    // falls through
    case 'confirmed':
      return Markup.inlineKeyboard([[Markup.button.callback(t('buttons.mainMenu', {}, lang), 'seller:menu')]]);
    case 'expired':
    case 'failed':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback(t('buttons.retry', {}, lang), retryCb),
          Markup.button.callback(t('buttons.cancel', {}, lang), cancelCb),
        ],
      ]);
    default:
      return Markup.inlineKeyboard([[Markup.button.callback(t('buttons.cancel', {}, lang), cancelCb)]]);
  }
}

export function isTerminalState(state) {
  // New statuses: paid, completed
  // Legacy statuses: confirmed (kept for backward compatibility)
  return state === 'paid' || state === 'completed' || state === 'confirmed' || state === 'expired' || state === 'failed';
}
