import { motion } from 'framer-motion';

/**
 * Refined Dark Header
 *
 * Design direction: Industrial Luxury
 * - Subtle gradient backdrop with noise texture
 * - Glassmorphism with controlled blur
 * - Geometric accent line (animated on mount)
 * - Clean typography with proper weight hierarchy
 */
export default function Header({ title, subtitle, showAccent = true }) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
        backgroundColor: '#181818',
      }}
    >
      {/* Background extension to cover area above safe-area-inset (for overscroll) */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          top: '-200px',
          height: '200px',
          background: '#181818',
        }}
      />

      {/* Main header content */}
      <div
        className="flex items-center justify-center px-5 relative"
        style={{ height: '56px' }}
      >
        {/* Decorative side accents */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-30">
          <span className="w-1 h-1 rounded-full bg-orange-primary" />
          <span className="w-0.5 h-0.5 rounded-full bg-white/50" />
        </div>

        {/* Title block */}
        <div className="flex flex-col items-center justify-center">
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
              delay: 0.05
            }}
            className="text-[22px] font-bold text-white tracking-tight"
            style={{
              letterSpacing: '-0.025em',
              fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            }}
          >
            {title}
          </motion.h1>

          {subtitle && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-[11px] text-gray-500 font-medium uppercase tracking-widest mt-0.5"
            >
              {subtitle}
            </motion.p>
          )}
        </div>

        {/* Decorative side accents (right) */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-30">
          <span className="w-0.5 h-0.5 rounded-full bg-white/50" />
          <span className="w-1 h-1 rounded-full bg-orange-primary" />
        </div>
      </div>

      {/* Bottom accent line - animated geometric element */}
      {showAccent && (
        <div className="relative h-[1px] overflow-hidden">
          {/* Base line */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent" />

          {/* Animated accent */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.2
            }}
            className="absolute left-1/2 -translate-x-1/2 w-24 h-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #FF6B00 50%, transparent 100%)',
            }}
          />
        </div>
      )}

      {/* Subtle shadow for depth */}
      <div
        className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none -z-10"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 100%)',
        }}
      />
    </header>
  );
}
