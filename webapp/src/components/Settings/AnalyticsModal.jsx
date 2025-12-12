import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { useScrollLock } from '../../hooks/useScrollLock';

export default function AnalyticsModal({ isOpen, onClose }) {
  const { get } = useApi();
  const { t } = useTranslation();
  const { triggerHaptic } = useTelegram();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('7d'); // '7d', '1m', 'custom'
  const [analytics, setAnalytics] = useState(null);
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const abortControllerRef = useRef(null);

  const formatUSD = useCallback((amount = 0, fractionDigits = 2) => {
    const value = Number(amount) || 0;
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }, []);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose, triggerHaptic]);

  useBackButton(isOpen ? handleClose : null);
  useScrollLock(isOpen || showCustomPicker);

  // Calculate date range based on period
  const getDateRange = useCallback(() => {
    const today = new Date();
    const to = today.toISOString().split('T')[0];

    if (period === 'custom') {
      if (customRange.from && customRange.to) {
        return { from: customRange.from, to: customRange.to };
      }
      return null;
    }

    let from;
    if (period === '7d') {
      const date = new Date(today);
      date.setDate(date.getDate() - 7);
      from = date.toISOString().split('T')[0];
    } else if (period === '1m') {
      const date = new Date(today);
      date.setMonth(date.getMonth() - 1);
      from = date.toISOString().split('T')[0];
    }

    return { from, to };
  }, [period, customRange]);

  // Fetch analytics data
  const fetchAnalytics = useCallback(
    async (signal) => {
      const range = getDateRange();
      if (!range) {
        return { status: 'skipped' };
      }

      const { from, to } = range;

      try {
        const { data, error } = await get(`/orders/analytics?from=${from}&to=${to}`, {
          signal,
          timeout: 10000, // 10 second timeout to prevent infinite loading
        });

        if (signal?.aborted) return { status: 'aborted' };

        if (error) {
          if (import.meta.env.DEV) {
            console.error('Analytics fetch error:', error);
          }
          return { status: 'error', error };
        } else if (data?.success && data?.data) {
          // ✅ FIX: Validate analytics data structure
          const analyticsData = data.data;
          if (!analyticsData || typeof analyticsData !== 'object') {
            if (import.meta.env.DEV) {
              console.error('Invalid analytics data format:', analyticsData);
            }
            return { status: 'error', error: 'Invalid analytics data format' };
          }

          setAnalytics(analyticsData);
          return { status: 'success' };
        } else {
          if (import.meta.env.DEV) {
            console.error('Unexpected API response:', data);
          }
          return { status: 'error', error: t('analytics.loadError') };
        }
      } catch (err) {
        if (signal?.aborted) return { status: 'aborted' };

        if (import.meta.env.DEV) {
          console.error('[AnalyticsModal] fetch exception', err);
        }
        return { status: 'error', error: err.message || t('analytics.fetchError') };
      }
    },
    [get, getDateRange, t] // period and customRange are read via getDateRange
  );

  // Fetch on mount and period change
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchAnalytics(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (result?.status === 'error') {
            if (import.meta.env.DEV) {
              console.error('Failed to fetch analytics:', result.error);
            }
            setError(result.error);
          }
        }
      })
      .finally(() => {
        // ✅ FIX: Always reset loading, even on abort
        // This prevents infinite spinner when modal is reopened after quick close
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, period, fetchAnalytics]);

  const handlePeriodChange = (newPeriod) => {
    triggerHaptic('light');
    setPeriod(newPeriod);
    if (newPeriod === 'custom') {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
    }
  };

  const handleCustomRangeApply = useCallback(() => {
    if (!customRange.from || !customRange.to) {
      return;
    }

    triggerHaptic('medium');
    setShowCustomPicker(false);
    setLoading(true);
    setError(null);

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    fetchAnalytics(abortControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [customRange.from, customRange.to, triggerHaptic, fetchAnalytics]);

  // Loading skeleton
  if (loading) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-dark-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PageHeader title="Analytics" onBack={handleClose} variant="close" />
            <div
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
                paddingBottom: 'calc(var(--tabbar-total) + 20px)',
              }}
              className="px-4"
            >
              {/* Hero skeleton */}
              <div className="glass-card p-6 mt-4 animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-1/3 mb-4" />
                <div className="h-12 bg-gray-700 rounded w-1/2 mb-2" />
                <div className="h-4 bg-gray-700 rounded w-1/4" />
              </div>

              {/* Buttons skeleton */}
              <div className="flex gap-2 mt-4 animate-pulse h-12 bg-white/5 rounded-xl">
              </div>

              {/* Products skeleton */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass-card p-4 mt-3 animate-pulse">
                  <div className="h-4 bg-gray-700 rounded w-2/3 mb-2" />
                  <div className="h-2 bg-gray-700 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-700 rounded w-1/4" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Error state
  if (error) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-dark-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PageHeader title="Analytics" onBack={handleClose} variant="close" />
            <div
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}
              className="px-4 py-8 text-center"
            >
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                  }
                  abortControllerRef.current = new AbortController();
                  fetchAnalytics(abortControllerRef.current.signal)
                    .then((result) => {
                      if (result?.status === 'error') {
                        setError(result.error);
                      }
                    })
                    .finally(() => setLoading(false));
                }}
                className="bg-orange-primary text-white px-6 py-3 rounded-xl"
              >
                {t('common.retry')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const { summary, topProducts } = analytics || {};
  const maxRevenue = topProducts?.length > 0 ? topProducts[0].revenue : 1;

  const periods = [
    { id: '7d', label: t('analytics.period7d') },
    { id: '1m', label: t('analytics.period1m') },
    { id: 'custom', label: t('analytics.periodCustom') },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-dark-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PageHeader title={t('settings.items.analytics')} onBack={handleClose} variant="close" />

            <div
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
                paddingBottom: 'calc(var(--tabbar-total, 90px) + 20px)',
              }}
              className="px-4 overflow-y-auto h-full"
            >
              {/* Hero Card */}
              <motion.div
                className="glass-card p-6 mt-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <p className="text-sm text-gray-400 mb-2 font-medium tracking-wide uppercase text-[10px] opacity-70">
                  {t('analytics.totalSales')}
                </p>
                <h1 className="text-4xl font-bold text-orange-primary mb-1 tracking-tight">
                  {formatUSD(summary?.totalRevenue)}
                </h1>
                <p className="text-sm text-gray-400">
                  {summary?.completedOrders || 0} {t('analytics.ordersCount')} <span className="mx-1 opacity-30">|</span> {t('analytics.avgCheck')}:{' '}
                  <span className="text-white font-medium">{formatUSD(summary?.avgOrderValue)}</span>
                </p>
              </motion.div>

              {/* Period Selector - Premium Segmented Control */}
              <div className="mt-6 mb-2">
                <div className="bg-white/5 p-1 rounded-xl flex relative isolate">
                  <LayoutGroup>
                    {periods.map((p) => {
                      const isActive = period === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => handlePeriodChange(p.id)}
                          className={`flex-1 relative z-10 py-2.5 text-sm font-medium transition-colors duration-200 ${isActive ? 'text-white' : 'text-gray-400 hover:text-white/70'
                            }`}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="activePeriod"
                              className="absolute inset-0 bg-white/10 rounded-lg shadow-sm backdrop-blur-sm border border-white/5"
                              transition={{ type: "spring", stiffness: 350, damping: 25 }}
                              style={{ borderRadius: '8px' }}
                            />
                          )}
                          <span className="relative z-20">{p.label}</span>
                        </button>
                      );
                    })}
                  </LayoutGroup>
                </div>
              </div>

              {/* Top Products */}
              <div className="mt-6 mb-4">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-1 h-5 bg-orange-primary rounded-full"></span>
                  {t('analytics.topProducts')}
                </h2>

                {topProducts && topProducts.length > 0 ? (
                  <div className="space-y-3">
                    {topProducts.map((product, index) => (
                      <motion.div
                        key={product.id}
                        className="glass-card p-4 active:scale-[0.99] transition-transform"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + index * 0.1 }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-white font-medium text-sm line-clamp-2 pr-4">{product.name}</span>
                          <span className="text-orange-primary font-bold whitespace-nowrap">
                            {formatUSD(product.revenue, 2)}
                          </span>
                        </div>

                        {/* Bar Chart */}
                        <div className="flex items-center gap-3">
                          <div className="bar-container flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-orange-primary to-orange-400 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${(product.revenue / maxRevenue) * 100}%` }}
                              transition={{ duration: 1, delay: 0.3 + index * 0.1, type: "spring" }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 tabular-nums w-12 text-right">
                            {product.quantity} sold
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="glass-card p-8 text-center border-dashed border-white/10">
                    <div className="text-4xl mb-3 opacity-30">📊</div>
                    <p className="text-gray-400 text-sm font-medium">{t('analytics.noData')}</p>
                    <p className="text-gray-600 text-xs mt-1">Try selecting a different period</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Custom Date Range Picker - Premium Bottom Sheet */}
          <AnimatePresence>
            {showCustomPicker && (
              <>
                <motion.div
                  className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowCustomPicker(false)}
                />
                <motion.div
                  className="fixed inset-x-0 bottom-0 z-[61] bg-[#141414] rounded-t-[32px] border-t border-white/10 overflow-hidden"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Sheet Handle */}
                  <div className="w-full flex justify-center pt-3 pb-2" onPointerDown={() => setShowCustomPicker(false)}>
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                  </div>

                  <div className="px-5 pb-8 pt-2">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-white">{t('analytics.selectPeriod')}</h3>
                      <button
                        onClick={() => setShowCustomPicker(false)}
                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">{t('analytics.from')}</label>
                        <div className="relative">
                          <input
                            type="date"
                            value={customRange.from}
                            onChange={(e) =>
                              setCustomRange((prev) => ({ ...prev, from: e.target.value }))
                            }
                            className="w-full bg-white/5 text-white px-4 py-3.5 rounded-xl border border-white/10 focus:border-orange-primary outline-none transition-colors appearance-none min-h-[50px]"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-400 mb-2 block uppercase tracking-wider">{t('analytics.to')}</label>
                        <div className="relative">
                          <input
                            type="date"
                            value={customRange.to}
                            onChange={(e) => setCustomRange((prev) => ({ ...prev, to: e.target.value }))}
                            className="w-full bg-white/5 text-white px-4 py-3.5 rounded-xl border border-white/10 focus:border-orange-primary outline-none transition-colors appearance-none min-h-[50px]"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8" style={{ marginBottom: 'max(env(safe-area-inset-bottom), 20px)' }}>
                      <button
                        onClick={handleCustomRangeApply}
                        className="w-full bg-gradient-to-r from-orange-primary to-orange-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                        disabled={!customRange.from || !customRange.to}
                      >
                        {t('common.apply')}
                      </button>
                    </div>
                    {/* Safe area spacer */}
                    <div className="h-[env(safe-area-inset-bottom)]" />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
