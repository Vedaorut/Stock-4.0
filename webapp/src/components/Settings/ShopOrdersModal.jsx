import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useApi } from '../../hooks/useApi';
import { useTelegram } from '../../hooks/useTelegram';
import { useBackButton } from '../../hooks/useBackButton';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../i18n/useTranslation';

// Compact status config with dot indicators (labels will be replaced with t() in component)
const STATUS_CONFIG = {
  pending: { key: 'shopOrders.status.pending', color: '#FFCC00', dot: 'bg-yellow-400' },
  verifying: { key: 'shopOrders.status.verifying', color: '#3B82F6', dot: 'bg-blue-500' },
  confirmed: { key: 'shopOrders.status.confirmed', color: '#22C55E', dot: 'bg-green-500' },
  shipped: { key: 'shopOrders.status.shipped', color: '#8B5CF6', dot: 'bg-purple-500' },
  delivered: { key: 'shopOrders.status.delivered', color: '#10B981', dot: 'bg-emerald-500' },
  cancelled: { key: 'shopOrders.status.cancelled', color: '#EF4444', dot: 'bg-red-500' },
};

// Status transitions for seller/worker actions (labels will be replaced with t() in component)
const STATUS_ACTIONS_CONFIG = {
  confirmed: [
    { status: 'shipped', key: 'shopOrders.actions.issue', color: 'bg-purple-500' },
    { status: 'cancelled', key: 'shopOrders.actions.cancel', color: 'bg-red-500/20 text-red-400' },
  ],
  shipped: [
    { status: 'delivered', key: 'shopOrders.actions.complete', color: 'bg-emerald-500' },
  ],
};

// Truncate hash: abc123...xyz789
const truncateHash = (hash) => {
  if (!hash || hash.length < 16) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
};

// Crypto symbols
const getCryptoSymbol = (currency) => {
  const symbols = { BTC: 'B', ETH: 'E', LTC: 'L', USDT: 'T', USDT_TRC20: 'T' };
  return symbols[currency] || '$';
};

