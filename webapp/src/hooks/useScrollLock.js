import { useEffect, useRef } from 'react';

/**
 * useScrollLock - Properly manages body scroll lock for modals
 *
 * Features:
 * - Prevents body scroll when modal is open
 * - Properly releases scroll lock on unmount/close
 * - Handles multiple concurrent modals via reference counting
 * - Preserves scroll position
 *
 * @param {boolean} isLocked - Whether scroll should be locked
 */

// Global counter to handle nested modals
let scrollLockCount = 0;
let originalStyles = {
  overflow: '',
  paddingRight: '',
  position: '',
  top: '',
  width: '',
};
let scrollY = 0;

export function useScrollLock(isLocked) {
  const wasLockedRef = useRef(false);

  useEffect(() => {
    const body = document.body;

    if (isLocked && !wasLockedRef.current) {
      // Lock scroll
      scrollLockCount++;
      wasLockedRef.current = true;

      if (scrollLockCount === 1) {
        // First modal - save state and lock
        scrollY = window.scrollY;

        // Save original styles
        originalStyles = {
          overflow: body.style.overflow,
          paddingRight: body.style.paddingRight,
          position: body.style.position,
          top: body.style.top,
          width: body.style.width,
        };

        // Calculate scrollbar width to prevent layout shift
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        // Apply scroll lock
        body.style.overflow = 'hidden';
        body.style.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : '';
        // For iOS Safari - prevent background scroll
        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.width = '100%';
      }
    } else if (!isLocked && wasLockedRef.current) {
      // Unlock scroll
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      wasLockedRef.current = false;

      if (scrollLockCount === 0) {
        // Last modal closed - restore state
        body.style.overflow = originalStyles.overflow;
        body.style.paddingRight = originalStyles.paddingRight;
        body.style.position = originalStyles.position;
        body.style.top = originalStyles.top;
        body.style.width = originalStyles.width;

        // Restore scroll position
        window.scrollTo(0, scrollY);
      }
    }

    // Cleanup on unmount - ensure scroll is unlocked
    return () => {
      if (wasLockedRef.current) {
        scrollLockCount = Math.max(0, scrollLockCount - 1);
        wasLockedRef.current = false;

        if (scrollLockCount === 0) {
          body.style.overflow = originalStyles.overflow;
          body.style.paddingRight = originalStyles.paddingRight;
          body.style.position = originalStyles.position;
          body.style.top = originalStyles.top;
          body.style.width = originalStyles.width;
          window.scrollTo(0, scrollY);
        }
      }
    };
  }, [isLocked]);
}

export default useScrollLock;
