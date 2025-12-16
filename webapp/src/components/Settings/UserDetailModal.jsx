import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useTelegram } from '../../hooks/useTelegram';
import { useScrollLock } from '../../hooks/useScrollLock';

// Badge configurations
const TIER_BADGES = {
  pro: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  max: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const STATUS_BADGES = {
  active: 'bg-green-500/20 text-green-400',
  inactive: 'bg-gray-500/20 text-gray-400',
  trial: 'bg-yellow-500/20 text-yellow-400',
  grace_period: 'bg-orange-500/20 text-orange-400',
};

const ORDER_STATUS_BADGES = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  verifying: 'bg-blue-500/20 text-blue-400',
  paid: 'bg-green-500/20 text-green-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

// Format date helper
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format currency
function formatUSD(amount) {
  const value = Number(amount) || 0;
  return `$${value.toFixed(2)}`;
}

// Stat Card Component
function StatCard({ icon, label, value }) {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider">{label}</p>
          <p className="text-white font-bold text-lg">{value}</p>
        </div>
      </div>
    </div>
  );
}

// Shop Card Component
function ShopCard({ shop, onClick }) {
  const { triggerHaptic } = useTelegram();
  const tier = shop.tier?.toLowerCase() || 'free';
  const status = shop.subscription_status || 'inactive';

  const handleClick = () => {
    triggerHaptic('light');
    onClick(shop.id);
  };

  return (
    <motion.button
      onClick={handleClick}
      className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 text-left hover:bg-white/10 transition-colors"
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-blue-500/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm truncate">{shop.name}</span>
            {tier !== 'free' && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIER_BADGES[tier] || TIER_BADGES.pro}`}>
                {tier.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGES[status] || STATUS_BADGES.inactive}`}>
              {status.replace('_', ' ')}
            </span>
            <span className="text-[11px] text-white/40 ml-2">{shop.product_count || 0} products</span>
            <span className="text-[11px] text-white/40 ml-2">{shop.order_count || 0} orders</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-[10px] text-white/40">{formatDate(shop.created_at)}</p>
        </div>

        <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </motion.button>
  );
}

// Order Row Component
function OrderRow({ order }) {
  const status = order.status || 'pending';

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm">#{order.id}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ORDER_STATUS_BADGES[status] || ORDER_STATUS_BADGES.pending}`}>
              {status}
            </span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5 truncate">{order.shop_name || 'Unknown Shop'}</p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-white font-bold text-sm">{formatUSD(order.total_price)}</p>
          <p className="text-[10px] text-white/40">{formatDate(order.created_at)}</p>
        </div>
      </div>
    </div>
  );
}

