import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { CRYPTO_OPTIONS, calculateCryptoAmount } from '../../utils/paymentUtils';

export default function PaymentDetailsModal() {
  const {
    paymentStep,
    selectedCrypto,
    paymentWallet,
    currentOrder,
    setPaymentStep
  } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const isOpen = paymentStep === 'details';

  const cryptoInfo = CRYPTO_OPTIONS.find(c => c.id === selectedCrypto);

  const handleClose = () => {
    triggerHaptic('light');
    setPaymentStep('method');
  };

  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(paymentWallet);
      setCopied(true);
      triggerHaptic('success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handlePaid = () => {
    triggerHaptic('medium');
    setPaymentStep('hash');
  };

  if (!cryptoInfo || !currentOrder) return null;

  const cryptoAmount = calculateCryptoAmount(currentOrder.total, selectedCrypto);
  const itemCount = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);

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
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          >
            <div
              className="rounded-t-[32px] flex flex-col"
              style={{
                background: 'linear-gradient(180deg, rgba(26, 26, 26, 0.98) 0%, rgba(15, 15, 15, 0.99) 100%)',
                backdropFilter: 'blur(40px) saturate(180%)',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
              }}
            >
              {/* Header - Compact */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={handleClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </motion.button>
                  <div>
                    <h2
                      className="text-lg font-bold text-white"
                      style={{ letterSpacing: '-0.01em' }}
                    >
                      {t('payment.payWith', { crypto: cryptoInfo.name })}
                    </h2>
                    <p className="text-xs text-gray-400">
                      {cryptoInfo.network}
                    </p>
                  </div>
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
                  style={{
                    background: `linear-gradient(135deg, ${cryptoInfo.gradient})`,
                    boxShadow: `0 4px 12px ${cryptoInfo.color}40`
                  }}
                >
                  {cryptoInfo.icon}
                </div>
              </div>

              {/* Content - No Scroll */}
              <div className="p-4 space-y-3">
                {/* QR Code - Compact */}
                <div className="flex justify-center">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.1 }}
                    className="p-3 rounded-xl"
                    style={{
                      background: 'white',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    <QRCodeSVG
                      value={paymentWallet}
                      size={160}
                      level="H"
                      includeMargin={false}
                    />
                  </motion.div>
                </div>

                {/* Wallet Address - Compact */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center gap-2 rounded-lg p-2"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <div className="flex-1 break-all text-white font-mono text-xs tabular-nums">
                    {paymentWallet}
                  </div>
                  <motion.button
                    onClick={handleCopyWallet}
                    className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                    style={{
                      background: copied ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 107, 0, 0.2)',
                      border: copied ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 107, 0, 0.3)'
                    }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    {copied ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-orange-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </motion.button>
                </motion.div>

                {/* Amount Summary - Compact & Centered */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-xl p-4 text-center space-y-2"
                  style={{
                    background: 'linear-gradient(145deg, rgba(26, 26, 26, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '1px 2px 2px hsl(0deg 0% 0% / 0.333), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <p className="text-gray-400 text-xs">
                    {t('cart.items', { count: itemCount })}
                  </p>
                  <div
                    className="text-orange-primary font-bold text-3xl tabular-nums"
                    style={{ letterSpacing: '-0.01em' }}
                  >
                    {cryptoAmount} {selectedCrypto}
                  </div>
                  <p className="text-gray-500 text-[10px] mt-2">
                    {t('payment.sendExact')}
                  </p>
                </motion.div>
              </div>

              {/* Footer - Compact */}
              <div className="p-4 pb-20 border-t border-white/10">
                <motion.button
                  onClick={handlePaid}
                  className="w-full h-12 text-white font-bold rounded-xl overflow-hidden"
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
