import { m as motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { useToast } from '../../hooks/useToast';
import { CRYPTO_OPTIONS } from '../../utils/paymentUtils';
import { usePlatform } from '../../hooks/usePlatform';
import {
  getSpringPreset,
  getSurfaceStyle,
  getSheetMaxHeight,
  isAndroid,
} from '../../utils/platform';
import { useBackButton } from '../../hooks/useBackButton';
import { useScrollLock } from '../../hooks/useScrollLock';

export default function PaymentMethodModal() {
  const {
    paymentStep,
    selectCrypto,
    setPaymentStep,
    currentShop,
    selectedCrypto: _selectedCrypto, // Reserved for multi-currency display
    isGeneratingInvoice,
  } = useStore(
    useShallow((state) => ({
      paymentStep: state.paymentStep,
      selectCrypto: state.selectCrypto,
      setPaymentStep: state.setPaymentStep,
      currentShop: state.currentShop,
      selectedCrypto: state.selectedCrypto,
      isGeneratingInvoice: state.isGeneratingInvoice,
    }))
  );
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const toast = useToast();
  const platform = usePlatform();
  const android = isAndroid(platform);

  // P0-1: Removed generatingStartTime - now using useEffect-based timer
  const [showCancelButton, setShowCancelButton] = useState(false);

  // P0-1 FIX: Timer to show Cancel button after 15 seconds
  useEffect(() => {
    if (!isGeneratingInvoice) {
      setShowCancelButton(false);
      return;
    }
    const timeout = setTimeout(() => setShowCancelButton(true), 15000);
    return () => clearTimeout(timeout);
  }, [isGeneratingInvoice]);

  const overlayStyle = useMemo(() => getSurfaceStyle('overlay', platform), [platform]);

  const sheetStyle = useMemo(() => getSurfaceStyle('surfacePanel', platform), [platform]);

  const cardBaseStyle = useMemo(() => getSurfaceStyle('glassCard', platform), [platform]);

  const sheetSpring = useMemo(() => getSpringPreset('sheet', platform), [platform]);

  const controlSpring = useMemo(() => getSpringPreset('press', platform), [platform]);

  const quickSpring = useMemo(() => getSpringPreset('quick', platform), [platform]);

  const isOpen = paymentStep === 'method';

  const handleClose = () => {
    triggerHaptic('light');
    setPaymentStep('idle');
  };

  const handleSelectCrypto = async (cryptoId) => {
    if (isGeneratingInvoice) return;

    triggerHaptic('medium');

    try {
      // Call selectCrypto from store - creates order + invoice + transition to details
      await selectCrypto(cryptoId);
      // Store will automatically set paymentStep = 'details'
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[PaymentMethodModal] Failed to select crypto:', error);
      }
      triggerHaptic('error');

      // Detailed toast messages
      const errorMsg = error.response?.data?.error || error.message;
      if (errorMsg?.includes('order')) {
        toast.error(t('payment.createOrderError'));
      } else if (errorMsg?.includes('invoice')) {
        toast.error(t('payment.invoiceError'));
      } else if (errorMsg?.includes('network') || errorMsg?.includes('timeout')) {
        toast.error(t('payment.connectionError'));
      } else {
        toast.error(t('payment.selectError'));
      }
    } finally {
      // isGeneratingInvoice is reset by paymentSlice.selectCrypto finally block
    }
  };

  useBackButton(isOpen ? handleClose : null);

  // BUG-WEBAPP-007: Properly manage scroll lock
  useScrollLock(isOpen);

  // Fallback: if modal is open but shop is missing
  useEffect(() => {
    if (isOpen && !currentShop?.id) {
      const timeout = setTimeout(() => {
        setPaymentStep('idle');
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [isOpen, currentShop?.id, setPaymentStep]);

  // Filter crypto options based on shop's available cryptos (from backend)
  const availableCryptoOptions = useMemo(() => {
    if (!currentShop?.availableCryptos?.length) {
      return [];
    }
    return CRYPTO_OPTIONS.filter((crypto) => currentShop.availableCryptos.includes(crypto.id));
  }, [currentShop?.availableCryptos]);

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
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
            style={{ maxHeight: getSheetMaxHeight(platform, 32) }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetSpring}
          >
            <div className="rounded-t-[32px] flex flex-col" style={sheetStyle}>
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div>
                  <h2
                    className="text-2xl font-bold text-white"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    {t('payment.selectCrypto')}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">{t('payment.selectMethod')}</p>
                </div>
                <motion.button
                  onClick={handleClose}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400"
                  style={{
                    background: android ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                  whileTap={{ scale: android ? 0.94 : 0.9 }}
                  transition={controlSpring}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </motion.button>
              </div>

              {/* Crypto Options */}
              <div
                className="flex-1 overflow-y-auto px-6 pt-4"
                style={{ paddingBottom: 'calc(var(--tabbar-total) + 72px)' }}
              >
                {availableCryptoOptions.length === 0 ? (
                  // Empty state - no wallets configured
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <svg
                      className="w-16 h-16 text-gray-600 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-400 mb-2">
                      {t('payment.noWallets') || 'No payment methods'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {t('payment.noWalletsDesc') ||
                        "This shop hasn't configured payment wallets yet"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {availableCryptoOptions.map((crypto) => {
                      return (
                        <motion.button
                          key={crypto.id}
                          onClick={() => handleSelectCrypto(crypto.id)}
                          disabled={isGeneratingInvoice} // ✅ Prevent double-clicks
                          className="relative overflow-hidden rounded-2xl p-5 text-left"
                          style={{
                            ...cardBaseStyle,
                            background: `linear-gradient(145deg, rgba(26, 26, 26, ${android ? '0.94' : '0.9'}) 0%, rgba(20, 20, 20, ${android ? '0.96' : '0.95'}) 100%)`,
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            opacity: isGeneratingInvoice ? 0.5 : 1, // ✅ Visual feedback
                            cursor: isGeneratingInvoice ? 'not-allowed' : 'pointer',
                          }}
                          whileHover={{ scale: android ? 1.015 : 1.02, y: android ? -1 : -2 }}
                          whileTap={{ scale: android ? 0.985 : 0.98 }}
                          transition={quickSpring}
                        >
                          {/* Gradient overlay */}
                          <motion.div
                            className="absolute inset-0 opacity-0 hover:opacity-100"
                            style={{
                              background: `radial-gradient(600px circle at center, ${crypto.color}15, transparent 40%)`,
                            }}
                            transition={{ duration: 0.3 }}
                          />

                          <div className="relative space-y-3">
                            {/* Icon */}
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold"
                              style={{
                                background: `linear-gradient(135deg, ${crypto.gradient})`,
                                boxShadow: `0 4px 12px ${crypto.color}40, inset 0 1px 0 rgba(255, 255, 255, 0.2)`,
                              }}
                            >
                              {crypto.icon}
                            </div>

                            {/* Info */}
                            <div>
                              <h3
                                className="text-white font-bold text-lg"
                                style={{ letterSpacing: '-0.01em' }}
                              >
                                {crypto.name}
                              </h3>
                              <p
                                className="text-gray-400 text-xs mt-1"
                                style={{ letterSpacing: '0.01em' }}
                              >
                                {crypto.network}
                              </p>
                            </div>

                            {/* Navigation arrow */}
                            <div className="flex justify-end">
                              <svg
                                className="w-5 h-5 text-orange-primary flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Generating Invoice Overlay */}
          {isGeneratingInvoice && (
            <motion.div
              className="fixed inset-0 z-60 flex items-center justify-center"
              style={{
                background: 'rgba(10, 10, 10, 0.85)',
                backdropFilter: 'blur(8px)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-orange-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white font-semibold text-lg">{t('payment.generatingInvoice')}</p>
                <p className="text-gray-400 text-sm mt-2">{t('payment.pleaseWait')}</p>

                {/* P0-1 FIX: Use state-driven condition instead of Date.now() */}
                {showCancelButton && (
                  <motion.button
                    onClick={() => {
                      // P0-2 FIX: Reset isGeneratingInvoice via store action
                      useStore.getState().resetPaymentFlow({ keepOrder: true });
                      setPaymentStep('method');
                      setShowCancelButton(false);
                      toast.error(t('payment.timeoutError'));
                    }}
                    className="mt-4 px-6 py-3 rounded-xl bg-red-500 text-white font-semibold"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {t('common.cancel')}
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
