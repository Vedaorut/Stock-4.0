import { m as motion, AnimatePresence } from 'framer-motion';
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
  // Use discount_active from backend if available (already checks expiration)
  // Fallback to manual check for compatibility
  const now = Date.now();
  const isExpired = product.discount_expires_at && new Date(product.discount_expires_at).getTime() < now;

  const hasDiscount = product.discount_active !== undefined
    ? product.discount_active
    : (product.original_price &&
       parseFloat(product.original_price) > 0 &&
       (product.discount_percentage || 0) > 0 &&
       !isExpired);

  const originalPrice = hasDiscount ? product.original_price : product.price;
  const discountPercentage = hasDiscount ? product.discount_percentage || 0 : 0;
  // Timer discount only when discount is active AND has expiration time
  const isTimerDiscount = hasDiscount && product.discount_expires_at && !isExpired;

  const rawPrice = product.price ?? '';
  const priceString = typeof rawPrice === 'number' ? String(rawPrice) : `${rawPrice}`;
  const numericPriceLength = priceString.replace(/[^0-9]/g, '').length;

  // Adaptive font sizing for "Clean Luxury" layout
  let priceSizeClass = 'text-xl'; // Default
  if (numericPriceLength >= 9) priceSizeClass = 'text-sm';
  else if (numericPriceLength >= 7) priceSizeClass = 'text-base';
  else if (numericPriceLength >= 5) priceSizeClass = 'text-lg';

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
  <div
    className="relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden"
    style={{
      background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.2) 0%, rgba(255, 140, 66, 0.15) 100%)',
      boxShadow: `
        0 0 0 1px rgba(255, 107, 0, 0.3),
        0 4px 16px rgba(255, 107, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1)
      `,
      backdropFilter: 'blur(8px)',
    }}
  >
    {/* Subtle inner glow */}
    <div
      className="absolute inset-0 opacity-50"
      style={{
        background: 'radial-gradient(circle at 30% 30%, rgba(255, 140, 66, 0.3) 0%, transparent 60%)',
      }}
    />
    <svg
      className="relative w-[18px] h-[18px] text-orange-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
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

