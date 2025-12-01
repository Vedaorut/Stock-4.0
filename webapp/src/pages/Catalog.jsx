import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // Used in JSX
import { useShallow } from 'zustand/react/shallow';
import ProductGrid from '../components/Product/ProductGrid';
import CartButton from '../components/Cart/CartButton';
import Header from '../components/Layout/Header';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useBackButton } from '../hooks/useBackButton';
import { useTranslation } from '../i18n/useTranslation';
import { useApi } from '../hooks/useApi';
import { normalizeProduct } from '../store/useStore';

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

// Search result item component
function SearchResultItem({ product, onClick, t }) {
  const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left"
    >
      {/* Product image */}
      <div className="w-12 h-12 rounded-lg bg-dark-elevated overflow-hidden flex-shrink-0">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{product.name}</p>
        <p className="text-xs text-gray-400 truncate">
          {t('catalog.fromShop', { shop: product.shop_name || 'Shop' })}
        </p>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right">
        <p className="text-orange-primary font-semibold">${price.toFixed(2)}</p>
      </div>

      {/* Arrow */}
      <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </motion.button>
  );
}

export default function Catalog() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [myShop, setMyShop] = useState(null);
  const [activeSection, setActiveSection] = useState('stock');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  
  // Optimized Store Selection
  const {
    products,
    currentShop,
    setCurrentShop,
    setProducts,
    setCartOpen,
    token,
    myShops,
    setMyShops,
    viewMode
  } = useStore(
    useShallow((state) => ({
      products: state.products,
      currentShop: state.currentShop,
      setCurrentShop: state.setCurrentShop,
      setProducts: state.setProducts,
      setCartOpen: state.setCartOpen,
      token: state.token,
      myShops: state.myShops,
      setMyShops: state.setMyShops,
      viewMode: state.viewMode,
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
          if (import.meta.env.DEV) {
            console.error('[Catalog] 🔴 loadMyShop ERROR:', apiError);
          }
          return { status: 'error', error: apiError };
        }

        const shops = data?.data || [];
        const shop = shops[0] || null;
        
        // Save ALL shops to store for multi-shop ownership detection
        setMyShops(shops);
        
        if (shop) setMyShop(shop);
        return { status: 'success', shop };
      } catch (err) {
        return { status: 'error', error: err.message };
      }
    },
    [get, setMyShops]
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
          if (import.meta.env.DEV) {
            console.error('[Catalog] 🔴 loadProducts ERROR:', apiError);
          }
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

  // Load shop by ID (for external shops - needed for availableCryptos in payment flow)
  const loadShopById = useCallback(
    async (shopId, signal) => {
      try {
        const { data, error: apiError } = await get(`/shops/${shopId}`, { signal });
        if (signal?.aborted) return { status: 'aborted' };

        if (apiError) {
          if (import.meta.env.DEV) {
            console.error('[Catalog] loadShopById ERROR:', apiError);
          }
          return { status: 'error', error: apiError };
        }

        const shop = data?.data || null;
        if (shop) {
          // Update currentShop with full data (including availableCryptos)
          setCurrentShop(shop);
        }
        return { status: 'success', shop };
      } catch (err) {
        return { status: 'error', error: err.message };
      }
    },
    [get, setCurrentShop]
  );

  // Search products across subscriptions/follows
  const searchProducts = useCallback(
    async (query, signal) => {
      if (!query || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);

      try {
        // Build query params based on view mode
        const params = { query: query.trim() };

        // In buyer mode: search in subscriptions
        // In seller mode: search in follows
        if (viewMode === 'seller') {
          params.follows = true;
        } else {
          params.subscriptions = true;
        }

        const { data, error: apiError } = await get('/products/search', {
          params,
          signal,
        });

        if (signal?.aborted) return;

        if (apiError) {
          if (import.meta.env.DEV) {
            console.error('[Catalog] searchProducts ERROR:', apiError);
          }
          setSearchResults([]);
          return;
        }

        const items = Array.isArray(data?.data) ? data.data.map(normalizeProduct) : [];
        setSearchResults(items);
      } catch (err) {
        if (err.name !== 'AbortError' && err.code !== 'ERR_CANCELED') {
          if (import.meta.env.DEV) {
            console.error('[Catalog] searchProducts error:', err);
          }
        }
        setSearchResults([]);
      } finally {
        if (!signal?.aborted) {
          setIsSearching(false);
        }
      }
    },
    [get, viewMode]
  );

  // Debounced search handler
  const handleSearchChange = useCallback(
    (e) => {
      const query = e.target.value;
      setSearchQuery(query);

      // Clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // If empty query, clear results immediately
      if (!query.trim()) {
        setSearchResults([]);
        setIsSearchActive(false);
        return;
      }

      setIsSearchActive(true);

      // Debounce 300ms
      debounceTimerRef.current = setTimeout(() => {
        const controller = new AbortController();
        searchProducts(query, controller.signal);
      }, 300);
    },
    [searchProducts]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchActive(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    triggerHaptic('light');
  }, [triggerHaptic]);

  // Handle search result click - navigate to shop
  const handleSearchResultClick = useCallback(
    (product) => {
      triggerHaptic('light');

      // Set current shop from product
      const shop = {
        id: product.shop_id,
        name: product.shop_name || 'Shop',
      };

      setCurrentShop(shop);
      clearSearch();
    },
    [setCurrentShop, clearSearch, triggerHaptic]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target) &&
        isSearchActive
      ) {
        setIsSearchActive(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSearchActive]);

  // Main Effect
  // IMPORTANT: Dependencies carefully chosen to avoid infinite loops:
  // - currentShop?.id instead of currentShop (loadShopById updates currentShop object)
  // - myShops removed (loadMyShop calls setMyShops, would cause loop)
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
      let shop = currentShop || shopResult.shop;

      // 3. If viewing external shop (not own), load full shop data for availableCryptos
      // This is needed for payment flow to know which crypto wallets are available
      // Get myShops from store directly to avoid dependency cycle
      const currentMyShops = useStore.getState().myShops;
      if (currentShop && currentShop.id && !currentShop.availableCryptos) {
        const isOwnShop = currentMyShops.some(s => s.id === currentShop.id);
        if (!isOwnShop) {
          // Load full shop data for external shops (needed for payment wallets)
          const fullShopResult = await loadShopById(currentShop.id, signal);
          if (signal.aborted) return;
          if (fullShopResult.status === 'success' && fullShopResult.shop) {
            shop = fullShopResult.shop;
          }
        }
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, currentShop?.id, loadMyShop, loadProducts, loadShopById]);

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
  
  // Check if currentShop belongs to user (using myShops array for multi-shop ownership)
  const isCurrentShopOwned = currentShop && myShops.some(s => s.id === currentShop.id);
  const isViewingSubscription = currentShop && !isCurrentShopOwned;

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

        {/* Search Bar */}
        <div className="mt-4 relative" ref={searchContainerRef}>
          <div className="relative">
            {/* Search Icon */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Input */}
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={t('catalog.searchPlaceholder')}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-white placeholder-gray-500 focus:outline-none focus:border-orange-primary/50 focus:ring-1 focus:ring-orange-primary/30 transition-all"
            />

            {/* Clear button */}
            {searchQuery && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            )}
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {isSearchActive && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-dark-card/95 backdrop-blur-lg rounded-xl border border-white/10 shadow-xl z-50 max-h-80 overflow-y-auto"
              >
                {isSearching ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-orange-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {searchResults.map((product) => (
                      <SearchResultItem
                        key={`${product.shop_id}-${product.id}`}
                        product={product}
                        onClick={() => handleSearchResultClick(product)}
                        t={t}
                      />
                    ))}
                  </div>
                ) : searchQuery.trim().length >= 2 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <svg className="w-12 h-12 text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-gray-400 font-medium">{t('catalog.searchEmpty')}</p>
                    <p className="text-gray-500 text-sm mt-1">{t('catalog.searchEmptyDesc')}</p>
                  </div>
                ) : (
                  <div className="py-4 px-4 text-center text-gray-500 text-sm">
                    {t('catalog.searchMinChars')}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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
