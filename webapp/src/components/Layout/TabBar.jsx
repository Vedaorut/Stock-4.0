import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { memo, useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { useToast } from '../../hooks/useToast';
import PendingOrderBadge from './PendingOrderBadge';

// --- Premium Animated Icons ---
const Icons = {
    // Bookmark icon with fill animation
    Subscriptions: memo(function SubscriptionsIcon({ isActive }) {
        return (
            <svg className="w-6 h-6" viewBox="0 0 24 24" strokeWidth={1.5}>
                {/* Background fill for active state */}
                <motion.path
                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                    fill={isActive ? 'url(#bookmarkGradient)' : 'transparent'}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                        fillOpacity: isActive ? 1 : 0,
                    }}
                    transition={{ duration: 0.2 }}
                />
                {/* Gradient definition */}
                <defs>
                    <linearGradient id="bookmarkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF6B00" />
                        <stop offset="50%" stopColor="#FF8C42" />
                        <stop offset="100%" stopColor="#FFB347" />
                    </linearGradient>
                </defs>
            </svg>
        );
    }),

    // Eye icon with pupil animation
    Follows: memo(function FollowsIcon({ isActive }) {
        return (
            <svg className="w-6 h-6" viewBox="0 0 24 24" strokeWidth={1.5}>
                {/* Eye outline */}
                <path
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                {/* Iris circle */}
                <motion.circle
                    cx="12"
                    cy="12"
                    r="3"
                    fill={isActive ? 'url(#eyeGradient)' : 'none'}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                        scale: isActive ? 1 : 0.9,
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
                {/* Glowing pupil */}
                <AnimatePresence>
                    {isActive && (
                        <motion.circle
                            cx="12"
                            cy="12"
                            r="1.5"
                            fill="#FF6B00"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        />
                    )}
                </AnimatePresence>
                <defs>
                    <linearGradient id="eyeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF6B00" />
                        <stop offset="100%" stopColor="#FF8C42" />
                    </linearGradient>
                </defs>
            </svg>
        );
    }),

    // Shopping bag with items indicator
    Catalog: memo(function CatalogIcon({ isActive }) {
        return (
            <svg className="w-6 h-6" viewBox="0 0 24 24" strokeWidth={1.5}>
                {/* Bag body */}
                <motion.path
                    d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z"
                    fill={isActive ? 'url(#bagGradient)' : 'none'}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                        fillOpacity: isActive ? 1 : 0,
                    }}
                    transition={{ duration: 0.2 }}
                />
                {/* Handle dots */}
                <motion.circle
                    cx="8.625"
                    cy="10.5"
                    r={isActive ? 0.5 : 0.375}
                    fill="currentColor"
                    initial={false}
                    animate={{ r: isActive ? 0.5 : 0.375 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
                <motion.circle
                    cx="15.375"
                    cy="10.5"
                    r={isActive ? 0.5 : 0.375}
                    fill="currentColor"
                    initial={false}
                    animate={{ r: isActive ? 0.5 : 0.375 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
                <defs>
                    <linearGradient id="bagGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF6B00" />
                        <stop offset="50%" stopColor="#FF8C42" />
                        <stop offset="100%" stopColor="#FFB347" />
                    </linearGradient>
                </defs>
            </svg>
        );
    }),

    // Animated gear with subtle rotation on tap
    Settings: memo(function SettingsIcon({ isActive, isPressed }) {
        return (
            <motion.svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                animate={{
                    rotate: isPressed ? 90 : 0,
                }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            >
                {/* Gear body */}
                <motion.path
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                    fill={isActive ? 'url(#gearGradient)' : 'none'}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                        fillOpacity: isActive ? 1 : 0,
                    }}
                    transition={{ duration: 0.2 }}
                />
                {/* Center circle */}
                <motion.circle
                    cx="12"
                    cy="12"
                    r="3"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                        scale: isActive ? 1.05 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
                <defs>
                    <linearGradient id="gearGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF6B00" />
                        <stop offset="50%" stopColor="#FF8C42" />
                        <stop offset="100%" stopColor="#FFB347" />
                    </linearGradient>
                </defs>
            </motion.svg>
        );
    })
};

// Smooth spring configs - high damping for elegant transitions
const springConfig = {
    type: 'spring',
    stiffness: 400,
    damping: 40,
    mass: 0.8
};

const softSpring = {
    type: 'spring',
    stiffness: 250,
    damping: 35,
    mass: 0.6
};

// Very soft spring for indicator slide
const indicatorSpring = {
    type: 'spring',
    stiffness: 300,
    damping: 38,
    mass: 0.7
};

