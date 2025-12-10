import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useTranslation } from '../../i18n/useTranslation';
import { useStore } from '../../store/useStore';
import { useScrollLock } from '../../hooks/useScrollLock';
import FollowCard from '../Follows/FollowCard';
import LoadingSpinner from '../common/LoadingSpinner';

// Main Modal Component
export default function FollowsModal({ isOpen, onClose }) {
  const { triggerHaptic, alert } = useTelegram();
  const { fetchApi } = useApi();
  const { t } = useTranslation();

  const [follows, setFollows] = useState([]);
  const [limitInfo, setLimitInfo] = useState(null);
  const [myShop, setMyShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchAbortControllerRef = useRef(null);

  const handleClose = useCallback(() => {
    // Cancel any pending search request
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      searchAbortControllerRef.current = null;
    }
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);

  // BUG-WEBAPP-007: Properly manage scroll lock
  useScrollLock(isOpen);

  const loadData = useCallback(
    async (signal) => {
      try {
        // 1. Get shop - simplified parsing
        const shopsRes = await fetchApi('/shops/my', {
          signal,
          timeout: 10000,
        });

        if (signal?.aborted) return { status: 'aborted' };

        const shopsList = Array.isArray(shopsRes?.data)
          ? shopsRes.data
          : Array.isArray(shopsRes)
            ? shopsRes
            : [];

        const shop = shopsList.length > 0 ? shopsList[0] : null;

        setMyShop(shop);

        if (!shop) {
          setFollows([]);
          setLimitInfo(null);
          return { status: 'success' };
        }

        // 2. Load follows and limits in parallel
        const [followsRes, limitRes] = await Promise.all([
          fetchApi(`/follows/my?shopId=${shop.id}`, {
            signal,
            timeout: 10000,
          }),
          fetchApi(`/follows/check-limit?shopId=${shop.id}`, {
            signal,
            timeout: 10000,
          }),
        ]);

        if (signal?.aborted) return { status: 'aborted' };

        // 3. Parse follows
        const followsList = Array.isArray(followsRes?.data)
          ? followsRes.data
          : Array.isArray(followsRes)
            ? followsRes
            : [];

        setFollows(followsList);

        // 4. Parse limit info
        try {
          let limitData = null;
          if (limitRes && typeof limitRes === 'object') {
            limitData = limitRes.data || limitRes;
          }

          if (limitData && typeof limitData === 'object') {
            setLimitInfo({
              count: Number(limitData.count) || 0,
              limit: limitData.limit === null ? null : Number(limitData.limit) || 0,
              remaining: limitData.remaining === null ? null : Number(limitData.remaining) || 0,
              tier: (limitData.tier || shop.tier || 'pro').toLowerCase(),
              canFollow: limitData.canFollow !== false,
              reached: limitData.reached === true,
            });
          } else {
            setLimitInfo({
              count: followsList.length,
              limit: null,
              remaining: null,
              tier: (shop.tier || 'pro').toLowerCase(),
              canFollow: true,
              reached: false,
            });
          }
        } catch (limitError) {
          if (import.meta.env.DEV) {
            console.error('[FollowsModal] Error parsing limit info:', limitError);
          }
          setLimitInfo({
            count: followsList.length,
            limit: null,
            remaining: null,
            tier: (shop.tier || 'basic').toLowerCase(),
            canFollow: true,
            reached: false,
          });
        }

        return { status: 'success' };
      } catch (error) {
        if (signal?.aborted) return { status: 'aborted' };

        if (import.meta.env.DEV) {
          console.error('[FollowsModal] Error loading data:', error);
        }
        setFollows([]);
        setLimitInfo(null);
        setMyShop(null);
        return { status: 'error', error: error.message };
      }
    },
    [fetchApi]
  );

  useEffect(() => {
    if (!isOpen) return;

    // OPTIMIZATION: Only show loading if no cached data
    if (follows.length === 0) {
      setLoading(true);
    }

    const controller = new AbortController();

    loadData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          if (import.meta.env.DEV) {
            console.error('Failed to load follows data:', result.error);
          }
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows.length check is for initial render only
  }, [isOpen, loadData]);

  // Navigate to FollowDetail page
  const handleFollowClick = useCallback((followId) => {
    triggerHaptic('light');
    useStore.getState().setFollowDetailId(followId);
    handleClose();
  }, [triggerHaptic, handleClose]);

  const handleSearchShop = async () => {
    if (!searchQuery.trim()) {
      await alert(t('follows.enterSearch'));
      return;
    }

    // Cancel any pending search request
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    searchAbortControllerRef.current = new AbortController();

    setSearching(true);
    try {
      const res = await fetchApi(`/shops/search?q=${encodeURIComponent(searchQuery.trim())}`, {
        signal: searchAbortControllerRef.current.signal,
      });
      const results = res.data || [];
      setSearchResults(results);
      if (results.length === 0) {
        await alert(t('follows.notFound'));
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      await alert(error.message || t('follows.searchError'));
    } finally {
      setSearching(false);
    }
  };

  const handleAddFollow = async (shopId) => {
    if (!myShop) {
      await alert(t('follows.createShopFirst'));
      return;
    }

    try {
      await fetchApi('/follows', {
        method: 'POST',
        body: JSON.stringify({
          followerShopId: myShop.id,
          sourceShopId: shopId,
          mode: 'monitor',
        }),
      });

      triggerHaptic('success');
      setSearchQuery('');
      setSearchResults([]);
      await loadData();
      useStore.getState().setHasFollows(true);
      await alert(t('follows.added'));
    } catch (error) {
      await alert(error.message || t('follows.addError'));
    }
  };

  if (!loading && !myShop) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-dark-bg"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <PageHeader title="Follows" onBack={handleClose} variant="close" />
            <div
              className="flex-1 overflow-y-auto"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
                paddingBottom: 'calc(var(--tabbar-total) + 24px)',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div className="px-4 py-6">
                <div className="text-center py-12">
                  <svg
                    className="w-20 h-20 mx-auto mb-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-white mb-2">{t('follows.noShop')}</h3>
                  <p className="text-gray-400 text-sm">
                    {t('follows.createShopForFollows')}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-dark-bg"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <PageHeader title={t('follows.title')} onBack={handleClose} variant="close" />
          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 24px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-6 space-y-4">
              {/* Add Follow Form - Always Visible */}
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">{t('follows.searchShop')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchShop()}
                      placeholder={t('follows.searchPlaceholder')}
                      className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
                    />
                    <motion.button
                      onClick={handleSearchShop}
                      disabled={searching || !searchQuery.trim()}
                      className="px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                      style={{
                        background: searchQuery.trim()
                          ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
                          : 'rgba(255, 255, 255, 0.1)',
                      }}
                      whileTap={searchQuery.trim() ? { scale: 0.95 } : {}}
                    >
                      {searching ? '...' : t('common.find')}
                    </motion.button>
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {searchResults.map((shop) => (
                      <motion.div
                        key={shop.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/5"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{shop.name}</p>
                          {shop.description && (
                            <p className="text-xs text-gray-400 truncate">{shop.description}</p>
                          )}
                        </div>
                        <motion.button
                          onClick={() => handleAddFollow(shop.id)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
                          style={{
                            background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                          }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {t('follows.subscribeBtn')}
                        </motion.button>
                      </motion.div>
                    ))}
                  </div>
                )}

                {searchResults.length > 0 && (
                  <motion.button
                    onClick={() => {
                      triggerHaptic('light');
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="w-full h-11 rounded-xl font-medium text-gray-300"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {t('follows.clearResults')}
                  </motion.button>
                )}
              </div>

              {/* Info card */}
              {searchResults.length === 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm text-white font-medium mb-1">{t('follows.monitoringInfo')}</p>
                      <p className="text-xs text-gray-400 mb-2">
                        • <strong>{t('follows.monitorShort')}</strong>: {t('follows.monitorDesc')}
                        <br />• <strong>{t('follows.resellShort')}</strong>: {t('follows.resellDesc')}
                      </p>
                      {limitInfo && (
                        <p className="text-xs text-orange-primary">
                          {t('follows.limit')}: {limitInfo.count ?? 0} /{' '}
                          {limitInfo.limit === null ? '∞' : limitInfo.limit}
                          {limitInfo.tier ? ` (${limitInfo.tier})` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Follows list */}
              {loading ? (
                <div className="text-center py-12">
                  <LoadingSpinner size="md" />
                </div>
              ) : follows.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-400 px-2">
                    {t('follows.subscriptions', { count: follows.length })}
                  </h3>
                  <AnimatePresence mode="wait">
                    {follows.map((follow) => (
                      <FollowCard
                        key={follow.id}
                        follow={follow}
                        onClick={() => handleFollowClick(follow.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="text-lg font-bold text-white mb-2">{t('follows.noSubscriptions')}</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    {t('follows.useBot')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
