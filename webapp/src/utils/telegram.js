/**
 * Initialize Telegram WebApp
 * @returns {Object|null} Object with user and tg or null
 */
export function initTelegramApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    return null;
  }

  try {
    // Initialize app
    tg.ready();
    tg.expand();

    // Check platform before requesting fullscreen (not supported on web)
    if (tg.requestFullscreen && tg.platform !== 'web') {
      try {
        tg.requestFullscreen();
      } catch {
        // Fullscreen not supported
      }
    } else {
    }

    // Check fullscreen mode

    // Set colors
    tg.setHeaderColor('#0A0A0A');
    tg.setBackgroundColor('#0A0A0A');

    // Disable vertical swipes (important for iOS)
    if (tg.disableVerticalSwipes) {
      tg.disableVerticalSwipes();
    }

    // Enable closing confirmation
    if (tg.enableClosingConfirmation) {
      tg.enableClosingConfirmation();
    }

    // Subscribe to viewport events for responsiveness
    if (tg.onEvent) {
      tg.onEvent('viewportChanged', (data) => {
        // Force set height on viewport change
        if (data.isExpanded) {
          document.documentElement.style.height = '100vh';
          document.body.style.height = '100vh';
        }
      });

      // Fullscreen event handlers (Mini Apps 2.0)
      tg.onEvent('fullscreenChanged', (_data) => {
        // Handle fullscreen change if needed
      });

      tg.onEvent('fullscreenFailed', (error) => {
        if (import.meta.env.DEV) {
          console.error('❌ Fullscreen failed:', error);
        }
      });
    }

    // Detect device performance class (Android only, Mini Apps 2.0)
    // LOW | AVERAGE | HIGH - used to optimize animations
    const performanceClass = detectPerformanceClass();

    return {
      user: tg.initDataUnsafe?.user || null,
      tg,
      platform: tg.platform,
      version: tg.version,
      isExpanded: tg.isExpanded,
      performanceClass,
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Telegram WebApp initialization error:', error);
    }
    return null;
  }
}

/**
 * Show Main Button
 * @param {string} text - Button text
 * @param {Function} onClick - Click handler
 */
export function showMainButton(text, onClick) {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.MainButton.setText(text);
  tg.MainButton.show();
  tg.MainButton.onClick(onClick);
}

/**
 * Hide Main Button
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

// Store current BackButton handler for proper cleanup
let currentBackButtonHandler = null;

/**
 * Show Back Button
 * @param {Function} onClick - Click handler
 */
export function showBackButton(onClick) {
  const tg = window.Telegram?.WebApp;
  if (!tg?.BackButton) return;

  // Remove previous handler if exists
  if (currentBackButtonHandler) {
    tg.BackButton.offClick(currentBackButtonHandler);
  }

  currentBackButtonHandler = onClick;
  tg.BackButton.onClick(onClick);
  tg.BackButton.show();
}

/**
 * Hide Back Button
 */
export function hideBackButton() {
  const tg = window.Telegram?.WebApp;
  if (!tg?.BackButton) return;

  // Remove handler with reference
  if (currentBackButtonHandler) {
    tg.BackButton.offClick(currentBackButtonHandler);
    currentBackButtonHandler = null;
  }

  tg.BackButton.hide();
}

/**
 * Show popup
 * @param {Object} params - Popup parameters
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
 * Close WebApp
 */
export function closeApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.close();
}

/**
 * Open link
 * @param {string} url - URL to open
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
 * Open Telegram link
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

/**
 * Detect device performance class from Telegram User-Agent
 * Mini Apps 2.0 feature - Android only
 *
 * User-Agent format includes: {performance_class}
 * Values: LOW | AVERAGE | HIGH
 *
 * @returns {'low' | 'average' | 'high'} Performance class
 */
export function detectPerformanceClass() {
  // Check User-Agent for performance class (Android Mini Apps 2.0)
  const ua = navigator.userAgent;

  // Look for performance class in User-Agent
  if (ua.includes('performance_class=LOW') || ua.includes('{LOW}')) {
    return 'low';
  }
  if (ua.includes('performance_class=AVERAGE') || ua.includes('{AVERAGE}')) {
    return 'average';
  }
  if (ua.includes('performance_class=HIGH') || ua.includes('{HIGH}')) {
    return 'high';
  }

  // Fallback: use hardware concurrency as heuristic
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 2) return 'low';
  if (cores <= 4) return 'average';
  return 'high';
}

/**
 * Check if animations should be reduced based on device performance
 * @returns {boolean} True if animations should be reduced
 */
export function shouldReduceAnimations() {
  const perfClass = detectPerformanceClass();
  return perfClass === 'low';
}
