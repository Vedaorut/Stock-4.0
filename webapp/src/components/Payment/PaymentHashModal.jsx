import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { validateTxHash, extractHashFromInput } from '../../utils/paymentUtils';
import { usePlatform } from '../../hooks/usePlatform';
import {
  getSpringPreset,
  getSurfaceStyle,
  getSheetMaxHeight,
  isAndroid,
  isIOS,
} from '../../utils/platform';
import { useBackButton } from '../../hooks/useBackButton';

export default function PaymentHashModal() {
  const { paymentStep, submitPaymentHash, setPaymentStep, isVerifying, verifyError } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const platform = usePlatform();
  const android = isAndroid(platform);
  const ios = isIOS(platform);

  // Memoize validation function to avoid recalculation on every render
  const isValidTxHash = useMemo(() => validateTxHash(txHash), [txHash]);

  const overlayStyle = useMemo(() => getSurfaceStyle('overlay', platform), [platform]);

  const sheetStyle = useMemo(() => getSurfaceStyle('surfacePanel', platform), [platform]);

  const sheetSpring = useMemo(() => getSpringPreset('sheet', platform), [platform]);

  const controlSpring = useMemo(() => getSpringPreset('press', platform), [platform]);

  const isOpen = paymentStep === 'hash';

  const handleClose = () => {
    triggerHaptic('light');
    setPaymentStep('details');
  };

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
    // H12 FIX: Use try/catch instead of getState() after await to avoid race condition
    try {
      await submitPaymentHash(cleanHash);
      // If no error was thrown, clear the input
      setTxHash('');
    } catch {
      // Error is already handled by submitPaymentHash and stored in verifyError
      // Just don't clear txHash so user can retry
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

          {/* Modal - Compact */}
          <motion.div
            className="fixed inset-x-0 z-50 flex flex-col"
            style={{
              bottom: 'var(--tabbar-total)', // ✅ FIX: Position ABOVE TabBar
              maxHeight: getSheetMaxHeight(platform, ios ? -20 : 32),
            }}
            initial={{ y: '100%', scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: '100%', scale: 0.95 }}
            transition={sheetSpring}
          >
            <div className="rounded-t-[32px] flex flex-col" style={sheetStyle}>
              {/* Header - Compact */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={handleClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400"
                    style={{
                      background: android
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(255, 255, 255, 0.05)',
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
                  <div>
                    <h2
                      className="text-lg font-bold text-white"
                      style={{ letterSpacing: '-0.01em' }}
                    >
                      {t('payment.txHashTitle')}
                    </h2>
                    <p className="text-xs text-gray-400">{t('payment.txHashDesc')}</p>
                  </div>
                </div>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Loading Overlay */}
                {isVerifying && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-10 flex items-center justify-center"
                    style={{
                      background: 'rgba(0, 0, 0, 0.7)',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-white font-semibold">Проверяем транзакцию...</p>
                      <p className="text-gray-400 text-sm">Это может занять несколько секунд</p>
                    </div>
                  </motion.div>
                )}

                {/* Error Message */}
                {verifyError && !isVerifying && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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
                      <div className="flex-1">
                        <p className="text-red-400 font-semibold text-sm">Ошибка проверки</p>
                        <p className="text-gray-300 text-sm mt-1">{verifyError}</p>
                        <motion.button
                          onClick={handleRetry}
                          className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                          style={{
                            background: 'rgba(255, 107, 0, 0.2)',
                            border: '1px solid rgba(255, 107, 0, 0.3)',
                          }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Попробовать снова
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
                {/* Icon - Smaller */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                  className="flex justify-center"
                >
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                      boxShadow:
                        '0 4px 12px rgba(255, 107, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    <svg
                      className="w-8 h-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                  </div>
                </motion.div>

                {/* Input - Compact */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-1"
                >
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Transaction Link or Hash
                  </label>
                  <div className="relative">
                    <textarea
                      value={txHash}
                      onChange={handleChange}
                      placeholder={t('payment.txHashPlaceholder')}
                      rows={4}
                      className="w-full px-3 py-3 rounded-lg font-mono text-xs leading-relaxed text-white placeholder-gray-500 resize-none focus:outline-none tabular-nums"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: error
                          ? '1px solid rgba(239, 68, 68, 0.5)'
                          : txHash.length > 0
                            ? '1px solid rgba(34, 197, 94, 0.3)'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'border 200ms ease-out',
                      }}
                    />
                    {txHash.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute top-2 right-2"
                      >
                        {error ? (
                          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                            <svg
                              className="w-3 h-3 text-red-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </div>
                        ) : isValidTxHash ? (
                          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                            <svg
                              className="w-3 h-3 text-green-400"
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
                          </div>
                        ) : null}
                      </motion.div>
                    )}
                  </div>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-xs"
                    >
                      {error}
                    </motion.p>
                  )}
                  <p className="text-gray-500 text-xs">{t('payment.txHashMin')}</p>
                </motion.div>

                {/* Info box - Very compact */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-start gap-2 p-2 rounded-lg"
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                  }}
                >
                  <svg
                    className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5"
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
                  <p className="text-gray-300 text-xs leading-snug">
                    <span className="text-blue-400 font-semibold">{t('payment.txHashHow')}</span>{' '}
                    {t('payment.txHashHowDesc')}
                  </p>
                </motion.div>
              </div>

              {/* Footer - Compact */}
              <div className="p-4 border-t border-white/10">
                <motion.button
                  onClick={handleSubmit}
                  disabled={!isValidTxHash}
                  className="w-full h-12 text-white font-bold rounded-xl overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: isValidTxHash
                      ? 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)'
                      : 'rgba(74, 74, 74, 0.5)',
                    boxShadow: isValidTxHash
                      ? android
                        ? '0 4px 16px rgba(255, 107, 0, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                        : '0 4px 12px rgba(255, 107, 0, 0.3), 0 8px 24px rgba(255, 107, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      : 'none',
                    letterSpacing: '-0.01em',
                  }}
                  whileTap={isValidTxHash ? { scale: android ? 0.985 : 0.98 } : {}}
                  transition={controlSpring}
                >
                  {t('payment.confirmPayment')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
