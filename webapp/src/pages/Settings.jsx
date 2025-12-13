import { useState, useMemo, lazy, Suspense, Component } from 'react';
import { motion } from 'framer-motion'; // Used in JSX
import Header from '../components/Layout/Header';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';
import { useStore } from '../store/useStore';
import InteractiveListItem from '../components/common/InteractiveListItem';

// Retry wrapper for lazy imports - handles chunk load failures
const lazyWithRetry = (importFn, retries = 2) => {
  return lazy(() =>
    importFn().catch((error) => {
      // Retry on chunk load failure
      if (retries > 0 && (error.name === 'ChunkLoadError' || error.message?.includes('Loading chunk'))) {
        console.warn(`[LazyLoad] Retrying import, ${retries} attempts left`);
        return new Promise((resolve) => setTimeout(resolve, 500)).then(() =>
          lazyWithRetry(importFn, retries - 1)()
        );
      }
      throw error;
    })
  );
};

// Error boundary for lazy-loaded modals - prevents full page crash
class ModalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ModalErrorBoundary] Modal failed to load:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Silently fail - modal just won't open, but page won't crash
      // User can try again by clicking the setting again
      return null;
    }
    return this.props.children;
  }
}

// Lazy load modals with retry logic for network failures
const WalletsModalLazy = lazyWithRetry(() => import('../components/Settings/WalletsModal'));
const LanguageModalLazy = lazyWithRetry(() => import('../components/Settings/LanguageModal'));
const ProductsModalLazy = lazyWithRetry(() => import('../components/Settings/ProductsModal'));
const SubscriptionModalLazy = lazyWithRetry(() => import('../components/Settings/SubscriptionModal'));
const WorkspaceModalLazy = lazyWithRetry(() => import('../components/Settings/WorkspaceModal'));
const FollowsModalLazy = lazyWithRetry(() => import('../components/Settings/FollowsModal'));
const AnalyticsModalLazy = lazyWithRetry(() => import('../components/Settings/AnalyticsModal'));
const MigrationModalLazy = lazyWithRetry(() => import('../components/Settings/MigrationModal'));
const InviteLinkModalLazy = lazyWithRetry(() => import('../components/Settings/InviteLinkModal'));

const MyOrdersModalLazy = lazyWithRetry(() => import('../components/Settings/MyOrdersModal'));
const ShopOrdersModalLazy = lazyWithRetry(() => import('../components/Settings/ShopOrdersModal'));
const FeedbackModalLazy = lazyWithRetry(() => import('../components/Settings/FeedbackModal'));

// Seller-only item IDs (hidden in buyer mode)
const SELLER_ONLY_ITEMS = [
  'products',
  'analytics',
  'wallet',
  'workspace',
  'follows',
  'migration',
  'subscription',
  'shop-orders',
  'invite-link',
];

