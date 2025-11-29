import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/outline';
import Header from '../components/Layout/Header';
import { useApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';
import FollowCard from '../components/Follows/FollowCard';

export default function Follows() {
  const { get } = useApi();
  const token = useStore((state) => state.token);
  const myShop = useStore((state) => state.myShop);
  const setMyShop = useStore((state) => state.setMyShop);
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [follows, setFollows] = useState([]);

  const loadFollows = useCallback(
    async (signal) => {
      let shop = myShop;

      if (!shop) {
        const { data: shopsResponse, error: shopsError } = await get('/shops/my', { signal });

        if (signal?.aborted) return { status: 'aborted' };

        if (shopsError) {
          console.error('[Follows] Error loading shops:', shopsError);
          return { status: 'error', error: 'Не удалось загрузить данные' };
        }

        const shops = Array.isArray(shopsResponse?.data) ? shopsResponse.data : [];

        if (!shops.length) {
          setFollows([]);
          useStore.getState().setHasFollows(false);
          return { status: 'success' };
        }

        shop = shops[0];
        setMyShop(shop);
      }

      const { data: followsResponse, error: followsError } = await get('/follows/my', {
        params: { shopId: shop.id },
        signal,
      });

      if (signal?.aborted) return { status: 'aborted' };

      if (followsError) {
        console.error('[Follows] Error loading follows:', followsError);
        return { status: 'error', error: 'Не удалось загрузить подписки' };
      }

      const list = Array.isArray(followsResponse?.data)
        ? followsResponse.data
        : followsResponse || [];
      setFollows(list);
      useStore.getState().setHasFollows(list.length > 0);
      return { status: 'success' };
    },
    [get, myShop, setMyShop]
  );

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    loadFollows(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
          setFollows([]);
          useStore.getState().setHasFollows(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [token, loadFollows]);

  const handleFollowClick = useCallback(
    (followId) => {
      triggerHaptic('light');
      useStore.getState().setFollowDetailId(followId);
    },
    [triggerHaptic]
  );

  const handleAddShop = () => {
    triggerHaptic('light');
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert('Используйте команду /follow в боте для добавления магазинов');
    }
  };

  return (
    <div
      className="h-screen overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <Header title={t('tabs.follows')} />

      {/* Add button - fixed in header area */}
      <div
        className="fixed top-0 right-0 z-50 pr-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <motion.button
          onClick={handleAddShop}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-orange-primary/10 text-orange-primary"
          whileTap={{ scale: 0.95 }}
        >
          <PlusIcon className="w-5 h-5" />
        </motion.button>
      </div>

      <div className="px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-16 h-16 text-red-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">{error}</h3>
            <motion.button
              onClick={() => loadFollows()}
              className="touch-target bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 rounded-xl transition-colors duration-300 mt-4"
              whileTap={{ scale: 0.95 }}
            >
              Попробовать снова
            </motion.button>
          </div>
        ) : follows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <svg
                className="w-10 h-10 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Нет подписок</h3>
            <p className="text-gray-400 text-sm mb-6">
              Добавьте магазины через бота командой /follow
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {follows.map((follow, index) => (
              <motion.div
                key={follow.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <FollowCard
                  follow={follow}
                  onClick={() => handleFollowClick(follow.id)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
