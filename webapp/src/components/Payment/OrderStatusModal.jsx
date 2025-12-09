import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { CRYPTO_OPTIONS, formatTxHash } from '../../utils/paymentUtils';
import { usePlatform } from '../../hooks/usePlatform';
import { getSpringPreset, getSurfaceStyle, isAndroid } from '../../utils/platform';
import { useBackButton } from '../../hooks/useBackButton';

export default function OrderStatusModal() {
  const { paymentStep, currentOrder, selectedCrypto, clearCheckout, pendingOrders } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const platform = usePlatform();
  const android = isAndroid(platform);

  const overlayStyle = useMemo(() => getSurfaceStyle('overlay', platform), [platform]);

  const modalStyle = useMemo(() => getSurfaceStyle('surfacePanel', platform), [platform]);

  const cardStyle = useMemo(() => getSurfaceStyle('glassCard', platform), [platform]);

  const sheetSpring = useMemo(() => getSpringPreset('sheet', platform), [platform]);

  const isOpen = paymentStep === 'success';

  const cryptoInfo = CRYPTO_OPTIONS.find((c) => c.id === selectedCrypto);

  const handleClose = () => {
    triggerHaptic('medium');
    clearCheckout();
  };

  // Hooks must be called unconditionally (Rules of Hooks)
  useBackButton(isOpen && currentOrder && cryptoInfo ? handleClose : null);

  // Show loading state if modal is open but data not ready yet
  if (!currentOrder || !cryptoInfo) {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/70 text-sm">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  // Get the completed order from pending orders (using hook for reactivity)
  const completedOrder = pendingOrders?.[pendingOrders.length - 1];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: android ? 0.24 : 0.2 }}
            onClick={handleClose}
            style={overlayStyle}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto"
            initial={{ scale: 0.8, opacity: 0, y: '-40%' }}
            animate={{ scale: 1, opacity: 1, y: '-50%' }}
            exit={{ scale: 0.8, opacity: 0, y: '-40%' }}
            transition={sheetSpring}
          >
            <div className="rounded-3xl overflow-hidden" style={modalStyle}>
              {/* Header with gradient */}
              <div
                className="relative p-8 text-center overflow-hidden"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255, 107, 0, 0.15) 0%, transparent 100%)',
                }}
              >
                {/* Success Icon Animation */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 15,
                    delay: 0.2,
                  }}
                  className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-4"
                  style={{
                    background: 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                    boxShadow: `
                      0 8px 32px rgba(255, 107, 0, 0.4),
                      0 0 0 8px rgba(255, 107, 0, 0.1),
                      0 0 0 16px rgba(255, 107, 0, 0.05),
                      inset 0 2px 0 rgba(255, 255, 255, 0.3)
                    `,
                  }}
                >
                  <motion.svg
                    className="w-12 h-12 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  >
                    <motion.path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </motion.svg>
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold text-white mb-2"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {t('payment.waitingConfirmation')}
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-400 text-sm"
                >
                  {t('payment.orderAccepted')}
                </motion.p>
              </div>

              {/* Order Details */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="p-6 space-y-4"
              >
                {/* Order ID */}
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    ...cardStyle,
                    background: android ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                    boxShadow: 'none',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm font-medium">
                      {t('payment.orderNumber')}
                    </span>
                    <span
                      className="text-white font-bold text-sm tabular-nums"
                      style={{ letterSpacing: '0.02em' }}
                    >
                      {completedOrder?.id || currentOrder.id}
                    </span>
                  </div>

                  {/* Crypto Info */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm font-medium">{t('orders.crypto')}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{
                          background: `linear-gradient(135deg, ${cryptoInfo.gradient})`,
                        }}
                      >
                        {cryptoInfo.icon}
                      </span>
                      <span className="text-white font-semibold text-sm">{cryptoInfo.name}</span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm font-medium">{t('payment.amount')}</span>
                    <span className="text-orange-primary font-bold text-lg tabular-nums">
                      ${parseFloat(currentOrder.total || currentOrder.total_price || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* TX Hash */}
                  {completedOrder?.txHash && (
                    <div className="pt-3 border-t border-white/10">
                      <div className="flex flex-col gap-2">
                        <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                          Transaction Hash
                        </span>
                        <div
                          className="px-3 py-2 rounded-lg font-mono text-xs text-gray-300 break-all tabular-nums"
                          style={{
                            ...cardStyle,
                            background: android
                              ? 'rgba(255, 255, 255, 0.12)'
                              : 'rgba(255, 255, 255, 0.05)',
                            boxShadow: 'none',
                          }}
                        >
                          {formatTxHash(completedOrder.txHash, 24)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{
                    background: 'rgba(255, 193, 7, 0.1)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                  }}
                >
                  <div className="relative flex-shrink-0">
                    <motion.div
                      className="w-3 h-3 rounded-full bg-yellow-500"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [1, 0.7, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 w-3 h-3 rounded-full bg-yellow-500"
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.5, 0, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-yellow-500 font-semibold text-sm mb-0.5">
                      {t('payment.checkingPayment')}
                    </p>
                    <p className="text-gray-400 text-xs">{t('payment.checkingDesc')}</p>
                  </div>
                </div>

                {/* Info */}
                <div
                  className="rounded-xl p-4 flex items-start gap-3"
                  style={{
                    background: 'rgba(59, 130, 246, 0.05)',
                    border: '1px solid rgba(59, 130, 246, 0.15)',
                  }}
                >
                  <svg
                    className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="space-y-2">
                    <p className="text-gray-300 text-xs leading-relaxed">
                      {t('payment.blockchainInfo')}
                    </p>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      {t('payment.orderHistoryHint')}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Footer */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="p-6 pt-2"
              >
                <motion.button
                  onClick={handleClose}
                  className="w-full touch-target text-white font-bold rounded-xl overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                    boxShadow: `
                      0 4px 12px rgba(255, 107, 0, 0.3),
                      0 8px 24px rgba(255, 107, 0, 0.15),
                      inset 0 1px 0 rgba(255, 255, 255, 0.2)
                    `,
                    letterSpacing: '-0.01em',
                  }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                >
                  {t('common.close')}
                </motion.button>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