// Subtle shimmer effect - very delicate (currently unused, kept for future)
const ShimmerEffect = memo(function ShimmerEffect() {
    return (
        <motion.div
            className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none"
        >
            <motion.div
                className="absolute inset-0"
                style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                }}
                animate={{
                    x: ['-100%', '100%'],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    repeatDelay: 6,
                    ease: 'easeInOut',
                }}
            />
        </motion.div>
    );
});

// Active indicator blob with glow (currently unused, kept for future)
const ActiveIndicator = memo(function ActiveIndicator({ tabIndex: _tabIndex, totalTabs: _totalTabs }) {
    // Disable shimmer animation for users who prefer reduced motion
    const shouldReduceMotion = useReducedMotion();

    return (
        <motion.div
            layoutId="activeTabIndicator"
            className="absolute inset-y-1.5 rounded-2xl"
            style={{
                left: '6px',
                right: '6px',
                // Multi-layer gradient background
                background: `
                    linear-gradient(135deg,
                        rgba(255, 107, 0, 0.18) 0%,
                        rgba(255, 140, 66, 0.12) 50%,
                        rgba(255, 179, 71, 0.08) 100%
                    )
                `,
                // Premium glow effect
                boxShadow: `
                    0 0 24px rgba(255, 107, 0, 0.25),
                    0 0 12px rgba(255, 107, 0, 0.15),
                    inset 0 0 20px rgba(255, 107, 0, 0.08),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1)
                `,
                // Subtle border
                border: '1px solid rgba(255, 107, 0, 0.2)',
            }}
            transition={indicatorSpring}
        >
            {/* Shimmer effect - disabled for reduced motion preference */}
            {!shouldReduceMotion && <ShimmerEffect />}
        </motion.div>
    );
});

// Tab Item Component with premium animations
const TabItem = memo(function TabItem({
    id,
    Icon,
    isActive,
    onClick,
    index,
    totalTabs
}) {
    const [isPressed, setIsPressed] = useState(false);
    const shouldReduceMotion = useReducedMotion();

    return (
        <motion.button
            onClick={onClick}
            onTapStart={() => setIsPressed(true)}
            onTap={() => setIsPressed(false)}
            onTapCancel={() => setIsPressed(false)}
            className="relative flex-1 flex items-center justify-center h-14 outline-none touch-manipulation"
            whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            aria-pressed={isActive}
            aria-label={id}
            style={{
                WebkitTapHighlightColor: 'transparent',
            }}
        >
            {/* Active indicator */}
            {isActive && (
                <ActiveIndicator tabIndex={index} totalTabs={totalTabs} />
            )}

            {/* Icon container - clean transitions only */}
            <motion.div
                className="relative z-10 flex items-center justify-center"
                initial={false}
                animate={{
                    color: isActive ? '#FF6B00' : 'rgba(255, 255, 255, 0.4)',
                    scale: isActive ? 1.02 : 1,
                }}
                transition={{
                    color: { duration: 0.2, ease: 'easeOut' },
                    scale: springConfig,
                }}
                style={{
                    filter: isActive
                        ? 'drop-shadow(0 0 8px rgba(255, 107, 0, 0.4))'
                        : 'none',
                    willChange: 'transform',
                }}
            >
                <Icon isActive={isActive} isPressed={isPressed} />
            </motion.div>

            {/* Tap ripple effect */}
            <AnimatePresence>
                {isPressed && !shouldReduceMotion && (
                    <motion.div
                        className="absolute inset-0 rounded-2xl"
                        style={{
                            background: 'radial-gradient(circle, rgba(255, 107, 0, 0.2) 0%, transparent 70%)',
                        }}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1.2, opacity: 1 }}
                        exit={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    />
                )}
            </AnimatePresence>
        </motion.button>
    );
});


// Aurora/gradient background effect (currently unused, kept for future)
const AuroraBackground = memo(function AuroraBackground({ activeIndex, totalTabs }) {
    const gradientPosition = useMemo(() => {
        const percentage = (activeIndex / Math.max(totalTabs - 1, 1)) * 100;
        return percentage;
    }, [activeIndex, totalTabs]);

    return (
        <motion.div
            className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none"
            initial={false}
        >
            {/* Gradient that shifts based on active tab */}
            <motion.div
                className="absolute inset-0"
                animate={{
                    background: `radial-gradient(ellipse 80% 50% at ${gradientPosition}% 100%, rgba(255, 107, 0, 0.08) 0%, transparent 50%)`,
                }}
                transition={softSpring}
            />
        </motion.div>
    );
});

