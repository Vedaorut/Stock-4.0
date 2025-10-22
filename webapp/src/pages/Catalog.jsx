import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Layout/Header';
import ProductGrid from '../components/Product/ProductGrid';
import CartButton from '../components/Cart/CartButton';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';
import { useApi } from '../hooks/useApi';

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { currentShop, setCurrentShop, setCartOpen } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const { get } = useApi();

  useEffect(() => {
    if (currentShop) {
      loadProducts(currentShop.id);
    }
  }, [currentShop]);

  const loadProducts = async (shopId) => {
    try {
      setLoading(true);
      setError(null);

      // GET /api/products?shopId=<shopId>
      const { data, error: apiError } = await get('/products', {
        params: { shopId }
      });

      if (apiError) {
        setError('Failed to load products');
        console.error('Products error:', apiError);
      } else {
        setProducts(data?.products || []);
      }
    } catch (err) {
      setError('Failed to load products');
      console.error('Products error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    triggerHaptic('light');
    setCurrentShop(null);
    setProducts([]);
  };

  // Если магазин не выбран
  if (!currentShop) {
    return (
      <div className="min-h-screen pb-24 pt-20">
        <Header title={t('catalog.title')} />

        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <svg className="w-20 h-20 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <h3 className="text-xl font-bold text-white mb-2">
            {t('catalog.selectShop')}
          </h3>
          <p className="text-gray-400 mb-6">
            {t('catalog.selectShopDesc')}
          </p>
          <motion.button
            onClick={() => useStore.getState().setActiveTab('subscriptions')}
            className="bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            {t('catalog.goToSubscriptions')}
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Shop Header with Back Button */}
      <div className="bg-dark-card/80 backdrop-blur-lg p-4 sticky top-0 z-10">
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

        <div className="flex items-center gap-4">
          {currentShop.image && (
            <div className="w-12 h-12 rounded-xl bg-dark-elevated overflow-hidden flex-shrink-0">
              <img
                src={currentShop.image}
                alt={currentShop.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">
              {currentShop.name}
            </h1>
            <p className="text-gray-400 text-sm">
              {products.length} {t('catalog.products')}
            </p>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <svg className="w-16 h-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-400 mb-2">{error}</h3>
          <motion.button
            onClick={() => loadProducts(currentShop.id)}
            className="bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 py-3 rounded-xl transition-colors mt-4"
            whileTap={{ scale: 0.95 }}
          >
            Retry
          </motion.button>
        </div>
      )}

      {/* Products Grid */}
      {!error && (
        <ProductGrid
          products={products}
          loading={loading}
        />
      )}

      {/* Floating Cart Button */}
      <CartButton onClick={() => setCartOpen(true)} />
    </div>
  );
}
