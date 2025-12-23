import { useEffect, useState, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store/useStore';
import { useTelegram } from './hooks/useTelegram';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardViewport } from './hooks/useKeyboardViewport';
import { usePlatform } from './hooks/usePlatform';
import { initI18n, getLanguage } from './i18n';
import TabBarPortal from './components/TabBarPortal';
import CartSheet from './components/Cart/CartSheet';
import CartButton from './components/Cart/CartButton';
import PaymentFlowManager from './components/Payment/PaymentFlowManager';
import { ToastContainer } from './components/common/Toast';
import OfflineBanner from './components/common/OfflineBanner';
import { useToastStore, useToast } from './hooks/useToast';
import './styles/globals.css';
import { useApi, invalidateCache } from './hooks/useApi';
import { clearActivePayment, getActivePayment } from './utils/paymentStorage';

// DEBUG: Expose store for console access
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  window.useStore = useStore;
}

// Lazy load pages for code splitting
const SubscriptionsPage = lazy(() => import('./pages/Subscriptions'));
const CatalogPage = lazy(() => import('./pages/Catalog'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const FollowsPage = lazy(() => import('./pages/Follows'));
const FollowDetailPage = lazy(() => import('./pages/FollowDetail'));

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#181818]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  // ✅ Fix: Use selectors for proper Zustand subscription (prevents missing re-renders)
  const activeTab = useStore((state) => state.activeTab);
  const followDetailId = useStore((state) => state.followDetailId);
  const token = useStore((state) => state.token);
  const hasFollows = useStore((state) => state.hasFollows);
  const isI18nReady = useStore((state) => state.isI18nReady);
  const setCartOpen = useStore((state) => state.setCartOpen);
  const setPendingOrders = useStore((state) => state.setPendingOrders);
  const resumePayment = useStore((state) => state.resumePayment);
  const { user, isReady, isValidating, error, startParam } = useTelegram();
  const { isConnected } = useWebSocket();
  const platform = usePlatform();
  const { toasts, removeToast } = useToastStore();
  const toast = useToast();
  const { get, post } = useApi();
  const [followsChecked, setFollowsChecked] = useState(false);
  const [deepLinkProcessed, setDeepLinkProcessed] = useState(false);
  const [writeAccessRequested, setWriteAccessRequested] = useState(false);

  // Initialize i18n - use language from backend (synced with bot)
  useEffect(() => {
    const loadLanguage = async () => {
      // Priority: user.language from backend > Telegram SDK
      const backendLang = user?.language;
      await initI18n(backendLang);
      const lang = backendLang || getLanguage();
      useStore.getState().setLanguage(lang);
      // Mark i18n as ready AFTER translations are loaded
      useStore.getState().setI18nReady(true);
    };
    // Wait for user to load from backend
    if (isReady) {
      loadLanguage();
    }
  }, [isReady, user?.language]);

  // Set view mode from user's selected_role (from backend)
  // NOTE: selected_role can be null for new users - default to 'buyer'
  useEffect(() => {
    if (isReady && user) {
      // If selected_role is explicitly 'seller', use seller mode
      // Otherwise (null, undefined, 'buyer') use buyer mode
      const mode = user.selected_role === 'seller' ? 'seller' : 'buyer';
      useStore.getState().setViewMode(mode);
      // Buyer defaults to Catalog (not empty Subscriptions)
      if (mode === 'buyer') {
        useStore.getState().setActiveTab('catalog');
      }
    }
  }, [isReady, user]);

  // Handle deep link (startapp parameter) - navigate to specific shop
  // Format: ?startapp=shop_123 or ?startapp=INVITE_CODE
  useEffect(() => {
    if (!isReady || !token || deepLinkProcessed) return;

    // startParam comes from TelegramProvider context (tg.initDataUnsafe.start_param)
    if (!startParam) {
      setDeepLinkProcessed(true);
      return;
    }

    const controller = new AbortController();

    const handleDeepLink = async () => {
      try {
        let shop = null;

        // Parse startParam: either "shop_123" format or invite_code
        if (startParam.startsWith('shop_')) {
          // Legacy format: shop_123
          const shopId = startParam.replace('shop_', '');
          const { data: shopResponse } = await get(`/shops/${shopId}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          shop = shopResponse?.data;
        } else {
          // Invite code format: use dedicated endpoint GET /shops/invite/:code
          const { data: shopResponse } = await get(`/shops/invite/${startParam}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          shop = shopResponse?.data;
        }

        if (shop) {
          // Subscribe to shop FIRST (handles already subscribed gracefully)
          try {
            const { data: subscribeResponse, error: subscribeError } = await post(
              `/shops/${shop.id}/subscribe`,
              {},
              { signal: controller.signal }
            );

            if (controller.signal.aborted) return;

            if (!subscribeError) {
              if (import.meta.env.DEV) {
                console.log('[DeepLink] Subscribed to shop:', shop.name);
              }
              // Invalidate subscriptions cache to refresh UI
              invalidateCache('/users');
              // Show success notification only for new subscriptions
              if (subscribeResponse?.isNew) {
                toast.success(`Вы подписались на магазин "${shop.name}"`);
              }
            } else if (subscribeError.response?.status === 409) {
              // Already subscribed - this is OK, continue silently
              if (import.meta.env.DEV) {
                console.log('[DeepLink] Already subscribed to shop:', shop.name);
              }
              // Invalidate cache anyway to ensure UI is up-to-date
              invalidateCache('/users');
            } else {
              // Subscription failed - log but continue to show shop
              console.warn('[DeepLink] Subscription failed:', subscribeError);
            }
          } catch (subscribeErr) {
            // Subscription error - log but continue to show shop
            if (subscribeErr.name !== 'AbortError' && subscribeErr.code !== 'ERR_CANCELED') {
              console.warn('[DeepLink] Subscription error:', subscribeErr);
            }
          }

          // Set current shop and navigate to catalog
          useStore.getState().setCurrentShop(shop);
          useStore.getState().setActiveTab('catalog');

          if (import.meta.env.DEV) {
            console.log('[DeepLink] Navigated to shop:', shop.name);
          }
        } else {
          // Shop not found (404) or invalid response
          toast.error('Магазин не найден. Ссылка может быть недействительной.');
          console.warn('[DeepLink] Shop not found for:', startParam);
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;

        // Handle specific HTTP errors with user-friendly messages
        if (err.response) {
          const status = err.response.status;
          if (status === 404) {
            toast.error('Магазин не найден. Ссылка может быть недействительной.');
          } else if (status === 403) {
            toast.error('Этот магазин заблокирован или приватный.');
          } else if (status >= 500) {
            toast.error('Ошибка сервера. Попробуйте позже.');
          } else {
            toast.error('Не удалось загрузить магазин. Проверьте соединение.');
          }
        } else if (err.message?.includes('Network Error')) {
          toast.error('Нет интернет соединения. Попробуйте позже.');
        } else {
          toast.error('Не удалось открыть ссылку на магазин.');
        }

        console.error('[DeepLink] Error processing deep link:', err);
      } finally {
        if (!controller.signal.aborted) {
          setDeepLinkProcessed(true);
        }
      }
    };

    handleDeepLink();

    return () => controller.abort();
  }, [isReady, token, startParam, deepLinkProcessed, get, post, toast]);

  // Request write access after deep link navigation (for push notifications)
  // Shows native Telegram popup asking for permission to send messages
  useEffect(() => {
    if (!deepLinkProcessed || writeAccessRequested) return;

    // startParam comes from TelegramProvider context
    // Only request if we came from a deep link (shop link)
    if (!startParam) return;

    // Check if it's a shop deep link
    // - Legacy format: shop_123 (starts with 'shop_')
    // - Invite code format: alphanumeric only (no underscores or special chars)
    const isShopDeepLink = startParam.startsWith('shop_') ||
      /^[a-zA-Z0-9]+$/.test(startParam);

    if (!isShopDeepLink) return;

    const tg = window.Telegram?.WebApp;

    // Small delay to ensure shop page is rendered first
    const timeout = setTimeout(() => {
      try {
        if (!tg) {
          console.warn('[WriteAccess] Telegram WebApp SDK not available');
          setWriteAccessRequested(true);
          return;
        }

        if (!tg.requestWriteAccess) {
          console.warn('[WriteAccess] requestWriteAccess not supported');
          setWriteAccessRequested(true);
          return;
        }

        tg.requestWriteAccess((allowed) => {
          if (import.meta.env.DEV) {
            console.log('[WriteAccess]', allowed ? 'Granted' : 'Declined');
          }
          // Note: If user declines, we don't show any blocking UI
          // The bot simply won't be able to send push notifications
        });

        setWriteAccessRequested(true);
      } catch (error) {
        console.error('[WriteAccess] Failed to request write access:', error);
        // Mark as requested to avoid infinite retry loop
        setWriteAccessRequested(true);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [startParam, deepLinkProcessed, writeAccessRequested]);

  // Initialize Telegram WebApp
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

      // Prevent app from closing on vertical swipe (Bot API 7.7+)
      if (tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes) {
        tg.disableVerticalSwipes();
      }

      // Also disable confirmation closing if enabled
      if (tg.isClosingConfirmationEnabled) {
        tg.enableClosingConfirmation();
      }

      tg.setHeaderColor('#181818');
      tg.setBackgroundColor('#181818');
    }

    // DEMO MODE: Auto-login
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      console.log('[App] Demo mode active - injecting mock user');
      useStore.getState().setUser({
        id: 12345678,
        first_name: 'Demo',
        last_name: 'User',
        username: 'demouser',
        language_code: 'en',
        selected_role: 'buyer'
      });
      useStore.getState().setToken('demo-token-123');
      useStore.getState().setMyShops([{
        id: 'shop_1',
        name: 'Demo Shop',
        description: 'A demo shop'
      }]);
    }
  }, []);

  // Keyboard viewport management
  useKeyboardViewport();

  useEffect(() => {
    if (isReady && user) {
      useStore.getState().setUser(user);
    }
  }, [isReady, user]);

  useEffect(() => {
    if (!isReady || !token) return;

    const controller = new AbortController();

    const loadPendingOrders = async () => {
      const { data, error: apiError } = await get('/orders/pending', {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (apiError) {
        if (import.meta.env.DEV) {
          console.error('[App] Failed to load pending orders:', apiError);
        }
        return;
      }

      const pendingOrder = data?.data || null;
      const normalizedId = pendingOrder?.orderId ?? pendingOrder?.id ?? null;
      const orders = pendingOrder ? [{ ...pendingOrder, id: normalizedId }] : [];
      setPendingOrders(orders);

      const activePayment = getActivePayment();
      const resumeId = activePayment?.orderId || normalizedId;
      if (!resumeId) {
        clearActivePayment();
        return;
      }

      const resumeResult = resumePayment(resumeId);
      if (resumeResult && !resumeResult.success) {
        clearActivePayment();
      }
    };

    loadPendingOrders();

    return () => controller.abort();
  }, [get, isReady, resumePayment, setPendingOrders, token]);

  // ✅ Fix: Wait for token before checking follows (prevents race condition)
  useEffect(() => {
    if (!isReady || !token || followsChecked || hasFollows) {
      return;
    }

    const controller = new AbortController();

    const checkFollows = async () => {
      try {
        const { data: shopsResponse } = await get('/shops/my', { signal: controller.signal });

        // Only update state if NOT aborted
        if (controller.signal.aborted) return;

        const shops = Array.isArray(shopsResponse?.data) ? shopsResponse.data : [];

        if (!shops.length) {
          useStore.getState().setHasFollows(false);
          setFollowsChecked(true);
          return;
        }

        const primaryShop = shops[0];
        // Save ALL shops to store for multi-shop ownership detection
        useStore.getState().setMyShops(shops);

        // Use consistent endpoint: /follows/my with shopId param
        const { data: followsResponse } = await get('/follows/my', {
          params: { shopId: primaryShop.id },
          signal: controller.signal,
        });

        // Only update state if NOT aborted
        if (controller.signal.aborted) return;

        const list = Array.isArray(followsResponse?.data)
          ? followsResponse.data
          : followsResponse || [];
        useStore.getState().setHasFollows(list.length > 0);
      } catch (fetchError) {
        // Ignore abort errors
        if (fetchError.name === 'AbortError' || fetchError.code === 'ERR_CANCELED') return;
        // Silent failure - tab will appear once user opens section manually
      } finally {
        if (!controller.signal.aborted) {
          setFollowsChecked(true);
        }
      }
    };

    checkFollows();

    // Cleanup
    return () => {
      controller.abort();
    };
  }, [isReady, token, followsChecked, hasFollows, get]);

  // Page transition variants
  const pageVariants = {
    initial: { opacity: 0, x: -20 },
    enter: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  };

  const pageTransition = {
    type: 'spring',
    stiffness: 380,
    damping: 30,
  };

  const renderPage = () => {
    // If follow detail view is open
    if (followDetailId) {
      return <FollowDetailPage />;
    }

    switch (activeTab) {
      case 'subscriptions':
        return <SubscriptionsPage />;
      case 'follows':
        return <FollowsPage />;
      case 'catalog':
        return <CatalogPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <SubscriptionsPage />;
    }
  };

  // Show loading state during validation or i18n loading
  if (isValidating || !isReady || !isI18nReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181818]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        </div>
      </div>
    );
  }

  // Show error state if authentication failed (skip in demo mode)
  if (error && import.meta.env.VITE_DEMO_MODE !== 'true') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181818] p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-white text-xl font-bold mb-2">Authentication Failed</h1>
          <p className="text-white/60 mb-4">{error}</p>
          <p className="text-white/40 text-sm">
            Please open this app from the Telegram bot menu button.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#181818] flex flex-col overflow-hidden">
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 20%, rgba(255, 107, 0, 0.03), transparent 60%)`,
          opacity: 0.6,
        }}
      />


      <div
        className="flex-1 min-h-0 overflow-y-auto bg-[#181818] [-webkit-overflow-scrolling:touch]"
        data-platform={platform}
      >
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={followDetailId ? `follow-${followDetailId}` : activeTab}
              initial="initial"
              animate="enter"
              exit="exit"
              variants={pageVariants}
              transition={pageTransition}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </div>

      <div className="relative z-20">
        <TabBarPortal />
        {/* CartButton shown globally but only visible on catalog tab */}
        {activeTab === 'catalog' && !followDetailId && (
          <CartButton onClick={() => setCartOpen(true)} />
        )}
        <CartSheet />
        <PaymentFlowManager />
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <OfflineBanner />

        {/* Global Debug Trigger (Demo Mode Only) */}
        {import.meta.env.VITE_DEMO_MODE === 'true' && (
          <button
            onClick={() => {
              useStore.setState({
                currentOrder: {
                  id: 'DEMO-1234',
                  total_price: 99.99,
                  crypto_amount: 0.05,
                  currency: 'USD',
                  items: [{ name: 'Demo Product', price: 99.99, quantity: 1 }]
                },
                selectedCrypto: 'BTC',
                paymentStep: 'success',
                pendingOrders: [{
                  id: 'DEMO-1234',
                  txHash: 'a1b2c3d4e5f67890abcdef1234567890',
                  total_price: 99.99,
                  status: 'paid'
                }]
              });
            }}
            // High z-index and explicit pointer-events
            className="fixed top-4 right-4 bg-red-500 text-white font-bold p-3 rounded-full shadow-lg border-2 border-white/20 active:scale-90 transition-transform"
            style={{
              zIndex: 9999,
              minWidth: '44px',
              minHeight: '44px',
              touchAction: 'manipulation',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
          >
            TEST PAY
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
