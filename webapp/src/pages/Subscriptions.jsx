import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion'; // Used in JSX
import Header from '../components/Layout/Header';
import { useApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { get } = useApi(); // ✅ FIX: Use stable useApi instead of useShopApi
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const token = useStore((state) => state.token);

  const loadSubscriptions = useCallback(
    async (signal) => {
      const { data, error } = await get('/subscriptions/my-shops', { signal });

      if (signal?.aborted) {
        return { status: 'aborted' };
      }

      if (error) {
        console.error('[Subscriptions] 🔴 ERROR:', error);
        return { status: 'error', error: 'Failed to load subscriptions' };
      }

      const subscriptionsList = data?.data || [];

      if (!Array.isArray(subscriptionsList)) {
        console.error('[Subscriptions] 🔴 INVALID FORMAT:', data);
        return { status: 'error', error: 'Invalid data format from server' };
      }

      const validSubscriptions = subscriptionsList.filter((sub) => sub && sub.id && sub.shop_name);

      // Normalize data for shop subscriptions (payment tier data)
      const normalized = validSubscriptions.map((item) => ({
        id: item.id,
        shopId: item.shop_id,
        shopName: item.shop_name,
        tier: item.tier,
        amount: item.amount,
        currency: item.currency,
        periodStart: item.period_start,
        periodEnd: item.period_end,
        status: item.status,
        createdAt: item.created_at,
        verifiedAt: item.verified_at,
      }));

      setSubscriptions(normalized);
      return { status: 'success' };
    },
    [get]
  );

  useEffect(() => {
    // ✅ Wait for token before loading
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    loadSubscriptions(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        } else {
        }
      });

    // Listen for WebSocket subscription payment confirmations
    const handleSubscriptionConfirmed = (_event) => {
      // Reload subscriptions to show updated status
      loadSubscriptions();
    };

    window.addEventListener('subscription_confirmed', handleSubscriptionConfirmed);

    return () => {
      controller.abort();
      window.removeEventListener('subscription_confirmed', handleSubscriptionConfirmed);
    };
  }, [token, loadSubscriptions]); // Added loadSubscriptions

  const handleShopClick = (subscription) => {
    triggerHaptic('medium');
    const { setCurrentShop, setActiveTab } = useStore.getState();

    setCurrentShop({
      id: subscription.shopId,
      name: subscription.shopName,
      logo: null, // Shop subscriptions don't include logo
    });

    setActiveTab('catalog');
  };

  const hasSubscriptions = useMemo(() => subscriptions.length > 0, [subscriptions]);

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
              onClick={loadSubscriptions}
              className="touch-target bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 rounded-xl transition-colors duration-300 mt-4"
              whileTap={{ scale: 0.95 }}
            >
              Retry
            </motion.button>
          </div>
        ) : !hasSubscriptions ? (
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
            {subscriptions.map((subscription) => {
              // Tier badge configuration
              const tierConfig = {
                FREE: {
                  bg: 'bg-gray-500/20',
                  text: 'text-gray-400',
                  label: 'FREE',
                },
                BASIC: {
                  bg: 'bg-blue-500/20',
                  text: 'text-blue-400',
                  label: 'BASIC',
                },
                PRO: {
                  bg: 'bg-orange-500/20',
                  text: 'text-orange-400',
                  label: 'PRO',
                },
              };

              const tier = subscription.tier?.toUpperCase() || 'FREE';
              const config = tierConfig[tier] || tierConfig.FREE;
              const isActive = subscription.status === 'active';

              return (
                <motion.div
                  key={subscription.id}
                  onClick={() => handleShopClick(subscription)}
                  className="glass-card rounded-2xl p-6 cursor-pointer min-h-[90px]"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01, y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center justify-between">
                    {/* Left side - main information */}
                    <div className="flex-1 space-y-2">
                      {/* Shop name */}
                      <h3
                        className="text-xl font-bold text-white"
                        style={{ letterSpacing: '-0.01em' }}
                      >
                        {subscription.shopName}
                      </h3>

                      {/* Tier badge + Status indicator */}
                      <div className="flex items-center gap-2">
                        {/* Tier badge */}
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${config.bg} ${config.text}`}
                        >
                          {config.label}
                        </span>

                        {/* Status indicator */}
                        <span
                          className={`flex items-center gap-1.5 text-xs font-medium ${isActive ? 'text-green-400' : 'text-gray-500'}`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400' : 'bg-gray-500'}`}
                          ></span>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    {/* Right side - navigation arrow */}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
