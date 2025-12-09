import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence,m as motion } from 'framer-motion';
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
  useScrollLock(isOpen);

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
    }
    if (newPeriod !== 'custom') {
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
                paddingBottom: 'var(--tabbar-total)',
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
              <div className="flex gap-2 mt-4 animate-pulse">
                <div className="h-11 bg-gray-700 rounded-xl flex-1" />
                <div className="h-11 bg-gray-700 rounded-xl flex-1" />
                <div className="h-11 bg-gray-700 rounded-xl flex-1" />
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
                paddingBottom: 'var(--tabbar-total)',
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
                <p className="text-sm text-gray-400 mb-2">{t('analytics.totalSales')}</p>
                <h1 className="text-4xl font-bold text-orange-primary mb-1">
                  {formatUSD(summary?.totalRevenue)}
                </h1>
                <p className="text-sm text-gray-400">
                  {summary?.completedOrders || 0} {t('analytics.ordersCount')} - {t('analytics.avgCheck')}:{' '}
                  {formatUSD(summary?.avgOrderValue)}
                </p>
              </motion.div>

              {/* Period Selector */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handlePeriodChange('7d')}
                  className={`period-btn flex-1 ${period === '7d' ? 'active' : ''}`}
                >
                  {t('analytics.period7d')}
                </button>
                <button
                  onClick={() => handlePeriodChange('1m')}
                  className={`period-btn flex-1 ${period === '1m' ? 'active' : ''}`}
                >
                  {t('analytics.period1m')}
                </button>
                <button
                  onClick={() => handlePeriodChange('custom')}
                  className={`period-btn flex-1 ${period === 'custom' ? 'active' : ''}`}
                >
                  {t('analytics.periodCustom')}
                </button>
              </div>

              {/* Top Products */}
              <div className="mt-6 mb-4">
                <h2 className="text-lg font-semibold text-white mb-4">{t('analytics.topProducts')}</h2>

                {topProducts && topProducts.length > 0 ? (
                  <div className="space-y-3">
                    {topProducts.map((product, index) => (
                      <motion.div
                        key={product.id}
                        className="glass-card p-4"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + index * 0.1 }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-white font-medium">{product.name}</span>
                          <span className="text-orange-primary font-bold">
                            {formatUSD(product.revenue, 2)}
                          </span>
                        </div>

                        {/* Bar Chart */}
                        <div className="bar-container mb-2">
                          <motion.div
                            className="bar-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${(product.revenue / maxRevenue) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.3 + index * 0.1 }}
                          />
                        </div>

                        <p className="text-xs text-gray-400">{product.quantity} {t('analytics.soldCount')}</p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="glass-card p-8 text-center">
                    <p className="text-gray-400">{t('analytics.noData')}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Custom Date Range Picker */}
          {showCustomPicker && (
            <motion.div
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end"
              style={{ padding: '0 12px calc(var(--tabbar-total) + 16px)', maxHeight: '80vh' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCustomPicker(false)}
            >
              <motion.div
                className="w-full max-w-xl mx-auto bg-dark-elevated rounded-3xl p-4 sm:p-6 shadow-2xl overflow-y-auto max-h-[75vh]"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold text-white mb-4">{t('analytics.selectPeriod')}</h3>

                <div className="space-y-4 w-full min-w-0">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">{t('analytics.from')}</label>
                    <input
                      type="date"
                      value={customRange.from}
                      onChange={(e) =>
                        setCustomRange((prev) => ({ ...prev, from: e.target.value }))
                      }
                      className="w-full bg-dark-bg text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-orange-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">{t('analytics.to')}</label>
                    <input
                      type="date"
                      value={customRange.to}
                      onChange={(e) => setCustomRange((prev) => ({ ...prev, to: e.target.value }))}
                      className="w-full bg-dark-bg text-white px-4 py-3 rounded-xl border border-gray-700 focus:border-orange-primary outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6 sticky bottom-0 bg-dark-elevated pt-4 -mx-6 px-6 pb-2">
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="flex-1 bg-dark-bg text-white px-4 py-3 sm:py-4 rounded-xl font-medium min-h-[44px]"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleCustomRangeApply}
                    className="flex-1 bg-orange-primary text-white px-4 py-3 sm:py-4 rounded-xl font-medium min-h-[44px]"
                    disabled={!customRange.from || !customRange.to}
                  >
                    {t('common.apply')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
