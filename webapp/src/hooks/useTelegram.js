import { useState, useEffect, useCallback } from 'react';
import {
  initTelegramApp,
  showMainButton,
  hideMainButton,
  showBackButton,
  hideBackButton,
  hapticFeedback,
  showPopup,
  closeApp
} from '../utils/telegram';

/**
 * Hook для работы с Telegram WebApp SDK
 * @returns {Object} Объект с методами и данными Telegram
 */
export function useTelegram() {
  const [telegramData, setTelegramData] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const data = initTelegramApp();
    setTelegramData(data);
    setIsReady(true);
  }, []);

  // Main Button
  const setMainButton = useCallback((text, onClick) => {
    showMainButton(text, onClick);
  }, []);

  const removeMainButton = useCallback(() => {
    hideMainButton();
  }, []);

  // Back Button
  const setBackButton = useCallback((onClick) => {
    showBackButton(onClick);
  }, []);

  const removeBackButton = useCallback(() => {
    hideBackButton();
  }, []);

  // Haptic Feedback
  const triggerHaptic = useCallback((type = 'light') => {
    hapticFeedback(type);
  }, []);

  // Popup
  const openPopup = useCallback(async (params) => {
    return await showPopup(params);
  }, []);

  // Close App
  const close = useCallback(() => {
    closeApp();
  }, []);

  // Confirm dialog
  const confirm = useCallback(async (message) => {
    const result = await showPopup({
      title: 'Подтверждение',
      message,
      buttons: [
        { id: 'ok', type: 'ok', text: 'Да' },
        { id: 'cancel', type: 'cancel', text: 'Отмена' }
      ]
    });
    return result === 'ok';
  }, []);

  // Alert dialog
  const alert = useCallback(async (message, title = 'Внимание') => {
    await showPopup({
      title,
      message,
      buttons: [{ id: 'ok', type: 'close', text: 'OK' }]
    });
  }, []);

  return {
    // Data
    user: telegramData?.user,
    tg: telegramData?.tg,
    platform: telegramData?.platform,
    version: telegramData?.version,
    isReady,

    // Methods
    setMainButton,
    removeMainButton,
    setBackButton,
    removeBackButton,
    triggerHaptic,
    openPopup,
    confirm,
    alert,
    close,
  };
}
