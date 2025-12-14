import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { useScrollLock } from '../../hooks/useScrollLock';

export default function AdminPanelModal({ isOpen, onClose }) {
  const { get } = useApi();
  const { t } = useTranslation();
  const { triggerHaptic } = useTelegram();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const abortControllerRef = useRef(null);

  const formatUSD = useCallback((amount = 0) => {
    const value = Number(amount) || 0;
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose, triggerHaptic]);

  useBackButton(isOpen ? handleClose : null);
  useScrollLock(isOpen);

  // Fetch admin stats
  const fetchStats = useCallback(
    async (signal) => {
      try {
        const { data, error } = await get('/admin/stats', {
          signal,
          timeout: 10000,
        });

        if (signal?.aborted) return { status: 'aborted' };

        if (error) {
          if (import.meta.env.DEV) {
            console.error('Admin stats fetch error:', error);
          }
          return { status: 'error', error };
        } else if (data?.success && data?.data) {
          setStats(data.data);
          return { status: 'success' };
        } else {
          if (import.meta.env.DEV) {
            console.error('Unexpected API response:', data);
          }
          return { status: 'error', error: t('admin.error') };
        }
      } catch (err) {
        if (signal?.aborted) return { status: 'aborted' };

        if (import.meta.env.DEV) {
          console.error('[AdminPanelModal] fetch exception', err);
        }
        return { status: 'error', error: err.message || t('admin.error') };
      }
    },
    [get, t]
  );

  // Fetch on mount
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetchStats(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (result?.status === 'error') {
            if (import.meta.env.DEV) {
              console.error('Failed to fetch admin stats:', result.error);
            }
            setError(result.error);
          }
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, fetchStats]);

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
            <PageHeader title={t('admin.title')} onBack={handleClose} variant="close" />
            <div
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
                paddingBottom: 'calc(var(--tabbar-total) + 20px)',
              }}
              className="px-4"
            >
              <div className="glass-card p-6 mt-4 animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-1/3 mb-4" />
                <div className="h-8 bg-gray-700 rounded w-1/2 mb-2" />
                <div className="h-4 bg-gray-700 rounded w-1/4" />
              </div>

              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="glass-card p-4 mt-3 animate-pulse">
                  <div className="h-4 bg-gray-700 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-700 rounded w-1/2" />
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
            <PageHeader title={t('admin.title')} onBack={handleClose} variant="close" />
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
                  fetchStats(abortControllerRef.current.signal)
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

  const { users, shops, orders, subscriptions, revenue } = stats || {};

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-dark-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <PageHeader title={t('admin.title')} onBack={handleClose} variant="close" />

          <div
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total, 90px) + 20px)',
            }}
            className="px-4 overflow-y-auto h-full"
          >
            {/* Users Section */}
            <motion.div
              className="glass-card p-5 mt-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
                {t('admin.users')}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.total')}</p>
                  <p className="text-2xl font-bold text-white">{users?.total || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.today')}</p>
                  <p className="text-2xl font-bold text-green-400">+{users?.today || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.week')}</p>
                  <p className="text-xl font-semibold text-gray-300">+{users?.week || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.month')}</p>
                  <p className="text-xl font-semibold text-gray-300">+{users?.month || 0}</p>
                </div>
              </div>
            </motion.div>

            {/* Shops Section */}
            <motion.div
              className="glass-card p-5 mt-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-purple-500 rounded-full"></span>
                {t('admin.shops')}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.total')}</p>
                  <p className="text-2xl font-bold text-white">{shops?.total || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.active')}</p>
                  <p className="text-2xl font-bold text-green-400">{shops?.active || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.today')}</p>
                  <p className="text-2xl font-bold text-blue-400">+{shops?.today || 0}</p>
                </div>
              </div>
            </motion.div>

            {/* Orders Section */}
            <motion.div
              className="glass-card p-5 mt-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-yellow-500 rounded-full"></span>
                {t('admin.orders')}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.total')}</p>
                  <p className="text-2xl font-bold text-white">{orders?.total || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.today')}</p>
                  <p className="text-2xl font-bold text-green-400">{orders?.today || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.week')}</p>
                  <p className="text-xl font-semibold text-gray-300">{orders?.week || 0}</p>
                </div>
              </div>
            </motion.div>

            {/* Subscriptions Section */}
            <motion.div
              className="glass-card p-5 mt-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-orange-primary rounded-full"></span>
                {t('admin.subscriptions')}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.active')}</p>
                  <p className="text-2xl font-bold text-white">{subscriptions?.active || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">PRO</p>
                  <p className="text-2xl font-bold text-blue-400">{subscriptions?.pro || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">MAX</p>
                  <p className="text-2xl font-bold text-purple-400">{subscriptions?.max || 0}</p>
                </div>
              </div>
            </motion.div>

            {/* Revenue Section */}
            <motion.div
              className="glass-card p-5 mt-3 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-green-500 rounded-full"></span>
                {t('admin.revenue')}
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.today')}</p>
                  <p className="text-xl font-bold text-green-400">{formatUSD(revenue?.today)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.week')}</p>
                  <p className="text-xl font-bold text-white">{formatUSD(revenue?.week)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{t('admin.month')}</p>
                  <p className="text-xl font-bold text-white">{formatUSD(revenue?.month)}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
