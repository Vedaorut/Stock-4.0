import { m as motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, lazy, Suspense, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { useToast } from '../../hooks/useToast';
import { CRYPTO_OPTIONS, formatCryptoAmount, generatePaymentQRValue } from '../../utils/paymentUtils';
import { usePlatform } from '../../hooks/usePlatform';
import {
  getSpringPreset,
  getSurfaceStyle,
  getSheetMaxHeight,
  isAndroid,
  isIOS,
} from '../../utils/platform';
import { useBackButton } from '../../hooks/useBackButton';
import { useScrollLock } from '../../hooks/useScrollLock';

// Lazy load QR code library (14KB gzipped)
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then((module) => ({ default: module.QRCodeSVG }))
);

export default function PaymentDetailsModal() {
  const {
    paymentStep,
    selectedCrypto,
    paymentWallet,
    currentOrder,
    cryptoAmount,
    setPaymentStep,
    isGeneratingInvoice,
  } = useStore(
    useShallow((state) => ({
      paymentStep: state.paymentStep,
      selectedCrypto: state.selectedCrypto,
      paymentWallet: state.paymentWallet,
      currentOrder: state.currentOrder,
      cryptoAmount: state.cryptoAmount,
      setPaymentStep: state.setPaymentStep,
      isGeneratingInvoice: state.isGeneratingInvoice,
    }))
  );
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const _toast = useToast(); // Reserved for future notifications
  const platform = usePlatform();
  const android = isAndroid(platform);
  const ios = isIOS(platform);
  const [copied, setCopied] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const copiedTimeoutRef = useRef(null);
  const copiedAmountTimeoutRef = useRef(null);

  // Log render state

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      if (copiedAmountTimeoutRef.current) {
        clearTimeout(copiedAmountTimeoutRef.current);
      }
    };
  }, []);

  // P0-002 FIX: Define isOpen and isLoading BEFORE useEffect that depends on them
  const isOpen = paymentStep === 'details';
  const isLoading = isOpen && isGeneratingInvoice;

  // Timeout protection: show cancel button after 30 seconds of loading
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimeout(false);
      return;
    }
    const timeout = setTimeout(() => setLoadingTimeout(true), 30000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  const overlayStyle = useMemo(() => getSurfaceStyle('overlay', platform), [platform]);

  const sheetStyle = useMemo(() => getSurfaceStyle('surfacePanel', platform), [platform]);

  const cardStyle = useMemo(() => getSurfaceStyle('glassCard', platform), [platform]);

  const sheetSpring = useMemo(() => getSpringPreset('sheet', platform), [platform]);

  const controlSpring = useMemo(() => getSpringPreset('press', platform), [platform]);

  const quickSpring = useMemo(() => getSpringPreset('quick', platform), [platform]);

  // ✅ CRITICAL: useBackButton must be called BEFORE any early returns!
  const handleClose = () => {
    triggerHaptic('light');
    setPaymentStep('method');
  };

  useBackButton(isOpen ? handleClose : null);

  // BUG-WEBAPP-007: Properly manage scroll lock
  useScrollLock(isOpen);

  // Universal copy with fallback for Telegram WebApp iframe
  const copyToClipboard = async (text) => {
    // Try modern Clipboard API first
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback: Legacy execCommand (works in iframe)
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          return true;
        }

        throw new Error('execCommand returned false');
      } catch {
        return false;
      }
    }
  };

  const handleCopyWallet = async () => {
    const success = await copyToClipboard(paymentWallet);

    if (success) {
      setCopied(true);
      triggerHaptic('success');

      // Clear previous timeout before setting new one
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }

      // Set new timeout with proper cleanup
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } else {
      triggerHaptic('error');
    }
  };

  const handleCopyAmount = async () => {
    const success = await copyToClipboard(`${cryptoAmount} ${selectedCrypto}`);

    if (success) {
      setCopiedAmount(true);
      triggerHaptic('success');

      // Clear previous timeout before setting new one
      if (copiedAmountTimeoutRef.current) {
        clearTimeout(copiedAmountTimeoutRef.current);
      }

      // Set new timeout with proper cleanup
      copiedAmountTimeoutRef.current = setTimeout(() => setCopiedAmount(false), 2000);
    } else {
      triggerHaptic('error');
    }
  };

  const handlePaid = () => {
    triggerHaptic('medium');
    setPaymentStep('hash');
  };

  const cryptoInfo = CRYPTO_OPTIONS.find((c) => c.id === selectedCrypto);

  // Show loading state if still generating invoice
  if (isLoading) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ background: 'rgba(10, 10, 10, 0.85)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-orange-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white font-semibold text-lg">{t('payment.loadingPaymentDetails')}</p>
              <p className="text-gray-400 text-sm mt-2">{t('payment.pleaseWait')}</p>

              {/* Timeout protection: Cancel button after 30s */}
              {loadingTimeout && (
                <motion.button
                  onClick={() => {
                    triggerHaptic('light');
                    setPaymentStep('method');
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
      </AnimatePresence>
    );
  }



  // Defensive error handling for unknown crypto
  if (!cryptoInfo) {
    if (import.meta.env.DEV) {
      console.error('🔴 [PaymentDetailsModal] Unknown cryptocurrency:', selectedCrypto);
      console.error(
        '🔴 [PaymentDetailsModal] Available currencies:',
        CRYPTO_OPTIONS.map((c) => c.id)
      );
    }

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              style={getSurfaceStyle('overlay', platform)}
            />
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="glass-card rounded-3xl p-6 text-center max-w-sm">
                <div className="text-red-500 mb-4">
                  <svg
                    className="w-16 h-16 mx-auto"
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
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{t('errors.unknownCrypto')}</h3>
                <p className="text-gray-400 mb-4">
                  {t('errors.cryptoNotSupported', { crypto: selectedCrypto })}
                </p>
                <motion.button
                  onClick={handleClose}
                  className="px-6 py-3 bg-orange-primary hover:bg-orange-light text-white font-semibold rounded-xl transition-colors"
                  whileTap={{ scale: 0.95 }}
                >
                  {t('common.close')}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Handle reset payment flow back to cart
  const handleBackToCart = () => {
    triggerHaptic('light');
    setPaymentStep('idle');
  };

  // Validate remaining data - show error state instead of silent disappear
  if (!currentOrder) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleBackToCart}
              style={getSurfaceStyle('overlay', platform)}
            />
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="bg-gray-900 rounded-2xl p-6 max-w-sm text-center">
                <svg
                  className="w-16 h-16 text-red-500 mx-auto mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {t('payment.orderDataLost')}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {t('payment.orderDataLostDesc')}
                </p>
                <motion.button
                  onClick={handleBackToCart}
                  className="px-6 py-3 rounded-xl font-semibold text-white bg-orange-primary"
                  whileTap={{ scale: 0.95 }}
                >
                  {t('payment.backToCart')}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  if (!paymentWallet || !cryptoAmount || cryptoAmount <= 0) {
    if (import.meta.env.DEV) {
      console.error('🔴 [PaymentDetailsModal] Invalid payment data:', {
        paymentWallet,
        cryptoAmount,
      });
    }
    // If no data - show error state
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              style={getSurfaceStyle('overlay', platform)}
            />
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="bg-gray-900 rounded-2xl p-6 max-w-sm text-center">
                <svg
                  className="w-16 h-16 text-red-500 mx-auto mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-white mb-2">{t('payment.loadingError')}</h3>
                <p className="text-sm text-gray-400 mb-4">{t('payment.failedPaymentDetails')}</p>
                <motion.button
                  onClick={handleClose}
                  className="px-6 py-3 rounded-xl font-semibold text-white bg-orange-primary"
                  whileTap={{ scale: 0.95 }}
                >
                  {t('common.back')}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  const itemCount = currentOrder.quantity || 1;
  const qrSize = ios ? 140 : 160;

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
            className="fixed inset-x-0 z-50 flex flex-col"
            style={{
              bottom: 'var(--tabbar-total)', // ✅ FIX: Position ABOVE TabBar
              maxHeight: getSheetMaxHeight(platform, ios ? -24 : 32),
            }}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={sheetSpring}
          >
            <div className="rounded-t-[32px] flex flex-col" style={sheetStyle}>
              {/* Header - Centered */}
              <div className="relative flex items-center justify-center p-4 border-b border-white/10">
                {/* Back Button - Absolute Left */}
                <motion.button
                  onClick={handleClose}
                  className="absolute left-4 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400"
                  style={{
                    background: android ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                  whileTap={{ scale: android ? 0.94 : 0.9 }}
                  transition={controlSpring}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </motion.button>

                {/* Title - Centered */}
                <div className="text-center">
                  <h2 className="text-lg font-bold text-white" style={{ letterSpacing: '-0.01em' }}>
                    {t('payment.payWith', { crypto: cryptoInfo.name })}
                  </h2>
                  <p className="text-xs text-gray-400">{cryptoInfo.network}</p>
                </div>

                {/* Crypto Icon - Absolute Right */}
                <div
                  className="absolute right-4 w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
                  style={{
                    background: `linear-gradient(135deg, ${cryptoInfo.gradient})`,
                    boxShadow: `0 4px 12px ${cryptoInfo.color}40`,
                  }}
                >
                  {cryptoInfo.icon}
                </div>
              </div>

              {/* Content - Scrollable */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-3"
                style={{ paddingBottom: 'calc(var(--tabbar-total) + 32px)' }}
              >
                {/* QR Code - Compact */}
                <div className="flex justify-center">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.1 }}
                    className="p-3 rounded-xl"
                    style={{
                      background: 'white',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    <Suspense
                      fallback={
                        <div
                          className="flex items-center justify-center"
                          style={{ width: qrSize, height: qrSize }}
                        >
                          <div className="w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      }
                    >
                      <QRCodeSVG
                        value={generatePaymentQRValue(paymentWallet, cryptoAmount, selectedCrypto)}
                        size={qrSize}
                        level="H"
                        includeMargin={false}
                      />
                    </Suspense>
                  </motion.div>
                </div>

                {/* Wallet Address - Compact */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center gap-2 rounded-lg p-2"
                  style={{
                    ...cardStyle,
                    background: android ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div className="flex-1 break-all text-white font-mono text-xs tabular-nums">
                    {paymentWallet}
                  </div>
                  <motion.button
                    onClick={handleCopyWallet}
                    aria-label="Copy address"
                    className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                    style={{
                      background: copied ? 'rgba(34, 197, 94, 0.24)' : 'rgba(255, 107, 0, 0.22)',
                      border: copied
                        ? '1px solid rgba(34, 197, 94, 0.36)'
                        : '1px solid rgba(255, 107, 0, 0.32)',
                    }}
                    whileTap={{ scale: android ? 0.95 : 0.9 }}
                    transition={controlSpring}
                  >
                    {copied ? (
                      <svg
                        className="w-4 h-4 text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4 text-orange-primary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </motion.button>
                </motion.div>

                {/* Amount Summary - Compact & Centered & Copyable */}
                <motion.button
                  onClick={handleCopyAmount}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="w-full rounded-xl p-4 text-center space-y-2 cursor-pointer"
                  style={{
                    ...cardStyle,
                    background:
                      'linear-gradient(145deg, rgba(26, 26, 26, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)',
                    border: copiedAmount
                      ? '1px solid rgba(34, 197, 94, 0.36)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                  whileTap={{ scale: android ? 0.985 : 0.98 }}
                  transition={{ ...quickSpring, delay: 0.3 }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-gray-400 text-xs">{t('cart.items', { count: itemCount })}</p>
                    {copiedAmount && (
                      <svg
                        className="w-4 h-4 text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm mb-1">
                    ${parseFloat(currentOrder.total_price || 0).toFixed(2)} USD
                  </p>
                  <div
                    className="text-orange-primary font-bold text-3xl tabular-nums"
                    style={{ letterSpacing: '-0.01em' }}
                  >
                    {formatCryptoAmount(cryptoAmount, selectedCrypto)} {selectedCrypto}
                  </div>
                  <p className="text-gray-500 text-[10px] mt-2">
                    {copiedAmount ? t('payment.amountCopied') : t('payment.tapToCopy')}
                  </p>
                </motion.button>
              </div>

              {/* Footer - Compact */}
              <div className="p-4 border-t border-white/10">
                <motion.button
                  onClick={handlePaid}
                  className="w-full h-12 text-white font-bold rounded-xl overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                    boxShadow: android
                      ? '0 4px 16px rgba(255, 107, 0, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                      : `
                          0 4px 12px rgba(255, 107, 0, 0.3),
                          0 8px 24px rgba(255, 107, 0, 0.15),
                          inset 0 1px 0 rgba(255, 255, 255, 0.2)
                        `,
                    letterSpacing: '-0.01em',
                  }}
                  whileTap={{ scale: android ? 0.985 : 0.98 }}
                  transition={controlSpring}
                >
                  {t('payment.iPaid')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
