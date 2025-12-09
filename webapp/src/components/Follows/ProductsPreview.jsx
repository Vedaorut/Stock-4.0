import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFollowsApi } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/useTranslation';

/**
 * Compact products preview for FollowCard
 * Shows products with prices - works for both monitor and resell modes
 * Wrapped in memo to prevent re-renders when parent updates
 */
function ProductsPreview({ followId, mode, maxProducts = 5 }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [responseMode, setResponseMode] = useState(null);
  const { getProducts } = useFollowsApi();
  const { t } = useTranslation();
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!followId) {
      setProducts([]);
      return;
    }

    // Abort previous request
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    controllerRef.current = new AbortController();

    setLoading(true);

    getProducts(followId, { signal: controllerRef.current.signal })
      .then((response) => {
        if (controllerRef.current?.signal?.aborted) return;

        const data = response?.data?.data || response?.data;
        const productsList = data?.products || [];
        setProducts(Array.isArray(productsList) ? productsList.slice(0, maxProducts) : []);
        setTotalCount(data?.pagination?.total || productsList.length || 0);
        setResponseMode(data?.mode || mode);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (import.meta.env.DEV) {
          console.error('[ProductsPreview] Error:', err);
        }
      })
      .finally(() => {
        if (!controllerRef.current?.signal?.aborted) {
          setLoading(false);
        }
      });

    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, [followId, mode, maxProducts, getProducts]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="mt-3 space-y-1.5">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-7 rounded-lg bg-white/[0.03] animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    );
  }

  // No products
  if (products.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        className="mt-3 space-y-1.5"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
      >
        {products.map((product, index) => {
          // Handle both monitor and resell modes
          const isResell = responseMode === 'resell';
          const productName = isResell
            ? (product.synced_product?.name || product.source_product?.name || product.name)
            : product.name;
          const originalPrice = isResell ? (product.source_product?.price || product.original_price) : null;
          const currentPrice = isResell
            ? (product.synced_product?.price || product.price)
            : product.price;
          const hasCustomMarkup = product.pricing?.has_custom_markup;
          const stock = product.stock ?? product.quantity;

          return (
            <motion.div
              key={product.id || index}
              className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/[0.03] border border-white/5"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs text-white/60 truncate">
                  {productName}
                </span>
                {hasCustomMarkup && (
                  <span className="flex-shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    {t('followDetail.ownMarkup')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {/* Monitor mode: show stock count */}
                {!isResell && stock !== undefined && (
                  <span className="text-[10px] text-white/40">
                    ×{stock}
                  </span>
                )}
                {/* Resell mode: show price comparison */}
                {isResell && originalPrice && (
                  <>
                    <span className="text-[10px] text-white/30 line-through">
                      ${Math.floor(parseFloat(originalPrice))}
                    </span>
                    <span className="text-[10px] text-[#FF6B00]">→</span>
                  </>
                )}
                <span className={`text-xs font-semibold ${isResell ? 'text-[#2ECC71]' : 'text-white/70'}`}>
                  ${Math.floor(parseFloat(currentPrice || 0))}
                </span>
              </div>
            </motion.div>
          );
        })}

        {/* Show "more" indicator */}
        {totalCount > maxProducts && (
          <div className="text-center pt-0.5">
            <span className="text-[10px] text-white/30">
              +{totalCount - maxProducts} {t('common.more')}
            </span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(ProductsPreview);