// Single expandable order row with action buttons
// eslint-disable-next-line no-unused-vars
function OrderRow({ order, isExpanded, onToggle, onStatusUpdate, isUpdating, t }) {
  const { triggerHaptic } = useTelegram();

  // Determine status
  let effectiveStatus = order.status;
  if (order.status === 'pending' && order.payment_hash) {
    effectiveStatus = 'verifying';
  }
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;
  const status = { ...statusConfig, label: t(statusConfig.key) };
  const actionsConfig = STATUS_ACTIONS_CONFIG[effectiveStatus] || [];
  const actions = actionsConfig.map(a => ({ ...a, label: t(a.key) }));

  const orderDate = new Date(order.created_at || order.createdAt);
  const cryptoAmount = order.crypto_amount ? parseFloat(order.crypto_amount) : null;

  const handleClick = () => {
    triggerHaptic('light');
    onToggle();
  };

  const handleStatusChange = (newStatus) => {
    triggerHaptic('medium');
    onStatusUpdate(order.id, newStatus);
  };

  return (
    <motion.div
      layout
      className="overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {/* Main clickable row */}
      <motion.button
        onClick={handleClick}
        className="w-full glass-card rounded-xl p-3 text-left transition-colors active:bg-white/5"
        whileTap={{ scale: 0.98 }}
        disabled={isUpdating}
      >
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className="relative flex-shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
            {effectiveStatus === 'verifying' && (
              <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${status.dot} animate-ping opacity-75`} />
            )}
          </div>

          {/* Order info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-sm">#{order.id}</span>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{
                  color: status.color,
                  background: `${status.color}15`,
                }}
              >
                {status.label}
              </span>
            </div>
            <p className="text-gray-500 text-[11px] mt-0.5">
              {orderDate.toLocaleDateString(t('locale') || 'ru-RU', { day: 'numeric', month: 'short' })}
              {' - '}
              {orderDate.toLocaleTimeString(t('locale') || 'ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {/* Amount */}
          <div className="text-right flex-shrink-0">
            <p className="text-white font-bold text-sm">
              ${parseFloat(order.total_price || 0).toFixed(2)}
            </p>
            {cryptoAmount && (
              <p className="text-gray-500 text-[10px] font-mono">
                {getCryptoSymbol(order.crypto_currency)} {cryptoAmount.toFixed(6)}
              </p>
            )}
          </div>

          {/* Chevron */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 text-gray-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 mt-3 border-t border-white/5 space-y-2.5">
                {/* Buyer info */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t('shopOrders.labels.buyer')}</p>
                  {order.buyer_username && order.buyer_username !== 'Anonymous' ? (
                    <p className="text-white text-xs">@{order.buyer_username}</p>
                  ) : (
                    <div>
                      <p className="text-white text-xs">@Anonymous</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{t('shopOrders.labels.anonymousHint')}</p>
                    </div>
                  )}
                </div>

                {/* Product & Quantity */}
                {order.product_name && (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t('shopOrders.labels.product')}</p>
                      <p className="text-white text-xs truncate">{order.product_name}</p>
                    </div>
                    {order.quantity && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t('shopOrders.labels.quantity')}</p>
                        <p className="text-white text-xs">{order.quantity} {t('shopOrders.labels.pcs')}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TX Hash */}
                {order.payment_hash && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">TX Hash</p>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] text-gray-400 font-mono bg-white/5 px-2 py-1 rounded flex-1 truncate">
                        {truncateHash(order.payment_hash)}
                      </code>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard?.writeText(order.payment_hash);
                          triggerHaptic('light');
                        }}
                        className="p-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {actions.length > 0 && (
                  <div className="pt-2 flex gap-2">
                    {actions.map((action) => (
                      <motion.button
                        key={action.status}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusChange(action.status);
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white ${action.color}`}
                        whileTap={{ scale: 0.95 }}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          action.label
                        )}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
}

