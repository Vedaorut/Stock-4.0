import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useApi } from '../../hooks/useApi';
import { useTelegram } from '../../hooks/useTelegram';
import { useBackButton } from '../../hooks/useBackButton';

// Compact status config with dot indicators
const STATUS = {
  pending: { label: 'Ожидание', color: '#FFCC00', dot: 'bg-yellow-400' },
  verifying: { label: 'Проверка', color: '#3B82F6', dot: 'bg-blue-500' },
  confirmed: { label: 'Оплачен', color: '#22C55E', dot: 'bg-green-500' },
  shipped: { label: 'Отправлен', color: '#8B5CF6', dot: 'bg-purple-500' },
  delivered: { label: 'Получен', color: '#22C55E', dot: 'bg-green-500' },
  cancelled: { label: 'Отменён', color: '#EF4444', dot: 'bg-red-500' },
};

// Truncate hash: abc123...xyz789
const truncateHash = (hash) => {
  if (!hash || hash.length < 16) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
};

// Crypto symbols
const getCryptoSymbol = (currency) => {
  const symbols = { BTC: '₿', ETH: 'Ξ', LTC: 'Ł', USDT: '₮', USDT_TRC20: '₮' };
  return symbols[currency] || '$';
};

// Single expandable order row
// eslint-disable-next-line no-unused-vars
function OrderRow({ order, isExpanded, onToggle }) {
  const { triggerHaptic } = useTelegram();

  // Determine status
  let effectiveStatus = order.status;
  if (order.status === 'pending' && order.payment_hash) {
    effectiveStatus = 'verifying';
  }
  const status = STATUS[effectiveStatus] || STATUS.pending;

  const orderDate = new Date(order.created_at || order.createdAt);
  const cryptoAmount = order.crypto_amount ? parseFloat(order.crypto_amount) : null;
  const confirmations = order.blockchain_confirmations || 0;
  const requiredConfirmations = 3;

  const handleClick = () => {
    triggerHaptic('light');
    onToggle();
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
              {orderDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              {' · '}
              {orderDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
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
                {/* Product & Shop */}
                {(order.product_name || order.shop_name) && (
                  <div className="flex items-start justify-between gap-2">
                    {order.product_name && (
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Товар</p>
                        <p className="text-white text-xs truncate">{order.product_name}</p>
                      </div>
                    )}
                    {order.shop_name && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Магазин</p>
                        <p className="text-white text-xs">{order.shop_name}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirmations progress (for verifying status) */}
                {effectiveStatus === 'verifying' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">Подтверждения</p>
                      <p className="text-[10px] text-blue-400 font-mono">{confirmations}/{requiredConfirmations}</p>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-blue-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((confirmations / requiredConfirmations) * 100, 100)}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
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

                {/* Crypto payment address (if pending) */}
                {effectiveStatus === 'pending' && order.payment_address && (
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Адрес оплаты</p>
                    <code className="text-[11px] text-orange-400 font-mono bg-orange-500/10 px-2 py-1 rounded block truncate">
                      {truncateHash(order.payment_address)}
                    </code>
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
export default function MyOrdersModal({ isOpen, onClose }) {
  const { get } = useApi();
  const { triggerHaptic } = useTelegram();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);

  const loadOrders = useCallback(async (signal) => {
    const { data, error } = await get('/orders/my', { signal });
    if (signal?.aborted) return { status: 'aborted' };
    if (error) {
      setError(error);
      return { status: 'error' };
    }
    const ordersList = Array.isArray(data?.data) ? data.data : [];
    setOrders(ordersList);
    return { status: 'success' };
  }, [get]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setExpandedId(null);

    const controller = new AbortController();
    loadOrders(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    // Auto-refresh every 30s
    const interval = setInterval(() => loadOrders(controller.signal), 30000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [isOpen, loadOrders]);

  const toggleExpand = (orderId) => {
    setExpandedId(expandedId === orderId ? null : orderId);
    triggerHaptic('light');
  };

  // Count active orders
  const activeCount = orders.filter(o =>
    o.status === 'pending' || (o.status === 'pending' && o.payment_hash)
  ).length;

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
          <PageHeader title="Мои заказы" onBack={handleClose} variant="close" />

          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 24px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-4">
              {/* Stats header */}
              {orders.length > 0 && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between mb-4 px-1"
                >
                  <p className="text-gray-500 text-xs">
                    Всего: <span className="text-white font-medium">{orders.length}</span>
                  </p>
                  {activeCount > 0 && (
                    <p className="text-xs">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 mr-1.5 animate-pulse" />
                      <span className="text-yellow-400">{activeCount} активных</span>
                    </p>
                  )}
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
                    onClick={() => {
                      triggerHaptic('light');
                      setLoading(true);
                      loadOrders().finally(() => setLoading(false));
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/15 transition-colors"
                    whileTap={{ scale: 0.95 }}
                  >
                    Повторить
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <p className="text-white font-medium mb-1">Нет заказов</p>
                  <p className="text-gray-500 text-sm">Ваши покупки появятся здесь</p>
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
                  Автообновление каждые 30 сек
                </motion.p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
