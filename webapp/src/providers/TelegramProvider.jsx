/* eslint-disable react-refresh/only-export-components */
// Provider and hook are intentionally co-located for maintainability
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import axios from 'axios';
import { useStore } from '../store/useStore';
import { setTokenRefreshCallback } from '../utils/tokenRefresh';
import { getApiBaseUrl } from '../utils/apiBase';
import {
  initTelegramApp,
  showMainButton,
  hideMainButton,
  showBackButton,
  hideBackButton,
  hapticFeedback,
  showPopup,
  closeApp,
} from '../utils/telegram';
import { t } from '../i18n';

const TelegramContext = createContext(null);

/**
 * TelegramProvider - единый контекст для Telegram WebApp
 * Инициализируется ОДИН РАЗ на весь app, вместо создания хука в каждом компоненте
 */
export function TelegramProvider({ children }) {
  const [telegramData, setTelegramData] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [error, setError] = useState(null);
  const [backendUser, setBackendUser] = useState(null); // User from backend (includes selected_role)
  const initializationRef = useRef(false);
  const apiLoggedRef = useRef(false);

  const waitForTelegramSDK = useCallback(async (maxRetries = 10, delay = 200) => {
    for (let i = 0; i < maxRetries; i++) {
      if (window.Telegram?.WebApp) {
        const data = initTelegramApp();
        if (data) {
          return data;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    console.error('❌ Telegram SDK not found after', maxRetries, 'retries');
    return null;
  }, []);

  const validateTelegramAuth = useCallback(async (initData) => {
    try {
      const API_URL = getApiBaseUrl();

      // Log once to help diagnose incorrect base URLs (DEV only)
      if (import.meta.env.DEV && !apiLoggedRef.current) {
        // eslint-disable-next-line no-console
        console.log('[TelegramProvider] Using API base URL:', API_URL);
        apiLoggedRef.current = true;
      }

      // Debug: Log initData info (without exposing sensitive data)
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[Auth] Validating initData, length:', initData?.length || 0);
      }

      const response = await axios.post(
        `${API_URL}/auth/telegram-validate`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': initData,
          },
        }
      );

      const { user, token } = response.data;

      // Use getState() for stable reference
      const { setUser, setToken } = useStore.getState();
      setUser(user);
      setToken(token);

      // Store backend user locally for context (includes selected_role)
      setBackendUser(user);

      // eslint-disable-next-line no-console
      console.log('[Auth] ✅ Token received, user:', user?.username);

      setError(null);
    } catch (err) {
      console.error('[Auth] ❌ Validation failed:', {
        status: err.response?.status,
        error: err.response?.data?.error || err.message,
        hasInitData: !!initData,
        initDataLength: initData?.length || 0,
      });

      const errorMessage = err.response?.data?.error || err.message;
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []); // Stable forever

  // Register token refresh callback for useApi auto-refresh on 401
  useEffect(() => {
    const refreshToken = async () => {
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        throw new Error('No Telegram initData available for token refresh');
      }
      await validateTelegramAuth(initData);
    };

    setTokenRefreshCallback(refreshToken);
  }, [validateTelegramAuth]);

  useEffect(() => {
    // ✅ CRITICAL: Prevent multiple initializations across components
    if (initializationRef.current) {
      return;
    }

    initializationRef.current = true;

    async function initialize() {
      try {
        // Wait for Telegram SDK to load (retry logic)
        const data = await waitForTelegramSDK();

        if (!data) {
          throw new Error('Telegram SDK not loaded after retries');
        }

        setTelegramData(data);

        // Validate initData with backend
        if (data?.tg?.initData) {
          await validateTelegramAuth(data.tg.initData);
        } else {
          // Development mode or missing initData
          if (import.meta.env.DEV) {
            setError(null);
          } else {
            console.error('❌ No initData available');
            setError('No initData available. Please open this app from Telegram bot.');
          }
        }

        setIsReady(true);
      } catch (err) {
        console.error('❌ Telegram initialization error:', err);
        setError(err.message);
        setIsReady(true);
      } finally {
        setIsValidating(false);
      }
    }

    initialize();
  }, [validateTelegramAuth, waitForTelegramSDK]); // Runs ONCE per app

  // Main Button
  const setMainButton = useCallback((text, onClick) => {
    showMainButton(text, onClick);
  }, []);

  const removeMainButton = useCallback(() => {
    hideMainButton();
  }, []);

  // Back Button
  const setBackButton = useCallback((onClick) => {
    showBackButton(onClick);
  }, []);

  const removeBackButton = useCallback(() => {
    hideBackButton();
  }, []);

  // Haptic Feedback
  const triggerHaptic = useCallback((type = 'light') => {
    hapticFeedback(type);
  }, []);

  // Popup
  const openPopup = useCallback(async (params) => {
    return await showPopup(params);
  }, []);

  // Close App
  const close = useCallback(() => {
    closeApp();
  }, []);

  // Confirm dialog
  const confirm = useCallback(async (message) => {
    const result = await showPopup({
      title: t('confirm.title'),
      message,
      buttons: [
        { id: 'ok', type: 'ok', text: t('common.yes') },
        { id: 'cancel', type: 'cancel', text: t('common.cancel') },
      ],
    });
    return result === 'ok';
  }, []);

  // Alert dialog
  const alert = useCallback(async (message, title) => {
    await showPopup({
      title: title || t('common.attention'),
      message,
      buttons: [{ id: 'ok', type: 'close', text: t('common.ok') }],
    });
  }, []);

  // ✅ CRITICAL: Memoize value to prevent re-renders
  // Merge Telegram SDK user data with backend user data (for selected_role, etc.)
  const mergedUser = useMemo(() => {
    if (!telegramData?.user && !backendUser) return null;
    return {
      ...telegramData?.user,
      ...backendUser, // Backend data overrides (includes selected_role)
    };
  }, [telegramData?.user, backendUser]);

  const value = useMemo(
    () => ({
      // Data
      user: mergedUser, // Now includes selected_role from backend
      tg: telegramData?.tg,
      platform: telegramData?.platform,
      version: telegramData?.version,
      isReady,
      isValidating,
      error,

      // Methods (all stable via useCallback)
      setMainButton,
      removeMainButton,
      setBackButton,
      removeBackButton,
      triggerHaptic,
      openPopup,
      confirm,
      alert,
      close,
    }),
    [
      mergedUser,
      telegramData,
      isReady,
      isValidating,
      error,
      setMainButton,
      removeMainButton,
      setBackButton,
      removeBackButton,
      triggerHaptic,
      openPopup,
      confirm,
      alert,
      close,
    ]
  );

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

/**
 * useTelegram hook - теперь использует контекст вместо создания нового экземпляра
 * Возвращает стабильные ссылки на весь app
 */
export function useTelegram() {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error('useTelegram must be used within TelegramProvider');
  }
  return context;
}
