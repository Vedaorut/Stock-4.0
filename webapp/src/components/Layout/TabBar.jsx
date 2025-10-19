import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';

const getTabsConfig = (t) => [
  {
    id: 'subscriptions',
    label: t('tabs.subscriptions'),
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    ),
  },
  {
    id: 'catalog',
    label: t('tabs.catalog'),
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: t('tabs.settings'),
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function TabBar() {
  const { activeTab, setActiveTab } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const tabs = getTabsConfig(t);

  const handleTabChange = (tabId) => {
    triggerHaptic('light');
    setActiveTab(tabId);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
      <div
        className="rounded-t-3xl"
        style={{
          background: 'linear-gradient(180deg, rgba(23, 33, 43, 0.7) 0%, rgba(15, 15, 15, 0.9) 100%)',
          backdropFilter: 'blur(16px) saturate(180%)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: `
            0 -4px 16px rgba(0, 0, 0, 0.3),
            0 -8px 32px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.08)
          `
        }}
      >
        <div className="flex items-center justify-around px-4 py-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className="relative px-2"
              >
                <motion.div
                  className={`flex flex-col items-center gap-1 relative px-4 py-2 ${
                    isActive ? 'text-orange-primary' : 'text-gray-400'
                  }`}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 25 }}
                >
                  {/* Active indicator background - positioned behind content */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      layoutId="activeTab"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.12) 0%, rgba(255, 140, 66, 0.08) 100%)',
                        border: '1px solid rgba(255, 107, 0, 0.3)',
                        boxShadow: `
                          0 2px 8px rgba(255, 107, 0, 0.15),
                          inset 0 1px 0 rgba(255, 255, 255, 0.08)
                        `,
                        zIndex: -1
                      }}
                    />
                  )}

                  {tab.icon}
                  <span
                    className="text-xs font-semibold"
                    style={{ letterSpacing: '0.02em' }}
                  >
                    {tab.label}
                  </span>
                </motion.div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
