import { useEffect, useRef } from 'react';
import { useTelegram } from './useTelegram';

/**
 * Hook для управления Telegram BackButton API
 *
 * Автоматически показывает BackButton при монтировании компонента
 * и скрывает при размонтировании. Вызывает callback при клике.
 *
 * @param {Function} onBack - Callback функция для обработки клика на BackButton
 *
 * @example
 * ```jsx
 * function MyPage() {
 *   const navigate = useNavigate();
 *   useBackButton(() => navigate(-1));
 *
 *   return <div>Content</div>;
 * }
 * ```
 */
export function useBackButton(onBack) {
  const { tg } = useTelegram();
  const onBackRef = useRef(onBack);

  // Update ref when callback changes
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!tg) return;

    if (typeof onBackRef.current !== 'function') {
      tg.BackButton.hide();
      return undefined;
    }

    const handler = () => onBackRef.current?.();

    tg.BackButton.show();
    tg.BackButton.onClick(handler);

    return () => {
      if (handler) {
        tg.BackButton.offClick(handler);
      }
      tg.BackButton.hide();
    };
  }, [tg]); // Only tg in dependencies - prevents jitter
}
