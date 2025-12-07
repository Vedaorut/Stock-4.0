import { useCallback, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';
import FollowCard from '../components/Follows/FollowCard';
// eslint-disable-next-line no-unused-vars -- Used in JSX below
import ProductsPreview from '../components/Follows/ProductsPreview';
import SubscriptionCard from '../components/Follows/SubscriptionCard';

export default function Follows() {
  const { get } = useApi();
  const token = useStore((state) => state.token);
  const myShop = useStore((state) => state.myShop);
  const setMyShops = useStore((state) => state.setMyShops);
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [follows, setFollows] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);

  // AbortController for retry requests
  const retryControllerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryControllerRef.current) {
        retryControllerRef.current.abort();
      }
    };
  }, []);

  const loadFollows = useCallback(
    async (signal) => {
      // Load user subscriptions (shops subscribed via invite link)
      // This works for ALL users, even without a shop
      const { data: subsResponse, error: subsError } = await get('/users/subscriptions', { signal });

      if (signal?.aborted) return { status: 'aborted' };

      if (!subsError && subsResponse?.data) {
        setSubscriptions(Array.isArray(subsResponse.data) ? subsResponse.data : []);
      } else {
        setSubscriptions([]);
      }

      // Load follows (only for sellers with a shop)
      let shop = myShop;

      if (!shop) {
        const { data: shopsResponse, error: shopsError } = await get('/shops/my', { signal });

        if (signal?.aborted) return { status: 'aborted' };

        if (shopsError) {
          if (import.meta.env.DEV) {
            console.error('[Follows] Error loading shops:', shopsError);
          }
          // Still return success if we loaded subscriptions
          setFollows([]);
          useStore.getState().setHasFollows(false);
          return { status: 'success' };
        }

        const shops = Array.isArray(shopsResponse?.data) ? shopsResponse.data : [];

        if (!shops.length) {
          setFollows([]);
          useStore.getState().setHasFollows(false);
          return { status: 'success' };
        }

        shop = shops[0];
        setMyShops(shops);  // Save ALL shops to store
      }

      const { data: followsResponse, error: followsError } = await get('/follows/my', {
        params: { shopId: shop.id },
        signal,
      });

      if (signal?.aborted) return { status: 'aborted' };

      if (followsError) {
        if (import.meta.env.DEV) {
          console.error('[Follows] Error loading follows:', followsError);
        }
        return { status: 'error', error: 'Failed to load subscriptions' };
      }

      const list = Array.isArray(followsResponse?.data)
        ? followsResponse.data
        : followsResponse || [];
      setFollows(list);
      useStore.getState().setHasFollows(list.length > 0);
      return { status: 'success' };
    },
    [get, myShop, setMyShops]
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

  // Handle click on subscription - navigate to shop catalog
  const handleSubscriptionClick = useCallback((subscription) => {
    triggerHaptic('light');
    const { setCurrentShop, setActiveTab } = useStore.getState();

    setCurrentShop({
      id: subscription.shop_id,
      name: subscription.shop_name,
      logo: subscription.shop_logo || null,
      isOwned: false,
    });

    setActiveTab('catalog');
  }, [triggerHaptic]);

  // Handle retry with AbortController
  const handleRetry = useCallback(() => {
    // Cancel any in-flight retry request
    if (retryControllerRef.current) {
      retryControllerRef.current.abort();
    }
    retryControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    loadFollows(retryControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'aborted') return;
        if (result?.status === 'error') {
          setError(result.error);
          setFollows([]);
          useStore.getState().setHasFollows(false);
        }
      })
      .finally(() => {
        if (!retryControllerRef.current?.signal?.aborted) {
          setIsLoading(false);
        }
      });
  }, [loadFollows]);

  const handleAddShop = () => {
    triggerHaptic('light');
    if (window.Telegram?.WebApp?.showAlert) {
      window.Telegram.WebApp.showAlert('Use the /follow command in the bot to add shops');
    }
  };

  return (
    <div
      className="min-h-full bg-[#181818]"
      style={{
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 bg-[#181818]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 36px)' }}
      >
        <div className="flex-1" />
        <h1 className="text-[22px] font-bold text-white tracking-tight py-3">
          {t('tabs.follows')}
        </h1>
        <div className="flex-1 flex justify-end">
          <motion.button
            onClick={handleAddShop}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6B00]/20 to-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20"
            whileTap={{ scale: 0.92 }}
          >
            <PlusIcon className="w-5 h-5 stroke-[2.5]" />
          </motion.button>
        </div>
      </div>

      <div className="px-4 py-6">
        {isLoading ? (
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
              onClick={handleRetry}
              className="mt-4 px-6 py-3 bg-[#FF6B00] text-white font-semibold rounded-xl shadow-lg shadow-[#FF6B00]/20"
              whileTap={{ scale: 0.95 }}
            >
              {t('common.retry')}
            </motion.button>
          </div>
        ) : subscriptions.length === 0 && follows.length === 0 ? (
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
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('follows.empty')}</h3>
            <p className="text-white/50 text-sm max-w-[240px] leading-relaxed">
              Add shops via the bot using <span className="text-[#FF6B00] font-mono bg-[#FF6B00]/10 px-1 rounded">/follow</span> command
            </p>
          </div>
        ) : (
          <>
            {/* User Subscriptions Section */}
            {subscriptions.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 px-1">
                  {t('subscriptions.title')}
                </h2>
                <div className="space-y-3">
                  {subscriptions.map((sub, index) => (
                    <motion.div
                      key={sub.shop_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <SubscriptionCard
                        subscription={sub}
                        onClick={() => handleSubscriptionClick(sub)}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Follows Section (for sellers) */}
            {follows.length > 0 && (
              <div className="space-y-3">
                {subscriptions.length > 0 && (
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 px-1">
                    {t('follows.myFollows')}
                  </h2>
                )}
                {follows.map((follow, index) => (
                  <motion.div
                    key={follow.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (subscriptions.length + index) * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                  >
                    <FollowCard
                      follow={follow}
                      onClick={() => handleFollowClick(follow.id)}
                    />
                    <ProductsPreview
                      followId={follow.id}
                      mode={follow.mode}
                      maxProducts={5}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
