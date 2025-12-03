/**
 * Seller Tips System - умные советы и предупреждения для продавцов
 */
import { t } from '../i18n/index.js';

// Tips keys for rotation
const TIP_KEYS = ['follow', 'resell', 'ai', 'stats', 'workers'];

/**
 * Получить следующий совет (избегая последнего показанного)
 */
function getNextTipKey(lastTipKey) {
  // Если советов мало или lastTipKey не задан, выбираем случайный
  if (TIP_KEYS.length <= 1 || !lastTipKey) {
    return TIP_KEYS[Math.floor(Math.random() * TIP_KEYS.length)];
  }

  // Фильтруем последний показанный совет
  const availableTips = TIP_KEYS.filter((key) => key !== lastTipKey);

  // Выбираем случайный из оставшихся
  return availableTips[Math.floor(Math.random() * availableTips.length)];
}

/**
 * Получить совет/предупреждение для магазина на основе его состояния
 * @param {Object} ctx - Telegraf context
 * @param {Object} shopHealth - Состояние магазина { hasWallets, productsCount, tier }
 * @returns {string|null} - Текст для показа или null
 */
function getTipForShop(ctx, shopHealth) {
  const lang = ctx.lang || 'ru';

  // Приоритет 1: Критичные предупреждения

  // Проверка кошельков
  if (!shopHealth.hasWallets) {
    return t('warnings.noWallets', {}, lang);
  }

  // Проверка товаров
  if (shopHealth.productsCount === 0) {
    return t('warnings.noProducts', {}, lang);
  }

  // Приоритет 2: Полезные советы (ротация)
  const lastTipKey = ctx.session.lastTipShown || null;
  const nextTipKey = getNextTipKey(lastTipKey);

  // Сохраняем key показанного совета в session
  ctx.session.lastTipShown = nextTipKey;
  ctx.session.lastTipTimestamp = Date.now();

  return t(`tips.${nextTipKey}`, {}, lang);
}

export { getTipForShop, getNextTipKey, TIP_KEYS };
