import { useState, useEffect, useCallback, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useApi } from '../../hooks/useApi';
import { useTelegram } from '../../hooks/useTelegram';
import { useBackButton } from '../../hooks/useBackButton';
import { useTranslation } from '../../i18n/useTranslation';

// Order card component
function OrderCard({ order }) {
  const { t } = useTranslation();

  const statusConfig = {
    pending: {
      label: t('orders.status.pending'),
      color: '#FFCC00',
      bgColor: 'rgba(255, 204, 0, 0.1)',
      borderColor: 'rgba(255, 204, 0, 0.2)',
    },
    paid: {
      label: t('orders.status.paid'),
      color: '#007AFF',
      bgColor: 'rgba(0, 122, 255, 0.1)',
      borderColor: 'rgba(0, 122, 255, 0.2)',
    },
    completed: {
      label: t('orders.status.completed'),
      color: '#34C759',
      bgColor: 'rgba(52, 199, 89, 0.1)',
      borderColor: 'rgba(52, 199, 89, 0.2)',
    },
    cancelled: {
      label: t('orders.status.cancelled'),
      color: '#FF3B30',
      bgColor: 'rgba(255, 59, 48, 0.1)',
      borderColor: 'rgba(255, 59, 48, 0.2)',
    },
  };

  const status = statusConfig[order.status] || statusConfig.pending;
  const orderDate = new Date(order.created_at || order.createdAt);

  return (
    <motion.div
      className="glass-card rounded-2xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-400 text-xs">
              {t('orders.order')} #{order.id}
            </p>
            <p className="text-white text-sm mt-1">
              {orderDate.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              color: status.color,
              background: status.bgColor,
              border: `1px solid ${status.borderColor}`,
            }}
          >
            {status.label}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* Order details */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{t('orders.itemsCount')}</span>
            <span className="text-white font-medium">
              {t('orders.items', { count: order.items?.length || order.item_count || 0 })}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{t('orders.amount')}</span>
            <span className="text-white font-bold">
              ${parseFloat(order.total_amount || order.total || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Crypto info if available */}
        {order.crypto && (
          <>
            <div className="h-px bg-white/5" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-primary/20 flex items-center justify-center">
                <span className="text-orange-primary text-xs font-bold">
                  {order.crypto === 'bitcoin' ? '₿' : order.crypto === 'ethereum' ? 'Ξ' : '₮'}
                </span>
              </div>
              <span className="text-gray-400 text-xs uppercase">{order.crypto}</span>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// Main modal component
export default function OrdersModal({ isOpen, onClose }) {
  const { get } = useApi();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  // Use Telegram BackButton API to close modal
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);

  const loadOrders = useCallback(
    async (signal) => {
      triggerHaptic('light');

      // ✅ FIX: Use api.get directly to support signal parameter
      const { data, error } = await get('/orders/my', { signal });

      if (signal?.aborted) return { status: 'aborted' };

      if (error) {
        setError(error);
        return { status: 'error' };
      } else {
        // Backend returns { success: true, data: [...orders] }
        // useApi wraps in { data: response.data, error: null }
        // Safe array extraction with validation
        const ordersList = Array.isArray(data?.data) ? data.data : [];
        if (!Array.isArray(ordersList)) {
          if (import.meta.env.DEV) {
            console.error('[OrdersModal] Invalid data format:', data);
          }
          setError(t('myOrders.loadError'));
          setOrders([]);
          return { status: 'error' };
        }
        setOrders(ordersList);
        return { status: 'success' };
      }
    },
    [get, triggerHaptic]
  );

  useEffect(() => {
    if (!isOpen) return;

    // OPTIMIZATION: Only show loading if no cached data
    if (orders.length === 0) {
      setLoading(true);
    }
    setError(null);

    const controller = new AbortController();

    loadOrders(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          if (import.meta.env.DEV) {
            console.error('[OrdersModal] Failed to load orders');
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orders.length check is for initial render only
  }, [isOpen, loadOrders]);

  // Handle retry with AbortController
  const handleRetry = useCallback(() => {
    // Cancel any in-flight retry request
    if (retryControllerRef.current) {
      retryControllerRef.current.abort();
    }
    retryControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    loadOrders(retryControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'aborted') return;
        // Error is already set in loadOrders
      })
      .finally(() => {
        if (!retryControllerRef.current?.signal?.aborted) {
          setLoading(false);
        }
      });
  }, [loadOrders]);

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
          <PageHeader title={t('orders.title')} onBack={handleClose} variant="close" />
          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 24px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-6 space-y-4">
              {/* Loading state */}
              {loading && (
                <div className="flex justify-center py-12">
                  <motion.div
                    className="w-12 h-12 rounded-full border-4 border-orange-primary/20 border-t-orange-primary"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              )}

              {/* Error state */}
              {error && !loading && (
                <div className="text-center py-12">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-gray-400 text-sm mb-4">{error}</p>
                  <motion.button
                    onClick={handleRetry}
                    className="px-6 py-2 rounded-xl font-medium text-white"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                    }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {t('common.retry')}
                  </motion.button>
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && orders.length === 0 && (
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
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                  <p className="text-gray-400 text-sm">{t('orders.empty')}</p>
                </div>
              )}

              {/* Orders list */}
              {!loading && !error && orders.length > 0 && (
                <div className="space-y-3">
                  {orders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <OrderCard order={order} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
