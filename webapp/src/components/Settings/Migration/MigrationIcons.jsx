import { m as motion } from 'framer-motion';

/**
 * Animated Warning Icon for migration hero screen
 * @param {{ className?: string }} props
 */
export function WarningIcon({ className }) {
  return (
    <motion.div
      className={className}
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
    >
      <motion.div
        className="w-24 h-24 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.2) 0%, rgba(255, 107, 0, 0.3) 100%)',
          boxShadow: '0 0 40px rgba(255, 140, 0, 0.3), 0 0 80px rgba(255, 107, 0, 0.15)',
        }}
        animate={{
          boxShadow: [
            '0 0 40px rgba(255, 140, 0, 0.3), 0 0 80px rgba(255, 107, 0, 0.15)',
            '0 0 60px rgba(255, 140, 0, 0.4), 0 0 100px rgba(255, 107, 0, 0.2)',
            '0 0 40px rgba(255, 140, 0, 0.3), 0 0 80px rgba(255, 107, 0, 0.15)',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.svg
          className="w-12 h-12 text-orange-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </motion.svg>
      </motion.div>
    </motion.div>
  );
}

/**
 * Animated Success Checkmark with burst particles
 */
export function SuccessCheckmark() {
  return (
    <motion.div
      className="relative"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
    >
      <motion.div
        className="w-28 h-28 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.3) 100%)',
          boxShadow: '0 0 40px rgba(34, 197, 94, 0.3), 0 0 80px rgba(34, 197, 94, 0.15)',
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.svg
          className="w-14 h-14 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }}
        >
          <motion.path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 13l4 4L19 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          />
        </motion.svg>
      </motion.div>

      {/* Burst particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-green-400"
          style={{
            top: '50%',
            left: '50%',
          }}
          initial={{ x: '-50%', y: '-50%', scale: 0 }}
          animate={{
            x: `calc(-50% + ${Math.cos((i * Math.PI * 2) / 8) * 60}px)`,
            y: `calc(-50% + ${Math.sin((i * Math.PI * 2) / 8) * 60}px)`,
            scale: [0, 1, 0],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 0.6, delay: 0.3 + i * 0.03 }}
        />
      ))}
    </motion.div>
  );
}

/**
 * Loading Spinner for eligibility check
 */
export function LoadingSpinner() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="relative w-16 h-16">
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-orange-500/20"
        />
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-orange-500"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <motion.p
        className="mt-4 text-gray-400 text-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Checking migration permissions...
      </motion.p>
    </motion.div>
  );
}

/**
 * Info Card Item
 * @param {{ icon: string, text: string, variant?: 'default' | 'success' | 'warning' }} props
 */
export function InfoItem({ icon, text, variant = 'default' }) {
  const variants = {
    default: 'text-gray-300',
    success: 'text-green-400',
    warning: 'text-orange-400',
  };

  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <span className={`text-lg ${variants[variant]}`}>{icon}</span>
      <span className={`text-sm ${variants[variant]}`}>{text}</span>
    </motion.div>
  );
}
