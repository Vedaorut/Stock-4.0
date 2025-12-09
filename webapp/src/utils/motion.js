/**
 * Motion Re-exports for LazyMotion Compatibility
 * 
 * Use `m` instead of `motion` when wrapped in LazyMotion
 * This allows framer-motion to tree-shake unused features
 * 
 * @example
 * // Before (loads full bundle ~125KB)
 * import { motion } from 'framer-motion';
 * 
 * // After (uses LazyMotion from App.jsx ~50KB)
 * import { motion } from '../../utils/motion';
 */

export { m, AnimatePresence, LazyMotion, domAnimation, useReducedMotion, useDragControls } from 'framer-motion';

// Note: useMotionValue, useTransform removed - not used in codebase
// If needed later, import directly from 'framer-motion'
