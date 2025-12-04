import { useEffect, useRef } from 'react';

const IOS_THRESHOLD = window.innerHeight * 0.25;
const ANDROID_THRESHOLD = window.innerHeight * 0.2;

/**
 * Hook for managing viewport when keyboard opens in Telegram Mini App
 * - Updates --vh-dynamic CSS variable
 * - Adds .kb-open class to <html> when keyboard opens
 * - Support: Telegram viewportChanged + fallback visualViewport (iOS)
 */
export function useKeyboardViewport() {
  const stableRef = useRef(null);
  const forceOpenRef = useRef(false);
  const focusTimeoutRef = useRef(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const html = document.documentElement;

    const setVH = (px) => {
      if (typeof px === 'number' && !Number.isNaN(px) && px > 0) {
        html.style.setProperty('--vh-dynamic', `${px}px`);
      }
    };

    const setKB = (open) => html.classList.toggle('kb-open', !!open);

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const THRESHOLD = isIOS ? IOS_THRESHOLD : ANDROID_THRESHOLD;
    const fallbackHeight = window.innerHeight || html.clientHeight || 0;

    const toNumber = (value) =>
      typeof value === 'number' && !Number.isNaN(value) && value > 0 ? value : null;

    const collectHeight = (candidates, mode) => {
      const values = candidates
        .map((candidate) => {
          try {
            const input = typeof candidate === 'function' ? candidate() : candidate;
            return toNumber(input);
          } catch {
            return null;
          }
        })
        .filter((value) => value !== null);

      if (!values.length) {
        return null;
      }

      return mode === 'min' ? Math.min(...values) : Math.max(...values);
    };

    const resolveStable = () =>
      collectHeight(
        [
          () => tg?.viewportStableHeight,
          () => window.visualViewport?.height,
          () => window.innerHeight,
          () => html.clientHeight,
        ],
        'max'
      ) || fallbackHeight;

    const resolveCurrent = () =>
      collectHeight(
        [
          () => tg?.viewportHeight,
          () => window.visualViewport?.height,
          () => window.innerHeight,
          () => html.clientHeight,
        ],
        'min'
      ) || fallbackHeight;

    if (typeof stableRef.current !== 'number') {
      stableRef.current = resolveStable();
    }

    const compute = () => {
      const baselineCandidate =
        typeof stableRef.current === 'number' && !Number.isNaN(stableRef.current)
          ? stableRef.current
          : resolveStable();

      const resolvedBaseline = toNumber(baselineCandidate) || fallbackHeight;
      const currentCandidate = resolveCurrent();
      const resolvedCurrent = toNumber(currentCandidate) || resolvedBaseline;
      const visualOffset = window.visualViewport
        ? Math.max(
            toNumber(window.visualViewport.offsetTop) || 0,
            toNumber(window.visualViewport.pageTop) || 0
          )
        : 0;

      const heightDelta = resolvedBaseline - resolvedCurrent;
      const keyboardByHeight = heightDelta > THRESHOLD;
      const keyboardByOffset = visualOffset > 0;

      const keyboardOpen = forceOpenRef.current || keyboardByHeight || keyboardByOffset;

      setVH(resolvedCurrent);
      setKB(keyboardOpen);

      if (!keyboardOpen && resolvedCurrent > resolvedBaseline) {
        stableRef.current = resolvedCurrent;
      }
    };

    const isKeyboardTarget = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      if (element.isContentEditable) {
        return true;
      }

      const tag = element.tagName;
      if (tag === 'TEXTAREA') {
        return true;
      }

      if (tag !== 'INPUT') {
        return false;
      }

      const type = element.getAttribute('type')?.toLowerCase() || 'text';
      const nonTextTypes = new Set([
        'button',
        'checkbox',
        'color',
        'date',
        'datetime-local',
        'file',
        'hidden',
        'image',
        'month',
        'range',
        'reset',
        'submit',
        'time',
        'week',
      ]);

      if (nonTextTypes.has(type)) {
        return false;
      }

      return true;
    };

    const focusin = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (isKeyboardTarget(target)) {
        // Don't set kb-open immediately - wait for actual keyboard
        // This prevents TabBar from hiding before keyboard appears
        forceOpenRef.current = true;
        if (focusTimeoutRef.current) {
          clearTimeout(focusTimeoutRef.current);
          focusTimeoutRef.current = null;
        }
        // Only call compute which will check height delta
        requestAnimationFrame(compute);
      }
    };

    const focusout = () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      focusTimeoutRef.current = window.setTimeout(() => {
        const active = document.activeElement;
        const stillFocused = isKeyboardTarget(active);

        if (!stillFocused) {
          forceOpenRef.current = false;
          compute();
        }
      }, 100);
    };

    if (tg?.onEvent) {
      tg.onEvent('viewportChanged', compute);
      tg.expand?.();
      compute();
    } else if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', compute, { passive: true });
      compute();
    } else {
      const baseline = toNumber(stableRef.current) || resolveStable();
      setVH(baseline);
      setKB(false);
    }

    document.addEventListener('focusin', focusin, true);
    document.addEventListener('focusout', focusout, true);

    return () => {
      tg?.offEvent?.('viewportChanged', compute);
      window.visualViewport?.removeEventListener('resize', compute);
      document.removeEventListener('focusin', focusin, true);
      document.removeEventListener('focusout', focusout, true);

      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);
}
