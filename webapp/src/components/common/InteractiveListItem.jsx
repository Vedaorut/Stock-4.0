import { motion } from 'framer-motion';
import { forwardRef } from 'react';

const MotionButton = motion.button;

const variants = {
  rest: {
    background: 'transparent',
    scale: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    transition: { type: 'spring', stiffness: 320, damping: 26 },
  },
  hover: {
    background: 'rgba(255, 255, 255, 0.05)',
    scale: 1.005,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    transition: { type: 'spring', stiffness: 260, damping: 20 },
  },
  press: {
    scale: 0.985,
    borderColor: 'rgba(255, 111, 41, 0.4)',
    boxShadow: 'inset 0 8px 18px rgba(0, 0, 0, 0.35)',
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 32,
      mass: 0.8,
    },
  },
};

const highlightVariants = {
  rest: { opacity: 0, scale: 0.92 },
  hover: { opacity: 0.28, scale: 1, transition: { duration: 0.25 } },
  press: { opacity: 0.4, scale: 1.02, transition: { duration: 0.2 } },
};

const rippleVariants = {
  rest: { scale: 0, opacity: 0 },
  press: {
    scale: 1.25,
    opacity: [0.2, 0.08, 0],
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

function InteractiveListItem(
  {
    as = MotionButton,
    children,
    className = '',
    rippleColor = 'rgba(255, 140, 66, 0.35)',
    ...props
  },
  ref
) {
  const WrapperComponent = as;

  return (
    <WrapperComponent
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      initial="rest"
      whileHover="hover"
      whileTap="press"
      variants={variants}
      {...props}
    >
      <motion.span
        className="absolute inset-0 pointer-events-none rounded-2xl"
        variants={highlightVariants}
      />

      <motion.span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${rippleColor} 0%, transparent 70%)`,
        }}
        variants={rippleVariants}
      />

      <div className="relative z-10 flex items-center gap-4">{children}</div>
    </WrapperComponent>
  );
}

export default forwardRef(InteractiveListItem);
