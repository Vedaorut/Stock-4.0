import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useTelegram } from '../../hooks/useTelegram';
import { useScrollLock } from '../../hooks/useScrollLock';
import UserDetailModal from './UserDetailModal';
import ShopDetailModal from './ShopDetailModal';

// Tab configuration
const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'shops', label: 'Shops' },
  { id: 'activity', label: 'Activity' },
];

// Filter configurations
const USER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'buyer', label: 'Buyers' },
  { id: 'seller', label: 'Sellers' },
];

const SHOP_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pro', label: 'Pro' },
  { id: 'max', label: 'Max' },
  { id: 'active', label: 'Active' },
  { id: 'trial', label: 'Trial' },
  { id: 'grace_period', label: 'Grace' },
];

const ACTIVITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'view_users', label: 'View Users' },
  { id: 'view_shops', label: 'View Shops' },
  { id: 'view_user_detail', label: 'User Detail' },
  { id: 'view_shop_detail', label: 'Shop Detail' },
];

// Badge colors
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

const ROLE_BADGES = {
  buyer: 'bg-gray-500/20 text-gray-400',
  seller: 'bg-green-500/20 text-green-400',
  admin: 'bg-red-500/20 text-red-400',
};

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Format date helper
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

// Format relative time
function formatRelativeTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

// Format currency
function formatUSD(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// Skeleton Row Component
function SkeletonRow() {
  return (
    <div className="glass-card rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-1/3" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
        <div className="h-5 bg-white/10 rounded w-16" />
      </div>
    </div>
  );
}

// User Row Component
function UserRow({ user, onClick }) {
  const { triggerHaptic } = useTelegram();
  const initial = (user.username || user.first_name || 'U')[0].toUpperCase();
  const role = user.shop_count > 0 ? 'seller' : 'buyer';

  const handleClick = () => {
    triggerHaptic('light');
    onClick(user.id);
  };

  return (
    <motion.button
      onClick={handleClick}
      className="w-full glass-card rounded-xl p-4 text-left hover:bg-white/5 transition-colors cursor-pointer"
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-primary/30 to-orange-500/10 flex items-center justify-center text-orange-primary font-bold text-sm flex-shrink-0">
          {initial}
        </div>

        {/* User info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm truncate">
              {user.username ? `@${user.username}` : user.first_name || `ID: ${user.telegram_id}`}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ROLE_BADGES[role]}`}>
              {role}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
            <span>{user.shop_count || 0} shops</span>
            <span>{user.order_count || 0} orders</span>
            <span>{formatUSD(user.total_spent || 0)}</span>
          </div>
        </div>

        {/* Joined date */}
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] text-gray-500">{formatDate(user.created_at)}</p>
        </div>

        {/* Chevron */}
        <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </motion.button>
  );
}

