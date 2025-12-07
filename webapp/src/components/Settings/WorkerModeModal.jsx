import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../i18n/useTranslation';

// Shop Card Component for Worker Mode
function WorkspaceShopCard({ shop, onSelect, isActive, t }) {
  const { triggerHaptic } = useTelegram();

  const handleSelect = () => {
    triggerHaptic('medium');
    onSelect(shop);
  };

  // Format date for "access since" display
  const formatAccessDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString(t('common.locale'), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <motion.div
      className={`glass-card rounded-2xl p-4 ${isActive ? 'ring-2 ring-orange-primary' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
    >
      <div className="flex items-center gap-4">
        {/* Shop Logo */}
        <div className="flex-shrink-0">
          {shop.logo_url ? (
            <img
              src={shop.logo_url}
              alt={shop.name}
              className="w-14 h-14 rounded-xl object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-orange-primary/20 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-orange-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Shop Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate">{shop.name}</h3>
          {shop.description && (
            <p className="text-sm text-gray-400 truncate mt-0.5">{shop.description}</p>
          )}
          {shop.added_at && (
            <p className="text-xs text-gray-500 mt-1">
              {t('workerMode.accessSince', { date: formatAccessDate(shop.added_at) })}
            </p>
          )}
        </div>

        {/* Action Button */}
        <motion.button
          onClick={handleSelect}
          className={`px-4 py-2 rounded-xl font-semibold text-sm ${isActive
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'text-white'
            }`}
          style={
            !isActive
              ? {
                background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
              }
              : undefined
          }
          whileTap={{ scale: 0.95 }}
        >
          {isActive ? t('workerMode.active') : t('workerMode.work')}
        </motion.button>
      </div>
    </motion.div>
  );
}

// Main Modal Component
export default function WorkerModeModal({ isOpen, onClose }) {
  const { triggerHaptic, alert } = useTelegram();
  const { fetchApi } = useApi();
  const { t } = useTranslation();

  const [workspaceShops, setWorkspaceShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Zustand store for worker mode
  const workspaceShopId = useStore((state) => state.workspaceShopId);
  const switchToWorkspaceShop = useStore((state) => state.switchToWorkspaceShop);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);


  const loadData = useCallback(
    async (signal) => {
      try {
        // Get workspace shops where user is a worker
        const response = await fetchApi('/shops/workspace', {
          signal,
          timeout: 10000,
        });

        if (signal?.aborted) return { status: 'aborted' };

        // Extract shops data - handle both {data: [...]} and [...] responses
        let shopsList = [];
        if (Array.isArray(response)) {
          shopsList = response;
        } else if (response && Array.isArray(response.data)) {
          shopsList = response.data;
        }

        setWorkspaceShops(shopsList);
        return { status: 'success' };
      } catch (err) {
        if (signal?.aborted) return { status: 'aborted' };

        if (import.meta.env.DEV) {
          console.error('[WorkerModeModal] Error loading workspace shops:', err);
        }
        setError(err.message || 'Failed to load data');
        setWorkspaceShops([]);
        return { status: 'error', error: err.message };
      }
    },
    [fetchApi]
  );

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    loadData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          if (import.meta.env.DEV) {
            console.error('Failed to load workspace data:', result.error);
          }
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, loadData]);

  const handleSelectShop = async (shop) => {
    try {
      // If clicking on already active shop, deactivate worker mode
      if (workspaceShopId === shop.id) {
        switchToWorkspaceShop(null); // Exit worker mode
        triggerHaptic('success');
        await alert(t('settings.workerModeDisabled'));
        handleClose();
        return;
      }

      // Activate worker mode for selected shop (saves full shop object)
      switchToWorkspaceShop(shop);
      triggerHaptic('success');
      await alert(t('settings.nowWorkingIn', { name: shop.name }));
      handleClose();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[WorkerModeModal] Error selecting shop:', err);
      }
      await alert(t('settings.shopSelectionError'));
    }
  };

  const handleExitWorkerMode = async () => {
    triggerHaptic('medium');
    switchToWorkspaceShop(null); // Exit worker mode
    triggerHaptic('success');
    await alert(t('settings.workerModeDisabled'));
  };

  // Retry function for error recovery
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    loadData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          if (import.meta.env.DEV) {
            console.error('Failed to load workspace data:', result.error);
          }
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadData]);

  // Error state
  if (!loading && error) {
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
            <PageHeader title={t('settings.items.workerMode')} onBack={handleClose} variant="close" />
            <div
              className="flex-1 overflow-y-auto"
              style={{
                paddingBottom: 'calc(var(--tabbar-total) + 100px)',
                maxHeight: '100vh',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div className="px-4 py-6">
                <div className="text-center py-12">
                  <svg
                    className="w-20 h-20 mx-auto mb-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-white mb-2">{t('workspace.loadError')}</h3>
                  <p className="text-red-400 text-sm mb-6">{error}</p>
                  <motion.button
                    onClick={() => {
                      triggerHaptic('medium');
                      handleRetry();
                    }}
                    className="h-12 px-6 rounded-xl font-semibold text-white"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                      boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)',
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {t('common.retry')}
                  </motion.button>
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
          <PageHeader title={t('settings.items.workerMode')} onBack={handleClose} variant="close" />
          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingBottom: 'calc(var(--tabbar-total) + 100px)',
              maxHeight: '100vh',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-6 space-y-4">
              {/* Info card */}
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
                    <p className="text-sm text-white font-medium mb-1">{t('workerMode.infoTitle')}</p>
                    <p className="text-xs text-gray-400">
                      {t('workerMode.infoDesc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Current worker mode indicator */}
              {workspaceShopId && (
                <motion.div
                  className="glass-card rounded-2xl p-4 border border-orange-primary/30"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-white font-medium">{t('workerMode.modeActive')}</span>
                    </div>
                    <motion.button
                      onClick={handleExitWorkerMode}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400"
                      style={{
                        background: 'rgba(255, 59, 48, 0.1)',
                        border: '1px solid rgba(255, 59, 48, 0.2)',
                      }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {t('workerMode.exit')}
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* Loading state */}
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : workspaceShops.length > 0 ? (
                /* Workspace shops list */
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-400 px-2">
                    {t('workerMode.availableShops', { count: workspaceShops.length })}
                  </h3>
                  <AnimatePresence mode="popLayout">
                    {workspaceShops.map((shop) => (
                      <WorkspaceShopCard
                        key={shop.id}
                        shop={shop}
                        onSelect={handleSelectShop}
                        isActive={workspaceShopId === shop.id}
                        t={t}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                /* Empty state */
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
                      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-white mb-2">{t('workerMode.noShops')}</h3>
                  <p className="text-gray-400 text-sm">
                    {t('workerMode.notWorker')}
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    {t('workerMode.askOwner')}
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
