import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Layout/Header';
import { useApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';

export default function Subscriptions() {
  const [myShop, setMyShop] = useState(null);
  const [follows, setFollows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { get } = useApi();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const token = useStore((state) => state.token);
  const setMyShops = useStore((state) => state.setMyShops);

  const loadData = useCallback(
    async (signal) => {
      try {
        // 1. Load my shop
        const { data: shopsData, error: shopsError } = await get('/shops/my', { signal });
        
        if (signal?.aborted) return { status: 'aborted' };
        
        if (shopsError) {
          console.error('[Subscriptions] Error loading shops:', shopsError);
          return { status: 'error', error: 'Не удалось загрузить данные' };
        }

        const shops = Array.isArray(shopsData?.data) ? shopsData.data : [];
        const shop = shops[0] || null;
        
        setMyShop(shop);
        setMyShops(shops); // Save to global store
        
        // 2. Load follows (subscriptions to other shops)
        if (shop) {
          const { data: followsData, error: followsError } = await get('/follows/my', {
            params: { shopId: shop.id },
            signal,
          });
          
          if (signal?.aborted) return { status: 'aborted' };
          
          if (followsError) {
            console.error('[Subscriptions] Error loading follows:', followsError);
            // Don't fail completely, just show my shop without follows
            setFollows([]);
          } else {
            const followsList = Array.isArray(followsData?.data) ? followsData.data : [];
            setFollows(followsList);
          }
        } else {
          setFollows([]);
        }

        return { status: 'success' };
      } catch (err) {
        console.error('[Subscriptions] Unexpected error:', err);
        return { status: 'error', error: err.message };
      }
    },
    [get, setMyShops]
  );

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    loadData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [token, loadData]);

  // Click on MY shop
  const handleMyShopClick = () => {
    triggerHaptic('medium');
    const { setCurrentShop, setActiveTab } = useStore.getState();

    setCurrentShop(null); // null = show my shop in Catalog
    setActiveTab('catalog');
  };

  // Click on followed shop (subscription to other shop)
  const handleFollowClick = (follow) => {
    triggerHaptic('medium');
    const { setCurrentShop, setActiveTab } = useStore.getState();

    setCurrentShop({
      id: follow.source_shop_id,
      name: follow.source_shop_name,
      logo: null,
      isOwned: false, // This is NOT my shop
    });

    setActiveTab('catalog');
  };

  const hasData = myShop || follows.length > 0;

  return (
    <div
      className="h-screen overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <Header title={t('subscriptions.title')} />

      <div className="px-4 py-6">
        {loading ? (
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
              onClick={() => loadData()}
              className="touch-target bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 rounded-xl transition-colors duration-300 mt-4"
              whileTap={{ scale: 0.95 }}
            >
              Повторить
            </motion.button>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-16 h-16 text-gray-600 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">{t('subscriptions.empty')}</h3>
            <p className="text-sm text-gray-500">{t('subscriptions.emptyDesc')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* MY SHOP - always on top */}
            {myShop && (
              <motion.div
                onClick={handleMyShopClick}
                className="glass-card rounded-2xl p-6 cursor-pointer min-h-[90px] border border-orange-primary/30"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01, y: -2 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3
                      className="text-xl font-bold text-white"
                      style={{ letterSpacing: '-0.01em' }}
                    >
                      {myShop.name}
                    </h3>
                  </div>
                  <svg
                    className="w-6 h-6 text-orange-primary flex-shrink-0 ml-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </motion.div>
            )}

            {/* FOLLOWED SHOPS - subscriptions to other shops */}
            {follows.map((follow, index) => (
              <motion.div
                key={follow.id}
                onClick={() => handleFollowClick(follow)}
                className="glass-card rounded-2xl p-6 cursor-pointer min-h-[90px]"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01, y: -2 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <h3
                      className="text-xl font-bold text-white"
                      style={{ letterSpacing: '-0.01em' }}
                    >
                      {follow.source_shop_name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/20 text-blue-400">
                        {follow.source_products_count || 0} товаров
                      </span>
                    </div>
                  </div>
                  <svg
                    className="w-6 h-6 text-orange-primary flex-shrink-0 ml-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
