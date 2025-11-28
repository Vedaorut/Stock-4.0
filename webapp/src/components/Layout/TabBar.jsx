import { motion } from 'framer-motion'; // Used in JSX
import { memo, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { usePlatform } from '../../hooks/usePlatform';
import { getSurfaceStyle, getSpringPreset, isAndroid } from '../../utils/platform';

// --- Icons ---
const Icons = {
  Subscriptions: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
  Follows: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7s-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Catalog: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
};

const TabBar = memo(function TabBar() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { triggerHaptic } = useTelegram();
  
  const { 
    activeTab, 
    setActiveTab, 
    setCartOpen, 
    paymentStep, 
    setPaymentStep, 
    hasFollows, 
    setFollowDetailId 
  } = useStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
      setCartOpen: state.setCartOpen,
      paymentStep: state.paymentStep,
      setPaymentStep: state.setPaymentStep,
      hasFollows: state.hasFollows,
      setFollowDetailId: state.setFollowDetailId,
    }))
  );

  // Tabs Configuration
  const tabs = useMemo(() => {
    const list = [
      { id: 'subscriptions', label: t('tabs.subscriptions'), Icon: Icons.Subscriptions },
    ];

    if (hasFollows) {
      list.push({ id: 'follows', label: t('tabs.follows'), Icon: Icons.Follows });
    }

    list.push(
      { id: 'catalog', label: t('tabs.catalog'), Icon: Icons.Catalog },
      { id: 'settings', label: t('tabs.settings'), Icon: Icons.Settings }
    );

    return list;
  }, [t, hasFollows]);

  // Auto-redirect if 'follows' tab is active but user has no follows
  useEffect(() => {
    if (!hasFollows && activeTab === 'follows') {
      setActiveTab('subscriptions');
    }
  }, [hasFollows, activeTab, setActiveTab]);

  const handleTabChange = useCallback((tabId) => {
    triggerHaptic('light');
    setCartOpen(false);
    setPaymentStep('idle');
    setFollowDetailId(null);
    setActiveTab(tabId);
  }, [triggerHaptic, setCartOpen, setPaymentStep, setFollowDetailId, setActiveTab]);

  // Styles & Animations
  const containerStyle = useMemo(() => ({
    ...getSurfaceStyle('tabbar', platform),
    paddingBottom: 'var(--safe-bottom)',
  }), [platform]);
  
  const activeIndicatorStyle = useMemo(() => getSurfaceStyle('accentGlow', platform), [platform]);
  const tapSpring = useMemo(() => getSpringPreset('quick', platform), [platform]);
  const indicatorSpring = useMemo(() => getSpringPreset('press', platform), [platform]);
  const android = isAndroid(platform);

  // Hide during payment
  if (paymentStep !== 'idle') return null;

  return (
    <div className="tabbar">
      <div className="rounded-t-3xl" style={containerStyle}>
        <div className="flex items-center justify-around px-4 py-3">
          {tabs.map(({ id, label, Icon: TabItemIcon }) => {
            const isActive = activeTab === id;

            return (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className="relative px-2"
                title={label}
                aria-label={label}
              >
                <motion.div
                  className={`flex flex-col items-center gap-1 relative px-4 py-2 ${
                    isActive ? 'text-orange-primary' : 'text-gray-400'
                  }`}
                  whileTap={{ scale: android ? 0.95 : 0.92 }}
                  transition={tapSpring}
                >
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      layoutId="activeTab"
                      initial={false}
                      transition={indicatorSpring}
                      style={{ willChange: 'transform', ...activeIndicatorStyle, zIndex: -1 }}
                    />
                  )}

                  <TabItemIcon />
                  <span className="text-xs font-semibold hidden sm:inline" style={{ letterSpacing: '0.02em' }}>
                    {label}
                  </span>
                </motion.div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default TabBar;
