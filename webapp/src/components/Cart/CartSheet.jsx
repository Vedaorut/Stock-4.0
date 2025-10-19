import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import CartItem from './CartItem';

export default function CartSheet() {
  const { cart, isCartOpen, setCartOpen, getCartTotal, clearCart, startCheckout } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const total = getCartTotal();

  const handleClose = () => {
    triggerHaptic('light');
    setCartOpen(false);
  };

  const handleCheckout = () => {
    triggerHaptic('success');
    startCheckout();
    setCartOpen(false);
  };

  const handleClearCart = async () => {
    triggerHaptic('warning');
    clearCart();
  };

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(8px)'
            }}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          >
            <div
              className="rounded-t-[32px] flex flex-col max-h-[80vh]"
              style={{
                background: 'linear-gradient(180deg, rgba(26, 26, 26, 0.95) 0%, rgba(15, 15, 15, 0.98) 100%)',
                backdropFilter: 'blur(40px) saturate(180%)',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <h2
                  className="text-xl font-bold text-white"
                  style={{ letterSpacing: '-0.01em' }}
                >
                  {t('cart.title')}
                </h2>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <motion.button
                      onClick={handleClearCart}
                      className="text-sm font-semibold text-red-500 hover:text-red-400 px-3 py-1 rounded-lg"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        transition: 'all 200ms ease-out'
                      }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    >
                      {t('common.clear')}
                    </motion.button>
                  )}
                  <motion.button
                    onClick={handleClose}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </motion.button>
                </div>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-400 mb-2">{t('cart.empty')}</h3>
                    <p className="text-sm text-gray-500">{t('cart.emptyDesc')}</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {cart.map((item) => (
                      <CartItem key={item.id} item={item} />
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Footer */}
              {cart.length > 0 && (
                <div className="p-5 pb-20 border-t border-white/10 space-y-4">
                  {/* Total */}
                  <div className="flex items-center justify-between">
                    <span
                      className="text-gray-400 text-base font-medium"
                      style={{ letterSpacing: '0.01em' }}
                    >
                      {t('cart.total')}
                    </span>
                    <span
                      className="text-2xl font-bold text-orange-primary tabular-nums"
                      style={{ letterSpacing: '-0.02em' }}
                    >
                      ${total.toFixed(2)}
                    </span>
                  </div>

                  {/* Checkout Button */}
                  <motion.button
                    onClick={handleCheckout}
                    className="w-full touch-target text-white font-bold rounded-xl overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                      boxShadow: `
                        0 4px 12px rgba(255, 107, 0, 0.3),
                        0 8px 24px rgba(255, 107, 0, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2)
                      `,
                      letterSpacing: '-0.01em'
                    }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    {t('cart.checkout')}
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
