import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTelegram } from '../../hooks/useTelegram';
import { useStore } from '../../store/useStore';

export default function ProductCard({ product }) {
  const { triggerHaptic } = useTelegram();
  const { addToCart } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  const handleAddToCart = (e) => {
    e.stopPropagation();
    triggerHaptic('medium');
    addToCart(product);
  };

  return (
    <motion.div
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="relative h-[180px] rounded-3xl overflow-hidden group"
      style={{
        background: 'linear-gradient(145deg, rgba(26, 26, 26, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)',
        backdropFilter: 'blur(12px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: `
          1px 2px 2px hsl(0deg 0% 0% / 0.333),
          2px 4px 4px hsl(0deg 0% 0% / 0.333),
          3px 6px 6px hsl(0deg 0% 0% / 0.333),
          0 0 0 1px rgba(255, 255, 255, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.06)
        `
      }}
    >
      {/* Subtle orange gradient overlay on hover */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{
          background: `radial-gradient(600px circle at center, rgba(255, 107, 0, 0.06), transparent 40%)`
        }}
      />

      <div className="relative p-5 h-full flex flex-col justify-between">
        {/* Product Name */}
        <h3
          className="text-white font-semibold text-lg leading-tight line-clamp-2"
          style={{ letterSpacing: '-0.01em' }}
        >
          {product.name}
        </h3>

        {/* Price and Button */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex flex-col">
            <span
              className="text-orange-primary font-bold text-2xl"
              style={{
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              ${product.price}
            </span>
            <span
              className="text-gray-500 text-xs uppercase font-medium"
              style={{ letterSpacing: '0.05em' }}
            >
              {product.currency || 'USD'}
            </span>
          </div>

          <motion.button
            onClick={handleAddToCart}
            disabled={!product.isAvailable || product.stock === 0}
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="relative w-11 h-11 rounded-xl text-white overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            style={{
              background: !product.isAvailable || product.stock === 0
                ? 'rgba(74, 74, 74, 0.5)'
                : 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)',
              boxShadow: !product.isAvailable || product.stock === 0
                ? 'none'
                : `
                  0 2px 4px rgba(255, 107, 0, 0.25),
                  0 4px 12px rgba(255, 107, 0, 0.2),
                  inset 0 1px 0 rgba(255, 255, 255, 0.25)
                `
            }}
          >
            {/* Shine effect on hover */}
            {(!product.isAvailable || product.stock === 0) ? null : (
              <motion.div
                className="absolute inset-0"
                initial={{ x: '-100%', opacity: 0 }}
                whileHover={{ x: '100%', opacity: 0.3 }}
                transition={{ duration: 0.6 }}
                style={{
                  background: 'linear-gradient(90deg, transparent, white, transparent)'
                }}
              />
            )}
            <svg
              className="relative w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
