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
const DEBOUNCE_DELAY_MS = 300;

export function useBackButton(onBack) {
  const { tg } = useTelegram();
  const onBackRef = useRef(onBack);
  const handlerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Always keep ref in sync
  onBackRef.current = onBack;

  // Stable handler that always calls current callback with debounce protection
  const stableHandler = useCallback(() => {
    // Prevent double clicks / rapid navigation
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      onBackRef.current?.();
    } catch (error) {
      console.error('[useBackButton] Callback error:', error);
    }

    // Reset after debounce delay
    debounceTimerRef.current = setTimeout(() => {
      isProcessingRef.current = false;
    }, DEBOUNCE_DELAY_MS);
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
      // Cleanup debounce timer and reset processing state
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      isProcessingRef.current = false;
      // Cleanup on unmount
      if (handlerRef.current) {
        tg.BackButton.offClick(handlerRef.current);
        handlerRef.current = null;
      }
      tg.BackButton.hide();
    };
  }, [tg, onBack, stableHandler]); // Re-run when onBack changes (null <-> function)
}
