import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import BottomSheet from '../common/BottomSheet';
import { useShopApi } from '../../hooks/useApi';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';

// Компонент карточки заказа
function OrderCard({ order }) {
  const { t } = useTranslation();

  const statusConfig = {
    pending: {
      label: t('orders.status.pending'),
      color: 'text-yellow-500',
      bgColor: 'rgba(255, 204, 0, 0.1)',
      borderColor: 'rgba(255, 204, 0, 0.2)'
    },
    paid: {
      label: t('orders.status.paid'),
      color: 'text-blue-500',
      bgColor: 'rgba(0, 122, 255, 0.1)',
      borderColor: 'rgba(0, 122, 255, 0.2)'
    },
    completed: {
      label: t('orders.status.completed'),
      color: 'text-green-500',
      bgColor: 'rgba(52, 199, 89, 0.1)',
      borderColor: 'rgba(52, 199, 89, 0.2)'
    },
    cancelled: {
      label: t('orders.status.cancelled'),
      color: 'text-red-500',
      bgColor: 'rgba(255, 59, 48, 0.1)',
      borderColor: 'rgba(255, 59, 48, 0.2)'
    }
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
            <p className="text-gray-400 text-xs">{t('orders.order')} #{order.id}</p>
            <p className="text-white text-sm mt-1">
              {orderDate.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </p>
          </div>
          <div
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              color: status.color.replace('text-', ''),
              background: status.bgColor,
              border: `1px solid ${status.borderColor}`
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
              ${order.total_amount?.toFixed(2) || order.total?.toFixed(2) || '0.00'}
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
              <span className="text-gray-400 text-xs uppercase">
                {order.crypto}
              </span>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

// Основной компонент модалки
export default function OrdersModal({ isOpen, onClose }) {
  const { getMyOrders, loading } = useShopApi();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen]);

  const loadOrders = async () => {
    triggerHaptic('light');
    const { data, error } = await getMyOrders();

    if (error) {
      setError(error);
    } else {
      setOrders(data || []);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('orders.title')}>
      <div className="space-y-4">
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
              onClick={loadOrders}
              className="px-6 py-2 rounded-xl font-medium text-white"
              style={{
                background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
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
            <p className="text-gray-400 text-sm">
              {t('orders.empty')}
            </p>
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
    </BottomSheet>
  );
}