// Main modal component
export default function ShopOrdersModal({ isOpen, onClose }) {
  const api = useApi();
  const { triggerHaptic, alert } = useTelegram();
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Stable ref for API to avoid useEffect re-runs
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  // Get shop context from store
  const isWorkerMode = useStore((state) => state.isWorkerMode);
  const workspaceShop = useStore((state) => state.workspaceShop);
  const myShop = useStore((state) => state.myShop);

  // Determine which shop to use
  const effectiveShop = isWorkerMode ? workspaceShop : myShop;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);

  // Load data - stable effect with minimal deps
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const controller = new AbortController();

    const loadData = async (showSkeleton = true) => {
      if (showSkeleton) {
        setLoading(true);
        setError(null);
        setExpandedId(null);
      }

      try {
        const storeState = useStore.getState();
        const currentIsWorkerMode = storeState.isWorkerMode;
        let shopId = currentIsWorkerMode ? storeState.workspaceShopId : storeState.myShop?.id;

        // Fetch shop if needed
        if (!shopId && !currentIsWorkerMode) {
          const { data, error: apiError } = await apiRef.current.get('/shops/my', { signal: controller.signal });
          if (cancelled) return;

          if (apiError) {
            setError(apiError);
            setLoading(false);
            return;
          }

          const shops = Array.isArray(data?.data) ? data.data : [];
          if (shops.length > 0) {
            useStore.getState().setMyShops(shops);
            shopId = shops[0].id;
          } else {
            setError('No shop found');
            setLoading(false);
            return;
          }
        }

        if (!shopId) {
          setError('No shop selected');
          setLoading(false);
          return;
        }

        // Fetch orders
        const { data: ordersData, error: ordersError } = await apiRef.current.get(`/shops/${shopId}/orders`, { signal: controller.signal });
        if (cancelled) return;

        if (ordersError) {
          setError(ordersError);
        } else {
          setOrders(Array.isArray(ordersData?.data) ? ordersData.data : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Unexpected error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData(true);

    // Silent refresh every 30s
    const intervalId = setInterval(() => {
      if (!cancelled) loadData(false);
    }, 30000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(intervalId);
    };
  }, [isOpen, retryTrigger]); // Only these 2 deps!

  // Retry handler
  const handleRetry = useCallback(() => {
    triggerHaptic('light');
    setRetryTrigger((prev) => prev + 1);
  }, [triggerHaptic]);

  const handleStatusUpdate = async (orderId, newStatus) => {
    setUpdatingOrderId(orderId);

    try {
      const { error: apiError } = await put(`/orders/${orderId}/status`, { status: newStatus });

      if (apiError) {
        await alert(`${t('common.error')}: ${apiError}`);
      } else {
        // Update local state
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, status: newStatus } : order
          )
        );
        triggerHaptic('success');
      }
    } catch {
      await alert(t('shopOrders.updateError'));
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const toggleExpand = (orderId) => {
    setExpandedId(expandedId === orderId ? null : orderId);
    triggerHaptic('light');
  };

  // Count orders by status
  const confirmedCount = orders.filter((o) => o.status === 'confirmed').length;
  const issuedCount = orders.filter((o) => o.status === 'issued').length;

  // Modal title with shop name
  const modalTitle = effectiveShop?.name
    ? t('shopOrders.ordersFor', { shop: effectiveShop.name })
    : t('shopOrders.title');

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
          <PageHeader title={modalTitle} onBack={handleClose} variant="close" />

          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 24px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-4">
              {/* Worker mode indicator */}
              {isWorkerMode && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-xl p-3 mb-4 border border-orange-primary/30"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-primary animate-pulse" />
                    <span className="text-sm text-orange-primary font-medium">
                      {t('shopOrders.workerMode')}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Stats header */}
              {orders.length > 0 && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between mb-4 px-1"
                >
                  <p className="text-gray-500 text-xs">
                    {t('common.total')}: <span className="text-white font-medium">{orders.length}</span>
                  </p>
                  <div className="flex gap-3">
                    {confirmedCount > 0 && (
                      <p className="text-xs">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                        <span className="text-green-400">{confirmedCount} {t('shopOrders.toIssue')}</span>
                      </p>
                    )}
                    {issuedCount > 0 && (
                      <p className="text-xs">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5" />
                        <span className="text-purple-400">{issuedCount} {t('shopOrders.issued')}</span>
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Loading skeleton */}
              {loading && orders.length === 0 && (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="glass-card rounded-xl p-3 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-white/10 rounded w-24" />
                          <div className="h-2 bg-white/5 rounded w-16" />
                        </div>
                        <div className="h-4 bg-white/10 rounded w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && !loading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm mb-3">{error}</p>
                  <motion.button
                    onClick={handleRetry}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/15 transition-colors"
                    whileTap={{ scale: 0.95 }}
                  >
                    {t('common.retry')}
                  </motion.button>
                </motion.div>
              )}

              {/* Empty */}
              {!loading && !error && orders.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-16"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-white font-medium mb-1">{t('shopOrders.noOrders')}</p>
                  <p className="text-gray-500 text-sm">{t('shopOrders.ordersWillAppear')}</p>
                </motion.div>
              )}

              {/* Orders list */}
              {!loading && !error && orders.length > 0 && (
                <div className="space-y-2">
                  {orders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <OrderRow
                        order={order}
                        isExpanded={expandedId === order.id}
                        onToggle={() => toggleExpand(order.id)}
                        onStatusUpdate={handleStatusUpdate}
                        isUpdating={updatingOrderId === order.id}
                        t={t}
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Refresh indicator */}
              {!loading && orders.length > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-center text-gray-600 text-[10px] mt-6"
                >
                  {t('shopOrders.autoRefresh')}
                </motion.p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
