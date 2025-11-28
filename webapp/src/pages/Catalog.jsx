import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion'; // Used in JSX
import { useShallow } from 'zustand/react/shallow';
import ProductGrid from '../components/Product/ProductGrid';
import CartButton from '../components/Cart/CartButton';
import Header from '../components/Layout/Header';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useBackButton } from '../hooks/useBackButton';
import { useTranslation } from '../i18n/useTranslation';
import { useApi } from '../hooks/useApi';

// Skeleton loader component
function ProductCardSkeleton() {
  return (
  <div className="glass-card rounded-2xl p-4 space-y-3 animate-pulse border border-white/10">
    <div className="w-full aspect-square rounded-xl bg-white/5" />
    <div className="h-5 bg-white/10 rounded-lg w-3/4" />
    <div className="h-3 bg-white/5 rounded w-full" />
    <div className="h-3 bg-white/5 rounded w-2/3" />
    <div className="flex items-center justify-between mt-4">
      <div className="h-6 bg-white/10 rounded-lg w-20" />
      <div className="h-9 bg-white/5 rounded-lg w-24" />
    </div>
  </div>
  );
}

export default function Catalog() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [myShop, setMyShop] = useState(null);
  const [activeSection, setActiveSection] = useState('stock');
  
  // Optimized Store Selection
  const { 
    products, 
    currentShop, 
    setCurrentShop, 
    setProducts, 
    setCartOpen, 
    token 
  } = useStore(
    useShallow((state) => ({
      products: state.products,
      currentShop: state.currentShop,
      setCurrentShop: state.setCurrentShop,
      setProducts: state.setProducts,
      setCartOpen: state.setCartOpen,
      token: state.token,
    }))
  );

  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const { get } = useApi();

  // Data Loading Logic
  const loadMyShop = useCallback(
    async (signal) => {
      try {
        const { data, error: apiError } = await get('/shops/my', { signal });
        if (signal?.aborted) return { status: 'aborted' };
        
        if (apiError) {
          console.error('[Catalog] 🔴 loadMyShop ERROR:', apiError);
          return { status: 'error', error: apiError };
        }

        const shop = data?.data?.[0] || null;
        if (shop) setMyShop(shop);
        return { status: 'success', shop };
      } catch (err) {
        return { status: 'error', error: err.message };
      }
    },
    [get]
  );

  const loadProducts = useCallback(
    async (shopId, signal) => {
      try {
        const { data, error: apiError } = await get('/products', {
          params: { shopId },
          signal,
        });

        if (signal?.aborted) return { status: 'aborted' };

        if (apiError) {
          console.error('[Catalog] 🔴 loadProducts ERROR:', apiError);
          return { status: 'error', error: 'Failed to load products' };
        }

        const items = Array.isArray(data?.data) ? data.data : [];
        setProducts(items, shopId); // Using action from hook, not getState()
        return { status: 'success' };
      } catch (err) {
        return { status: 'error', error: err.message };
      }
    },
    [get, setProducts]
  );

  // Main Effect
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const signal = controller.signal;

    const fetchData = async () => {
      // 1. Load My Shop (if not already known or needed context)
      const shopResult = await loadMyShop(signal);
      if (signal.aborted) return;
      if (shopResult.status === 'error' && !currentShop) {
         // Only block if we have absolutely no shop to show
         setError(shopResult.error);
         setLoading(false);
         return;
      }

      // 2. Determine target shop ID
      const shop = currentShop || shopResult.shop;
      
      if (shop) {
        const prodResult = await loadProducts(shop.id, signal);
        if (!signal.aborted && prodResult.status === 'error') {
           setError(prodResult.error);
        }
      }
      
      if (!signal.aborted) setLoading(false);
    };

    fetchData();

    return () => controller.abort();
  }, [token, currentShop, loadMyShop, loadProducts]);

  // Navigation Handlers
  const handleBack = useCallback(() => {
    triggerHaptic('light');
    setCurrentShop(null);
    setProducts([], null); // Reset products
  }, [triggerHaptic, setCurrentShop, setProducts]);

  const handleBackToMyShop = useCallback(() => {
    triggerHaptic('light');
    setCurrentShop(null);
    // Products will reload via useEffect when currentShop becomes null (and logic picks up myShop)
  }, [triggerHaptic, setCurrentShop]);

  // Derived State
  const displayShop = currentShop || myShop;
  const displayShopLogo = displayShop?.logo || displayShop?.image || null;
  const isViewingOwnShop = !currentShop && myShop;
  const isViewingSubscription = currentShop && myShop && currentShop.id !== myShop.id;

  // Back Button Logic
  const backHandler = useMemo(() => {
    if (isViewingSubscription) return handleBackToMyShop;
    if (currentShop) return handleBack;
    return null;
  }, [isViewingSubscription, currentShop, handleBackToMyShop, handleBack]);

  useBackButton(backHandler);

  // Product Filtering
  const { stockProducts, preorderProducts } = useMemo(() => {
    const stock = [];
    const preorder = [];
    
    if (!products) return { stockProducts: [], preorderProducts: [] };

    for (const product of products) {
      if (product.availability === 'preorder') {
        preorder.push(product);
      } else if (product.availability === 'stock') {
        stock.push(product);
      }
    }
    return { stockProducts: stock, preorderProducts: preorder };
  }, [products]);

  const displayedProducts = activeSection === 'preorder' ? preorderProducts : stockProducts;

  const handleSectionChange = useCallback(
    (sectionId) => {
      if (sectionId === activeSection) return;
      triggerHaptic('light');
      setActiveSection(sectionId);
    },
    [activeSection, triggerHaptic]
  );

  const handleRetry = () => {
    setError(null);
    // Force re-run of effect by toggling loading state explicitly or rely on dep change
    // A simple way to retry is to keep currentShop as is, the effect will fire again if we mounted/unmounted or if we trigger a refresh
    // Here we just clear error and let the user try navigation again or re-mount
    setLoading(true);
    // Re-triggering load manually
    loadMyShop(new AbortController().signal).then(() => setLoading(false));
  };

  // --- Renders ---

  if (!displayShop) {
    return (
      <div className="pb-24" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}>
        <Header title={t('catalog.title')} />
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          {loading ? (
            <>
              <div className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-400">{t('common.loading')}</p>
            </>
          ) : (
            <>
              <svg className="w-20 h-20 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <h3 className="text-xl font-bold text-white mb-2">{t('catalog.selectShop')}</h3>
              <p className="text-gray-400 mb-6">{t('catalog.selectShopDesc')}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}>
      {/* Shop Header */}
      <div className="bg-dark-card/80 backdrop-blur-lg p-4 sticky top-0 z-10">
        {isViewingSubscription && (
          <motion.button
            onClick={handleBackToMyShop}
            className="flex items-center gap-2 text-orange-primary mb-2"
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-medium">{t('catalog.backToMyShop')}</span>
          </motion.button>
        )}

        {currentShop && !isViewingSubscription && (
          <motion.button
            onClick={handleBack}
            className="flex items-center gap-2 text-orange-primary mb-2"
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-medium">{t('common.back')}</span>
          </motion.button>
        )}

        <div className="flex items-center gap-4">
          {displayShopLogo && (
            <div className="w-12 h-12 rounded-xl bg-dark-elevated overflow-hidden flex-shrink-0">
              <img src={displayShopLogo} alt={displayShop.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">
              {displayShop.name}
              {isViewingOwnShop && (
                <span className="ml-2 text-sm text-orange-primary">(Мой магазин)</span>
              )}
            </h1>
            <p className="text-gray-400 text-sm">
              {activeSection === 'preorder'
                ? `${preorderProducts.length} в предзаказе`
                : `${stockProducts.length} в наличии`}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-4">
        <div className="relative flex bg-white/5 backdrop-blur rounded-2xl p-1">
          {['stock', 'preorder'].map((sectionId) => {
            const isActive = activeSection === sectionId;
            const label = sectionId === 'stock' ? 'Наличие' : 'Предзаказ';
            const count = sectionId === 'stock' ? stockProducts.length : preorderProducts.length;

            return (
              <button
                key={sectionId}
                type="button"
                onClick={() => handleSectionChange(sectionId)}
                className={`relative flex-1 py-2.5 rounded-xl transition-colors ${
                  isActive ? 'text-white' : 'text-white/60'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="catalog-section-highlight"
                    className="absolute inset-0 bg-white/16 shadow-[0_10px_30px_rgba(10,10,10,0.35)] rounded-xl"
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  />
                )}
                <span className="relative z-10 text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>
                  {label}
                </span>
                <span className={`relative z-10 ml-2 text-xs font-semibold ${isActive ? 'text-orange-primary' : 'text-white/35'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="px-4 py-6">
          <div className="grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <svg className="w-16 h-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-400 mb-2">{error}</h3>
          <motion.button
            onClick={handleRetry}
            className="bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 py-3 rounded-xl transition-colors mt-4"
            whileTap={{ scale: 0.95 }}
          >
            Retry
          </motion.button>
        </div>
      )}

      {!loading && !error && (
        <ProductGrid
          products={displayedProducts}
          loading={loading}
          emptyTitle={activeSection === 'preorder' ? 'Нет товаров в предзаказе' : t('catalog.empty')}
          emptyDescription={
            activeSection === 'preorder'
              ? 'Мы сообщим, как только появятся новые позиции для предзаказа'
              : t('catalog.emptyDesc')
          }
          emptyIcon={activeSection === 'preorder' ? '🕒' : '📦'}
        />
      )}

      <CartButton onClick={() => setCartOpen(true)} />
    </div>
  );
}
