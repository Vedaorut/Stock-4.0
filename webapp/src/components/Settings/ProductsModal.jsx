import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';

// Product Card Component
function ProductCard({ product, onEdit, onDelete }) {
  const { triggerHaptic, confirm } = useTelegram();

  const handleDelete = async () => {
    triggerHaptic('medium');
    const confirmed = await confirm(`Удалить "${product.name}"?`);
    if (confirmed) {
      triggerHaptic('success');
      onDelete(product.id);
    }
  };

  return (
    <motion.div
      className="glass-card rounded-2xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-white font-semibold">{product.name}</h3>
            {!product.is_available && (
              <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                Недоступен
              </span>
            )}
          </div>
          {product.description && (
            <p className="text-gray-400 text-sm mb-2">{product.description}</p>
          )}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-orange-primary font-bold">
              ${product.price}
            </span>
            <span className="text-gray-500">
              В наличии: {product.stock || 0}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button
            onClick={() => onEdit(product)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-blue-400"
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}
            whileTap={{ scale: 0.9 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </motion.button>
          <motion.button
            onClick={handleDelete}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-red-400"
            style={{
              background: 'rgba(255, 59, 48, 0.1)',
              border: '1px solid rgba(255, 59, 48, 0.2)'
            }}
            whileTap={{ scale: 0.9 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// Product Form Component
function ProductForm({ product, onSubmit, onCancel, limitStatus }) {
  const { triggerHaptic } = useTelegram();
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || '',
    stock: product?.stock || '',
    is_available: product?.is_available ?? true
  });

  const isEdit = !!product;

  const handleSubmit = () => {
    if (!formData.name || !formData.price) {
      return;
    }
    triggerHaptic('success');
    onSubmit(formData);
  };

  return (
    <motion.div
      className="glass-card rounded-2xl p-4 space-y-3"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <div>
        <label className="text-sm text-gray-400 mb-2 block">
          Название товара *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Windows 11 Pro"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
        />
      </div>

      <div>
        <label className="text-sm text-gray-400 mb-2 block">
          Описание
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Лицензионный ключ Windows 11 Pro"
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400 mb-2 block">
            Цена ($) *
          </label>
          <input
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            placeholder="29.99"
            step="0.01"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-2 block">
            В наличии
          </label>
          <input
            type="number"
            value={formData.stock}
            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
            placeholder="100"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <input
          type="checkbox"
          id="is_available"
          checked={formData.is_available}
          onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
          className="w-5 h-5 rounded bg-white/5 border border-white/10 text-orange-primary focus:ring-orange-primary"
        />
        <label htmlFor="is_available" className="text-sm text-white">
          Товар доступен для продажи
        </label>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <motion.button
          onClick={() => {
            triggerHaptic('light');
            onCancel();
          }}
          className="flex-1 h-11 rounded-xl font-medium text-gray-300"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
          whileTap={{ scale: 0.98 }}
        >
          Отмена
        </motion.button>
        <motion.button
          onClick={handleSubmit}
          disabled={!formData.name || !formData.price}
          className="flex-1 h-11 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{
            background: formData.name && formData.price
              ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
              : 'rgba(255, 255, 255, 0.1)'
          }}
          whileTap={formData.name && formData.price ? { scale: 0.98 } : {}}
        >
          {isEdit ? 'Сохранить' : 'Создать'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// Main Modal Component
export default function ProductsModal({ isOpen, onClose }) {
  const { triggerHaptic, alert } = useTelegram();
  const { fetchApi } = useApi();

  const [myShop, setMyShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [limitStatus, setLimitStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Fetch shop and products
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get user's shop
      const shopsRes = await fetchApi('/shops/my');
      if (shopsRes.data && shopsRes.data.length > 0) {
        const shop = shopsRes.data[0];
        setMyShop(shop);

        // Get products
        const productsRes = await fetchApi(`/products?shopId=${shop.id}`);
        setProducts(productsRes.data || []);

        // Get limit status
        const limitRes = await fetchApi(`/products/limit-status/${shop.id}`);
        setLimitStatus(limitRes);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (formData) => {
    try {
      await fetchApi('/products', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          shop_id: myShop.id
        })
      });

      triggerHaptic('success');
      await loadData();
      setShowForm(false);
    } catch (error) {
      await alert(error.message || 'Ошибка создания товара');
    }
  };

  const handleEditProduct = async (formData) => {
    try {
      await fetchApi(`/products/${editingProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify(formData)
      });

      triggerHaptic('success');
      await loadData();
      setShowForm(false);
      setEditingProduct(null);
    } catch (error) {
      await alert(error.message || 'Ошибка обновления товара');
    }
  };

  const handleDeleteProduct = async (productId) => {
    try {
      await fetchApi(`/products/${productId}`, {
        method: 'DELETE'
      });

      triggerHaptic('success');
      await loadData();
    } catch (error) {
      await alert(error.message || 'Ошибка удаления товара');
    }
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingProduct(null);
    onClose();
  };

  // No shop - show empty state
  if (!loading && !myShop) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-dark-bg"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <PageHeader title="Мои товары" onBack={handleClose} />
            <div className="min-h-screen pb-24 pt-20">
              <div className="px-4 py-6">
                <div className="text-center py-12">
                  <svg
                    className="w-20 h-20 mx-auto mb-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-white mb-2">
                    У вас еще нет магазина
                  </h3>
                  <p className="text-gray-400 text-sm mb-6">
                    Создайте магазин для продажи товаров
                  </p>
                  <motion.button
                    onClick={() => {
                      triggerHaptic('medium');
                      alert('Создание магазина через бота ($25)');
                    }}
                    className="h-12 px-6 rounded-xl font-semibold text-white"
                    style={{
                      background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                      boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)'
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Создать магазин ($25)
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-dark-bg"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <PageHeader title="Мои товары" onBack={handleClose} />
          <div className="min-h-screen pb-24 pt-20">
            <div className="px-4 py-6 space-y-4">
        {/* Limit status */}
        {limitStatus && (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Товары</p>
                <p className="text-xl font-bold text-white">
                  {limitStatus.currentCount} / {limitStatus.limit === 999999 ? '∞' : limitStatus.limit}
                </p>
              </div>
              <div className="text-right">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  limitStatus.tier === 'ELITE' ? 'bg-purple-500/20 text-purple-400' :
                  limitStatus.tier === 'PREMIUM' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {limitStatus.tier}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Add product button */}
        {!showForm && !loading && (
          <motion.button
            onClick={() => {
              if (limitStatus && limitStatus.canAdd) {
                triggerHaptic('light');
                setShowForm(true);
                setEditingProduct(null);
              } else {
                alert(`Лимит достигнут! Доступно: ${limitStatus?.tier}`);
              }
            }}
            disabled={limitStatus && !limitStatus.canAdd}
            className="w-full h-14 rounded-2xl font-semibold text-white disabled:opacity-50"
            style={{
              background: limitStatus && limitStatus.canAdd
                ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
                : 'rgba(255, 255, 255, 0.1)',
              boxShadow: limitStatus && limitStatus.canAdd ? '0 4px 16px rgba(255, 107, 0, 0.3)' : 'none'
            }}
            whileTap={limitStatus && limitStatus.canAdd ? { scale: 0.98 } : {}}
          >
            + Добавить товар
          </motion.button>
        )}

        {/* Product form */}
        <AnimatePresence>
          {showForm && (
            <ProductForm
              product={editingProduct}
              onSubmit={editingProduct ? handleEditProduct : handleAddProduct}
              onCancel={() => {
                setShowForm(false);
                setEditingProduct(null);
              }}
              limitStatus={limitStatus}
            />
          )}
        </AnimatePresence>

        {/* Products list */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : products.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 px-2">
              Список товаров
            </h3>
            <AnimatePresence mode="popLayout">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={(p) => {
                    setEditingProduct(p);
                    setShowForm(true);
                  }}
                  onDelete={handleDeleteProduct}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : !showForm && (
          <div className="text-center py-12">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            <p className="text-gray-400 text-sm">
              Пока нет товаров
            </p>
          </div>
        )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