// Shop Row Component
function ShopRow({ shop, onClick }) {
  const { triggerHaptic } = useTelegram();
  const tier = shop.subscription_tier?.toLowerCase() || 'free';
  const status = shop.subscription_status || 'inactive';

  const handleClick = () => {
    triggerHaptic('light');
    onClick(shop.id);
  };

  return (
    <motion.button
      onClick={handleClick}
      className="w-full glass-card rounded-xl p-4 text-left hover:bg-white/5 transition-colors cursor-pointer"
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3">
        {/* Shop icon */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-blue-500/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>

        {/* Shop info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm truncate">{shop.name}</span>
            {tier !== 'free' && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TIER_BADGES[tier] || TIER_BADGES.pro}`}>
                {tier.toUpperCase()}
              </span>
            )}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGES[status] || STATUS_BADGES.inactive}`}>
              {status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
            <span>@{shop.owner_username || 'unknown'}</span>
            <span>{shop.product_count || 0} products</span>
            <span>{shop.order_count || 0} orders</span>
          </div>
        </div>

        {/* Revenue */}
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-green-400">{formatUSD(shop.revenue || 0)}</p>
          <p className="text-[10px] text-gray-500">{formatDate(shop.created_at)}</p>
        </div>

        {/* Chevron */}
        <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </motion.button>
  );
}

// Activity Row Component
function ActivityRow({ log }) {
  const actionColors = {
    view_users: 'text-blue-400',
    view_shops: 'text-purple-400',
    view_user_detail: 'text-green-400',
    view_shop_detail: 'text-orange-400',
  };

  return (
    <motion.div
      className="glass-card rounded-xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3">
        {/* Action icon */}
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
          <svg className={`w-5 h-5 ${actionColors[log.action] || 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>

        {/* Log info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-sm">
              @{log.admin_username || 'Admin'}
            </span>
            <span className={`text-[10px] font-medium ${actionColors[log.action] || 'text-gray-400'}`}>
              {log.action?.replace(/_/g, ' ')}
            </span>
          </div>
          {log.target_name && (
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              Target: {log.target_name}
            </p>
          )}
        </div>

        {/* Timestamp */}
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-gray-500">{formatRelativeTime(log.created_at)}</p>
        </div>
      </div>
    </motion.div>
  );
}

// Empty State Component
function EmptyState({ type }) {
  const configs = {
    users: {
      icon: (
        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      title: 'No users found',
      subtitle: 'Try adjusting your search or filters',
    },
    shops: {
      icon: (
        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      title: 'No shops found',
      subtitle: 'Try adjusting your search or filters',
    },
    activity: {
      icon: (
        <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      title: 'No activity logs',
      subtitle: 'Activity will appear here as admins interact',
    },
  };

  const config = configs[type] || configs.users;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-16"
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
        {config.icon}
      </div>
      <p className="text-white font-medium mb-1">{config.title}</p>
      <p className="text-gray-500 text-sm">{config.subtitle}</p>
    </motion.div>
  );
}

// Search Bar Component
function SearchBar({ value, onChange, placeholder }) {
  const { triggerHaptic } = useTelegram();
  const inputRef = useRef(null);

  const handleClear = () => {
    triggerHaptic('light');
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 text-white pl-10 pr-10 py-3 rounded-xl border border-white/10 focus:border-orange-primary/50 outline-none transition-colors text-sm placeholder:text-gray-500"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Filter Chips Component
function FilterChips({ options, selected, onChange }) {
  const { triggerHaptic } = useTelegram();

  const handleSelect = (id) => {
    triggerHaptic('light');
    onChange(id);
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      {options.map((option) => {
        const isActive = selected === option.id;
        return (
          <motion.button
            key={option.id}
            onClick={() => handleSelect(option.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-orange-primary text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
            whileTap={{ scale: 0.95 }}
          >
            {option.label}
          </motion.button>
        );
      })}
    </div>
  );
}

// Tab Bar Component
function TabBar({ tabs, activeTab, onChange }) {
  const { triggerHaptic } = useTelegram();

  return (
    <div className="bg-white/5 p-1 rounded-xl flex relative isolate">
      <LayoutGroup>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                triggerHaptic('light');
                onChange(tab.id);
              }}
              className={`flex-1 relative z-10 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive ? 'text-white' : 'text-gray-400 hover:text-white/70'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-white/10 rounded-lg shadow-sm backdrop-blur-sm border border-white/5"
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  style={{ borderRadius: '8px' }}
                />
              )}
              <span className="relative z-20">{tab.label}</span>
            </button>
          );
        })}
      </LayoutGroup>
    </div>
  );
}

