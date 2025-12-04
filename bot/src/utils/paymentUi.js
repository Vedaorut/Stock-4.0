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
  confirmed: t('paymentUi.confirmed', {}, lang),
  paid: t('paymentUi.confirmed', {}, lang),
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
    case 'confirmed':
    case 'paid':
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
    case 'confirmed':
    case 'paid':
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
  return state === 'confirmed' || state === 'paid' || state === 'expired' || state === 'failed';
}
