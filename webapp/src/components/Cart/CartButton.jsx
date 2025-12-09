import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';

export default function CartButton({ onClick }) {
  const cart = useStore(useShallow((state) => state.cart));
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const itemCount = useMemo(() => cart.reduce((count, item) => count + item.quantity, 0), [cart]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2),
    [cart]
  );

  const handleClick = () => {
    triggerHaptic('medium');
    onClick?.();
  };

  return (
    <AnimatePresence>
      {itemCount > 0 && (
        <motion.button
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={handleClick}
          className="fixed bottom-28 left-4 right-4 text-white h-14 rounded-2xl flex items-center justify-between px-5 z-40 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)',
            boxShadow: `
              0 4px 12px rgba(255, 107, 0, 0.4),
              0 8px 24px rgba(255, 107, 0, 0.25),
              0 16px 48px rgba(255, 107, 0, 0.15),
              inset 0 1px 0 rgba(255, 255, 255, 0.25)
            `,
          }}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.01 }}
        >
          <div className="flex items-center gap-3">
            <div
              className="bg-white/25 rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm"
              style={{
                boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.25)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {itemCount}
            </div>
            <span className="font-semibold text-base" style={{ letterSpacing: '-0.01em' }}>
              {t('cart.title')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="font-bold text-lg"
              style={{
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ${total}
            </span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
