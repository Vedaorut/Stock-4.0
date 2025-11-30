import { useEffect, useState, lazy, Suspense } from 'react';
import { AnimatePresence, motion, LazyMotion, domAnimation } from 'framer-motion';
import { useStore } from './store/useStore';
import { useTelegram } from './hooks/useTelegram';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardViewport } from './hooks/useKeyboardViewport';
import { usePlatform } from './hooks/usePlatform';
import { initI18n, getLanguage } from './i18n';
import TabBarPortal from './components/TabBarPortal';
import CartSheet from './components/Cart/CartSheet';
import PaymentFlowManager from './components/Payment/PaymentFlowManager';
import { ToastContainer } from './components/common/Toast';
import OfflineBanner from './components/common/OfflineBanner';
import { useToastStore } from './hooks/useToast';
import './styles/globals.css';
import { useApi } from './hooks/useApi';

// Lazy load pages for code splitting
const SubscriptionsPage = lazy(() => import('./pages/Subscriptions'));
const CatalogPage = lazy(() => import('./pages/Catalog'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const FollowsPage = lazy(() => import('./pages/Follows'));
const FollowDetailPage = lazy(() => import('./pages/FollowDetail'));

// Loading fallback component
function PageLoader() {
  return (
  <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
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
  const { user, isReady, isValidating, error } = useTelegram();
  const { isConnected } = useWebSocket();
  const platform = usePlatform();
  const { toasts, removeToast } = useToastStore();
  const { get } = useApi();
  const [followsChecked, setFollowsChecked] = useState(false);

  // Инициализация i18n
  useEffect(() => {
    const loadLanguage = async () => {
      const lang = getLanguage();
      await initI18n();
      useStore.getState().setLanguage(lang);
    };
    loadLanguage();
  }, []);

  // Инициализация Telegram WebApp
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

      tg.setHeaderColor('#0A0A0A');
      tg.setBackgroundColor('#0A0A0A');
    }
  }, []);

  // Keyboard viewport management
  useKeyboardViewport();

  useEffect(() => {
    if (isReady && user) {
      useStore.getState().setUser(user);
    }
  }, [isReady, user]);

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
        if (fetchError.name === 'AbortError') return;
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
    // Если открыт детальный просмотр подписки
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

  // Show loading state during validation
  if (isValidating || !isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Show error state if authentication failed
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] p-4">
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
    <LazyMotion features={domAnimation}>
      <div
        className="fixed inset-0 flex flex-col overflow-hidden min-h-0"
        style={{ height: 'var(--vh-dynamic)' }}
      >
        <div
          className="fixed inset-0 z-0"
          style={{
            background: 'linear-gradient(180deg, #0A0A0A 0%, #17212b 100%)',
          }}
        />

        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 20%, rgba(255, 107, 0, 0.03), transparent 60%)`,
            opacity: 0.6,
          }}
        />

        {import.meta.env.DEV && (
          <div className="fixed top-2 right-2 z-50">
            <div
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}
            >
              {isConnected ? '🟢 WS Connected' : '🔴 WS Disconnected'}
            </div>
          </div>
        )}

        <div
          className="scroll-container relative z-10 flex-1 min-h-0 overflow-y-auto"
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
          <CartSheet />
          <PaymentFlowManager />
          <ToastContainer toasts={toasts} removeToast={removeToast} />
          <OfflineBanner />
        </div>
      </div>
    </LazyMotion>
  );
}

export default App;
