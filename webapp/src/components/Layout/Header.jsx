import { motion } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

export default function Header({ title }) {
  const { close, triggerHaptic } = useTelegram();

  const handleClose = () => {
    triggerHaptic('light');
    close();
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center justify-between px-4" style={{ height: '56px' }}>
        {/* Close Button */}
        <motion.button
          onClick={handleClose}
          className="flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          style={{
            width: '40px',
            height: '40px',
          }}
          whileTap={{ scale: 0.9 }}
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </motion.button>

        {/* Title */}
        <h1 className="flex-1 text-xl font-bold text-white text-center">{title}</h1>

        {/* Spacer for symmetry */}
        <div style={{ width: '40px', height: '40px' }} />
      </div>
    </header>
  );
}
