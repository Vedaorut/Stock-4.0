import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Layout/Header';
import ActionsList from '../components/Follows/ActionsList';
import ConfirmDialog from '../components/Follows/ConfirmDialog';
import MarkupSliderModal from '../components/Follows/MarkupSliderModal';
import ProductMarkupModal from '../components/Follows/ProductMarkupModal';
import { useFollowsApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useBackButton } from '../hooks/useBackButton';

export default function FollowDetail() {
  const followDetailId = useStore((state) => state.followDetailId);
  const { getDetail, updateMarkup, switchMode, deleteFollow, getProducts, updateProductMarkup, resetProductMarkup } = useFollowsApi();
  const { triggerHaptic } = useTelegram();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [follow, setFollow] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Modal states
  const [isMarkupModalOpen, setIsMarkupModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSwitchModeDialogOpen, setIsSwitchModeDialogOpen] = useState(false);
  const [isProductMarkupModalOpen, setIsProductMarkupModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Back button handler
  const handleBack = useCallback(() => {
    triggerHaptic('light');
    useStore.getState().setFollowDetailId(null);
  }, [triggerHaptic]);

  // Telegram BackButton integration
  useBackButton(handleBack);

  // Load follow data
  const loadFollow = useCallback(
    async (signal) => {
      if (!followDetailId) return { status: 'error', error: 'No follow ID' };

      const response = await getDetail(followDetailId, { signal });

      if (signal?.aborted) return { status: 'aborted' };

      if (response.error) {
        console.error('[FollowDetail] Error loading follow:', response.error);
        return { status: 'error', error: 'Failed to load subscription' };
      }

      const followData = response.data?.data || response.data;
      setFollow(followData);
      return { status: 'success' };
    },
    [followDetailId, getDetail]
  );

  // Load products for this follow
  const loadProducts = useCallback(
    async (signal) => {
      if (!followDetailId) return;

      setProductsLoading(true);
      try {
        const response = await getProducts(followDetailId, { signal });
        if (signal?.aborted) return;

        const productsData = response.data?.data?.products || response.data?.products || [];
        setProducts(Array.isArray(productsData) ? productsData : []);
      } catch (err) {
        console.error('[FollowDetail] Error loading products:', err);
      } finally {
        if (!signal?.aborted) {
          setProductsLoading(false);
        }
      }
    },
    [followDetailId, getProducts]
  );

  useEffect(() => {
    if (!followDetailId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    loadFollow(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
          setFollow(null);
        } else if (!controller.signal.aborted && result?.status === 'success') {
          loadProducts(controller.signal);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [followDetailId, loadFollow, loadProducts]);

  // Handle markup update
  const handleUpdateMarkup = useCallback(
    async (markupData) => {
      if (!followDetailId || !follow) return;

      triggerHaptic('medium');

      try {
        await updateMarkup(followDetailId, markupData);
        setFollow((prev) => ({
          ...prev,
          markup_type: markupData.markupType,
          markup_percentage: markupData.markupPercentage,
          markup_fixed: markupData.markupFixed,
        }));
        triggerHaptic('success');
      } catch (err) {
        console.error('[FollowDetail] Error updating markup:', err);
        triggerHaptic('error');
      }
    },
    [followDetailId, follow, updateMarkup, triggerHaptic]
  );

  // Handle mode switch
  const handleSwitchMode = useCallback(async () => {
    if (!followDetailId || !follow) return;
    const newMode = follow.mode === 'monitor' ? 'resell' : 'monitor';
    triggerHaptic('medium');

    try {
      await switchMode(followDetailId, newMode);
      setFollow((prev) => ({ ...prev, mode: newMode }));
      triggerHaptic('success');
    } catch (err) {
      console.error('[FollowDetail] Error switching mode:', err);
      triggerHaptic('error');
    }
  }, [followDetailId, follow, switchMode, triggerHaptic]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!followDetailId) return;
    triggerHaptic('medium');
    try {
      await deleteFollow(followDetailId);
      triggerHaptic('success');
      useStore.getState().setFollowDetailId(null);
    } catch (err) {
      console.error('[FollowDetail] Error deleting follow:', err);
      triggerHaptic('error');
    }
  }, [followDetailId, deleteFollow, triggerHaptic]);

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
        console.error('[FollowDetail] Error updating product markup:', err);
        triggerHaptic('error');
      }
    },
    [followDetailId, selectedProduct, updateProductMarkup, triggerHaptic, loadProducts]
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
      console.error('[FollowDetail] Error resetting product markup:', err);
      triggerHaptic('error');
    }
  }, [followDetailId, selectedProduct, resetProductMarkup, triggerHaptic, loadProducts]);

  // Get display values
  const shopName = follow?.source_shop_name || follow?.shop_name || 'Loading...';
  const mode = follow?.mode || 'monitor';
  const markupType = follow?.markup_type || 'percentage';
  const markupPercentage = follow?.markup_percentage ?? 25;
  const markupFixed = follow?.markup_fixed ?? 0;
  const displayMarkup = markupType === 'percentage' ? markupPercentage : markupFixed;

  return (
    <div
      className="h-screen overflow-y-auto bg-[#181818]"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
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
              onClick={() => loadFollow()}
              className="bg-[#FF6B00] text-white font-semibold px-6 py-2 rounded-xl"
              whileTap={{ scale: 0.95 }}
            >
              Try again
            </motion.button>
          </div>
        ) : follow ? (
          <>
            {/* Shop Info Card */}
            <motion.div
              className="relative overflow-hidden rounded-3xl border border-white/10 p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              {/* Background Gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent" />
              
              <div className="relative flex flex-col items-center gap-4 text-center">
                {/* Shop Avatar */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#FF6B00] to-[#FF8F00] shadow-lg shadow-[#FF6B00]/20 flex items-center justify-center text-white font-bold text-3xl">
                    {shopName.charAt(0).toUpperCase()}
                </div>

                {/* Shop Info */}
                <div className="w-full">
                  <h2 className="text-white font-bold text-2xl mb-2">{shopName}</h2>
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                        mode === 'resell'
                          ? 'bg-[#FF6B00]/10 text-[#FF6B00] border-[#FF6B00]/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}
                    >
                      {mode === 'resell' ? 'Resale' : 'Monitoring'}
                    </span>
                    {mode === 'resell' && (
                      <span className="text-[#2ECC71] text-xs font-bold px-3 py-1 rounded-full bg-[#2ECC71]/10 border border-[#2ECC71]/20">
                        +{markupType === 'percentage' ? `${markupPercentage}%` : `$${markupFixed}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 gap-px bg-white/10 w-full rounded-2xl overflow-hidden mt-2 border border-white/5">
                  <div className="bg-white/[0.02] p-3 text-center hover:bg-white/[0.05] transition-colors">
                    <div className="text-white font-bold text-lg">{follow.products_count || 0}</div>
                    <div className="text-white/40 text-xs uppercase tracking-wide">Products</div>
                  </div>
                  <div className="bg-white/[0.02] p-3 text-center hover:bg-white/[0.05] transition-colors">
                    <div className="text-white font-bold text-lg">
                        {new Date(follow.created_at).toLocaleDateString(undefined, {day: 'numeric', month: 'short'})}
                    </div>
                    <div className="text-white/40 text-xs uppercase tracking-wide">Since</div>
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
                onEditMarkup={() => {
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

            {/* Products Section */}
            {follow.mode === 'resell' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-bold text-lg">Товары</h3>
                  <span className="text-white/40 text-sm">{products.length} шт</span>
                </div>

                {productsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : products.length === 0 ? (
                  <div className="bg-white/5 rounded-2xl p-6 text-center border border-white/5">
                    <div className="text-white/30 text-sm">Нет синхронизированных товаров</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {products.map((product) => (
                      <motion.div
                        key={product.id}
                        onClick={() => handleProductClick(product)}
                        className="bg-white/5 rounded-2xl p-4 border border-white/5 hover:bg-white/[0.07] transition-colors cursor-pointer active:scale-[0.98]"
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-center gap-2">
                              <h4 className="text-white font-medium text-sm truncate">
                                {product.synced_product?.name || product.source_product?.name || product.name}
                              </h4>
                              {product.pricing?.has_custom_markup && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#FF6B00]/20 text-[#FF6B00] flex-shrink-0">
                                  Custom
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-white/40 text-xs line-through">
                                ${product.source_product?.price || product.original_price || product.price}
                              </span>
                              <span className="text-[#FF6B00] text-xs">→</span>
                              <span className="text-[#2ECC71] font-bold text-sm">
                                ${product.synced_product?.price || product.price}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {(product.synced_product?.stock_quantity ?? product.stock_quantity) > 0 ? (
                              <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-[#2ECC71]/10 text-[#2ECC71] border border-[#2ECC71]/20">
                                {product.synced_product?.stock_quantity ?? product.stock_quantity} шт
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                                Нет в наличии
                              </span>
                            )}
                            <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
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
        title="Switch Mode"
        message={
          mode === 'monitor'
            ? 'Switch to Resale mode? Products will be added to your catalog with your markup.'
            : 'Switch to Monitoring mode? Products will only be tracked.'
        }
        confirmText="Switch"
        cancelText="Cancel"
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Subscription"
        message="Are you sure? All synced products will be removed. This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
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