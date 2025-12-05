import { motion, AnimatePresence, LazyMotion } from 'framer-motion';
import { useMemo, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { usePlatform } from '../../hooks/usePlatform';
import {
  getSpringPreset,
  getSurfaceStyle,
  getSheetMaxHeight,
  isAndroid,
} from '../../utils/platform';
import CartItem from './CartItem';
import { useBackButton } from '../../hooks/useBackButton';

// Lazy load domMax
const loadDomMax = () => import('framer-motion').then((mod) => mod.domMax);

// --- Styles & Variants ---

const getCheckoutShadows = (android) => ({
  shadow: android
    ? '0 4px 16px rgba(255, 107, 0, 0.26), 0 8px 20px rgba(255, 107, 0, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
    : `0 4px 12px rgba(255, 107, 0, 0.3),
       0 8px 24px rgba(255, 107, 0, 0.15),
       inset 0 1px 0 rgba(255, 255, 255, 0.2)`,
  hover: android
    ? '0 4px 10px rgba(255, 107, 0, 0.3), 0 8px 20px rgba(255, 107, 0, 0.2)'
    : '0 4px 8px rgba(255, 107, 0, 0.3), 0 8px 20px rgba(255, 107, 0, 0.25), 0 0 40px rgba(255, 107, 0, 0.2)',
});

const getEmptyEmojiVariants = (android) => ({
  animate: android
    ? { scale: 1, rotate: 0 }
    : { scale: [1, 1.1, 1], rotate: [0, -10, 10, 0] },
  transition: android
    ? { duration: 1.2, ease: 'easeOut' }
    : { duration: 2, repeat: Infinity, repeatDelay: 1 },
});

// --- Component ---

export default function CartSheet() {
  // State Selection
  const { cart, isCartOpen, setCartOpen, clearCart, startCheckout, myShops } = useStore(
    useShallow((state) => ({
      cart: state.cart,
      isCartOpen: state.isCartOpen,
      setCartOpen: state.setCartOpen,
      clearCart: state.clearCart,
      startCheckout: state.startCheckout,
      myShops: state.myShops,
    }))
  );

  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const platform = usePlatform();
  const android = isAndroid(platform);
  const checkoutTimeoutRef = useRef(null);

  // Derived Values
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  // Check if cart contains items from user's own shop (cannot order own products)
  const isOwnShopCart = useMemo(() => {
    if (!cart.length || !myShops?.length) return false;
    const cartShopId = cart[0]?.shopId;
    if (!cartShopId) return false;
    return myShops.some((shop) => shop.id === cartShopId);
  }, [cart, myShops]);

  // Styles
  const overlayStyle = useMemo(() => getSurfaceStyle('overlay', platform), [platform]);
  const sheetStyle = useMemo(() => getSurfaceStyle('surfaceStrong', platform), [platform]);
  const sheetSpring = useMemo(() => getSpringPreset('sheet', platform), [platform]);
  const controlSpring = useMemo(() => getSpringPreset('press', platform), [platform]);
  const quickSpring = useMemo(() => getSpringPreset('quick', platform), [platform]);
  
  const { shadow: checkoutShadow, hover: checkoutHoverShadow } = useMemo(
    () => getCheckoutShadows(android),
    [android]
  );

  const { animate: emptyAnimate, transition: emptyTransition } = useMemo(
    () => getEmptyEmojiVariants(android),
    [android]
  );

  // Lifecycle
  useEffect(() => {
    return () => {
      if (checkoutTimeoutRef.current) clearTimeout(checkoutTimeoutRef.current);
    };
  }, []);

  // Handlers
  const handleClose = () => {
    triggerHaptic('light');
    setCartOpen(false);
  };

  const handleCheckout = () => {
    triggerHaptic('success');
    setCartOpen(false);
    if (checkoutTimeoutRef.current) clearTimeout(checkoutTimeoutRef.current);
    checkoutTimeoutRef.current = setTimeout(() => startCheckout(), 200);
  };

  const handleClearCart = () => {
    triggerHaptic('warning');
    clearCart();
  };

  useBackButton(isCartOpen ? handleClose : null);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <LazyMotion features={loadDomMax}>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[1000]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: android ? 0.24 : 0.2 }}
            onClick={handleClose}
            style={overlayStyle}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[1000] flex flex-col"
            style={{ maxHeight: getSheetMaxHeight(platform, 24) }}
            initial={{ y: '100%' }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%' }}
            transition={sheetSpring}
          >
            <div className="rounded-t-[32px] flex flex-col h-full" style={sheetStyle}>
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/10 flex-shrink-0">
                <h2 className="text-xl font-bold text-white" style={{ letterSpacing: '-0.01em' }}>
                  {t('cart.title')}
                </h2>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <motion.button
                      onClick={handleClearCart}
                      className="text-sm font-semibold text-red-500 hover:text-red-400 px-3 py-1 rounded-lg"
                      style={{
                        background: android ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.1)',
                      }}
                      whileTap={{ scale: android ? 0.97 : 0.95 }}
                      transition={controlSpring}
                    >
                      {t('common.clear')}
                    </motion.button>
                  )}
                  <motion.button
                    onClick={handleClose}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400"
                    style={{
                      background: android ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                    whileTap={{ scale: android ? 0.94 : 0.9 }}
                    transition={controlSpring}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </motion.button>
                </div>
              </div>

              {/* Cart Items Area */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
                style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
              >
                {cart.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center h-full py-10"
                  >
                    <motion.div
                      animate={emptyAnimate}
                      transition={emptyTransition}
                      className="text-6xl mb-4"
                    >
                      🛒
                    </motion.div>
                    <h3 className="text-xl font-semibold text-white mb-2">{t('cart.empty')}</h3>
                    <p className="text-gray-400 text-sm mb-6 text-center px-8">{t('cart.emptyDesc')}</p>
                    <motion.button
                      onClick={handleClose}
                      whileHover={{ scale: android ? 1.02 : 1.05 }}
                      whileTap={{ scale: android ? 0.97 : 0.95 }}
                      className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-orange-primary to-orange-400"
                      style={{
                        boxShadow: android
                          ? '0 4px 12px rgba(255, 107, 0, 0.24)'
                          : '0 4px 12px rgba(255, 107, 0, 0.3)',
                      }}
                      transition={quickSpring}
                    >
                      {t('cart.browseCatalog')}
                    </motion.button>
                  </motion.div>
                ) : (
                  <AnimatePresence initial={false}>
                    {cart.map((item) => (
                      <CartItem key={item.id} item={item} />
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Footer */}
              {cart.length > 0 && (
                <div
                  className="p-5 border-t border-white/10 space-y-4 flex-shrink-0"
                  style={{ paddingBottom: 'calc(var(--tabbar-total) + 20px)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-base font-medium">{t('cart.total')}</span>
                    <span className="text-2xl font-bold text-orange-primary tabular-nums">
                      ${total.toFixed(2)}
                    </span>
                  </div>

                  {isOwnShopCart ? (
                    /* Warning: Cannot order own products */
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-yellow-500 text-sm font-medium">
                        {t('cart.cannotOrderOwn') || 'You cannot order products from your own shop'}
                      </span>
                    </div>
                  ) : (
                    <motion.button
                      onClick={handleCheckout}
                      className="w-full h-12 text-white font-bold rounded-xl overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                        boxShadow: checkoutShadow,
                      }}
                      whileHover={{
                        scale: android ? 1.01 : 1.02,
                        boxShadow: checkoutHoverShadow,
                      }}
                      whileTap={{
                        scale: android ? 0.985 : 0.98,
                        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3)',
                      }}
                      transition={{ ...controlSpring, boxShadow: { duration: 0.18 } }}
                    >
                      {t('cart.checkout')}
                    </motion.button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </LazyMotion>
      )}
    </AnimatePresence>
  );
}