const StockBadge = ({ stock, lowStock, pcsLabel }) => (
  <div
    className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg overflow-hidden"
    style={{
      background: lowStock
        ? 'linear-gradient(135deg, rgba(255, 107, 0, 0.18) 0%, rgba(255, 140, 66, 0.12) 100%)'
        : 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)',
      boxShadow: lowStock
        ? `0 0 0 1px rgba(255, 107, 0, 0.35), 0 4px 12px rgba(255, 107, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)`
        : `0 0 0 1px rgba(34, 197, 94, 0.25), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06)`,
      backdropFilter: 'blur(8px)',
    }}
  >
    {/* Subtle highlight */}
    <div
      className="absolute inset-0 opacity-40"
      style={{
        background: lowStock
          ? 'radial-gradient(ellipse at 20% 20%, rgba(255, 140, 66, 0.25) 0%, transparent 50%)'
          : 'radial-gradient(ellipse at 20% 20%, rgba(34, 197, 94, 0.2) 0%, transparent 50%)',
      }}
    />
    {/* Status dot */}
    <span
      className={`relative w-1.5 h-1.5 rounded-full ${lowStock ? 'bg-orange-400' : 'bg-emerald-400'}`}
      style={{
        boxShadow: lowStock
          ? '0 0 6px rgba(255, 107, 0, 0.6)'
          : '0 0 6px rgba(34, 197, 94, 0.5)',
        animation: lowStock ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
      }}
    />
    {/* Stock text */}
    <span
      className={`relative text-[10px] font-semibold ${lowStock ? 'text-orange-200' : 'text-emerald-200'}`}
      style={{ letterSpacing: '0.06em' }}
    >
      {stock > 999 ? '999+' : stock} {pcsLabel}
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
  const { t } = useTranslation();
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
      className={`relative h-[200px] rounded-3xl overflow-hidden group ${hasDiscount ? 'ring-2 ring-red-500/50 shadow-[0_0_20px_rgba(255,71,87,0.25)]' : ''
        } ${isHighlighted ? 'ring-4 ring-white z-10 shadow-[0_0_60px_rgba(255,255,255,0.8),0_0_100px_rgba(255,255,255,0.4)] animate-[highlight-glow_1s_ease-in-out_infinite]' : ''}`}
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

      {/* Left badges */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {product.isPremium && <PremiumIcon />}
        {/* Stock badge moves to left when timer discount is active */}
        {isTimerDiscount && !isPreorder && stock > 0 && (
          <StockBadge stock={stock} lowStock={lowStock} pcsLabel={t('shopOrders.labels.pcs')} />
        )}
      </div>

      {/* Right badges */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 items-end">
        {isTimerDiscount && (
          <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-red-500/30 shadow-lg flex items-center justify-center">
            <CountdownTimer expiresAt={product.discount_expires_at} />
          </div>
        )}
        {isPreorder ? (
          <PreorderIcon />
        ) : (
          /* Stock badge in right corner only when NO timer discount */
          !isTimerDiscount && stock > 0 && <StockBadge stock={stock} lowStock={lowStock} pcsLabel={t('shopOrders.labels.pcs')} />
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
        className={`relative h-full ${isWide ? 'p-6' : 'p-5'} flex ${isWide ? 'flex-row items-center gap-5' : 'flex-col gap-3'
          }`}
      >
        <h3
          className={`text-white font-semibold leading-snug flex-shrink-0 ${isWide ? 'text-sm mt-1' : 'text-[15px] mt-4'
            }`}
          style={{
            letterSpacing: '-0.02em',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            wordBreak: 'break-word',
            height: isWide ? 'auto' : '2.4em',
            lineHeight: '1.2',
          }}
        >
          {product.name}
        </h3>

        <div
          className={`flex items-end mt-auto ${isWide ? 'gap-4 ml-auto' : 'justify-between gap-3'}`}
        >
          {/* Price section */}
          <div className="flex flex-col justify-end flex-1 min-w-0">
            {hasDiscount ? (
              <div className="flex flex-col justify-end h-full">
                {/* Old Price + Badge Row */}
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-[11px] text-gray-400 line-through font-medium whitespace-nowrap">
                    ${Math.floor(parseFloat(originalPrice))}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold bg-red-500/90 text-white shadow-sm backdrop-blur-sm whitespace-nowrap">
                    -{Math.round(discountPercentage)}%
                  </span>
                </div>
                {/* Current price */}
                <span
                  className={`text-red-500 font-bold leading-tight ${priceSizeClass} whitespace-nowrap`}
                  style={{
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ${parseFloat(product.price) % 1 === 0 ? Math.floor(parseFloat(product.price)) : parseFloat(product.price).toFixed(2)}
                </span>

                <span
                  className="mt-0.5 text-[10px] uppercase font-medium text-gray-500"
                  style={{ letterSpacing: '0.05em' }}
                >
                  {product.currency || 'USD'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col justify-end h-full">
                <span
                  className={`text-orange-primary font-bold leading-tight ${priceSizeClass}`}
                  style={{
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    wordBreak: 'break-word',
                  }}
                >
                  ${parseFloat(product.price) % 1 === 0 ? Math.floor(parseFloat(product.price)) : parseFloat(product.price).toFixed(2)}
                </span>
                <span
                  className="mt-1 text-[10px] uppercase font-medium text-gray-500"
                  style={{ letterSpacing: '0.05em' }}
                >
                  {product.currency || 'USD'}
                </span>
              </div>
            )}
          </div>

          {/* Add to cart button - ALWAYS aligned to bottom */}
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
            <CartIcon />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
});

export default ProductCard;
