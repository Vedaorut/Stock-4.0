import { useEffect, useState } from 'react';
import { useTelegram } from './useTelegram';

/**
 * Hook for tracking keyboard visibility in Telegram WebApp
 * @returns {boolean} keyboardVisible - true if keyboard is shown
 */
export function useKeyboardVisibility() {
  const { tg } = useTelegram();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!tg?.onEvent) return;

    const handleViewportChanged = (data) => {
      // Telegram API: when keyboard appears, viewport.isExpanded === false
      // isExpanded: true - full viewport, false - keyboard is visible
      setKeyboardVisible(!data.isExpanded);
    };

    tg.onEvent('viewportChanged', handleViewportChanged);

    return () => {
      if (tg?.offEvent) {
        tg.offEvent('viewportChanged', handleViewportChanged);
      }
    };
  }, [tg]);

  return keyboardVisible;
}
