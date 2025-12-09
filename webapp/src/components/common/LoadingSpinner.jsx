import { memo } from 'react';
import { motion } from 'framer-motion';

/**
 * LoadingSpinner - Standardized loading indicator component
 *
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl' (default: 'md')
 * @param {string} color - 'orange' | 'white' | 'gray' (default: 'orange')
 * @param {boolean} fullScreen - Whether to show as fullscreen overlay
 * @param {string} text - Optional loading text to display
 * @param {string} className - Additional CSS classes
 */

const sizes = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
  xl: 'w-16 h-16 border-4',
};

const colors = {
  orange: 'border-orange-primary border-t-transparent',
  white: 'border-white border-t-transparent',
  gray: 'border-gray-400 border-t-transparent',
};

const LoadingSpinner = memo(function LoadingSpinner({
  size = 'md',
  color = 'orange',
  fullScreen = false,
  text = null,
  className = '',
}) {
  const spinnerClasses = `${sizes[size] || sizes.md} ${colors[color] || colors.orange} rounded-full animate-spin`;

  if (fullScreen) {
    return (
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="text-center">
          <div className={`${spinnerClasses} mx-auto mb-4`} />
          {text && (
            <p className="text-white font-semibold text-lg">{text}</p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={spinnerClasses} />
      {text && (
        <p className="text-gray-400 text-sm mt-3">{text}</p>
      )}
    </div>
  );
});

/**
 * LoadingSkeleton - Skeleton placeholder for content
 *
 * @param {string} variant - 'text' | 'card' | 'avatar' | 'button'
 * @param {number} count - Number of skeleton items
 * @param {string} className - Additional CSS classes
 */
export const LoadingSkeleton = memo(function LoadingSkeleton({
  variant = 'text',
  count = 1,
  className = '',
}) {
  const variants = {
    text: 'h-4 bg-white/10 rounded',
    card: 'h-24 bg-white/10 rounded-xl',
    avatar: 'w-10 h-10 bg-white/10 rounded-full',
    button: 'h-12 bg-white/10 rounded-xl',
    row: 'h-16 bg-white/10 rounded-xl',
  };

  const baseClass = variants[variant] || variants.text;

  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${baseClass} animate-pulse shimmer-effect`}
          style={{
            animationDelay: `${i * 100}ms`,
            width: variant === 'text' ? `${Math.random() * 40 + 60}%` : '100%',
          }}
        />
      ))}
    </div>
  );
});

/**
 * InlineLoader - Small inline loading indicator
 *
 * @param {string} text - Loading text
 * @param {string} size - 'xs' | 'sm' (default: 'sm')
 */
export const InlineLoader = memo(function InlineLoader({
  text = 'Loading...',
  size = 'sm',
}) {
  const sizeClass = size === 'xs' ? 'w-3 h-3 border' : 'w-4 h-4 border-2';

  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeClass} border-orange-primary border-t-transparent rounded-full animate-spin`} />
      <span className={`text-gray-400 ${size === 'xs' ? 'text-xs' : 'text-sm'}`}>{text}</span>
    </div>
  );
});

/**
 * ListLoadingState - Standard loading state for list views
 */
export const ListLoadingState = memo(function ListLoadingState({ itemCount = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: itemCount }).map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
            <div className="h-6 w-16 bg-white/10 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
});

export default LoadingSpinner;
