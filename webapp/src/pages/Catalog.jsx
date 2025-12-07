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
// normalizeProduct import removed - not used

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
    setActiveTab,
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
      setActiveTab: state.setActiveTab,
    }))
  );

  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const { get } = useApi();

  // Derived State (moved up to fix ReferenceError - used in searchProducts)
  const displayShop = currentShop || myShop;

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

  // Search products - local filter for current shop's products
  const searchProducts = useCallback(
    (query) => {
      if (!query || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);

      // Local search within current shop's products
      const searchTerm = query.trim().toLowerCase();
      const filtered = products.filter((product) => {
        const name = (product.name || '').toLowerCase();
        const description = (product.description || '').toLowerCase();
        return name.includes(searchTerm) || description.includes(searchTerm);
      });

      // Add shop info for display
      const resultsWithShop = filtered.map((product) => ({
        ...product,
        shop_id: displayShop?.id,
        shop_name: displayShop?.name || 'Shop',
      }));

      setSearchResults(resultsWithShop);
      setIsSearching(false);
    },
    [products, displayShop]
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

      // Debounce 150ms (faster for local search)
      debounceTimerRef.current = setTimeout(() => {
        searchProducts(query);
      }, 150);
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
      try {
        // 1. Load My Shop (if not already known or needed context)
        const shopResult = await loadMyShop(signal);
        if (signal.aborted) return;
        if (shopResult.status === 'error' && !currentShop) {
          // Only block if we have absolutely no shop to show
          setError(shopResult.error);
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
      } finally {
        if (!signal.aborted) setLoading(false);
      }
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
    setActiveTab('subscriptions');
  }, [triggerHaptic, setCurrentShop, setActiveTab]);

  // Derived State (displayShop moved up for searchProducts dependency)
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

  // H13 FIX: Use ref to store AbortController to prevent memory leak
  const retryControllerRef = useRef(null);

  const handleRetry = () => {
    setError(null);
    // Abort previous retry if still pending
    if (retryControllerRef.current) {
      retryControllerRef.current.abort();
    }
    retryControllerRef.current = new AbortController();
    setLoading(true);
    // Re-triggering load manually
    loadMyShop(retryControllerRef.current.signal).then(() => setLoading(false));
  };

  // --- Renders ---

  if (!displayShop) {
    return (
      <div
        className="h-screen overflow-y-auto bg-[#181818]"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 80px)',
          paddingBottom: 'calc(var(--tabbar-total) + 20px)',
        }}
      >
        <Header title={t('catalog.title')} />
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          {loading ? (
            <>
              <div className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-400">{t('common.loading')}</p>
            </>
          ) : !token ? (
            <>
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{t('common.authRequired')}</h3>
              <p className="text-gray-400 mb-6">{t('common.restartBot')}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl transition-colors"
              >
                {t('common.retry')}
              </button>
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
    <div
      className="h-screen overflow-y-auto bg-[#181818]"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 80px)',
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <Header title={t('catalog.title')} />

      {/* Shop Info & Search - Premium E-commerce Header */}
      <div className="relative z-10">
        <div className="px-4 py-4 space-y-4">
          {/* Shop Hero Card - Modern Glassmorphism */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl"
          >
            {/* Gradient Background - Premium Dark */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, #1A1A1A 0%, #111111 100%)',
              }}
            />

            {/* Ambient Glow Effects */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-orange-500/10 blur-[60px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-blue-500/5 blur-[50px] rounded-full pointer-events-none" />

            {/* Content */}
            <div className="relative p-8 flex flex-col items-center justify-center text-center min-h-[120px]">
              {/* Shop Name */}
              <h2
                className="text-3xl font-bold text-white tracking-tight leading-snug whitespace-normal break-words max-w-full"
                style={{
                  fontFamily: "'SF Pro Display', sans-serif",
                  letterSpacing: '-0.02em',
                  background: 'linear-gradient(180deg, #FFFFFF 0%, #D1D1D1 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: '0 2px 10px rgba(0,0,0,0.2)'
                }}
              >
                {displayShop.name}
              </h2>
            </div>

            {/* Bottom accent line */}
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </motion.div>

          {/* Enhanced Search & Filters Area */}
          <div className="space-y-3 sticky top-0 z-20">
            {/* Search Bar */}
            <div className="relative" ref={searchContainerRef}>
              <div className="relative group">
                {/* Search Icon */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 group-focus-within:text-orange-primary">
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
                  className="w-full bg-[#242424] border border-white/5 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-500 focus:outline-none focus:bg-[#2a2a2a] focus:border-orange-primary/50 focus:ring-1 focus:ring-orange-primary/50 transition-all shadow-sm"
                />

                {/* Clear button */}
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </motion.button>
                )}
              </div>

              {/* Search Results Dropdown */}
              <AnimatePresence>
                {isSearchActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    className="absolute top-full left-0 right-0 mt-3 bg-[#242424] rounded-2xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.4)] z-50 max-h-[60vh] overflow-y-auto overflow-hidden ring-1 ring-white/5"
                  >
                    {isSearching ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="w-8 h-8 border-3 border-orange-primary border-t-transparent rounded-full animate-spin opacity-80" />
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
                      <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-white font-semibold">{t('catalog.searchEmpty')}</p>
                        <p className="text-gray-500 text-sm mt-1">{t('catalog.searchEmptyDesc')}</p>
                      </div>
                    ) : (
                      <div className="py-6 px-4 text-center text-gray-500 text-sm font-medium">
                        {t('catalog.searchMinChars')}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tabs - Premium Segmented Control */}
            <div
              className="relative flex rounded-2xl p-1"
              style={{
                background: 'linear-gradient(145deg, rgba(36, 36, 36, 0.9) 0%, rgba(28, 28, 28, 0.95) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.3)',
              }}
            >
              {['stock', 'preorder'].map((sectionId) => {
                const isActive = activeSection === sectionId;
                const label = sectionId === 'stock' ? t('catalog.tabs.stock') : t('catalog.tabs.preorder');
                const count = sectionId === 'stock' ? stockProducts.length : preorderProducts.length;

                return (
                  <button
                    key={sectionId}
                    type="button"
                    onClick={() => handleSectionChange(sectionId)}
                    className={`relative flex-1 py-3 px-4 rounded-xl transition-all duration-200 ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="catalog-section-highlight"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.15) 0%, rgba(255, 107, 0, 0.08) 100%)',
                          border: '1px solid rgba(255, 107, 0, 0.3)',
                          boxShadow: '0 4px 12px rgba(255, 107, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <div className="relative z-10 flex items-center justify-center gap-2">
                      {/* Icon */}
                      {sectionId === 'stock' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <circle cx="12" cy="12" r="9" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
                        </svg>
                      )}
                      <span className="text-sm font-semibold" style={{ letterSpacing: '-0.01em' }}>
                        {label}
                      </span>
                      {/* Count badge */}
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${isActive
                          ? 'bg-orange-500/30 text-orange-300'
                          : 'bg-white/5 text-gray-500'
                          }`}
                      >
                        {count}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-2">
        {loading && (
          <div className="px-4">
            <div className="grid grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Oops!</h3>
            <p className="text-gray-400 mb-6 max-w-[200px]">{error}</p>
            <motion.button
              onClick={handleRetry}
              className="bg-orange-primary hover:bg-orange-600 text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg shadow-orange-500/20 transition-all"
              whileTap={{ scale: 0.95 }}
            >
              {t('common.retry')}
            </motion.button>
          </div>
        )}

        {!loading && !error && (
          <ProductGrid
            products={displayedProducts}
            loading={loading}
            emptyTitle={activeSection === 'preorder' ? t('catalog.preorderEmpty') : t('catalog.empty')}
            emptyDescription={
              activeSection === 'preorder'
                ? t('catalog.preorderEmptyDesc')
                : t('catalog.emptyDesc')
            }
            emptyIcon={activeSection === 'preorder' ? 'clock' : 'box'}
          />
        )}
      </div>

      <CartButton onClick={() => setCartOpen(true)} />
    </div>
  );
}