const TabBar = memo(function TabBar() {
    const { t } = useTranslation();
    const { tg, triggerHaptic } = useTelegram();
    const shouldReduceMotion = useReducedMotion();
    const containerRef = useRef(null);

    // Refs for popup callback to avoid stale closures
    const resumePaymentRef = useRef(null);
    const removePendingOrderRef = useRef(null);
    const toastRef = useRef(null);
    const tRef = useRef(null);
    const triggerHapticRef = useRef(null);

    const {
        activeTab,
        setActiveTab,
        setCartOpen,
        paymentStep,
        setPaymentStep,
        hasFollows,
        setFollowDetailId,
        viewMode,
        pendingOrders,
        resumePayment,
        removePendingOrder
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
            pendingOrders: state.pendingOrders,
            resumePayment: state.resumePayment,
            removePendingOrder: state.removePendingOrder,
        }))
    );

    // Get first pending order (most recent)
    const activePendingOrder = useMemo(() => pendingOrders?.[0], [pendingOrders]);

    // Timer for reactive expiration check (updates every 30s)
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!activePendingOrder?.expiresAt) return;
        const interval = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(interval);
    }, [activePendingOrder?.expiresAt]);

    // Check if expiring soon (< 10 minutes) - reactive with timer
    const isExpiringSoon = useMemo(() => {
        if (!activePendingOrder?.expiresAt) return false;
        return new Date(activePendingOrder.expiresAt) - now < 10 * 60 * 1000;
    }, [activePendingOrder, now]);

    // Toast for error feedback
    const toast = useToast();

    // Keep refs in sync for popup callback (avoid stale closures)
    resumePaymentRef.current = resumePayment;
    removePendingOrderRef.current = removePendingOrder;
    toastRef.current = toast;
    tRef.current = t;
    triggerHapticRef.current = triggerHaptic;

    // Handler for pending order click - use fresh state to avoid stale closure
    const handlePendingOrderClick = useCallback(() => {
        const currentPending = pendingOrders?.[0];
        if (!currentPending) return;

        try {
            triggerHaptic('medium');
            const result = resumePayment(currentPending.id);

            // Handle errors with toast feedback
            if (result && !result.success) {
                if (result.error === 'ORDER_EXPIRED') {
                    toast.error(t('payment.orderExpired') || 'Order has expired');
                } else if (result.error === 'MISSING_PAYMENT_DATA') {
                    toast.error(t('payment.cannotResume') || 'Cannot resume payment');
                } else {
                    // Handle unknown error types
                    toast.error(t('payment.resumeFailed') || 'Failed to resume payment');
                }
                triggerHaptic('error');
            }
        } catch (error) {
            console.error('[TabBar] handlePendingOrderClick error:', error);
            toast.error(t('errors.unexpectedError') || 'An unexpected error occurred');
            triggerHaptic('error');
        }
    }, [pendingOrders, triggerHaptic, resumePayment, toast, t]);

    // Handler for long press on pending order badge - show cancel dialog
    const handleLongPressOrder = useCallback((order) => {
        if (!order) return;

        triggerHaptic('medium');

        // Fallback if showPopup is not available
        if (!tg?.showPopup) {
            console.error('[TabBar] tg.showPopup not available - Telegram WebApp API may not be loaded');
            toast.info(t('payment.tapToResume') || 'Tap to resume payment');
            return;
        }

        // Store order.id in closure - it won't change during popup display
        const orderId = order.id;

        try {
            tg.showPopup({
                title: t('payment.pendingOrderTitle') || 'Ожидающий заказ',
                message: t('payment.cancelOrderMessage') || 'Что вы хотите сделать с этим заказом?',
                buttons: [
                    { id: 'resume', type: 'default', text: t('payment.resumePayment') || 'Продолжить оплату' },
                    { id: 'cancel', type: 'destructive', text: t('payment.cancelOrder') || 'Отменить заказ' },
                ]
            }, (buttonId) => {
                // Use refs to get fresh values and avoid stale closures
                try {
                    if (buttonId === 'resume') {
                        // Resume payment
                        const result = resumePaymentRef.current?.(orderId);
                        if (result && !result.success) {
                            if (result.error === 'ORDER_EXPIRED') {
                                toastRef.current?.error(tRef.current?.('payment.orderExpired') || 'Order has expired');
                            } else if (result.error === 'MISSING_PAYMENT_DATA') {
                                toastRef.current?.error(tRef.current?.('payment.cannotResume') || 'Cannot resume payment');
                            } else {
                                toastRef.current?.error(tRef.current?.('payment.resumeFailed') || 'Failed to resume payment');
                            }
                            triggerHapticRef.current?.('error');
                        }
                    } else if (buttonId === 'cancel') {
                        // Cancel order - remove from pending
                        removePendingOrderRef.current?.(orderId);
                        triggerHapticRef.current?.('success');
                        toastRef.current?.success(tRef.current?.('payment.orderCancelled') || 'Заказ отменён');
                    }
                } catch (error) {
                    console.error('[TabBar] Popup callback error:', error);
                    toastRef.current?.error(tRef.current?.('errors.unexpectedError') || 'An unexpected error occurred');
                    triggerHapticRef.current?.('error');
                }
            });
        } catch (error) {
            console.error('[TabBar] tg.showPopup call failed:', error);
            toast.error(t('errors.popupFailed') || 'Could not show dialog');
            triggerHaptic('error');
        }
    }, [tg, t, toast, triggerHaptic]); // Reduced dependencies - using refs for callback

    const tabs = useMemo(() => {
        const list = [
            { id: 'subscriptions', label: t('tabs.subscriptions'), Icon: Icons.Subscriptions },
            { id: 'catalog', label: t('tabs.catalog'), Icon: Icons.Catalog },
        ];
        if (viewMode === 'seller' && hasFollows) {
            list.push({ id: 'follows', label: t('tabs.follows'), Icon: Icons.Follows });
        }
        list.push({ id: 'settings', label: t('tabs.settings'), Icon: Icons.Settings });
        return list;
    }, [t, hasFollows, viewMode]);

    const activeIndex = useMemo(() => {
        return tabs.findIndex(tab => tab.id === activeTab);
    }, [tabs, activeTab]);

    useEffect(() => {
        if (!hasFollows && activeTab === 'follows') {
            setActiveTab('subscriptions');
        }
    }, [hasFollows, activeTab, setActiveTab]);

    const handleTabChange = useCallback((tabId) => {
        if (tabId === activeTab) return;
        triggerHaptic('light');
        setCartOpen(false);
        setPaymentStep('idle');
        setFollowDetailId(null);
        setActiveTab(tabId);
    }, [activeTab, triggerHaptic, setCartOpen, setPaymentStep, setFollowDetailId, setActiveTab]);

    if (paymentStep !== 'idle') return null;

    return (
        <motion.div
            ref={containerRef}
            className="fixed bottom-0 left-0 right-0 z-50 px-3"
            style={{
                paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
            }}
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={shouldReduceMotion ? { duration: 0.2 } : {
                type: 'spring',
                stiffness: 300,
                damping: 30,
                delay: 0.1
            }}
        >
            {/* Pending Order Badge - positioned above TabBar */}
            <AnimatePresence>
                {activePendingOrder && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30
                        }}
                        className="absolute right-4 -top-14 z-10"
                    >
                        <PendingOrderBadge
                            order={{
                                ...activePendingOrder,
                                count: pendingOrders?.length || 1
                            }}
                            onClick={handlePendingOrderClick}
                            onLongPress={handleLongPressOrder}
                            isExpiringSoon={isExpiringSoon}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main glass container - Floating style */}
            <div
                className="relative mx-auto w-full max-w-lg overflow-hidden"
                style={{
                    // Ultra-premium glassmorphism
                    background: 'rgba(20, 20, 22, 0.85)',
                    backdropFilter: 'blur(40px) saturate(200%)',
                    WebkitBackdropFilter: 'blur(40px) saturate(200%)',

                    // Full rounded corners for floating style
                    borderRadius: '24px',

                    // Premium multi-layer shadow
                    boxShadow: `
                        0 0 0 1px rgba(255, 255, 255, 0.08),
                        0 8px 32px rgba(0, 0, 0, 0.4),
                        0 2px 8px rgba(0, 0, 0, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, 0.06),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.2)
                    `,

                    // GPU acceleration
                    willChange: 'transform',
                    transform: 'translateZ(0)',
                }}
            >
                {/* Aurora gradient background */}
                <AuroraBackground activeIndex={activeIndex} totalTabs={tabs.length} />


                {/* Tab items container */}
                <div className="relative flex w-full justify-around items-center px-1">
                    <AnimatePresence mode="wait">
                        {tabs.map(({ id, label, Icon }, index) => (
                            <TabItem
                                key={id}
                                id={id}
                                Icon={Icon}
                                label={label}
                                isActive={activeTab === id}
                                onClick={() => handleTabChange(id)}
                                index={index}
                                totalTabs={tabs.length}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
});

export default TabBar;

// Export unused components to prevent ESLint warnings (kept for future use)
export { ShimmerEffect, ActiveIndicator, AuroraBackground };
