import { motion } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

/**
 * PageHeader component
 *
 * @param {string} title - Page title
 * @param {Function} onBack - Callback for back button (used with useBackButton)
 * @param {ReactNode} action - Optional element for right side of header
 * @param {'back'|'close'} variant - Button type: 'back' (back arrow) or 'close' (x icon)
 */
export default function PageHeader({ title, onBack, action, variant = 'back' }) {
  const { triggerHaptic } = useTelegram();

  const handleBack = () => {
    triggerHaptic('light');
    onBack();
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="flex items-center justify-between px-4" style={{ height: '56px' }}>
        {/* Back/Close Button (only if onBack is provided) */}
        {onBack ? (
          <motion.button
            onClick={handleBack}
            className="flex items-center justify-center text-orange-primary"
            style={{
              width: '40px',
              height: '40px',
            }}
            whileTap={{ scale: 0.9 }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {variant === 'close' ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              )}
            </svg>
          </motion.button>
        ) : (
          <div style={{ width: '40px', height: '40px' }} />
        )}

        {/* Title */}
        <h1
          className="flex-1 text-center text-lg font-bold text-white"
          style={{ letterSpacing: '-0.02em' }}
        >
          {title}
        </h1>

        {/* Action Button (optional) */}
        <div className="flex items-center justify-end" style={{ width: '40px', height: '40px' }}>
          {action}
        </div>
      </div>
    </div>
  );
}
