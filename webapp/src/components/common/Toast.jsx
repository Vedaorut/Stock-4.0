import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, memo } from 'react';

const toastIcons = {
  success: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

const toastStyles = {
  success: {
    background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
    icon: '#fff',
  },
  error: {
    background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
    icon: '#fff',
  },
  warning: {
    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    icon: '#000',
  },
  info: {
    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    icon: '#fff',
  },
};

const Toast = memo(function Toast({ type = 'info', message, onClose, duration = 3000 }) {
  const Icon = toastIcons[type];
  const styles = toastStyles[type];
  const timerRef = useRef(null);

  useEffect(() => {
    if (duration) {
      timerRef.current = setTimeout(onClose, duration);
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    }
  }, [duration, onClose]);

  const _handleManualClose = () => {
    // Reserved for close button implementation
    // Clear auto-dismiss timer before manual close
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onClose();
  };

  return (
    <motion.div
      initial={{ scale: 0, y: 50, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.8, y: -50, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg min-w-[280px]"
      style={{
        background: styles.background,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
      }}
    >
      <motion.div
        initial={{ rotate: -180, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
        style={{ color: styles.icon }}
      >
        {Icon}
      </motion.div>
      <p className="flex-1 text-sm font-medium" style={{ color: styles.icon }}>
        {message}
      </p>
    </motion.div>
  );
});

// Toast Container
export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-[env(safe-area-inset-top)] right-4 z-[100] flex flex-col gap-2 pt-4">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
            duration={toast.duration}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default Toast;
