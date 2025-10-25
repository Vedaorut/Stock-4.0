import { motion } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

export default function PageHeader({ title, onBack, action }) {
  const { triggerHaptic } = useTelegram();

  const handleBack = () => {
    triggerHaptic('light');
    onBack();
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4"
      style={{
        height: '56px',
        background: 'rgba(10, 10, 10, 0.95)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}
    >
      {/* Back Button */}
      <motion.button
        onClick={handleBack}
        className="flex items-center justify-center rounded-xl text-white"
        style={{
          width: '40px',
          height: '40px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
        whileTap={{ scale: 0.9 }}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </motion.button>

      {/* Title */}
      <h1
        className="absolute left-1/2 transform -translate-x-1/2 text-xl font-bold text-white"
        style={{ letterSpacing: '-0.02em' }}
      >
        {title}
      </h1>

      {/* Action Button (optional) */}
      <div style={{ width: '40px', height: '40px' }}>
        {action}
      </div>
    </div>
  );
}
