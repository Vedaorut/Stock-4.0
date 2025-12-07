import { useState, useEffect } from 'react';

/**
 * useKeyboardOpen - Aggressively detects if the virtual keyboard is open
 * 
 * Strategies:
 * 1. Focus Listeners (Immediate): Detects when an input gets focus.
 * 2. Viewport Check (Accurate): Uses Telegram SDK to check efficient viewport height.
 */
export function useKeyboardOpen() {
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    useEffect(() => {
        const tg = window.Telegram?.WebApp;

        // 1. Focus Detection (Fastest)
        const handleFocus = (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') {
                setIsKeyboardOpen(true);
            }
        };

        const handleBlur = (_e) => {
            // Small delay to check if focus moved to another input
            setTimeout(() => {
                if (
                    document.activeElement?.tagName !== 'INPUT' &&
                    document.activeElement?.tagName !== 'TEXTAREA'
                ) {
                    // Double check viewport to be safe (if tg is available)
                    if (tg && tg.viewportHeight < tg.viewportStableHeight) {
                        // Keep open if viewport is still shrunk (keyboard valid)
                        setIsKeyboardOpen(true);
                    } else {
                        setIsKeyboardOpen(false);
                    }
                }
            }, 50);
        };

        // 2. Viewport Detection (Telegram Native)
        const checkViewport = () => {
            if (!tg) return;
            if (tg.viewportHeight < tg.viewportStableHeight) {
                setIsKeyboardOpen(true);
            } else {
                // Only close if no input is focused
                if (
                    document.activeElement?.tagName !== 'INPUT' &&
                    document.activeElement?.tagName !== 'TEXTAREA'
                ) {
                    setIsKeyboardOpen(false);
                }
            }
        };

        // Attach listeners
        window.addEventListener('focusin', handleFocus);
        window.addEventListener('focusout', handleBlur);
        tg?.onEvent('viewportChanged', checkViewport);

        // Initial check
        if (
            document.activeElement?.tagName === 'INPUT' ||
            document.activeElement?.tagName === 'TEXTAREA'
        ) {
            setIsKeyboardOpen(true);
        } else {
            checkViewport();
        }

        return () => {
            window.removeEventListener('focusin', handleFocus);
            window.removeEventListener('focusout', handleBlur);
            tg?.offEvent('viewportChanged', checkViewport);
        };
    }, []);

    return isKeyboardOpen;
}
