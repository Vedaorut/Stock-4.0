import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';
import { useToast } from '../hooks/useToast';
import FollowCard from '../components/Follows/FollowCard';
import SubscriptionCard from '../components/Follows/SubscriptionCard';
import CreateFollowModal from '../components/Follows/CreateFollowModal';
import ManageSubscriptionModal from '../components/Follows/ManageSubscriptionModal';
import ConfirmDialog from '../components/Follows/ConfirmDialog';

export default function Follows() {
  const { get, delete: del } = useApi();
  const token = useStore((state) => state.token);
  const myShop = useStore((state) => state.myShop);
  const setMyShops = useStore((state) => state.setMyShops);
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const toast = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [follows, setFollows] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Manage Subscription Modal State
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  // Unsubscribe Confirmation State
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(null);

  // Preselected shop for CreateFollowModal (separate from selectedSubscription to avoid race condition)
  const [preselectedShop, setPreselectedShop] = useState(null);

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
      const { data: subsResponse, error: subsError } = await get('/users/subscriptions', { signal });

      if (signal?.aborted) return { status: 'aborted' };

      if (subsError) {
        if (import.meta.env.DEV) {
          console.error('[Follows] Error loading subscriptions:', subsError);
        }
        return { status: 'error', error: subsError || 'Failed to load subscriptions' };
      }

      setSubscriptions(Array.isArray(subsResponse?.data) ? subsResponse.data : []);

      // Load follows (only for sellers with a shop)
      let shop = myShop;

      if (!shop) {
        const { data: shopsResponse, error: shopsError } = await get('/shops/my', { signal });

        if (signal?.aborted) return { status: 'aborted' };

        if (!shopsResponse?.data?.length) {
          setFollows([]);
          useStore.getState().setHasFollows(false);
          return { status: 'success' };
        }

        shop = shopsResponse.data[0];
        setMyShops(shopsResponse.data);
      }

      if (shop) {
        const { data: followsResponse, error: followsError } = await get('/follows/my', {
          params: { shopId: shop.id },
          signal,
        });

        if (signal?.aborted) return { status: 'aborted' };

        if (!followsError) {
          const list = Array.isArray(followsResponse?.data) ? followsResponse.data : [];
          setFollows(list);
          useStore.getState().setHasFollows(list.length > 0);
        }
      }

      return { status: 'success' };
    },
    [get, myShop, setMyShops]
  );

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    const hasExistingData = follows.length > 0 || subscriptions.length > 0;
    if (!hasExistingData) {
      setIsLoading(true);
    }
    setError(null);

    const controller = new AbortController();

    loadFollows(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [token, loadFollows]);

  // Unified List: Follows + Subscriptions (deduplicated)
  const unifiedItems = useMemo(() => {
    const items = [];
    const handledShopIds = new Set();

    // 1. Add Active Follows (Priority)
    follows.forEach(follow => {
      items.push({ type: 'follow', data: follow, key: `follow-${follow.id}` });
      handledShopIds.add(follow.source_shop_id);
    });

    // 2. Add Subscriptions (if not already appearing as a Follow)
    subscriptions.forEach(sub => {
      // Use efficient Set lookup instead of array.find
      // NOTE: In demo mode/mock data, make sure shop_ids align
      if (!handledShopIds.has(sub.shop_id)) {
        items.push({ type: 'subscription', data: sub, key: `sub-${sub.shop_id}` });
      }
    });

    return items;
  }, [follows, subscriptions]);


  // Handlers
  const handleFollowClick = useCallback((followId) => {
    triggerHaptic('light');
    useStore.getState().setFollowDetailId(followId);
  }, [triggerHaptic]);

  const handleSubscriptionClick = useCallback((subscription) => {
    triggerHaptic('light');
    setSelectedSubscription(subscription);
    setIsManageModalOpen(true);
  }, [triggerHaptic]);

  const handleOpenCatalog = useCallback((shopId, shopName, shopLogo) => {
    const { setCurrentShop, setActiveTab, setProducts } = useStore.getState();

    // Clear products to avoid stale data
    setProducts([], null);

    setCurrentShop({
      id: shopId,
      name: shopName,
      logo: shopLogo || null,
      isOwned: false,
    });

    setActiveTab('catalog');
  }, []);

  const handleUnsubscribe = useCallback(async () => {
    if (!confirmUnsubscribe) return;

    try {
      const { error: delError } = await del(`/shops/${confirmUnsubscribe.shop_id}/subscribe`);

      if (delError) {
        toast.error(t('subscriptions.unsubscribeError'));
        return;
      }

      setSubscriptions((prev) =>
        prev.filter((sub) => sub.shop_id !== confirmUnsubscribe.shop_id)
      );
      toast.success(t('subscriptions.unsubscribeSuccess'));
      triggerHaptic('success');
    } catch {
      toast.error(t('subscriptions.unsubscribeError'));
    } finally {
      setConfirmUnsubscribe(null);
    }
  }, [confirmUnsubscribe, del, t, toast, triggerHaptic]);

  const handleRetry = useCallback(() => {
    if (retryControllerRef.current) {
      retryControllerRef.current.abort();
    }
    retryControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);
    loadFollows(retryControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => setIsLoading(false));
  }, [loadFollows]);

  const handleAddShop = () => {
    triggerHaptic('light');
    if (!myShop) {
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(t('follows.createShopFirst'));
      }
      return;
    }
    setIsCreateModalOpen(true);
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
            {/* Error state similar to defined previously ... omitting svg for brevity, using simple text for robustness */}
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={handleRetry} className="text-orange-500">Retry</button>
          </div>
        ) : unifiedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            {/* Empty state */}
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-[#FF6B00]/10 blur-xl rounded-full"></div>
              <div className="relative w-full h-full rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-sm">
                <PlusIcon className="w-10 h-10 text-white/40" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('follows.empty')}</h3>
            <p className="text-white/50 text-sm max-w-[240px] leading-relaxed">
              Add shops via the bot using <span className="text-[#FF6B00] font-mono bg-[#FF6B00]/10 px-1 rounded">/follow</span> command
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {unifiedItems.map((item, index) => (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                >
                  {item.type === 'follow' ? (
                    <FollowCard
                      follow={item.data}
                      onClick={() => handleFollowClick(item.data.id)}
                    />
                  ) : (
                    <SubscriptionCard
                      subscription={item.data}
                      onClick={() => handleSubscriptionClick(item.data)}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateFollowModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setPreselectedShop(null);
        }}
        myShopId={myShop?.id}
        preselectedShop={preselectedShop}
        onSuccess={() => {
          setPreselectedShop(null);
          const controller = new AbortController();
          loadFollows(controller.signal);
        }}
      />

      <ManageSubscriptionModal
        isOpen={isManageModalOpen}
        onClose={() => {
          setIsManageModalOpen(false);
          setTimeout(() => setSelectedSubscription(null), 300);
        }}
        subscription={selectedSubscription}
        onStartMonitoring={() => {
          // Verify user has shop before opening create modal
          if (!myShop) {
            setIsManageModalOpen(false);
            if (window.Telegram?.WebApp?.showAlert) {
              window.Telegram.WebApp.showAlert(t('follows.createShopFirst'));
            }
            return;
          }
          // Save shop data BEFORE closing modal to avoid race condition with setTimeout cleanup
          if (selectedSubscription) {
            setPreselectedShop({
              id: selectedSubscription.shop_id,
              name: selectedSubscription.shop_name,
              description: selectedSubscription.shop_description,
              logo: selectedSubscription.shop_logo
            });
          }
          setIsManageModalOpen(false);
          setIsCreateModalOpen(true);
        }}
        onOpenCatalog={() => {
          if (selectedSubscription) {
            handleOpenCatalog(selectedSubscription.shop_id, selectedSubscription.shop_name, selectedSubscription.shop_logo);
            setIsManageModalOpen(false);
          }
        }}
        onUnsubscribe={() => {
          setConfirmUnsubscribe(selectedSubscription);
          setIsManageModalOpen(false);
        }}
      />

      <ConfirmDialog
        isOpen={!!confirmUnsubscribe}
        onClose={() => setConfirmUnsubscribe(null)}
        onConfirm={handleUnsubscribe}
        title={t('subscriptions.unsubscribeTitle')}
        message={t('subscriptions.unsubscribeMessage', { shop: confirmUnsubscribe?.shop_name })}
        confirmText={t('subscriptions.unsubscribe')}
        cancelText={t('common.cancel')}
        danger
      />
    </div>
  );
}
