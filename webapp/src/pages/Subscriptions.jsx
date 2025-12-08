import { useState, useEffect, useCallback, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import Header from '../components/Layout/Header';
import { useApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';
import { useToast } from '../hooks/useToast';
import ConfirmDialog from '../components/Follows/ConfirmDialog';

function SearchResultItem({ product, onClick }) {
  const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
  
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left"
    >
      <div className="w-12 h-12 rounded-lg bg-dark-elevated overflow-hidden flex-shrink-0">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{product.name}</p>
        <p className="text-xs text-gray-400 truncate">{product.shop_name || 'Shop'}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-orange-primary font-semibold">${price % 1 === 0 ? Math.floor(price) : price.toFixed(2)}</p>
      </div>
      <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </motion.button>
  );
}

export default function Subscriptions() {
  const [myShop, setMyShop] = useState(null);
  const [follows, setFollows] = useState([]);
  const [buyerSubscriptions, setBuyerSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(null);
  const { get, delete: del } = useApi();
  const toast = useToast();

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
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const token = useStore((state) => state.token);
  const viewMode = useStore((state) => state.viewMode);
  const setMyShops = useStore((state) => state.setMyShops);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchContainerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const loadData = useCallback(
    async (signal) => {
      try {
        // BUYER MODE: fetch user's subscriptions to shops
        if (viewMode === 'buyer') {
          const { data: subsData, error: subsError } = await get('/users/subscriptions', { signal });

          if (signal?.aborted) return { status: 'aborted' };

          if (subsError) {
            if (import.meta.env.DEV) {
              console.error('[Subscriptions] Error loading buyer subscriptions:', subsError);
            }
            return { status: 'error', error: 'Failed to load subscriptions' };
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
          return { status: 'error', error: 'Failed to load data' };
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

  // Search products across subscriptions
  const searchProducts = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { data, error } = await get('/products/search', {
        params: { 
          query: query.trim(),
          subscriptions: viewMode === 'buyer' ? 'true' : 'false',
          follows: viewMode === 'seller' ? 'true' : 'false',
          limit: 20
        }
      });
      if (!error && data?.data) {
        setSearchResults(data.data);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [get, viewMode]);

  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearchActive(false);
      return;
    }
    setIsSearchActive(true);
    debounceTimerRef.current = setTimeout(() => searchProducts(query), 300);
  }, [searchProducts]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchActive(false);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    triggerHaptic('light');
  }, [triggerHaptic]);

  const handleSearchResultClick = useCallback((product) => {
    triggerHaptic('medium');
    const { setCurrentShop, setActiveTab, setHighlightProductId } = useStore.getState();
    setCurrentShop({
      id: product.shop_id,
      name: product.shop_name,
      logo: null,
      isOwned: false,
    });
    // Ensure product.id is a number for consistent comparison in ProductCard
    const productId = typeof product.id === 'string' ? parseInt(product.id, 10) : product.id;
    setHighlightProductId(productId);
    setActiveTab('catalog');
    clearSearch();
  }, [triggerHaptic, clearSearch]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // OPTIMIZATION: Only show loading if no cached data exists
    const hasExistingData = viewMode === 'buyer'
      ? buyerSubscriptions.length > 0
      : (myShop !== null || follows.length > 0);
    if (!hasExistingData) {
      setLoading(true);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cached data check is for initial render only
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

  // Unsubscribe from shop (buyer mode)
  const handleUnsubscribeClick = useCallback((e, sub) => {
    e.stopPropagation();
    triggerHaptic('light');
    setConfirmUnsubscribe(sub);
  }, [triggerHaptic]);

  const handleUnsubscribe = useCallback(async () => {
    if (!confirmUnsubscribe) return;

    try {
      const { error: delError } = await del(`/shops/${confirmUnsubscribe.shop_id}/subscribe`);

      if (delError) {
        toast.error(t('subscriptions.unsubscribeError'));
        return;
      }

      // Remove from local state
      setBuyerSubscriptions((prev) =>
        prev.filter((sub) => sub.shop_id !== confirmUnsubscribe.shop_id)
      );
      toast.success(t('subscriptions.unsubscribeSuccess'));
      triggerHaptic('success');
    } catch {
      toast.error(t('subscriptions.unsubscribeError'));
    }
  }, [confirmUnsubscribe, del, t, toast, triggerHaptic]);

  // Handle retry with AbortController
  const handleRetry = useCallback(() => {
    // Cancel any in-flight retry request
    if (retryControllerRef.current) {
      retryControllerRef.current.abort();
    }
    retryControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    loadData(retryControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'aborted') return;
        if (result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => {
        if (!retryControllerRef.current?.signal?.aborted) {
          setLoading(false);
        }
      });
  }, [loadData]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Outside click handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target) && isSearchActive) {
        setIsSearchActive(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSearchActive]);

  // Auto-refresh subscriptions when webapp gains focus (for invite link flow)
  // Debounced to prevent excessive refetches - only refetch if >30s since last fetch
  const lastFetchTimeRef = useRef(Date.now());

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && token && !loading) {
        const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;
        // Only refetch if more than 30 seconds have passed
        if (timeSinceLastFetch > 30000) {
          lastFetchTimeRef.current = Date.now();
          const controller = new AbortController();
          loadData(controller.signal);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [token, loading, loadData]);

  // Determine if we have data based on mode
  const hasData = viewMode === 'buyer'
    ? buyerSubscriptions.length > 0
    : (myShop || follows.length > 0);

  return (
    <div
      className="min-h-full bg-[#181818]"
      style={{
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <Header title={t('subscriptions.title')} />

      {/* Search Bar */}
      {!loading && !error && hasData && (
        <div className="px-4 pt-4 pb-2">
          <div className="relative" ref={searchContainerRef}>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={t('subscriptions.searchPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-orange-primary/50 focus:ring-1 focus:ring-orange-primary/30 transition-all"
              />
              {searchQuery && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </motion.button>
              )}
            </div>
            <AnimatePresence>
              {isSearchActive && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-dark-card/95 backdrop-blur-lg rounded-xl border border-white/10 shadow-xl z-50 max-h-80 overflow-y-auto"
                >
                  {isSearching ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-orange-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="p-2 space-y-1">
                      {searchResults.map((product) => (
                        <SearchResultItem
                          key={`${product.shop_id}-${product.id}`}
                          product={product}
                          onClick={() => handleSearchResultClick(product)}
                        />
                      ))}
                    </div>
                  ) : searchQuery.trim().length >= 2 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <svg className="w-12 h-12 text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-gray-400 font-medium">{t('subscriptions.searchEmpty')}</p>
                      <p className="text-gray-500 text-sm mt-1">{t('subscriptions.searchEmptyDesc')}</p>
                    </div>
                  ) : (
                    <div className="py-4 px-4 text-center text-gray-500 text-sm">
                      {t('subscriptions.searchMinChars')}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

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
              onClick={handleRetry}
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
                className="glass-card rounded-2xl p-6 cursor-pointer min-h-[90px] relative"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01, y: -2 }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                {/* Unsubscribe button */}
                <button
                  onClick={(e) => handleUnsubscribeClick(e, sub)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                  aria-label={t('subscriptions.unsubscribe')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <div className="flex items-center justify-between pr-8">
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
                        {follow.source_products_count || 0} {t('common.products')}
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

      {/* Unsubscribe confirmation dialog */}
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
