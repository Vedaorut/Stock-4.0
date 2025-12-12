import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { memo, useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

const LONG_PRESS_DURATION_MS = 500;

/**
 * Animated badge showing pending order status with pulsing and ripple effects.
 * Used in TabBar to indicate orders awaiting payment.
 *
 * @param {Object} props
 * @param {Object} props.order - The pending order object
 * @param {Function} props.onClick - Click handler (short tap - resume payment)
 * @param {Function} props.onLongPress - Long press handler (show cancel options)
 * @param {boolean} props.isExpiringSoon - If true, shows red color instead of orange
 */
const PendingOrderBadge = memo(function PendingOrderBadge({
  order,
  onClick,
  onLongPress,
  isExpiringSoon = false
}) {
  const shouldReduceMotion = useReducedMotion();
  const [showTooltip, setShowTooltip] = useState(false);
  const longPressTimer = useRef(null);
  const isLongPress = useRef(false);

  // Refs for latest props to avoid stale closures in timer
  const onLongPressRef = useRef(onLongPress);
  const onClickRef = useRef(onClick);
  const orderRef = useRef(order);

  // Keep refs in sync (direct assignment is safe during render)
  onLongPressRef.current = onLongPress;
  onClickRef.current = onClick;
  orderRef.current = order;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
  }, []);

  // DRY: Shared timer cleanup helper
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTapStart = useCallback(() => {
    isLongPress.current = false;
    setShowTooltip(true);

    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setShowTooltip(false);
      try {
        onLongPressRef.current?.(orderRef.current);
      } catch (error) {
        console.error('[PendingOrderBadge] onLongPress error:', error);
      }
    }, LONG_PRESS_DURATION_MS);
  }, []);

  const handleTapEnd = useCallback(() => {
    clearLongPressTimer();
    setShowTooltip(false);

    // Only trigger click if it wasn't a long press
    if (!isLongPress.current) {
      try {
        onClickRef.current?.(orderRef.current);
      } catch (error) {
        console.error('[PendingOrderBadge] onClick error:', error);
      }
    }
    isLongPress.current = false;
  }, [clearLongPressTimer]);

  const handleTapCancel = useCallback(() => {
    clearLongPressTimer();
    setShowTooltip(false);
    isLongPress.current = false;
  }, [clearLongPressTimer]);

  // Colors based on urgency
  const baseColor = isExpiringSoon ? '#EF4444' : '#FF6B00';
  const lightColor = isExpiringSoon ? '#F87171' : '#FF8C42';
  const glowColor = isExpiringSoon ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 107, 0, 0.4)';

  // Animation variants
  const pulseVariants = {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.08, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  };

  const rippleVariants = {
    initial: { scale: 0.8, opacity: 0.6 },
    animate: {
      scale: [0.8, 1.8],
      opacity: [0.6, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeOut'
      }
    }
  };

  const ripple2Variants = {
    initial: { scale: 0.8, opacity: 0.4 },
    animate: {
      scale: [0.8, 2],
      opacity: [0.4, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeOut',
        delay: 0.5
      }
    }
  };

  return (
    <div className="relative">
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap z-50"
          >
            <div
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{
                background: 'rgba(20, 20, 22, 0.95)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08)'
              }}
            >
              {isExpiringSoon ? 'Срок истекает!' : 'Ожидает оплаты'}
            </div>
            {/* Tooltip arrow */}
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45"
              style={{
                background: 'rgba(20, 20, 22, 0.95)'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ripple effects (behind the badge) */}
      {!shouldReduceMotion && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${baseColor} 0%, transparent 70%)`
            }}
            variants={rippleVariants}
            initial="initial"
            animate="animate"
          />
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${lightColor} 0%, transparent 70%)`
            }}
            variants={ripple2Variants}
            initial="initial"
            animate="animate"
          />
        </>
      )}

      {/* Main badge button */}
      <motion.button
        onHoverStart={() => setShowTooltip(true)}
        onHoverEnd={() => setShowTooltip(false)}
        onTapStart={handleTapStart}
        onTap={handleTapEnd}
        onTapCancel={handleTapCancel}
        className="relative w-10 h-10 rounded-full flex items-center justify-center cursor-pointer outline-none touch-manipulation"
        style={{
          background: `linear-gradient(135deg, ${baseColor} 0%, ${lightColor} 100%)`,
          boxShadow: `
            0 4px 12px ${glowColor},
            0 0 20px ${glowColor},
            inset 0 1px 0 rgba(255, 255, 255, 0.25)
          `,
          WebkitTapHighlightColor: 'transparent'
        }}
        variants={shouldReduceMotion ? {} : pulseVariants}
        initial="initial"
        animate="animate"
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
      >
        {/* Clock icon */}
        <svg
          className="w-5 h-5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        {/* Inner glow overlay */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3) 0%, transparent 50%)'
          }}
        />
      </motion.button>

      {/* Badge count indicator (optional, shows if multiple pending) */}
      {order?.count > 1 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{
            background: isExpiringSoon ? '#DC2626' : '#FF6B00',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {order.count > 9 ? '9+' : order.count}
        </motion.div>
      )}
    </div>
  );
});

PendingOrderBadge.propTypes = {
  order: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    count: PropTypes.number
  }),
  onClick: PropTypes.func,
  onLongPress: PropTypes.func,
  isExpiringSoon: PropTypes.bool
};

export default PendingOrderBadge;
