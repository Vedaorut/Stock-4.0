import { motion, useDragControls } from 'framer-motion';
import { memo, useMemo, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { useTelegram } from '../../hooks/useTelegram';
import { usePlatform } from '../../hooks/usePlatform';
import { getSurfaceStyle, getSpringPreset, isAndroid } from '../../utils/platform';
import { gpuAccelStyle } from '../../utils/animationHelpers';

const CartItem = memo(function CartItem({ item }) {
  const { updateCartQuantity, removeFromCart } = useStore(
    useShallow((state) => ({
      updateCartQuantity: state.updateCartQuantity,
      removeFromCart: state.removeFromCart,
    }))
  );
  const { triggerHaptic } = useTelegram();
  const [isDragging, setIsDragging] = useState(false);
  const platform = usePlatform();
  const android = isAndroid(platform);

  // Drag controls для iOS swipe-to-delete
  const dragControls = useDragControls();

  const startDrag = (e) => {
    dragControls.start(e);
  };

  const cardSurface = useMemo(() => getSurfaceStyle('glassCard', platform), [platform]);

  const quickSpring = useMemo(() => getSpringPreset('quick', platform), [platform]);

  const pressSpring = useMemo(() => getSpringPreset('press', platform), [platform]);

  const actionScale = android ? 0.95 : 0.9;

  const handleIncrease = useCallback(() => {
    triggerHaptic('light');
    updateCartQuantity(item.id, item.quantity + 1);
  }, [triggerHaptic, updateCartQuantity, item.id, item.quantity]);

  const handleDecrease = useCallback(() => {
    triggerHaptic('light');
    if (item.quantity > 1) {
      updateCartQuantity(item.id, item.quantity - 1);
    } else {
      removeFromCart(item.id);
    }
  }, [triggerHaptic, updateCartQuantity, removeFromCart, item.id, item.quantity]);

  const handleRemove = useCallback(() => {
    triggerHaptic('medium');
    removeFromCart(item.id);
  }, [triggerHaptic, removeFromCart, item.id]);

  const handleDragEnd = useCallback(
    (event, info) => {
      setIsDragging(false);

      if (info.offset.x < -80) {
        triggerHaptic('warning');
        removeFromCart(item.id);
      }
    },
    [triggerHaptic, removeFromCart, item.id]
  );

  const swipeProps = android
    ? {}
    : {
        drag: 'x',
        dragControls,
        dragListener: false, // КРИТИЧНО: убираем глобальный слушатель
        dragDirectionLock: true,
        dragElastic: 0.08,
        dragMomentum: false,
        dragConstraints: { left: -100, right: 0 },
        onDragEnd: handleDragEnd,
        whileDrag: { scale: 0.985 },
      };

  return (
    <motion.div
      className="relative"
      {...swipeProps}
      style={{ ...gpuAccelStyle, touchAction: android ? 'pan-y' : 'pan-x' }}
      initial={{ opacity: 0, y: android ? 12 : 0, x: android ? 0 : -20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: android ? 12 : 0, x: android ? 0 : 20 }}
      transition={quickSpring}
    >
      {!android && (
        <motion.div
          className="absolute right-0 top-0 h-full w-20 flex items-center justify-center rounded-r-xl"
          style={{
            background: 'linear-gradient(90deg, transparent, #EF4444)',
          }}
          animate={{ opacity: isDragging ? 1 : 0 }}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </motion.div>
      )}

      {/* Drag handle (iOS only) */}
      {!android && (
        <div
          onPointerDown={startDrag}
          className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center cursor-grab active:cursor-grabbing z-20"
          style={{ touchAction: 'none' }}
        >
          <div className="w-1 h-8 rounded-full bg-gray-600 opacity-40" />
        </div>
      )}

      <motion.div className="glass-card rounded-xl p-4 relative z-10" style={cardSurface}>
        <div className="flex gap-4">
          <div className="w-20 h-20 rounded-lg bg-dark-elevated flex-shrink-0 overflow-hidden">
            {item.image ? (
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white line-clamp-2">{item.name}</h4>
              <p className="text-lg font-bold text-orange-primary mt-1">${parseFloat(item.price).toFixed(2)}</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={handleDecrease}
                  className="w-8 h-8 rounded-lg bg-dark-elevated flex items-center justify-center text-white"
                  whileTap={{ scale: actionScale }}
                  transition={pressSpring}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 12H4"
                    />
                  </svg>
                </motion.button>

                <span className="text-white font-semibold min-w-[2rem] text-center">
                  {item.quantity}
                </span>

                <motion.button
                  onClick={handleIncrease}
                  className="w-8 h-8 rounded-lg bg-dark-elevated flex items-center justify-center text-white"
                  whileTap={{ scale: actionScale }}
                  transition={pressSpring}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </motion.button>
              </div>

              <motion.button
                onClick={handleRemove}
                className="text-red-500 hover:text-red-400"
                whileTap={{ scale: actionScale }}
                transition={pressSpring}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

export default CartItem;
