import { motion, AnimatePresence } from 'framer-motion';
import { useState, memo, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTelegram } from '../../hooks/useTelegram';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';
import { usePlatform } from '../../hooks/usePlatform';
import { useTranslation } from '../../i18n/useTranslation';
import { getSpringPreset, getSurfaceStyle, isAndroid } from '../../utils/platform';
import { gpuAccelStyle } from '../../utils/animationHelpers';
import CountdownTimer from '../common/CountdownTimer';

// --- Constants & Helpers ---

const getSurfaceStyles = (platform) => ({
  cardSurface: getSurfaceStyle('glassCard', platform),
  quickSpring: getSpringPreset('quick', platform),
  pressSpring: getSpringPreset('press', platform),
});

// Extract Price Logic
const calculatePriceDetails = (product) => {
  const hasDiscount =
    product.original_price &&
    parseFloat(product.original_price) > 0 &&
    (product.discount_percentage || 0) > 0;
  
  const originalPrice = hasDiscount ? product.original_price : product.price;
  const discountPercentage = hasDiscount ? product.discount_percentage || 0 : 0;
  const isTimerDiscount = hasDiscount && product.discount_expires_at;
  
  const rawPrice = product.price ?? '';
  const priceString = typeof rawPrice === 'number' ? String(rawPrice) : `${rawPrice}`;
  const numericPriceLength = priceString.replace(/[^0-9]/g, '').length;

  let priceSizeClass = 'text-2xl';
  if (numericPriceLength >= 10) priceSizeClass = 'text-base';
  else if (numericPriceLength >= 7) priceSizeClass = 'text-lg';
  else if (numericPriceLength >= 4) priceSizeClass = 'text-xl';

  return {
    hasDiscount,
    originalPrice,
    discountPercentage,
    isTimerDiscount,
    priceSizeClass,
  };
};

// --- Icon Components ---

const PremiumIcon = () => (
  <div className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-100 border border-white/20 bg-white/10 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
    Premium
  </div>
);

const PreorderIcon = () => (
  <div className="w-9 h-9 rounded-full border border-orange-400/50 bg-orange-500/15 flex items-center justify-center shadow-[0_4px_12px_rgba(255,107,0,0.25)]">
    <svg
      className="w-5 h-5 text-orange-300"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.2}
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5" />
    </svg>
  </div>
);

const SyncedBadge = ({ sourceName, t }) => (
  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-400 flex items-center gap-1">
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
    {sourceName ? t('product.syncedFrom', { shop: sourceName }) : t('product.synced')}
  </span>
);

const StockBadge = ({ stock, lowStock }) => (
  <div
    className={`flex items-center gap-1 px-2 py-1 rounded-full border ${
      lowStock ? 'border-orange-400/70 bg-orange-500/12' : 'border-white/12 bg-black/35'
    } shadow-[0_8px_24px_rgba(12,12,12,0.35)] backdrop-blur`}
  >
    <span
      className={`w-1 h-1 rounded-full ${lowStock ? 'bg-orange-400 animate-pulse' : 'bg-emerald-400'}`}
    />
    <span
      className="text-[10px] font-semibold text-white"
      style={{ letterSpacing: '0.08em' }}
    >
      {stock > 999 ? '999+' : stock} шт
    </span>
  </div>
);