// Main Component
export default function AdminPanelV2({ isOpen, onClose }) {
  const { get } = useApi();
  const { triggerHaptic } = useTelegram();

  // Tab state
  const [activeTab, setActiveTab] = useState('users');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 500);

  // Filter states
  const [usersFilter, setUsersFilter] = useState('all');
  const [shopsFilter, setShopsFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');

  // Data states
  const [usersData, setUsersData] = useState({ items: [], total: 0, page: 1, hasMore: true });
  const [shopsData, setShopsData] = useState({ items: [], total: 0, page: 1, hasMore: true });
  const [activityData, setActivityData] = useState({ items: [], total: 0, page: 1, hasMore: true });

  // Loading states
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modal states for detail views
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedShopId, setSelectedShopId] = useState(null);

  // Refs
  const loadMoreRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Get current data based on active tab
  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'users':
        return usersData;
      case 'shops':
        return shopsData;
      case 'activity':
        return activityData;
      default:
        return { items: [], total: 0, page: 1, hasMore: true };
    }
  }, [activeTab, usersData, shopsData, activityData]);

  // Get current filter based on active tab
  const currentFilter = useMemo(() => {
    switch (activeTab) {
      case 'users':
        return usersFilter;
      case 'shops':
        return shopsFilter;
      case 'activity':
        return activityFilter;
      default:
        return 'all';
    }
  }, [activeTab, usersFilter, shopsFilter, activityFilter]);

  // Handle close
  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose, triggerHaptic]);

  useBackButton(isOpen ? handleClose : null);
  useScrollLock(isOpen);

  // Fetch data function
  const fetchData = useCallback(
    async (tab, page = 1, search = '', filter = 'all', append = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const signal = abortControllerRef.current.signal;

      try {
        let endpoint = '';
        let params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('limit', '50');

        if (search) {
          params.set('search', search);
        }

        switch (tab) {
          case 'users':
            endpoint = '/admin/users';
            if (filter !== 'all') {
              params.set('role', filter);
            }
            break;
          case 'shops':
            endpoint = '/admin/shops';
            if (['pro', 'max'].includes(filter)) {
              params.set('tier', filter);
            } else if (['active', 'inactive', 'trial', 'grace_period'].includes(filter)) {
              params.set('status', filter);
            }
            break;
          case 'activity':
            endpoint = '/admin/activity';
            params.set('limit', '100');
            if (filter !== 'all') {
              params.set('action', filter);
            }
            break;
          default:
            return;
        }

        const { data, error } = await get(`${endpoint}?${params.toString()}`, {
          signal,
          timeout: 15000,
        });

        if (signal.aborted) return;

        if (error) {
          console.error(`Failed to fetch ${tab}:`, error);
          return;
        }

        if (data?.success && data?.data) {
          const responseData = data.data;
          const items = responseData.users || responseData.shops || responseData.logs || [];
          const pagination = responseData.pagination || {};

          const newData = {
            items: append ? [...currentData.items, ...items] : items,
            total: pagination.total || items.length,
            page: pagination.page || page,
            hasMore: pagination.hasMore ?? (items.length >= (tab === 'activity' ? 100 : 50)),
          };

          switch (tab) {
            case 'users':
              setUsersData(newData);
              break;
            case 'shops':
              setShopsData(newData);
              break;
            case 'activity':
              setActivityData(newData);
              break;
          }
        }
      } catch (err) {
        if (!signal.aborted) {
          console.error(`Error fetching ${tab}:`, err);
        }
      }
    },
    [get, currentData.items]
  );

  // Initial load and refresh
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    fetchData(activeTab, 1, debouncedSearch, currentFilter).finally(() => {
      setLoading(false);
    });

    // Auto-refresh every 30s
    const intervalId = setInterval(() => {
      fetchData(activeTab, 1, debouncedSearch, currentFilter);
    }, 30000);

    return () => {
      clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, activeTab, debouncedSearch, currentFilter, fetchData]);

  // Reset page on filter/search change
  useEffect(() => {
    if (!isOpen) return;

    // Reset data for current tab
    switch (activeTab) {
      case 'users':
        setUsersData((prev) => ({ ...prev, page: 1, hasMore: true }));
        break;
      case 'shops':
        setShopsData((prev) => ({ ...prev, page: 1, hasMore: true }));
        break;
      case 'activity':
        setActivityData((prev) => ({ ...prev, page: 1, hasMore: true }));
        break;
    }
  }, [isOpen, activeTab, debouncedSearch, currentFilter]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!isOpen || !loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && currentData.hasMore && !loading && !loadingMore) {
          setLoadingMore(true);
          const nextPage = currentData.page + 1;
          fetchData(activeTab, nextPage, debouncedSearch, currentFilter, true).finally(() => {
            setLoadingMore(false);
          });
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [isOpen, activeTab, currentData.hasMore, currentData.page, loading, loadingMore, debouncedSearch, currentFilter, fetchData]);

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchQuery('');
  };

  // Handle user click
  const handleUserClick = (userId) => {
    setSelectedUserId(userId);
  };

  // Handle shop click
  const handleShopClick = (shopId) => {
    setSelectedShopId(shopId);
  };

  // Get filter options for current tab
  const filterOptions = useMemo(() => {
    switch (activeTab) {
      case 'users':
        return USER_FILTERS;
      case 'shops':
        return SHOP_FILTERS;
      case 'activity':
        return ACTIVITY_FILTERS;
      default:
        return [];
    }
  }, [activeTab]);

  // Handle filter change
  const handleFilterChange = (filter) => {
    switch (activeTab) {
      case 'users':
        setUsersFilter(filter);
        break;
      case 'shops':
        setShopsFilter(filter);
        break;
      case 'activity':
        setActivityFilter(filter);
        break;
    }
  };

  // Get search placeholder for current tab
  const searchPlaceholder = useMemo(() => {
    switch (activeTab) {
      case 'users':
        return 'Search by username or ID...';
      case 'shops':
        return 'Search by shop name or owner...';
      case 'activity':
        return 'Search by action type...';
      default:
        return 'Search...';
    }
  }, [activeTab]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-dark-bg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <PageHeader title="Admin Panel" onBack={handleClose} variant="close" />

          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total, 100px) + 40px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-4 space-y-4">
              {/* Tab Bar */}
              <TabBar tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

              {/* Search Bar */}
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={searchPlaceholder}
              />

              {/* Filter Chips */}
              <FilterChips
                options={filterOptions}
                selected={currentFilter}
                onChange={handleFilterChange}
              />

              {/* Results count */}
              {!loading && currentData.items.length > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-gray-500"
                >
                  Showing {currentData.items.length} of {currentData.total} results
                </motion.p>
              )}

              {/* Loading skeletons */}
              {loading && currentData.items.length === 0 && (
                <div className="space-y-3">
                  {[...Array(8)].map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!loading && currentData.items.length === 0 && (
                <EmptyState type={activeTab} />
              )}

              {/* Data list */}
              {currentData.items.length > 0 && (
                <div className="space-y-3">
                  {activeTab === 'users' &&
                    currentData.items.map((user, index) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                      >
                        <UserRow user={user} onClick={handleUserClick} />
                      </motion.div>
                    ))}

                  {activeTab === 'shops' &&
                    currentData.items.map((shop, index) => (
                      <motion.div
                        key={shop.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                      >
                        <ShopRow shop={shop} onClick={handleShopClick} />
                      </motion.div>
                    ))}

                  {activeTab === 'activity' &&
                    currentData.items.map((log, index) => (
                      <motion.div
                        key={log.id || index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                      >
                        <ActivityRow log={log} />
                      </motion.div>
                    ))}
                </div>
              )}

              {/* Load more trigger */}
              {currentData.hasMore && (
                <div ref={loadMoreRef} className="py-4 flex justify-center">
                  {loadingMore && (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-orange-primary rounded-full animate-spin" />
                      <span>Loading more...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Auto-refresh indicator */}
              {!loading && currentData.items.length > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-center text-gray-600 text-[10px]"
                >
                  Auto-refresh every 30s
                </motion.p>
              )}

              {/* Spacer for TabBar */}
              <div className="h-24 shrink-0" aria-hidden="true" />
            </div>
          </div>

          {/* User Detail Modal */}
          <UserDetailModal
            isOpen={!!selectedUserId}
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
            onNavigateToShop={(shopId) => {
              setSelectedUserId(null);
              setSelectedShopId(shopId);
            }}
          />

          {/* Shop Detail Modal */}
          <ShopDetailModal
            isOpen={!!selectedShopId}
            shopId={selectedShopId}
            onClose={() => setSelectedShopId(null)}
            onNavigateToUser={(userId) => {
              setSelectedShopId(null);
              setSelectedUserId(userId);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
