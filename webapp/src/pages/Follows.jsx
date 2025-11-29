import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion'; // Used in JSX
import { PlusIcon } from '@heroicons/react/24/outline';
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
      // First, load user's shop if not already loaded
      let shop = myShop;

      if (!shop) {
        const { data: shopsResponse, error: shopsError } = await get('/shops/my', { signal });

        if (signal?.aborted) return { status: 'aborted' };

        if (shopsError) {
          console.error('[Follows] Error loading shops:', shopsError);
          return { status: 'error', error: 'Не удалось загрузить магазин' };
        }

        const shops = Array.isArray(shopsResponse?.data) ? shopsResponse.data : [];

        if (!shops.length) {
          setFollows([]);
          useStore.getState().setHasFollows(false);
          return { status: 'success' };
        }

        shop = shops[0];
        // Save myShop to store for future use
        setMyShop(shop);
      }

      // Load follows using consistent endpoint
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
      // ✅ FIX: Use getState() for stable reference
      useStore.getState().setFollowDetailId(followId);
    },
    [triggerHaptic]
  );

  const handleAddShop = () => {
    triggerHaptic('light');
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert('Добавление магазинов доступно через бота. Используйте команду /follow');
    }
  };

  return (
    <div className="pb-24" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}>
      {/* Custom Header with Add Button */}
      <div 
        className="fixed top-0 left-0 right-0 z-40 bg-dark-bg/95 backdrop-blur-lg border-b border-white/5" 
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">{t('tabs.follows')}</h1>
          <motion.button
            onClick={handleAddShop}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-orange-primary/10 text-orange-primary"
            whileTap={{ scale: 0.95 }}
          >
            <PlusIcon className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {isLoading ? (
          <motion.div
            className="flex flex-col items-center justify-center py-16 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="text-gray-400 text-sm"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              Загрузка подписок...
            </motion.div>
          </motion.div>
        ) : error ? (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </div>
        ) : follows.length === 0 ? (
          <div className="glass-card rounded-2xl p-4 text-gray-400 text-sm">
            У вас пока нет подписок. Добавьте магазины через бота.
          </div>
        ) : (
          <div className="space-y-3">
            {follows.map((follow) => (
              <FollowCard
                key={follow.id}
                follow={follow}
                onClick={() => handleFollowClick(follow.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
