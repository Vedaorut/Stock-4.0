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
  const [buyerSubscriptions, setBuyerSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { get } = useApi();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const token = useStore((state) => state.token);
  const viewMode = useStore((state) => state.viewMode);
  const setMyShops = useStore((state) => state.setMyShops);

  const loadData = useCallback(
    async (signal) => {
      try {
        // BUYER MODE: fetch user's subscriptions to shops
        if (viewMode === 'buyer') {
          const { data: subsData, error: subsError } = await get('/subscriptions', { signal });

          if (signal?.aborted) return { status: 'aborted' };

          if (subsError) {
            if (import.meta.env.DEV) {
              console.error('[Subscriptions] Error loading buyer subscriptions:', subsError);
            }
            return { status: 'error', error: 'Не удалось загрузить подписки' };
          }

          const subsList = Array.isArray(subsData?.data) ? subsData.data : [];
          setBuyerSubscriptions(subsList);

          return { status: 'success' };
        }

        // SELLER MODE: existing logic
        // 1. Load my shop
        const { data: shopsData, error: shopsError } = await get('/shops/my', { signal });

        if (signal?.aborted) return { status: 'aborted' };

        if (shopsError) {
          if (import.meta.env.DEV) {
            console.error('[Subscriptions] Error loading shops:', shopsError);
          }
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
            if (import.meta.env.DEV) {
              console.error('[Subscriptions] Error loading follows:', followsError);
            }
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
        if (import.meta.env.DEV) {
          console.error('[Subscriptions] Unexpected error:', err);
        }
        return { status: 'error', error: err.message };
      }
    },
    [get, setMyShops, viewMode]
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

  // Click on MY shop (seller mode)
  const handleMyShopClick = () => {
    triggerHaptic('medium');
    const { setCurrentShop, setActiveTab } = useStore.getState();

    setCurrentShop(null); // null = show my shop in Catalog
    setActiveTab('catalog');
  };

  // Click on followed shop (seller mode - subscription to other shop)
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

  // Click on buyer subscription (buyer mode - navigate to shop catalog)
  const handleBuyerSubscriptionClick = (sub) => {
    triggerHaptic('medium');
    const { setCurrentShop, setActiveTab } = useStore.getState();

    setCurrentShop({
      id: sub.shop_id,
      name: sub.shop_name,
      logo: null,
      isOwned: false,
    });

    setActiveTab('catalog');
  };

  // Determine if we have data based on mode
  const hasData = viewMode === 'buyer'
    ? buyerSubscriptions.length > 0
    : (myShop || follows.length > 0);

  return (
    <div
      className="h-screen overflow-y-auto bg-[#181818]"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <Header title={t('subscriptions.title')} />

      <div className="px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-red-500"
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
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{error}</h3>
            <motion.button
              onClick={() => {
                setLoading(true);
                setError(null);
                loadData().finally(() => setLoading(false));
              }}
              className="mt-4 px-6 py-3 bg-[#FF6B00] text-white font-semibold rounded-xl shadow-lg shadow-[#FF6B00]/20"
              whileTap={{ scale: 0.95 }}
            >
              {t('common.retry')}
            </motion.button>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-[#FF6B00]/10 blur-xl rounded-full"></div>
              <div className="relative w-full h-full rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm">
                <svg
                  className="w-10 h-10 text-white/40"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('subscriptions.empty')}</h3>
            <p className="text-white/50 text-sm max-w-[240px] leading-relaxed">{t('subscriptions.emptyDesc')}</p>
          </div>
        ) : viewMode === 'buyer' ? (
          // BUYER MODE: Show subscriptions to shops
          <div className="space-y-4">
            {buyerSubscriptions.map((sub, index) => (
              <motion.div
                key={sub.id}
                onClick={() => handleBuyerSubscriptionClick(sub)}
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
                      {sub.shop_name}
                    </h3>
                    {sub.shop_description && (
                      <p className="text-sm text-gray-400 line-clamp-2">
                        {sub.shop_description}
                      </p>
                    )}
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
        ) : (
          // SELLER MODE: Show my shop + follows
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