const CartIcon = () => (
  <svg
    className="relative w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

// --- Main Component ---

const ProductCard = memo(function ProductCard({ product, onPreorder: _onPreorder, isWide = false }) {
  const { triggerHaptic } = useTelegram();
  const addToCart = useStore((state) => state.addToCart);
  const toast = useToast();
  const platform = usePlatform();
  const android = isAndroid(platform);
  const { t: _t } = useTranslation();
  const highlightProductId = useStore(state => state.highlightProductId);
  const setHighlightProductId = useStore(state => state.setHighlightProductId);
  const cardRef = useRef(null);

  const { cardSurface, quickSpring, pressSpring } = useMemo(
    () => getSurfaceStyles(platform),
    [platform]
  );

  const [isHovered, setIsHovered] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimeoutRef = useRef(null);

  // Cleanup timeout
  useEffect(() => () => {
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
  }, []);

  // Derived State
  const isAvailable = product.isAvailable ?? product.is_available ?? true;
  const stock = product.stock ?? product.stock_quantity ?? 0;
  const availability = product.availability || (isAvailable && stock <= 0 ? 'preorder' : 'stock');
  const isPreorder = availability === 'preorder';
  const isDisabled = !isAvailable || (!isPreorder && stock <= 0);
  const lowStock = stock > 0 && stock <= 3;

  // Price Logic
  const {
    hasDiscount,
    originalPrice,
    discountPercentage,
    isTimerDiscount,
    priceSizeClass,
  } = useMemo(() => calculatePriceDetails(product), [product]);

  // Use strict equality with explicit type conversion for safety
  const isHighlighted = highlightProductId != null && String(highlightProductId) === String(product.id);

  const handleAddToCart = useCallback(
    (event) => {
      event.stopPropagation();
      if (isDisabled) {
        toast.warning('This product is out of stock', 2000);
        return;
      }
      triggerHaptic('success');
      addToCart(product);
      setJustAdded(true);

      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      addedTimeoutRef.current = setTimeout(() => setJustAdded(false), 1500);
    },
    [isDisabled, toast, triggerHaptic, addToCart, product]
  );

  // Scroll to highlighted product + auto-clear after 3s
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
      }, 100);

      const timer = setTimeout(() => {
        setHighlightProductId(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isHighlighted, setHighlightProductId]);

  // Styles
  const backgroundStyle = useMemo(() => ({
    ...gpuAccelStyle,
    ...cardSurface,
    isolation: 'isolate',
    background: hasDiscount
      ? 'linear-gradient(145deg, rgba(255, 71, 87, 0.08) 0%, rgba(255, 107, 53, 0.06) 50%, rgba(26, 26, 26, 0.9) 100%)'
      : 'linear-gradient(145deg, rgba(26, 26, 26, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)',
  }), [hasDiscount, cardSurface]);

  const buttonStyle = useMemo(() => ({
    background: isDisabled
      ? 'rgba(74, 74, 74, 0.5)'
      : 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)',
    boxShadow: isDisabled
      ? 'none'
      : `0 2px 4px rgba(255, 107, 0, 0.25),
         0 4px 12px rgba(255, 107, 0, 0.2),
         inset 0 1px 0 rgba(255, 255, 255, 0.25)`,
  }), [isDisabled]);

  return (
    <motion.div
      {...(!android && {
        onHoverStart: () => setIsHovered(true),
        onHoverEnd: () => setIsHovered(false),
      })}
      whileHover={!android ? { y: -4 } : undefined}
      whileTap={{ scale: android ? 0.99 : 0.98 }}
      transition={quickSpring}
      ref={cardRef}
      className={`relative min-h-[200px] rounded-3xl overflow-hidden group ${
        hasDiscount ? 'ring-2 ring-red-500/50 shadow-[0_0_20px_rgba(255,71,87,0.25)]' : ''
      } ${isHighlighted ? 'ring-2 ring-orange-500 animate-pulse shadow-[0_0_30px_rgba(255,107,0,0.4)]' : ''}`}
      style={backgroundStyle}
    >
      {!android && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(600px circle at center, rgba(255, 107, 0, 0.06), transparent 40%)',
          }}
        />
      )}

      {/* Badges */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {product.isPremium && <PremiumIcon />}
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 items-end">
        {isPreorder ? (
          <PreorderIcon />
        ) : (
          stock > 0 && <StockBadge stock={stock} lowStock={lowStock} />
        )}
      </div>

      {/* Success Animation */}
      <AnimatePresence>
        {justAdded && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center rounded-3xl z-20"
            style={{
              background: android ? 'rgba(0, 0, 0, 0.78)' : 'rgba(0, 0, 0, 0.7)',
              backdropFilter: android ? 'blur(2px)' : 'blur(4px)',
            }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 15 }}
              className="text-5xl"
            >
              ✓
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div
        className={`relative h-full ${isWide ? 'p-6' : 'p-5'} flex ${
          isWide ? 'flex-row items-center gap-5' : 'flex-col gap-3'
        }`}
      >
        <h3
          className={`text-white font-semibold leading-snug ${
            isWide ? 'text-sm mt-1' : 'text-base mt-4'
          }`}
          style={{
            letterSpacing: '-0.02em',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            wordBreak: 'break-word',
            minHeight: isWide ? 'auto' : '2.6em',
          }}
        >
          {product.name}
        </h3>

        <div
          className={`flex items-end mt-auto ${isWide ? 'gap-6 ml-auto' : 'justify-between gap-5'}`}
        >
          <div className="flex flex-col min-w-fit max-w-[calc(100%-60px)]">
            {hasDiscount ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400 line-through font-medium">
                    ${Math.floor(parseFloat(originalPrice))}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">
                    -{Math.round(discountPercentage)}%
                  </span>
                </div>
                <span
                  className={`text-red-500 font-bold leading-tight ${priceSizeClass}`}
                  style={{
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ${Math.floor(parseFloat(product.price))}
                </span>
              </div>
            ) : (
              <span
                className={`text-orange-primary font-bold leading-tight ${priceSizeClass}`}
                style={{
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                ${Math.floor(parseFloat(product.price))}
              </span>
            )}

            {isTimerDiscount ? (
              <div className="mt-1">
                <CountdownTimer expiresAt={product.discount_expires_at} />
              </div>
            ) : (
              <span
                className="mt-1 text-xs uppercase font-medium text-gray-500"
                style={{ letterSpacing: '0.05em' }}
              >
                {product.currency || 'USD'}
              </span>
            )}
          </div>

          <motion.button
            onClick={handleAddToCart}
            disabled={isDisabled}
            whileHover={{
              y: android ? -1 : -2,
              scale: android ? 1.03 : 1.05,
              boxShadow: `
                1px 2px 2px hsl(0deg 0% 0% / 0.4),
                4px 8px 8px hsl(0deg 0% 0% / 0.4),
                8px 16px 16px hsl(0deg 0% 0% / 0.3),
                0 0 40px rgba(255, 107, 0, 0.15)
              `,
            }}
            whileTap={{
              scale: android ? 0.985 : 0.98,
              y: 0,
              boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
            transition={{
              ...pressSpring,
              boxShadow: { duration: 0.18 },
            }}
            className="relative w-[2.75rem] h-[2.75rem] min-w-[2.75rem] min-h-[2.75rem] flex-shrink-0 rounded-xl text-white overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            style={buttonStyle}
          >
            {!isDisabled && !android && (
              <motion.div
                className="absolute inset-0"
                initial={{ x: '-100%', opacity: 0 }}
                whileHover={{ x: '100%', opacity: 0.3 }}
                transition={{ duration: 0.6 }}
                style={{
                  background: 'linear-gradient(90deg, transparent, white, transparent)',
                }}
              />
            )}
            <CartIcon />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
});

export default ProductCard;
