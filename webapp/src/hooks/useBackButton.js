import { useEffect, useRef, useCallback } from 'react';
import { useTelegram } from './useTelegram';

/**
 * Hook for managing Telegram BackButton API
 *
 * Automatically shows BackButton when callback is provided
 * and hides it when callback is null/undefined or component unmounts.
 *
 * @param {Function|null} onBack - Callback function to handle BackButton click, or null to hide
 *
 * @example
 * ```jsx
 * // Page navigation
 * function MyPage() {
 *   const navigate = useNavigate();
 *   useBackButton(() => navigate(-1));
 *   return <div>Content</div>;
 * }
 *
 * // Modal with conditional BackButton
 * function MyModal({ isOpen, onClose }) {
 *   useBackButton(isOpen ? onClose : null);
 *   return isOpen ? <div>Modal</div> : null;
 * }
 * ```
 */
export function useBackButton(onBack) {
  const { tg } = useTelegram();
  const onBackRef = useRef(onBack);
  const handlerRef = useRef(null);

  // Always keep ref in sync
  onBackRef.current = onBack;

  // Stable handler that always calls current callback
  const stableHandler = useCallback(() => {
    onBackRef.current?.();
  }, []);

  useEffect(() => {
    if (!tg?.BackButton) return;

    const hasCallback = typeof onBack === 'function';

    if (hasCallback) {
      // Show BackButton and attach handler
      // Remove previous handler first to avoid duplicates
      if (handlerRef.current) {
        tg.BackButton.offClick(handlerRef.current);
      }

      handlerRef.current = stableHandler;
      tg.BackButton.onClick(stableHandler);
      tg.BackButton.show();
    } else {
      // Hide BackButton and remove handler
      if (handlerRef.current) {
        tg.BackButton.offClick(handlerRef.current);
        handlerRef.current = null;
      }
      tg.BackButton.hide();
    }

    return () => {
      // Cleanup on unmount
      if (handlerRef.current) {
        tg.BackButton.offClick(handlerRef.current);
        handlerRef.current = null;
      }
      tg.BackButton.hide();
    };
  }, [tg, onBack, stableHandler]); // Re-run when onBack changes (null <-> function)
}
