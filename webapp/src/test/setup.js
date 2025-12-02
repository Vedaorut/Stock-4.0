/**
 * Vitest Test Setup
 *
 * This file is loaded before each test file.
 * Use it to set up global mocks and test utilities.
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock window.Telegram for Telegram Mini App
global.window = global.window || {};
global.window.Telegram = {
  WebApp: {
    initData: 'mock-init-data-for-tests',
    initDataUnsafe: {
      user: {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        language_code: 'en',
      },
    },
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    MainButton: {
      show: vi.fn(),
      hide: vi.fn(),
      setText: vi.fn(),
      onClick: vi.fn(),
      offClick: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      showProgress: vi.fn(),
      hideProgress: vi.fn(),
    },
    BackButton: {
      show: vi.fn(),
      hide: vi.fn(),
      onClick: vi.fn(),
      offClick: vi.fn(),
    },
    HapticFeedback: {
      impactOccurred: vi.fn(),
      notificationOccurred: vi.fn(),
      selectionChanged: vi.fn(),
    },
    themeParams: {
      bg_color: '#ffffff',
      text_color: '#000000',
      hint_color: '#999999',
      link_color: '#2678b6',
      button_color: '#2678b6',
      button_text_color: '#ffffff',
    },
    colorScheme: 'light',
    viewportHeight: 600,
    viewportStableHeight: 600,
    isExpanded: true,
    platform: 'tdesktop',
    disableVerticalSwipes: vi.fn(),
    enableVerticalSwipes: vi.fn(),
    showPopup: vi.fn(),
    showConfirm: vi.fn(),
    showAlert: vi.fn(),
  },
};

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    DEV: true,
    PROD: false,
    VITE_API_URL: 'http://localhost:3000',
    MODE: 'test',
  },
});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});

// Console error/warn suppression for cleaner test output (optional)
// Uncomment if you want to suppress expected console output during tests
// const originalError = console.error;
// const originalWarn = console.warn;
//
// beforeAll(() => {
//   console.error = (...args) => {
//     if (args[0]?.includes?.('[addToCart]')) return;
//     originalError.apply(console, args);
//   };
//   console.warn = (...args) => {
//     if (args[0]?.includes?.('[apiBase]')) return;
//     originalWarn.apply(console, args);
//   };
// });
//
// afterAll(() => {
//   console.error = originalError;
//   console.warn = originalWarn;
// });
