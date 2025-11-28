import { motion } from 'framer-motion';
import { memo } from 'react';

const FloatingButton = memo(function FloatingButton({
  onClick,
  icon: Icon,
  className = '',
  bottom = '24',
  right = '6',
}) {
  // Default Plus icon if no icon provided
  const DefaultIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );

  const ButtonIcon = Icon || DefaultIcon;

  return (
    <motion.button
      onClick={onClick}
      className={`fixed w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-40 ${className}`}
      style={{
        bottom: `${bottom}px`,
        right: `${right}px`,
        background: 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)',
        boxShadow: '0 4px 16px rgba(255, 107, 0, 0.4), 0 8px 32px rgba(255, 107, 0, 0.2)',
      }}
      whileHover={{ scale: 1.1, rotate: 90 }}
      whileTap={{ scale: 0.9, rotate: 0 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      <ButtonIcon className="w-6 h-6 text-white" />
    </motion.button>
  );
});

export default FloatingButton;