// Loading Skeleton
function LoadingSkeleton() {
  return (
    <div className="px-4 space-y-4">
      {/* User info skeleton */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-white/10 rounded w-1/3" />
            <div className="h-4 bg-white/5 rounded w-1/2" />
            <div className="h-3 bg-white/5 rounded w-1/4" />
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10" />
              <div className="space-y-2">
                <div className="h-3 bg-white/5 rounded w-12" />
                <div className="h-5 bg-white/10 rounded w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Shops skeleton */}
      <div className="space-y-3">
        <div className="h-5 bg-white/10 rounded w-24" />
        {[1, 2].map((i) => (
          <div key={i} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
            <div className="h-3 bg-white/5 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Component
export default function UserDetailModal({ isOpen, userId, onClose, onNavigateToShop }) {
  const { get } = useApi();
  const { triggerHaptic } = useTelegram();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const abortControllerRef = useRef(null);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose, triggerHaptic]);

  useBackButton(isOpen ? handleClose : null);
  useScrollLock(isOpen);

  // Fetch user data
  const fetchUserData = useCallback(
    async (signal) => {
      if (!userId) return { status: 'error', error: 'No user ID provided' };

      try {
        const { data, error } = await get(`/admin/users/${userId}`, {
          signal,
          timeout: 10000,
        });

        if (signal?.aborted) return { status: 'aborted' };

        if (error) {
          return { status: 'error', error };
        }

        if (data?.success && data?.data) {
          setUserData(data.data);
          return { status: 'success' };
        }

        return { status: 'error', error: 'Failed to load user data' };
      } catch (err) {
        if (signal?.aborted) return { status: 'aborted' };
        return { status: 'error', error: err.message || 'An error occurred' };
      }
    },
    [get, userId]
  );

  // Fetch on mount
  useEffect(() => {
    if (!isOpen || !userId) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchUserData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (result?.status === 'error') {
            setError(result.error);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [isOpen, userId, fetchUserData]);

  // Retry handler
  const handleRetry = useCallback(() => {
    triggerHaptic('light');
    setLoading(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    fetchUserData(abortControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => setLoading(false));
  }, [triggerHaptic, fetchUserData]);

  // Handle shop click - navigate to ShopDetailModal
  const handleShopClick = (shopId) => {
    if (onNavigateToShop) {
      onNavigateToShop(shopId);
    }
  };

  // Get user initials
  const getInitials = () => {
    if (!userData) return 'U';
    return (userData.username || userData.first_name || 'U')[0].toUpperCase();
  };

  // Modal title
  const modalTitle = userData?.username ? `@${userData.username}` : 'User Details';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] bg-dark-bg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <PageHeader title={modalTitle} onBack={handleClose} variant="close" />

          <div
            className="flex-1 min-h-0 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total, 100px) + 40px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Loading state */}
            {loading && <LoadingSkeleton />}

            {/* Error state */}
            {!loading && error && (
              <div className="px-4 py-8">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white/5 backdrop-blur-md border border-red-500/20 rounded-xl p-6 text-center"
                >
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-red-400 text-sm mb-4">{error}</p>
                  <motion.button
                    onClick={handleRetry}
                    className="px-6 py-2 rounded-xl text-sm font-medium text-white bg-orange-primary hover:bg-orange-primary/80 transition-colors"
                    whileTap={{ scale: 0.95 }}
                  >
                    Try Again
                  </motion.button>
                </motion.div>
              </div>
            )}

            {/* Content */}
            {!loading && !error && userData && (
              <div className="px-4 py-4 space-y-4">
                {/* User Info Card */}
                <motion.div
                  className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-primary/30 to-orange-500/10 flex items-center justify-center text-orange-primary font-bold text-xl flex-shrink-0">
                      {getInitials()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-white font-bold text-lg">
                          {userData.username ? `@${userData.username}` : userData.first_name || 'Anonymous'}
                        </h2>
                        {userData.is_admin && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                            ADMIN
                          </span>
                        )}
                      </div>

                      {userData.first_name && userData.last_name && (
                        <p className="text-white/60 text-sm mt-1">
                          {userData.first_name} {userData.last_name}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        {/* Role badge */}
                        <div className={`text-[10px] font-medium px-2 py-1 rounded ${
                          userData.selected_role === 'seller'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {userData.selected_role || 'buyer'}
                        </div>

                        {/* Language */}
                        <div className="text-[10px] font-medium px-2 py-1 rounded bg-white/5 text-white/60">
                          {userData.language === 'ru' ? 'Russian' : 'English'}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <p className="text-white/40 text-xs">
                          Telegram ID: <span className="text-white/60 font-mono">{userData.telegram_id}</span>
                        </p>
                        <p className="text-white/40 text-xs">
                          Joined: <span className="text-white/60">{formatDate(userData.created_at)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Stats Grid */}
                <motion.div
                  className="grid grid-cols-2 gap-3"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <StatCard
                    icon={
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    }
                    label="Shops"
                    value={userData.shop_count || 0}
                  />
                  <StatCard
                    icon={
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    }
                    label="Orders"
                    value={userData.order_count || 0}
                  />
                  <StatCard
                    icon={
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                    label="Total Spent"
                    value={formatUSD(userData.total_spent || 0)}
                  />
                  <StatCard
                    icon={
                      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    }
                    label="Member Since"
                    value={formatDate(userData.created_at)}
                  />
                </motion.div>

                {/* User's Shops */}
                {userData.shops && userData.shops.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                      <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                      User&apos;s Shops
                    </h3>
                    <div className="space-y-2">
                      {userData.shops.map((shop) => (
                        <ShopCard key={shop.id} shop={shop} onClick={handleShopClick} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Empty shops state */}
                {(!userData.shops || userData.shops.length === 0) && userData.selected_role === 'seller' && (
                  <motion.div
                    className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <p className="text-white/40 text-sm">This user has no shops</p>
                  </motion.div>
                )}

                {/* Recent Orders */}
                {userData.recent_orders && userData.recent_orders.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                  >
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                      <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                      Recent Orders (Last 10)
                    </h3>
                    <div className="space-y-2">
                      {userData.recent_orders.map((order) => (
                        <OrderRow key={order.id} order={order} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Empty orders state */}
                {(!userData.recent_orders || userData.recent_orders.length === 0) && (
                  <motion.div
                    className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                  >
                    <p className="text-white/40 text-sm">This user has no orders</p>
                  </motion.div>
                )}

                {/* Spacer for TabBar */}
                <div className="h-24 shrink-0" aria-hidden="true" />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
