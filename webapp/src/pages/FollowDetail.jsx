import { useCallback, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Layout/Header';
import ActionsList from '../components/Follows/ActionsList';
import ConfirmDialog from '../components/Follows/ConfirmDialog';
import MarkupSliderModal from '../components/Follows/MarkupSliderModal';
import ProductMarkupModal from '../components/Follows/ProductMarkupModal';
import { useFollowsApi, invalidateCache } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useBackButton } from '../hooks/useBackButton';
import { useTranslation } from '../i18n/useTranslation';
import { useToast } from '../hooks/useToast';

export default function FollowDetail() {
  const followDetailId = useStore((state) => state.followDetailId);
  const { getDetail, updateMarkup, switchMode, deleteFollow, getProducts, updateProductMarkup, resetProductMarkup } = useFollowsApi();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [follow, setFollow] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(null);

  // Modal states
  const [isMarkupModalOpen, setIsMarkupModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSwitchModeDialogOpen, setIsSwitchModeDialogOpen] = useState(false);
  const [isProductMarkupModalOpen, setIsProductMarkupModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // AbortController for retry requests
  const retryControllerRef = useRef(null);
  
  // P1-2 FIX: Track current followId to prevent race conditions
  // This ref always holds the latest followDetailId for validation
  const currentFollowIdRef = useRef(followDetailId);

  // P1-1 FIX: Keep follow data in ref for stable access during async operations
  // Moved BEFORE functions that use it to fix undefined reference
  const followRef = useRef(follow);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryControllerRef.current) {
        retryControllerRef.current.abort();
      }
    };
  }, []);

  // Load follow data - defined BEFORE handleRetry that uses it
  const loadFollow = useCallback(
    async (signal) => {
      if (!followDetailId) return { status: 'error', error: 'No follow ID' };

      // P1-2 FIX: Capture followId at start of request
      const requestFollowId = followDetailId;

      const response = await getDetail(followDetailId, { signal });

      if (signal?.aborted) return { status: 'aborted' };

      // P1-2 FIX: Validate followId hasn't changed during request
      if (currentFollowIdRef.current !== requestFollowId) {
        if (import.meta.env.DEV) {
          console.log('[FollowDetail] Ignoring stale follow response', {
            requested: requestFollowId,
            current: currentFollowIdRef.current,
          });
        }
        return { status: 'aborted' };
      }

      if (response.error) {
        if (import.meta.env.DEV) {
          console.error('[FollowDetail] Error loading follow:', response.error);
        }
        return { status: 'error', error: 'Failed to load subscription' };
      }

      const followData = response.data?.data || response.data;
      setFollow(followData);
      return { status: 'success' };
    },
    [followDetailId, getDetail]
  );

  // Load products for this follow - defined BEFORE handleRetry that uses it
  const loadProducts = useCallback(
    async (signal) => {
      if (!followDetailId) return;

      // P1-2 FIX: Capture followId at start of request
      const requestFollowId = followDetailId;

      setProductsLoading(true);
      setProductsError(null);
      try {
        const response = await getProducts(followDetailId, { signal });
        if (signal?.aborted) return;

        // P1-2 FIX: Validate followId hasn't changed during request
        if (currentFollowIdRef.current !== requestFollowId) {
          if (import.meta.env.DEV) {
            console.log('[FollowDetail] Ignoring stale products response', {
              requested: requestFollowId,
              current: currentFollowIdRef.current,
            });
          }
          return;
        }

        if (response.error) {
          if (import.meta.env.DEV) {
            console.error('[FollowDetail] Error loading products:', response.error);
          }
          setProductsError(t('followDetail.productsLoadError') || 'Failed to load products');
          setProducts([]);
          return;
        }

        const productsData = response.data?.data?.products || response.data?.products || [];
        setProducts(Array.isArray(productsData) ? productsData : []);
        setProductsError(null);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[FollowDetail] Error loading products:', err);
        }
        if (!signal?.aborted && currentFollowIdRef.current === requestFollowId) {
          setProductsError(t('followDetail.productsLoadError') || 'Failed to load products');
          setProducts([]);
        }
      } finally {
        if (!signal?.aborted && currentFollowIdRef.current === requestFollowId) {
          setProductsLoading(false);
        }
      }
    },
    [followDetailId, getProducts, t]
  );

  // Handle retry with AbortController - uses loadFollow and loadProducts
  const handleRetry = useCallback(() => {
    // Cancel any in-flight retry request
    if (retryControllerRef.current) {
      retryControllerRef.current.abort();
    }
    retryControllerRef.current = new AbortController();

    // P1-3 FIX: Invalidate cache on retry to ensure fresh data
    if (followDetailId) {
      invalidateCache(`/follows/${followDetailId}`);
    }

    setIsLoading(true);
    setError(null);

    loadFollow(retryControllerRef.current.signal)
      .then((result) => {
        if (result?.status === 'aborted') return;
        if (result?.status === 'error') {
          setError(result.error);
          setFollow(null);
        } else if (result?.status === 'success') {
          loadProducts(retryControllerRef.current?.signal);
        }
      })
      .finally(() => {
        if (!retryControllerRef.current?.signal?.aborted) {
          setIsLoading(false);
        }
      });
  }, [followDetailId, loadFollow, loadProducts]);

  // Back button handler
  const handleBack = useCallback(() => {
    // Check if any modal is open and close it first
    if (isMarkupModalOpen) {
      setIsMarkupModalOpen(false);
      return;
    }
    if (isSwitchModeDialogOpen) {
      setIsSwitchModeDialogOpen(false);
      return;
    }
    if (isDeleteDialogOpen) {
      setIsDeleteDialogOpen(false);
      return;
    }
    if (isProductMarkupModalOpen) {
      setIsProductMarkupModalOpen(false);
      setSelectedProduct(null);
      return;
    }

    triggerHaptic('light');
    useStore.getState().setFollowDetailId(null);
  }, [triggerHaptic, isMarkupModalOpen, isSwitchModeDialogOpen, isDeleteDialogOpen, isProductMarkupModalOpen]);

  // Telegram BackButton integration
  useBackButton(handleBack);

  useEffect(() => {
    if (!followDetailId) {
      setIsLoading(false);
      return;
    }

    // P1-2 FIX: Update ref immediately to track current followId
    currentFollowIdRef.current = followDetailId;

    // CRITICAL FIX: Clear state when switching between follows
    // This prevents showing products from previous follow
    setProducts([]);
    setFollow(null);
    setProductsError(null);
    setIsLoading(true);
    setError(null);

    // P1-3 FIX: Invalidate cache for this follow to ensure fresh data
    invalidateCache(`/follows/${followDetailId}`);

    const controller = new AbortController();
    const requestFollowId = followDetailId; // Capture for closure

    loadFollow(controller.signal)
      .then((result) => {
        // P1-2 FIX: Double-check followId hasn't changed during request
        if (currentFollowIdRef.current !== requestFollowId) {
          if (import.meta.env.DEV) {
            console.log('[FollowDetail] Ignoring stale follow response', {
              requested: requestFollowId,
              current: currentFollowIdRef.current,
            });
          }
          return;
        }

        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
          setFollow(null);
        } else if (!controller.signal.aborted && result?.status === 'success') {
          loadProducts(controller.signal);
        }
      })
      .finally(() => {
        // Only update loading state if this is still the current request
        if (!controller.signal.aborted && currentFollowIdRef.current === requestFollowId) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [followDetailId, loadFollow, loadProducts]);

  // Handle markup update (also switches mode to resell if needed)
  const handleUpdateMarkup = useCallback(
    async (markupData) => {
      if (!followDetailId || !follow) return;

      triggerHaptic('medium');

      try {
        // If currently in monitor mode, switch to resell with markup
        if (follow.mode === 'monitor') {
          const response = await switchMode(followDetailId, 'resell', markupData);
          const followData = response?.data?.data || response?.data;
          if (followData) {
            setFollow(followData);
            // P1-1 FIX: followRef.current is auto-synced via useEffect
          } else {
            setFollow((prev) => ({
              ...prev,
              mode: 'resell',
              markup_type: markupData.markupType,
              markup_percentage: markupData.markupPercentage,
              markup_fixed: markupData.markupFixed,
            }));
          }
        } else {
          // Already in resell mode, just update markup
          const response = await updateMarkup(followDetailId, markupData);
          const followData = response?.data?.data || response?.data;
          if (followData) {
            setFollow(followData);
          } else {
            setFollow((prev) => ({
              ...prev,
              markup_type: markupData.markupType,
              markup_percentage: markupData.markupPercentage,
              markup_fixed: markupData.markupFixed,
            }));
          }
        }
        triggerHaptic('success');
        // Reload products to update prices with new markup
        await loadProducts();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[FollowDetail] Error updating markup:', err);
        }
        triggerHaptic('error');
        showToast(t('follows.markupError') || 'Failed to update markup', 'error');
      }
    },
    [followDetailId, follow, updateMarkup, switchMode, triggerHaptic, loadProducts, showToast, t]
  );

  // Handle mode switch
  // P1-1 FIX: Removed manual followRef assignments, P3-6: Removed debug logs
  const handleSwitchMode = useCallback(async () => {
    const currentFollowId = followDetailId || useStore.getState().followDetailId;
    const currentFollow = followRef.current;

    if (!currentFollowId || !currentFollow) return;

    const newMode = currentFollow.mode === 'monitor' ? 'resell' : 'monitor';
    triggerHaptic('medium');

    // Resell: open markup modal (API call happens when user saves)
    if (newMode === 'resell') {
      setIsMarkupModalOpen(true);
      return;
    }

    // Monitor: call API directly
    try {
      const response = await switchMode(currentFollowId, newMode, null);
      const followData = response?.data?.data || response?.data;

      if (followData) {
        setFollow(followData);
      } else {
        setFollow((prev) => ({ ...prev, mode: newMode }));
      }
      // Reload products to show source shop products in monitor mode
      await loadProducts();
      triggerHaptic('success');
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[FollowDetail] Error switching mode:', err);
      }
      triggerHaptic('error');
      showToast(t('follows.modeError') || 'Failed to switch mode', 'error');
    }
  }, [followDetailId, follow, switchMode, triggerHaptic, loadProducts, showToast, t]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!followDetailId) return;
    triggerHaptic('medium');
    try {
      await deleteFollow(followDetailId);
      triggerHaptic('success');
      useStore.getState().setFollowDetailId(null);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[FollowDetail] Error deleting follow:', err);
      }
      triggerHaptic('error');
      showToast(t('follows.deleteError') || 'Failed to delete follow', 'error');
    }
  }, [followDetailId, deleteFollow, triggerHaptic, showToast, t]);

  // Handle product click for individual markup
  const handleProductClick = useCallback((product) => {
    triggerHaptic('light');
    setSelectedProduct(product);
    setIsProductMarkupModalOpen(true);
  }, [triggerHaptic]);

  // Handle update product markup
  const handleUpdateProductMarkup = useCallback(
    async (markupData) => {
      if (!followDetailId || !selectedProduct) return;

      triggerHaptic('medium');
      try {
        const productId = selectedProduct.synced_product?.id || selectedProduct.id;
        await updateProductMarkup(followDetailId, productId, markupData);
        triggerHaptic('success');
        // Reload products to see updated price
        loadProducts();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[FollowDetail] Error updating product markup:', err);
        }
        triggerHaptic('error');
        showToast(t('follows.productMarkupError') || 'Failed to update product markup', 'error');
      }
    },
    [followDetailId, selectedProduct, updateProductMarkup, triggerHaptic, loadProducts, showToast, t]
  );

  // Handle reset product markup
  const handleResetProductMarkup = useCallback(async () => {
    if (!followDetailId || !selectedProduct) return;

    triggerHaptic('medium');
    try {
      const productId = selectedProduct.synced_product?.id || selectedProduct.id;
      await resetProductMarkup(followDetailId, productId);
      triggerHaptic('success');
      // Reload products to see updated price
      loadProducts();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[FollowDetail] Error resetting product markup:', err);
      }
      triggerHaptic('error');
      showToast(t('follows.productMarkupError') || 'Failed to reset product markup', 'error');
    }
  }, [followDetailId, selectedProduct, resetProductMarkup, triggerHaptic, loadProducts, showToast, t]);

  // Get display values
  const shopName = follow?.source_shop_name || follow?.shop_name || 'Loading...';
  const mode = follow?.mode || 'monitor';
  const markupType = follow?.markup_type || 'percentage';
  const markupPercentage = follow?.markup_percentage ?? 25;
  const markupFixed = follow?.markup_fixed ?? 0;
  const displayMarkup = markupType === 'percentage' ? markupPercentage : markupFixed;
  const isResellMode = mode === 'resell';

  return (
    <div
      className="min-h-full bg-[#181818]"
      style={{
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <Header title={shopName} />

      <div className="px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-semibold text-white/50 mb-4">{error}</h3>
            <motion.button
              onClick={handleRetry}
              className="bg-[#FF6B00] text-white font-semibold px-6 py-2 rounded-xl"
              whileTap={{ scale: 0.95 }}
            >
              {t('followDetail.tryAgain')}
            </motion.button>
          </div>
        ) : follow ? (
          <>
            {/* Shop Info Card - Compact */}
            <motion.div
              className="relative overflow-hidden rounded-2xl border border-white/10 p-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent" />

              <div className="relative flex items-center gap-4">
                {/* Shop Avatar */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF6B00] to-[#FF8F00] shadow-lg shadow-[#FF6B00]/20 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                  {shopName.charAt(0).toUpperCase()}
                </div>

                {/* Shop Info */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-bold text-lg truncate">{shopName}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${mode === 'resell'
                        ? 'bg-[#FF6B00]/10 text-[#FF6B00] border-[#FF6B00]/20'
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}
                    >
                      {mode === 'resell' ? t('followDetail.resale') : t('followDetail.monitor')}
                    </span>
                    {isResellMode && (
                      <span className="text-[#2ECC71] text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2ECC71]/10 border border-[#2ECC71]/20">
                        +{markupType === 'percentage' ? `${markupPercentage}%` : `$${markupFixed}`}
                      </span>
                    )}
                    <span className="text-white/40 text-xs">
                      {t('followDetail.productsCount', { count: products.length })}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Actions List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <ActionsList
                mode={mode}
                markup={displayMarkup}
                markupType={markupType}
                onEditMarkup={() => {
                  if (!isResellMode) return;
                  triggerHaptic('light');
                  setIsMarkupModalOpen(true);
                }}
                onSwitchMode={() => {
                  triggerHaptic('light');
                  setIsSwitchModeDialogOpen(true);
                }}
                onDelete={() => {
                  triggerHaptic('light');
                  setIsDeleteDialogOpen(true);
                }}
              />
            </motion.div>

            {/* Products Section - show in BOTH modes */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">{t('followDetail.products')}</h3>
                <span className="text-white/40 text-sm">{products.length} {t('followDetail.pcs')}</span>
              </div>

              {productsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : productsError ? (
                <div className="bg-red-500/10 rounded-2xl p-6 text-center border border-red-500/20">
                  <div className="text-red-400 text-sm mb-3">{productsError}</div>
                  <motion.button
                    onClick={() => loadProducts()}
                    className="px-4 py-2 bg-[#FF6B00] text-white text-sm font-semibold rounded-xl"
                    whileTap={{ scale: 0.95 }}
                  >
                    {t('common.retry')}
                  </motion.button>
                </div>
              ) : products.length === 0 ? (
                <div className="bg-white/5 rounded-2xl p-6 text-center border border-white/5">
                  <div className="text-white/30 text-sm">
                    {isResellMode ? t('followDetail.noSyncedProducts') : t('followDetail.noProducts')}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {products.map((product) => {
                    // FIX: Robust data fallback for Monitor mode vs Resell mode
                    const isMonitor = !isResellMode;

                    // Name: Try synced -> source -> direct
                    const productName = product.synced_product?.name || product.source_product?.name || product.name || 'Unknown Product';

                    // Price: Try synced -> source -> direct
                    // In monitor mode, we might just have 'price' on the product object itself if it's a raw listing
                    const rawOriginalPrice = product.source_product?.price || product.original_price || product.price || 0;
                    const originalPrice = parseFloat(rawOriginalPrice);

                    // Current Price (what we sell for): 
                    // In resell mode: synced_product.price
                    // In monitor mode: same as original
                    const rawCurrentPrice = product.synced_product?.price || product.price || originalPrice;
                    const currentPrice = parseFloat(rawCurrentPrice);

                    // Stock:
                    const stockQty = product.synced_product?.stock_quantity ?? product.source_product?.stock_quantity ?? product.stock_quantity ?? 0;

                    return (
                      <motion.div
                        key={product.id}
                        onClick={isResellMode ? () => handleProductClick(product) : undefined}
                        className={`bg-white/5 rounded-2xl p-4 border border-white/5 transition-colors ${isResellMode ? 'hover:bg-white/[0.07] cursor-pointer active:scale-[0.98]' : ''
                          }`}
                        whileTap={isResellMode ? { scale: 0.98 } : undefined}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-center gap-2">
                              <h4 className="text-white font-medium text-sm truncate">
                                {productName}
                              </h4>
                              {isResellMode && product.pricing?.has_custom_markup && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1 flex-shrink-0">
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  {t('followDetail.ownMarkup')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {isResellMode ? (
                                <>
                                  <span className="text-white/40 text-xs line-through">
                                    ${originalPrice % 1 === 0 ? Math.floor(originalPrice) : originalPrice.toFixed(2)}
                                  </span>
                                  <span className="text-[#FF6B00] text-xs">→</span>
                                  <span className="text-[#2ECC71] font-bold text-sm">
                                    ${currentPrice % 1 === 0 ? Math.floor(currentPrice) : currentPrice.toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-white/60 font-medium text-sm">
                                  ${originalPrice % 1 === 0 ? Math.floor(originalPrice) : originalPrice.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {stockQty > 0 ? (
                              <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-[#2ECC71]/10 text-[#2ECC71] border border-[#2ECC71]/20">
                                {stockQty} {t('followDetail.pcs')}
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                                {t('followDetail.outOfStock')}
                              </span>
                            )}
                            {isResellMode && (
                              <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </>
        ) : null}
      </div>

      {/* Modals */}
      <MarkupSliderModal
        isOpen={isMarkupModalOpen}
        onClose={() => setIsMarkupModalOpen(false)}
        onConfirm={handleUpdateMarkup}
        currentMarkup={markupPercentage}
        currentMarkupType={markupType}
        currentMarkupFixed={markupFixed}
      />

      <ConfirmDialog
        isOpen={isSwitchModeDialogOpen}
        onClose={() => setIsSwitchModeDialogOpen(false)}
        onConfirm={handleSwitchMode}
        title={t('followDetail.switchModeTitle')}
        message={
          mode === 'monitor'
            ? t('followDetail.switchToResaleDesc')
            : t('followDetail.switchToMonitorDesc')
        }
        confirmText={t('dialogs.switchMode')}
        cancelText={t('common.cancel')}
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title={t('followDetail.deleteTitle')}
        message={t('followDetail.deleteWarning')}
        confirmText={t('dialogs.delete')}
        cancelText={t('common.cancel')}
        danger
      />

      <ProductMarkupModal
        isOpen={isProductMarkupModalOpen}
        onClose={() => {
          setIsProductMarkupModalOpen(false);
          setSelectedProduct(null);
        }}
        onConfirm={handleUpdateProductMarkup}
        onReset={handleResetProductMarkup}
        product={selectedProduct}
        globalMarkup={{
          type: markupType,
          percentage: markupPercentage,
          fixed: markupFixed,
        }}
      />
    </div>
  );
}
