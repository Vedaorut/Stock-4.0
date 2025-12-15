import { useEffect, useRef, useCallback } from 'react';
import { useTelegram } from './useTelegram';

/**
 * Hook for managing Telegram BackButton API
 *
 * Automatically shows BackButton when callback is provided
 * and hides it when callback is null/undefined or component unmounts.
 *
 * Uses debounced hide() to prevent flickering during modal transitions.
 * When multiple modals transition (A closes -> B opens), hide() is delayed
 * to allow incoming show() to cancel it, preventing visible flicker.
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
const CLICK_DEBOUNCE_MS = 300;
const HIDE_DEBOUNCE_MS = 50; // Short delay to batch hide/show during transitions

// Shared state across all useBackButton instances to coordinate hide/show
const backButtonState = {
  hideTimer: null,
  activeCount: 0, // Number of components wanting BackButton visible
};

export function useBackButton(onBack) {
  const { tg } = useTelegram();
  const onBackRef = useRef(onBack);
  const handlerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const clickDebounceTimerRef = useRef(null);
  const wasActiveRef = useRef(false); // Track if this instance was showing BackButton

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
    clickDebounceTimerRef.current = setTimeout(() => {
      isProcessingRef.current = false;
    }, CLICK_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!tg?.BackButton) return;

    const hasCallback = typeof onBack === 'function';

    if (hasCallback) {
      // Cancel any pending hide - another component wants BackButton visible
      if (backButtonState.hideTimer) {
        clearTimeout(backButtonState.hideTimer);
        backButtonState.hideTimer = null;
      }

      // Track that this instance is active
      if (!wasActiveRef.current) {
        wasActiveRef.current = true;
        backButtonState.activeCount++;
      }

      // Show BackButton and attach handler
      // Remove previous handler first to avoid duplicates
      if (handlerRef.current) {
        tg.BackButton.offClick(handlerRef.current);
      }

      handlerRef.current = stableHandler;
      tg.BackButton.onClick(stableHandler);
      tg.BackButton.show();
    } else {
      // Mark this instance as inactive
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        backButtonState.activeCount = Math.max(0, backButtonState.activeCount - 1);
      }

      // Remove handler immediately
      if (handlerRef.current) {
        tg.BackButton.offClick(handlerRef.current);
        handlerRef.current = null;
      }

      // Debounce hide() - only hide if no other component wants BackButton visible
      // This prevents flicker during modal-to-modal transitions
      if (backButtonState.activeCount === 0) {
        // Clear existing timer to prevent stacking
        if (backButtonState.hideTimer) {
          clearTimeout(backButtonState.hideTimer);
        }

        backButtonState.hideTimer = setTimeout(() => {
          // Double-check no one activated BackButton during delay
          if (backButtonState.activeCount === 0) {
            tg.BackButton.hide();
          }
          backButtonState.hideTimer = null;
        }, HIDE_DEBOUNCE_MS);
      }
    }

    return () => {
      // Cleanup click debounce timer and reset processing state
      if (clickDebounceTimerRef.current) {
        clearTimeout(clickDebounceTimerRef.current);
        clickDebounceTimerRef.current = null;
      }
      isProcessingRef.current = false;

      // Cleanup on unmount - mark as inactive and debounce hide
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        backButtonState.activeCount = Math.max(0, backButtonState.activeCount - 1);
      }

      if (handlerRef.current) {
        tg.BackButton.offClick(handlerRef.current);
        handlerRef.current = null;
      }

      // Debounced hide on unmount
      if (backButtonState.activeCount === 0) {
        if (backButtonState.hideTimer) {
          clearTimeout(backButtonState.hideTimer);
        }

        backButtonState.hideTimer = setTimeout(() => {
          if (backButtonState.activeCount === 0) {
            tg?.BackButton?.hide();
          }
          backButtonState.hideTimer = null;
        }, HIDE_DEBOUNCE_MS);
      }
    };
  }, [tg, onBack, stableHandler]); // Re-run when onBack changes (null <-> function)
}
