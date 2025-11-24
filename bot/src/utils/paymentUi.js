import { Markup } from 'telegraf';
import { buttons as buttonText } from '../texts/messages.js';

const STATE_LABELS = {
  pending: '⏳ Ожидание подтверждения сети',
  processing: '⏳ Проверяем транзакцию…',
  confirmed: '✅ Оплата подтверждена',
  paid: '✅ Оплата подтверждена',
  failed: '❌ Оплата не подтверждена',
  expired: '⏳ Счёт истёк',
};

export function normalizePaymentState(result, fallback = 'pending') {
  if (!result) return fallback;
  if (result.state) return result.state;
  if (result.status) return result.status;
  if (result.confirmations) return 'confirmed';
  return fallback;
}

export function paymentStateMessage(state, extra = {}) {
  const label = STATE_LABELS[state] || STATE_LABELS.pending;

  switch (state) {
    case 'confirmed':
    case 'paid':
      return `${label}\n\nВсе готово!`;
    case 'expired':
      return `${label}\nСгенерируйте новый инвойс и отправьте новый TX hash.`;
    case 'failed':
      return `${label}\nПроверьте сумму/сеть и отправьте корректный TX hash.`;
    default:
      return `${label}\n${extra.hint || 'Подождите подтверждения или отправьте корректный TX hash.'}`;
  }
}

export function paymentStateKeyboard(state, { retryCb = 'payment:retry', cancelCb = 'seller:menu' } = {}) {
  switch (state) {
    case 'confirmed':
    case 'paid':
      return Markup.inlineKeyboard([[Markup.button.callback(buttonText.mainMenu, 'seller:menu')]]);
    case 'expired':
    case 'failed':
      return Markup.inlineKeyboard([
        [
          Markup.button.callback(buttonText.retry, retryCb),
          Markup.button.callback(buttonText.cancel, cancelCb),
        ],
      ]);
    default:
      return Markup.inlineKeyboard([[Markup.button.callback(buttonText.cancel, cancelCb)]]);
  }
}

export function isTerminalState(state) {
  return state === 'confirmed' || state === 'paid' || state === 'expired' || state === 'failed';
}
