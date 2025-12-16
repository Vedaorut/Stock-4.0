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
  active: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-500' },
  inactive: { bg: 'bg-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-500' },
  trial: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  grace_period: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500' },
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
function StatCard({ icon, label, value, highlight }) {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider">{label}</p>
          <p className={`font-bold text-lg ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

// Product Row Component
function ProductRow({ product }) {
  const isActive = product.is_active !== false;

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm truncate">{product.name}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-white/40">
            <span>Stock: {product.stock ?? '-'}</span>
            <span>{formatDate(product.created_at)}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-white font-bold text-sm">{formatUSD(product.price)}</p>
        </div>
      </div>
    </div>
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
          <p className="text-[11px] text-white/40 mt-0.5 truncate">
            Buyer: @{order.buyer_username || 'Anonymous'}
          </p>
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
      {/* Shop info skeleton */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 animate-pulse">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/10" />
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

      {/* Products skeleton */}
      <div className="space-y-3">
        <div className="h-5 bg-white/10 rounded w-24" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 animate-pulse">
            <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
            <div className="h-3 bg-white/5 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Base Modal Wrapper
function ActionModal({ title, children, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      {/* Modal */}
      <motion.div
        className="relative bg-dark-bg/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-xl"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
        {children}
      </motion.div>
    </motion.div>
  );
}

// Change Tier Modal
function ChangeTierModal({ currentTier, loading, onConfirm, onClose }) {
  const [tier, setTier] = useState(currentTier === 'pro' ? 'max' : 'pro');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(tier, reason || undefined, notes || undefined);
  };

  return (
    <ActionModal title="Change Subscription Tier" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tier Selection */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Select Tier</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTier('pro')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${
                tier === 'pro'
                  ? 'bg-blue-500/30 border-blue-500/50 text-blue-400'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
            >
              PRO
            </button>
            <button
              type="button"
              onClick={() => setTier('max')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${
                tier === 'max'
                  ? 'bg-purple-500/30 border-purple-500/50 text-purple-400'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
            >
              MAX
            </button>
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is the tier being changed?"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={2}
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Internal Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes for admin logs"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Changing...' : 'Change Tier'}
          </button>
        </div>
      </form>
    </ActionModal>
  );
}

// Suspend Shop Modal
function SuspendShopModal({ loading, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Please provide a reason for suspension');
      return;
    }
    onConfirm(reason.trim(), notes || undefined);
  };

  return (
    <ActionModal title="Suspend Shop" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          <p className="text-red-400 text-sm">
            Warning: This will immediately suspend the shop and prevent all operations.
          </p>
        </div>

        {/* Reason (Required) */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Reason <span className="text-red-400">*</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this shop being suspended?"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={3}
            required
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Internal Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes for admin logs"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !reason.trim()}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Suspending...' : 'Suspend Shop'}
          </button>
        </div>
      </form>
    </ActionModal>
  );
}

// Activate Shop Modal
function ActivateShopModal({ loading, onConfirm, onClose }) {
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(notes || undefined);
  };

  return (
    <ActionModal title="Activate Shop" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
          <p className="text-green-400 text-sm">
            This will reactivate the shop and allow normal operations.
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Internal Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes for admin logs"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white bg-green-500 hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Activating...' : 'Activate Shop'}
          </button>
        </div>
      </form>
    </ActionModal>
  );
}

// Grant Lifetime Modal
function GrantLifetimeModal({ loading, onConfirm, onClose }) {
  const [tier, setTier] = useState('max');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(tier, notes || undefined);
  };

  return (
    <ActionModal title="Grant Lifetime Subscription" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
          <p className="text-purple-400 text-sm">
            This will grant a permanent lifetime subscription to this shop.
          </p>
        </div>

        {/* Tier Selection */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Select Tier</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTier('pro')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${
                tier === 'pro'
                  ? 'bg-blue-500/30 border-blue-500/50 text-blue-400'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
            >
              PRO Lifetime
            </button>
            <button
              type="button"
              onClick={() => setTier('max')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${
                tier === 'max'
                  ? 'bg-purple-500/30 border-purple-500/50 text-purple-400'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
            >
              MAX Lifetime
            </button>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Internal Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why is lifetime being granted?"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Granting...' : 'Grant Lifetime'}
          </button>
        </div>
      </form>
    </ActionModal>
  );
}

// Extend Subscription Modal
function ExtendSubscriptionModal({ loading, onConfirm, onClose }) {
  const [days, setDays] = useState(30);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 3650) {
      alert('Please enter a valid number of days (1-3650)');
      return;
    }
    onConfirm(daysNum, notes || undefined);
  };

  return (
    <ActionModal title="Extend Subscription" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
          <p className="text-orange-400 text-sm">
            This will extend the current subscription period by the specified number of days.
          </p>
        </div>

        {/* Days Input */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Number of Days</label>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            min={1}
            max={3650}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          />
          <div className="flex gap-2">
            {[7, 14, 30, 90, 365].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  days === d
                    ? 'bg-orange-500/30 border-orange-500/50 text-orange-400'
                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-white/60 text-sm">Internal Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why is subscription being extended?"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/30"
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Extending...' : `Extend by ${days} days`}
          </button>
        </div>
      </form>
    </ActionModal>
  );
}

// Main Component
export default function ShopDetailModal({ isOpen, shopId, onClose, onNavigateToUser }) {
  const { get, post } = useApi();
  const { triggerHaptic } = useTelegram();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shopData, setShopData] = useState(null);
  const abortControllerRef = useRef(null);

  // Admin action modal states
  const [showChangeTier, setShowChangeTier] = useState(false);
  const [showSuspend, setShowSuspend] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [showGrantLifetime, setShowGrantLifetime] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose, triggerHaptic]);

  useBackButton(isOpen ? handleClose : null);
  useScrollLock(isOpen);

  // Fetch shop data
  const fetchShopData = useCallback(
    async (signal) => {
      if (!shopId) return { status: 'error', error: 'No shop ID provided' };

      try {
        const { data, error } = await get(`/admin/shops/${shopId}`, {
          signal,
          timeout: 10000,
        });

        if (signal?.aborted) return { status: 'aborted' };

        if (error) {
          return { status: 'error', error };
        }

        if (data?.success && data?.data) {
          setShopData(data.data);
          return { status: 'success' };
        }

        return { status: 'error', error: 'Failed to load shop data' };
      } catch (err) {
        if (signal?.aborted) return { status: 'aborted' };
        return { status: 'error', error: err.message || 'An error occurred' };
      }
    },
    [get, shopId]
  );

  // Fetch on mount
  useEffect(() => {
    if (!isOpen || !shopId) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchShopData(controller.signal)
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
  }, [isOpen, shopId, fetchShopData]);

  // Retry handler
  const handleRetry = useCallback(() => {
    triggerHaptic('light');
    setLoading(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    fetchShopData(abortControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'error') {
          setError(result.error);
        }
      })
      .finally(() => setLoading(false));
  }, [triggerHaptic, fetchShopData]);

  // Refresh shop data
  const refreshShopData = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    fetchShopData(abortControllerRef.current.signal).then((result) => {
      if (result?.status === 'error') {
        setError(result.error);
      }
    });
  }, [fetchShopData]);

  // Handle owner click - navigate to UserDetailModal
  const handleOwnerClick = () => {
    if (onNavigateToUser && shopData?.owner_id) {
      triggerHaptic('light');
      onNavigateToUser(shopData.owner_id);
    }
  };

  // Admin action handlers
  const handleChangeTier = async (tier, reason, notes) => {
    triggerHaptic('light');
    setActionLoading(true);
    try {
      const { data, error: apiError } = await post(`/admin/shops/${shopId}/change-tier`, { tier, reason, notes });
      if (apiError || !data?.success) {
        alert('Failed to change tier: ' + (apiError || 'Unknown error'));
        return;
      }
      refreshShopData();
      setShowChangeTier(false);
    } catch (err) {
      alert('Failed to change tier: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (reason, notes) => {
    triggerHaptic('light');
    setActionLoading(true);
    try {
      const { data, error: apiError } = await post(`/admin/shops/${shopId}/suspend`, { reason, notes });
      if (apiError || !data?.success) {
        alert('Failed to suspend shop: ' + (apiError || 'Unknown error'));
        return;
      }
      refreshShopData();
      setShowSuspend(false);
    } catch (err) {
      alert('Failed to suspend shop: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async (notes) => {
    triggerHaptic('light');
    setActionLoading(true);
    try {
      const { data, error: apiError } = await post(`/admin/shops/${shopId}/activate`, { notes });
      if (apiError || !data?.success) {
        alert('Failed to activate shop: ' + (apiError || 'Unknown error'));
        return;
      }
      refreshShopData();
      setShowActivate(false);
    } catch (err) {
      alert('Failed to activate shop: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleGrantLifetime = async (tier, notes) => {
    triggerHaptic('light');
    setActionLoading(true);
    try {
      const { data, error: apiError } = await post(`/admin/shops/${shopId}/grant-lifetime`, { tier, notes });
      if (apiError || !data?.success) {
        alert('Failed to grant lifetime: ' + (apiError || 'Unknown error'));
        return;
      }
      refreshShopData();
      setShowGrantLifetime(false);
    } catch (err) {
      alert('Failed to grant lifetime: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtendSubscription = async (days, notes) => {
    triggerHaptic('light');
    setActionLoading(true);
    try {
      const { data, error: apiError } = await post(`/admin/shops/${shopId}/extend-subscription`, { days, notes });
      if (apiError || !data?.success) {
        alert('Failed to extend subscription: ' + (apiError || 'Unknown error'));
        return;
      }
      refreshShopData();
      setShowExtend(false);
    } catch (err) {
      alert('Failed to extend subscription: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  // Get status config
  const getStatusConfig = () => {
    const status = shopData?.subscription_status || 'inactive';
    return STATUS_BADGES[status] || STATUS_BADGES.inactive;
  };

  // Modal title
  const modalTitle = shopData?.name || 'Shop Details';
  const tier = shopData?.tier?.toLowerCase() || 'free';
  const statusConfig = getStatusConfig();

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
            {!loading && !error && shopData && (
              <div className="px-4 py-4 space-y-4">
                {/* Shop Info Card */}
                <motion.div
                  className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex items-start gap-4">
                    {/* Shop icon */}
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/30 to-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-white font-bold text-lg">{shopData.name}</h2>
                        {tier !== 'free' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIER_BADGES[tier] || TIER_BADGES.pro}`}>
                            {tier.toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Owner - clickable */}
                      <button
                        onClick={handleOwnerClick}
                        className="mt-2 text-sm text-orange-primary hover:text-orange-300 transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        @{shopData.owner_username || 'unknown'}
                      </button>

                      {/* Status badges */}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <div className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded ${statusConfig.bg} ${statusConfig.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                          {(shopData.subscription_status || 'inactive').replace('_', ' ')}
                        </div>
                        {shopData.is_trial && (
                          <span className="text-[10px] font-medium px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">
                            Trial
                          </span>
                        )}
                      </div>

                      {/* Additional info */}
                      <div className="mt-3 space-y-1">
                        {shopData.next_payment_due && (
                          <p className="text-white/40 text-xs">
                            Next payment: <span className="text-white/60">{formatDate(shopData.next_payment_due)}</span>
                          </p>
                        )}
                        <p className="text-white/40 text-xs">
                          Created: <span className="text-white/60">{formatDate(shopData.created_at)}</span>
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
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    }
                    label="Active Products"
                    value={shopData.stats?.active_product_count || 0}
                  />
                  <StatCard
                    icon={
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    }
                    label="Total Orders"
                    value={shopData.stats?.total_order_count || 0}
                  />
                  <StatCard
                    icon={
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                    label="Completed"
                    value={shopData.stats?.completed_order_count || 0}
                  />
                  <StatCard
                    icon={
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                    label="Total Revenue"
                    value={formatUSD(shopData.stats?.total_revenue || 0)}
                    highlight
                  />
                </motion.div>

                {/* Admin Actions Section */}
                <motion.div
                  className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                >
                  <h3 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                    <span className="w-1 h-4 bg-orange-500 rounded-full"></span>
                    Admin Actions
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Change Tier Button */}
                    <motion.button
                      onClick={() => { triggerHaptic('light'); setShowChangeTier(true); }}
                      className="px-4 py-3 rounded-xl text-sm font-medium text-white bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                      whileTap={{ scale: 0.95 }}
                    >
                      Change Tier
                    </motion.button>

                    {/* Suspend/Activate Button */}
                    {shopData.is_active !== false ? (
                      <motion.button
                        onClick={() => { triggerHaptic('light'); setShowSuspend(true); }}
                        className="px-4 py-3 rounded-xl text-sm font-medium text-white bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                        whileTap={{ scale: 0.95 }}
                      >
                        Suspend Shop
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={() => { triggerHaptic('light'); setShowActivate(true); }}
                        className="px-4 py-3 rounded-xl text-sm font-medium text-white bg-green-500/20 border border-green-500/30 hover:bg-green-500/30 transition-colors"
                        whileTap={{ scale: 0.95 }}
                      >
                        Activate Shop
                      </motion.button>
                    )}

                    {/* Grant Lifetime Button */}
                    <motion.button
                      onClick={() => { triggerHaptic('light'); setShowGrantLifetime(true); }}
                      className="px-4 py-3 rounded-xl text-sm font-medium text-white bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                      whileTap={{ scale: 0.95 }}
                    >
                      Grant Lifetime
                    </motion.button>

                    {/* Extend Subscription Button */}
                    <motion.button
                      onClick={() => { triggerHaptic('light'); setShowExtend(true); }}
                      className="px-4 py-3 rounded-xl text-sm font-medium text-white bg-orange-500/20 border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
                      whileTap={{ scale: 0.95 }}
                    >
                      Extend Subscription
                    </motion.button>
                  </div>
                </motion.div>

                {/* Products Section */}
                {shopData.products && shopData.products.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                      <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                      Products (Last 10)
                    </h3>
                    <div className="space-y-2">
                      {shopData.products.map((product) => (
                        <ProductRow key={product.id} product={product} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Empty products state */}
                {(!shopData.products || shopData.products.length === 0) && (
                  <motion.div
                    className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <p className="text-white/40 text-sm">This shop has no products</p>
                  </motion.div>
                )}

                {/* Recent Orders Section */}
                {shopData.recent_orders && shopData.recent_orders.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                  >
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                      <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                      Recent Orders (Last 10)
                    </h3>
                    <div className="space-y-2">
                      {shopData.recent_orders.map((order) => (
                        <OrderRow key={order.id} order={order} />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Empty orders state */}
                {(!shopData.recent_orders || shopData.recent_orders.length === 0) && (
                  <motion.div
                    className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                  >
                    <p className="text-white/40 text-sm">This shop has no orders</p>
                  </motion.div>
                )}

                {/* Spacer for TabBar */}
                <div className="h-24 shrink-0" aria-hidden="true" />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Change Tier Modal */}
      <AnimatePresence>
        {showChangeTier && (
          <ChangeTierModal
            currentTier={shopData?.tier?.toLowerCase() || 'free'}
            loading={actionLoading}
            onConfirm={handleChangeTier}
            onClose={() => setShowChangeTier(false)}
          />
        )}
      </AnimatePresence>

      {/* Suspend Shop Modal */}
      <AnimatePresence>
        {showSuspend && (
          <SuspendShopModal
            loading={actionLoading}
            onConfirm={handleSuspend}
            onClose={() => setShowSuspend(false)}
          />
        )}
      </AnimatePresence>

      {/* Activate Shop Modal */}
      <AnimatePresence>
        {showActivate && (
          <ActivateShopModal
            loading={actionLoading}
            onConfirm={handleActivate}
            onClose={() => setShowActivate(false)}
          />
        )}
      </AnimatePresence>

      {/* Grant Lifetime Modal */}
      <AnimatePresence>
        {showGrantLifetime && (
          <GrantLifetimeModal
            loading={actionLoading}
            onConfirm={handleGrantLifetime}
            onClose={() => setShowGrantLifetime(false)}
          />
        )}
      </AnimatePresence>

      {/* Extend Subscription Modal */}
      <AnimatePresence>
        {showExtend && (
          <ExtendSubscriptionModal
            loading={actionLoading}
            onConfirm={handleExtendSubscription}
            onClose={() => setShowExtend(false)}
          />
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
