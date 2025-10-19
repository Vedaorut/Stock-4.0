import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './store/useStore';
import { useTelegram } from './hooks/useTelegram';
import { initI18n, getLanguage } from './i18n';
import TabBar from './components/Layout/TabBar';
import CartSheet from './components/Cart/CartSheet';
import PaymentFlowManager from './components/Payment/PaymentFlowManager';
import Subscriptions from './pages/Subscriptions';
import Catalog from './pages/Catalog';
import Settings from './pages/Settings';
import './styles/globals.css';

function App() {
  const { activeTab } = useStore();
  const { user, isReady } = useTelegram();

  // Инициализация i18n
  useEffect(() => {
    const loadLanguage = async () => {
      const lang = getLanguage()
      await initI18n()
      useStore.getState().setLanguage(lang)
    }
    loadLanguage()
  }, [])

  useEffect(() => {
    if (isReady && user) {
      // Сохраняем пользователя в store
      useStore.getState().setUser(user);
    }
  }, [isReady, user]);

  const renderPage = () => {
    switch (activeTab) {
      case 'subscriptions':
        return <Subscriptions />;
      case 'catalog':
        return <Catalog />;
      case 'settings':
        return <Settings />;
      default:
        return <Subscriptions />;
    }
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg">
        <div className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative"
      style={{
        background: 'linear-gradient(180deg, #0A0A0A 0%, #17212b 100%)'
      }}
    >
      {/* Subtle orange glow - barely visible */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 20%, rgba(255, 107, 0, 0.03), transparent 60%)`,
          opacity: 0.6
        }}
      />

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {renderPage()}
        </AnimatePresence>

        <TabBar />
        <CartSheet />
        <PaymentFlowManager />
      </div>
    </div>
  );
}

export default App;
