import { motion } from 'framer-motion'; // Used in JSX
import { memo, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { usePlatform } from '../../hooks/usePlatform';
import { isAndroid } from '../../utils/platform';
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen';

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
    setFollowDetailId,
    viewMode
  } = useStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
      setCartOpen: state.setCartOpen,
      paymentStep: state.paymentStep,
      setPaymentStep: state.setPaymentStep,
      hasFollows: state.hasFollows,
      setFollowDetailId: state.setFollowDetailId,
      viewMode: state.viewMode,
    }))
  );

  // Tabs Configuration
  // Order: Subscriptions → Catalog → Follows (seller only) → Settings
  const tabs = useMemo(() => {
    const list = [
      { id: 'subscriptions', label: t('tabs.subscriptions'), Icon: Icons.Subscriptions },
      { id: 'catalog', label: t('tabs.catalog'), Icon: Icons.Catalog },
    ];

    // Follows tab only visible in seller mode AND if user has follows
    if (viewMode === 'seller' && hasFollows) {
      list.push({ id: 'follows', label: t('tabs.follows'), Icon: Icons.Follows });
    }

    list.push({ id: 'settings', label: t('tabs.settings'), Icon: Icons.Settings });

    return list;
  }, [t, hasFollows, viewMode]);

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
  // Standard iOS Spring Physics - Clean & Predictable
  const indicatorSpring = {
    type: "spring",
    bounce: 0.2,
    duration: 0.6
  };

  const android = isAndroid(platform);
  const isKeyboardOpen = useKeyboardOpen();

  // Hide during payment or when keyboard is open
  if (paymentStep !== 'idle' || isKeyboardOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 pointer-events-none z-50 flex justify-center pb-[max(20px,env(safe-area-inset-bottom))]">
      {/* 
        Minimalist "Liquid Glass" Container 
        - Pure Blur (3xl)
        - High Transparency (neutral-900/50)
        - Hairline Border (white/5)
      */}
      <div
        className="pointer-events-auto relative px-1 py-1 rounded-full overflow-hidden backdrop-blur-3xl border border-white/5 shadow-2xl shadow-black/20"
        style={{
          background: 'rgba(20, 20, 20, 0.5)',
          width: 'min(90%, 360px)',
        }}
      >
        <div className="flex items-center justify-between relative">
          {tabs.map(({ id, label, Icon: TabItemIcon }) => {
            const isActive = activeTab === id;

            return (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className="relative flex-1 flex flex-col items-center justify-center h-[52px] z-10"
                title={label}
                aria-label={label}
              >
                {/* Active "Liquid" Bubble */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-white/10"
                    layoutId="activeTab"
                    initial={false}
                    transition={indicatorSpring}
                    style={{ zIndex: -1 }} // Ensure it stays behind text/icon
                  />
                )}

                {/* Icon & Label */}
                <div
                  className={`flex flex-col items-center gap-0.5 transition-colors duration-300 ${isActive ? 'text-white' : 'text-neutral-400'
                    }`}
                >
                  <TabItemIcon />
                  {/* Label: Only noticeable when active to reduce clutter, or keep minimal */}
                  <span className="text-[10px] font-medium tracking-wide">
                    {label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default TabBar;
