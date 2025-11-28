import { useState, useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion'; // Used in JSX
import Header from '../components/Layout/Header';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';
import InteractiveListItem from '../components/common/InteractiveListItem';

// Lazy load modals - only load when user opens them
const WalletsModalLazy = lazy(() => import('../components/Settings/WalletsModal'));
const LanguageModalLazy = lazy(() => import('../components/Settings/LanguageModal'));
const ProductsModalLazy = lazy(() => import('../components/Settings/ProductsModal'));
const SubscriptionModalLazy = lazy(() => import('../components/Settings/SubscriptionModal'));
const WorkspaceModalLazy = lazy(() => import('../components/Settings/WorkspaceModal'));
const FollowsModalLazy = lazy(() => import('../components/Settings/FollowsModal'));
const AnalyticsModalLazy = lazy(() => import('../components/Settings/AnalyticsModal'));
const MigrationModalLazy = lazy(() => import('../components/Settings/MigrationModal'));

const getSettingsSections = (t, lang) => {
  const languageNames = { ru: 'Русский', en: 'English' };

  const sections = [
    {
      title: 'УПРАВЛЕНИЕ',
      items: [
        {
          id: 'products',
          label: 'Товары',
          description: 'Управление каталогом товаров',
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
          id: 'analytics',
          label: 'Статистика',
          description: 'Продажи и аналитика',
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
          id: 'wallet',
          label: 'Платёжные кошельки',
          description: 'Мои крипто-кошельки',
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
          label: 'Workspace',
          description: 'Работники и доступы',
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
          label: 'Follows',
          description: 'Отслеживайте другие магазины',
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
          label: 'Канал заблокирован?',
          description: 'Миграция на новый канал',
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
      title: 'НАСТРОЙКИ',
      items: [
        {
          id: 'subscription',
          label: 'Подписка',
          description: 'Тарифы и оплата',
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
          id: 'language',
          label: t('settings.language'),
          description: 'Выбор языка интерфейса',
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
          value: languageNames[lang] || 'Русский',
        },
      ],
    },
  ];

  return sections;
};

export default function Settings() {
  const { user, triggerHaptic } = useTelegram();
  const { t, lang } = useTranslation();
  const [showWallets, setShowWallets] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [showFollows, setShowFollows] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

  const settingsSections = useMemo(() => getSettingsSections(t, lang), [t, lang]);

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
      default:
        break;
    }
  };

  return (
    <div
      className="scroll-smooth"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
        paddingBottom: 'var(--tabbar-total)',
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
                      className={`w-full flex items-center gap-4 text-left ${
                        !isLast ? 'border-b border-white/5' : ''
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

      {/* Modals - wrapped in Suspense for lazy loading */}
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
      </Suspense>
    </div>
  );
}
