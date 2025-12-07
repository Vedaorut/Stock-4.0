import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { validateTxHash, extractHashFromInput } from '../../utils/paymentUtils';
import { usePlatform } from '../../hooks/usePlatform';
import { isAndroid } from '../../utils/platform';
import { useBackButton } from '../../hooks/useBackButton';

/**
 * PaymentHashModal - Transaction Confirmation
 *
 * Design: Refined Industrial Dark
 * - Fixed header with ALWAYS visible back button (no disappearing!)
 * - Clean, focused input area
 * - Stable positioning above TabBar
 * - Reliable navigation on all devices
 */
export default function PaymentHashModal() {
  const { paymentStep, submitPaymentHash, setPaymentStep, isVerifying, verifyError } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const platform = usePlatform();
  const android = isAndroid(platform);

  const isValidTxHash = useMemo(() => validateTxHash(txHash), [txHash]);
  const isOpen = paymentStep === 'hash';

  // Stable back handler
  const handleClose = useCallback(() => {
    triggerHaptic('light');
    setPaymentStep('details');
  }, [triggerHaptic, setPaymentStep]);

  useBackButton(isOpen ? handleClose : null);

  const handleSubmit = async () => {
    setError('');
    const cleanHash = extractHashFromInput(txHash);

    if (!cleanHash) {
      setError(t('payment.txHashInvalid'));
      triggerHaptic('error');
      return;
    }

    triggerHaptic('success');
    try {
      await submitPaymentHash(cleanHash);
      setTxHash('');
    } catch {
      // Error handled by store
    }
  };

  const handleChange = (e) => {
    setTxHash(e.target.value);
    if (error) setError('');
  };

  const handleRetry = () => {
    setTxHash('');
    setError('');
  };

  // Style constants
  const modalStyle = useMemo(() => ({
    background: 'linear-gradient(180deg, #1C1C1C 0%, #161616 100%)',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  }), []);

  const overlayStyle = useMemo(() => ({
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: android ? 'blur(8px)' : 'blur(16px)',
    WebkitBackdropFilter: android ? 'blur(8px)' : 'blur(16px)',
  }), [android]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            style={overlayStyle}
          />

          {/* Modal Container - Fixed positioning */}
          <motion.div
            className="fixed inset-x-0 z-50 flex flex-col"
            style={{
              bottom: 'var(--tabbar-total, 80px)',
              maxHeight: 'calc(100vh - env(safe-area-inset-top) - var(--tabbar-total, 80px) - 20px)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
          >
            <div className="rounded-t-3xl flex flex-col overflow-hidden" style={modalStyle}>
              {/* ============================================
                  FIXED HEADER - Always visible navigation
                  ============================================ */}
              <div
                className="flex items-center gap-3 px-4 shrink-0"
                style={{
                  height: '60px',
                  minHeight: '60px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  background: 'rgba(28, 28, 28, 0.98)',
                }}
              >
                {/* Back Button - ALWAYS visible, fixed size */}
                <motion.button
                  onClick={handleClose}
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: '40px',
                    height: '40px',
                    minWidth: '40px',
                    minHeight: '40px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                  whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.15 }}
                  aria-label="Go back"
                >
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </motion.button>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <h2
                    className="text-lg font-bold text-white truncate"
                    style={{ letterSpacing: '-0.01em' }}
                  >
                    {t('payment.txHashTitle')}
                  </h2>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {t('payment.txHashDesc')}
                  </p>
                </div>

                {/* Status indicator */}
                <div className="shrink-0">
                  {isVerifying ? (
                    <div className="w-8 h-8 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-orange-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : isValidTxHash ? (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(34, 197, 94, 0.15)' }}
                    >
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* ============================================
                  SCROLLABLE CONTENT
                  ============================================ */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 relative">
                {/* Loading Overlay */}
                <AnimatePresence>
                  {isVerifying && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-10 flex items-center justify-center"
                      style={{
                        background: 'rgba(0, 0, 0, 0.8)',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      <div className="flex flex-col items-center gap-4 p-6">
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-orange-primary/30 rounded-full" />
                          <div className="absolute inset-0 w-16 h-16 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                        <div className="text-center">
                          <p className="text-white font-semibold">Verifying transaction...</p>
                          <p className="text-gray-400 text-sm mt-1">This may take a few seconds</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error Message */}
                {verifyError && !isVerifying && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl"
                    style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(239, 68, 68, 0.15)' }}
                      >
                        <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-red-400 font-semibold text-sm">Verification Failed</p>
                        <p className="text-gray-400 text-sm mt-1 break-words">{verifyError}</p>
                        <motion.button
                          onClick={handleRetry}
                          className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                          style={{
                            background: 'rgba(255, 107, 0, 0.15)',
                            border: '1px solid rgba(255, 107, 0, 0.25)',
                          }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Try Again
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Icon */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                  className="flex justify-center"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                      boxShadow: '0 8px 24px rgba(255, 107, 0, 0.25)',
                    }}
                  >
                    {/* Shimmer effect */}
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%)',
                        animation: 'shimmer 2s infinite',
                      }}
                    />
                    <svg className="w-8 h-8 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </motion.div>

                {/* Input Section */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="space-y-2"
                >
                  <label className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Transaction Link or Hash
                    </span>
                    {txHash.length > 0 && (
                      <span className="text-xs text-gray-500 font-mono tabular-nums">
                        {txHash.length} chars
                      </span>
                    )}
                  </label>

                  <div className="relative">
                    <textarea
                      value={txHash}
                      onChange={handleChange}
                      placeholder={t('payment.txHashPlaceholder')}
                      rows={4}
                      className="w-full px-4 py-4 rounded-2xl font-mono text-sm leading-relaxed text-white placeholder-gray-600 resize-none focus:outline-none transition-all duration-200"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: error
                          ? '2px solid rgba(239, 68, 68, 0.5)'
                          : isValidTxHash
                            ? '2px solid rgba(34, 197, 94, 0.3)'
                            : '2px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: isValidTxHash
                          ? '0 0 20px rgba(34, 197, 94, 0.1)'
                          : error
                            ? '0 0 20px rgba(239, 68, 68, 0.1)'
                            : 'none',
                      }}
                      disabled={isVerifying}
                    />
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-xs px-1 flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </motion.p>
                  )}

                  <p className="text-gray-500 text-xs px-1">{t('payment.txHashMin')}</p>
                </motion.div>

                {/* Info Box */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="flex items-start gap-3 p-4 rounded-2xl"
                  style={{
                    background: 'rgba(59, 130, 246, 0.06)',
                    border: '1px solid rgba(59, 130, 246, 0.12)',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(59, 130, 246, 0.15)' }}
                  >
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    <span className="text-blue-400 font-semibold">{t('payment.txHashHow')}</span>{' '}
                    {t('payment.txHashHowDesc')}
                  </p>
                </motion.div>
              </div>

              {/* ============================================
                  FIXED FOOTER - Submit button
                  ============================================ */}
              <div
                className="shrink-0 p-4"
                style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  background: 'rgba(22, 22, 22, 0.98)',
                }}
              >
                <motion.button
                  onClick={handleSubmit}
                  disabled={!isValidTxHash || isVerifying}
                  className="w-full h-14 text-white font-bold text-base rounded-2xl overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed relative"
                  style={{
                    background: isValidTxHash && !isVerifying
                      ? 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)'
                      : 'rgba(74, 74, 74, 0.4)',
                    boxShadow: isValidTxHash && !isVerifying
                      ? '0 4px 20px rgba(255, 107, 0, 0.3), 0 8px 32px rgba(255, 107, 0, 0.15)'
                      : 'none',
                    letterSpacing: '-0.01em',
                  }}
                  whileTap={isValidTxHash && !isVerifying ? { scale: 0.98 } : {}}
                  transition={{ duration: 0.15 }}
                >
                  {/* Button shine effect */}
                  {isValidTxHash && !isVerifying && (
                    <div
                      className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)',
                      }}
                    />
                  )}
                  <span className="relative z-10">{t('payment.confirmPayment')}</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
