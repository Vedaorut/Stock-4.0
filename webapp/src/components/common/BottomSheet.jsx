import { motion, AnimatePresence } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

export default function BottomSheet({ isOpen, onClose, children, title }) {
  const { triggerHaptic } = useTelegram();

  const handleClose = () => {
    triggerHaptic('light');
    onClose();
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

          {/* Bottom Sheet */}
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
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div
                  className="w-10 h-1 rounded-full bg-white/20"
                  style={{ touchAction: 'none' }}
                />
              </div>

              {/* Header */}
              {title && (
                <div className="flex items-center justify-between px-6 pb-4">
                  <h2
                    className="text-2xl font-bold text-white"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    {title}
                  </h2>
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
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 pb-20">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
