import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { CRYPTO_OPTIONS } from '../../utils/paymentUtils';

export default function PaymentMethodModal() {
  const { paymentStep, selectCrypto, setPaymentStep } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const isOpen = paymentStep === 'method';

  const handleClose = () => {
    triggerHaptic('light');
    setPaymentStep('idle');
  };

  const handleSelectCrypto = (cryptoId) => {
    triggerHaptic('medium');
    selectCrypto(cryptoId);
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
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            style={{
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(12px)'
            }}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          >
            <div
              className="rounded-t-[32px] flex flex-col max-h-[85vh]"
              style={{
                background: 'linear-gradient(180deg, rgba(26, 26, 26, 0.98) 0%, rgba(15, 15, 15, 0.99) 100%)',
                backdropFilter: 'blur(40px) saturate(180%)',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div>
                  <h2
                    className="text-2xl font-bold text-white"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    {t('payment.selectCrypto')}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {t('payment.selectMethod')}
                  </p>
                </div>
                <motion.button
                  onClick={handleClose}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400"
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

              {/* Crypto Options */}
              <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20">
                <div className="grid grid-cols-2 gap-3">
                  {CRYPTO_OPTIONS.map((crypto) => (
                    <motion.button
                      key={crypto.id}
                      onClick={() => handleSelectCrypto(crypto.id)}
                      className="relative overflow-hidden rounded-2xl p-5 text-left"
                      style={{
                        background: 'linear-gradient(145deg, rgba(26, 26, 26, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)',
                        backdropFilter: 'blur(12px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: `
                          1px 2px 2px hsl(0deg 0% 0% / 0.333),
                          2px 4px 4px hsl(0deg 0% 0% / 0.333),
                          0 0 0 1px rgba(255, 255, 255, 0.05),
                          inset 0 1px 0 rgba(255, 255, 255, 0.06)
                        `
                      }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    >
                      {/* Gradient overlay */}
                      <motion.div
                        className="absolute inset-0 opacity-0 hover:opacity-100"
                        style={{
                          background: `radial-gradient(600px circle at center, ${crypto.color}15, transparent 40%)`
                        }}
                        transition={{ duration: 0.3 }}
                      />

                      <div className="relative space-y-3">
                        {/* Icon */}
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold"
                          style={{
                            background: `linear-gradient(135deg, ${crypto.gradient})`,
                            boxShadow: `0 4px 12px ${crypto.color}40, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
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

                        {/* Arrow icon */}
                        <div className="flex justify-end">
                          <svg
                            className="w-5 h-5 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