// Helper function to format subscription value for display
const formatSubscriptionValue = (shop, t) => {
  if (!shop) return null;

  const tier = (shop.tier || 'pro').toUpperCase();

  // Trial
  if (shop.is_trial && shop.trial_ends_at) {
    const days = Math.max(0, Math.ceil((new Date(shop.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)));
    return `${t('settings.subscription.trial')} • ${days} ${t('settings.subscription.daysLeft')}`;
  }

  // Grace period
  if (shop.subscription_status === 'grace_period') {
    return `${tier} • ${t('settings.subscription.gracePeriod')}`;
  }

  // Inactive
  if (shop.subscription_status === 'inactive') {
    return `${tier} • ${t('settings.subscription.expired')}`;
  }

  // Active with days left
  if (shop.next_payment_due) {
    const days = Math.max(0, Math.ceil((new Date(shop.next_payment_due) - new Date()) / (1000 * 60 * 60 * 24)));
    if (days > 0) {
      return `${tier} • ${days} ${t('settings.subscription.daysLeft')}`;
    }
  }

  // Active (no date)
  return `${tier} • ${t('settings.subscription.active')}`;
};

const getSettingsSections = (t, lang, viewMode, shop) => {
  const languageNames = { ru: 'Russian', en: 'English' };

  const allSections = [
    {
      title: t('settings.sections.management'),
      items: [
        {
          id: 'products',
          label: t('settings.items.products'),
          description: t('settings.items.productsDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          ),
        },
        {
          id: 'shop-orders',
          label: t('settings.items.shopOrders'),
          description: t('settings.items.shopOrdersDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
          ),
        },
        {
          id: 'analytics',
          label: t('settings.items.analytics'),
          description: t('settings.items.analyticsDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          ),
        },
        {
          id: 'invite-link',
          label: t('settings.inviteLink'),
          description: t('settings.inviteLinkDescription'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          ),
        },
        {
          id: 'wallet',
          label: t('settings.items.wallets'),
          description: t('settings.items.walletsDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          ),
        },
        {
          id: 'workspace',
          label: t('settings.items.workspace'),
          description: t('settings.items.workspaceDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          ),
        },

        {
          id: 'follows',
          label: t('settings.items.follows'),
          description: t('settings.items.followsDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          ),
        },
        {
          id: 'migration',
          label: t('settings.items.migration'),
          description: t('settings.items.migrationDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          ),
        },
      ],
    },
    {
      title: t('settings.sections.purchases'),
      items: [
        {
          id: 'my-orders',
          label: t('settings.items.myOrders'),
          description: t('settings.items.myOrdersDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          ),
        },
      ],
    },
    {
      title: t('settings.sections.settings'),
      items: [
        {
          id: 'subscription',
          label: t('settings.items.subscription'),
          description: t('settings.items.subscriptionDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          ),
          value: formatSubscriptionValue(shop, t),
        },
        {
          id: 'language',
          label: t('settings.language'),
          description: t('settings.items.languageDesc'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
              />
            </svg>
          ),
          value: languageNames[lang] || 'Russian',
        },
        {
          id: 'feedback',
          label: t('feedback.title'),
          description: t('feedback.description'),
          icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          ),
        },
      ],
    },
  ];

  // In buyer mode, filter out seller-only items
  if (viewMode === 'buyer') {
    return allSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !SELLER_ONLY_ITEMS.includes(item.id)),
      }))
      .filter((section) => section.items.length > 0); // Remove empty sections
  }

  return allSections;
};

export default function Settings() {
  const { user, triggerHaptic } = useTelegram();
  const { t, lang } = useTranslation();
  const viewMode = useStore((state) => state.viewMode);
  const myShop = useStore((state) => state.myShop);
  const [showWallets, setShowWallets] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showFollows, setShowFollows] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [showInviteLink, setShowInviteLink] = useState(false);

  const [showMyOrders, setShowMyOrders] = useState(false);
  const [showShopOrders, setShowShopOrders] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const settingsSections = useMemo(() => getSettingsSections(t, lang, viewMode, myShop), [t, lang, viewMode, myShop]);

  const handleSettingClick = (itemId) => {
    triggerHaptic('light');

    switch (itemId) {
      case 'wallet':
        setShowWallets(true);
        break;
      case 'language':
        setShowLanguage(true);
        break;
      case 'analytics':
        setShowAnalytics(true);
        break;
      case 'products':
        setShowProducts(true);
        break;
      case 'subscription':
        setShowSubscription(true);
        break;
      case 'workspace':
        setShowWorkspace(true);
        break;
      case 'follows':
        setShowFollows(true);
        break;
      case 'migration':
        setShowMigration(true);
        break;
      case 'invite-link':
        setShowInviteLink(true);
        break;

      case 'my-orders':
        setShowMyOrders(true);
        break;
      case 'shop-orders':
        setShowShopOrders(true);
        break;
      case 'feedback':
        setShowFeedback(true);
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="scroll-smooth"
      style={{
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
        scrollBehavior: 'smooth',
      }}
    >
      <Header title={t('settings.title')} />

      <div className="px-4 py-6">
        {/* User Card */}
        {user && (
          <motion.div
            className="glass-card rounded-2xl p-6 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-4">
              {user.photo_url ? (
                <div className="w-16 h-16 rounded-full overflow-hidden bg-dark-elevated">
                  <img
                    src={user.photo_url}
                    alt={user.first_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-orange-primary flex items-center justify-center text-white text-2xl font-bold">
                  {user.first_name?.[0] || 'U'}
                </div>
              )}
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white mb-1">
                  {user.first_name} {user.last_name}
                </h2>
                {user.username && <p className="text-sm text-gray-400">@{user.username}</p>}
              </div>
            </div>
          </motion.div>
        )}

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingsSections.map((section, sectionIndex) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIndex * 0.1 }}
            >
              <h3
                className="text-xs font-semibold text-gray-400 mb-3 px-2 uppercase tracking-wider"
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                  marginTop: sectionIndex > 0 ? '24px' : '0',
                  marginBottom: '12px',
                }}
              >
                {section.title}
              </h3>
              <div className="rounded-2xl overflow-hidden glass-card border border-white/10">
                {section.items.map((item, index) => {
                  const isLast = index === section.items.length - 1;
                  return (
                    <InteractiveListItem
                      key={item.id}
                      onClick={() => handleSettingClick(item.id)}
                      className={`w-full flex items-center gap-4 text-left ${!isLast ? 'border-b border-white/5' : ''
                        }`}
                      style={{
                        minHeight: '72px',
                        padding: '16px 18px',
                        borderRadius: 0,
                        background: 'transparent',
                      }}
                    >
                      <div className="flex items-center justify-center text-gray-300 rounded-xl bg-white/5 w-10 h-10">
                        {item.icon}
                      </div>
                      <div className="flex-1">
                        <span className="text-white font-medium text-base block">{item.label}</span>
                        {item.description && (
                          <span className="text-gray-400 text-xs block mt-0.5">
                            {item.description}
                          </span>
                        )}
                      </div>
                      {item.value && <span className="text-gray-300 text-sm">{item.value}</span>}
                    </InteractiveListItem>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* DEMO MODE ONLY: Role Switcher */}
      {import.meta.env.VITE_DEMO_MODE === 'true' && (
        <div className="fixed bottom-24 right-4 z-50">
          <button
            onClick={() => {
              useStore.getState().setViewMode(viewMode === 'seller' ? 'buyer' : 'seller');
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-full shadow-lg font-bold text-xs"
          >
            Demo: Switch Role ({viewMode})
          </button>
        </div>
      )}

      {/* Modals - wrapped in ErrorBoundary + Suspense for lazy loading */}
      <ModalErrorBoundary>
        <Suspense fallback={null}>
          {showAnalytics && (
            <AnalyticsModalLazy isOpen={showAnalytics} onClose={() => setShowAnalytics(false)} />
          )}
          {showProducts && (
            <ProductsModalLazy isOpen={showProducts} onClose={() => setShowProducts(false)} />
          )}
          {showSubscription && (
            <SubscriptionModalLazy isOpen={showSubscription} onClose={() => setShowSubscription(false)} />
          )}
          {showWorkspace && (
            <WorkspaceModalLazy isOpen={showWorkspace} onClose={() => setShowWorkspace(false)} />
          )}
          {showFollows && <FollowsModalLazy isOpen={showFollows} onClose={() => setShowFollows(false)} />}
          {showWallets && <WalletsModalLazy isOpen={showWallets} onClose={() => setShowWallets(false)} />}
          {showLanguage && (
            <LanguageModalLazy isOpen={showLanguage} onClose={() => setShowLanguage(false)} />
          )}
          {showMigration && (
            <MigrationModalLazy isOpen={showMigration} onClose={() => setShowMigration(false)} />
          )}
          {showInviteLink && (
            <InviteLinkModalLazy isOpen={showInviteLink} onClose={() => setShowInviteLink(false)} />
          )}

          {showMyOrders && (
            <MyOrdersModalLazy isOpen={showMyOrders} onClose={() => setShowMyOrders(false)} />
          )}
          {showShopOrders && (
            <ShopOrdersModalLazy isOpen={showShopOrders} onClose={() => setShowShopOrders(false)} />
          )}
          {showFeedback && (
            <FeedbackModalLazy isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
          )}
        </Suspense>
      </ModalErrorBoundary>
    </div>
  );
}
