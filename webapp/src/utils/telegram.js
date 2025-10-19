/**
 * Инициализация Telegram WebApp
 * @returns {Object|null} Объект с user и tg или null
 */
export function initTelegramApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    console.warn('Telegram WebApp SDK not found');
    return null;
  }

  try {
    // Инициализация приложения
    tg.ready();
    tg.expand();

    // Настройка цветов
    tg.setHeaderColor('#0A0A0A');
    tg.setBackgroundColor('#0A0A0A');

    // Отключаем вертикальные свайпы
    tg.disableVerticalSwipes();

    // Включаем подтверждение закрытия
    tg.enableClosingConfirmation();

    return {
      user: tg.initDataUnsafe?.user || null,
      tg,
      platform: tg.platform,
      version: tg.version,
    };
  } catch (error) {
    console.error('Telegram WebApp initialization error:', error);
    return null;
  }
}

/**
 * Показать Main Button
 * @param {string} text - Текст кнопки
 * @param {Function} onClick - Обработчик клика
 */
export function showMainButton(text, onClick) {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.MainButton.setText(text);
  tg.MainButton.show();
  tg.MainButton.onClick(onClick);
}

/**
 * Скрыть Main Button
 */
export function hideMainButton() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.MainButton.hide();
  tg.MainButton.offClick();
}

/**
 * Haptic feedback
 * @param {string} type - 'light', 'medium', 'heavy', 'error', 'success', 'warning'
 */
export function hapticFeedback(type = 'light') {
  const tg = window.Telegram?.WebApp;
  if (!tg?.HapticFeedback) return;

  switch (type) {
    case 'light':
    case 'medium':
    case 'heavy':
      tg.HapticFeedback.impactOccurred(type);
      break;
    case 'error':
    case 'success':
    case 'warning':
      tg.HapticFeedback.notificationOccurred(type);
      break;
    default:
      tg.HapticFeedback.impactOccurred('light');
  }
}

/**
 * Показать Back Button
 * @param {Function} onClick - Обработчик клика
 */
export function showBackButton(onClick) {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.BackButton.show();
  tg.BackButton.onClick(onClick);
}

/**
 * Скрыть Back Button
 */
export function hideBackButton() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.BackButton.hide();
  tg.BackButton.offClick();
}

/**
 * Показать popup
 * @param {Object} params - Параметры popup
 */
export function showPopup(params) {
  const tg = window.Telegram?.WebApp;
  if (!tg) return Promise.resolve(null);

  return new Promise((resolve) => {
    tg.showPopup(params, (buttonId) => {
      resolve(buttonId);
    });
  });
}

/**
 * Закрыть WebApp
 */
export function closeApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.close();
}

/**
 * Открыть ссылку
 * @param {string} url - URL для открытия
 */
export function openLink(url) {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    window.open(url, '_blank');
    return;
  }

  tg.openLink(url);
}

/**
 * Открыть Telegram ссылку
 * @param {string} url - Telegram URL
 */
export function openTelegramLink(url) {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    window.open(url, '_blank');
    return;
  }

  tg.openTelegramLink(url);
}
