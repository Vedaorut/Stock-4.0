import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../../common/PageHeader';
import { useTelegram } from '../../../hooks/useTelegram';
import { useApi } from '../../../hooks/useApi';
import { useBackButton } from '../../../hooks/useBackButton';
import { useTranslation } from '../../../i18n/useTranslation';

// Sub-components
import ProductForm from './ProductForm';
import ProductList from './ProductList';
import ProductEmptyState from './ProductEmptyState';
import ProductLoadingState from './ProductLoadingState';
import ProductErrorState from './ProductErrorState';
import NoShopState from './NoShopState';
import AIChatPanel from './AIChatPanel';
import AddProductButton from './AddProductButton';

/**
 * ProductsModal - Main container for products management
 */
export default function ProductsModal({ isOpen, onClose }) {
  const { triggerHaptic, alert } = useTelegram();
  const { fetchApi } = useApi();
  const { t } = useTranslation();

  // AI Chat state
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiHistory, setAiHistory] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [lastAIPrompt, setLastAIPrompt] = useState('');
  const aiAbortControllerRef = useRef(null);
  const productAbortControllerRef = useRef(null);

  // Products state
  const [myShop, setMyShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [limitStatus, setLimitStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    is_available: true,
    is_preorder: false,
  });

  // AI Chat handlers
  const handleOpenAIChat = () => {
    triggerHaptic('medium');
    setShowAIChat(true);
  };

  const handleCloseAIChat = useCallback(() => {
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }
    setShowAIChat(false);
    setAiError(null);
    setLastAIPrompt('');
    setAiLoading(false);
  }, []);

  // Map product data helper
  const mapProduct = useCallback((product) => {
    const stock = product.stock_quantity ?? product.stock ?? 0;
    const isAvailable = product.is_available ?? product.isActive ?? true;
    const isPreorder = product.is_preorder ?? false;

    const availability = !isAvailable ? 'unavailable' : isPreorder ? 'preorder' : 'stock';

    return {
      ...product,
      price: typeof product.price === 'number' ? product.price : Number(product.price) || 0,
      stock,
      stock_quantity: stock,
      is_available: isAvailable,
      isAvailable,
      isPreorder,
      availability,
    };
  }, []);

  // Close handler
  const handleClose = useCallback(() => {
    if (productAbortControllerRef.current) {
      productAbortControllerRef.current.abort();
      productAbortControllerRef.current = null;
    }
    setShowForm(false);
    setEditingProduct(null);
    setShowAIChat(false);
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? (showAIChat ? handleCloseAIChat : handleClose) : null);

  // Disable vertical swipes when modal is open (Telegram Mini App)
  useEffect(() => {
    if (isOpen && window.Telegram?.WebApp) {
      window.Telegram.WebApp.disableVerticalSwipes();
      return () => {
        window.Telegram.WebApp.enableVerticalSwipes();
      };
    }
  }, [isOpen]);

  // Initialize AI chat history
  useEffect(() => {
    if (showAIChat && aiHistory.length === 0) {
      setAiHistory([
        {
          role: 'assistant',
          content:
            'Привет! Я AI-ассистент магазина. Напишите, какие товары нужно добавить или изменить - все сделаю за вас.',
        },
      ]);
    }
  }, [showAIChat, aiHistory.length]);

  // Load data function
  const loadData = useCallback(
    async (signal) => {
      const shopsRes = await fetchApi('/shops/my', {
        signal,
        timeout: 10000,
      });

      if (signal?.aborted) return { status: 'aborted' };

      const shops = Array.isArray(shopsRes?.data) ? shopsRes.data : [];
      if (shops.length === 0) {
        setMyShop(null);
        setProducts([]);
        setLimitStatus(null);
        return { status: 'no_shop' };
      }

      const shop = shops[0];
      setMyShop(shop);

      const productsRes = await fetchApi(`/products?shopId=${shop.id}`, {
        signal,
        timeout: 10000,
      });

      if (signal?.aborted) return { status: 'aborted' };

      const items = Array.isArray(productsRes?.data) ? productsRes.data : [];
      setProducts(items.map(mapProduct));

      const limitRes = await fetchApi(`/products/limit-status/${shop.id}`, {
        signal,
        timeout: 10000,
      });

      if (signal?.aborted) return { status: 'aborted' };

      setLimitStatus(limitRes);
      return { status: 'success' };
    },
    [fetchApi, mapProduct]
  );

  // Load data on open
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    loadData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error || 'Failed to load data');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to load data');
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, loadData]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (productAbortControllerRef.current) {
        productAbortControllerRef.current.abort();
        productAbortControllerRef.current = null;
      }
      setMyShop(null);
      setProducts([]);
      setError(null);
      setShowForm(false);
      setEditingProduct(null);
      setShowAIChat(false);
      setAiError(null);
      setLastAIPrompt('');
      setFormData({
        name: '',
        description: '',
        price: '',
        stock: '',
        is_available: true,
        is_preorder: false,
      });
    }
  }, [isOpen]);

  // AI message handler
  const handleSendAIMessage = async (text) => {
    const value = text.trim();
    if (!value) return;

    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    aiAbortControllerRef.current = new AbortController();

    setLastAIPrompt(value);
    const optimisticHistory = [...aiHistory, { role: 'user', content: value }];
    setAiHistory(optimisticHistory);
    setAiLoading(true);
    setAiError(null);

    try {
      const historyPayload = optimisticHistory.map(({ role, content }) => ({ role, content }));

      const response = await fetchApi('/ai/products/chat', {
        method: 'POST',
        body: JSON.stringify({
          shopId: myShop?.id,
          message: value,
          history: historyPayload,
        }),
        signal: aiAbortControllerRef.current.signal,
      });

      if (response?.data) {
        const { reply, history: serverHistory, productsChanged } = response.data;
        if (Array.isArray(serverHistory) && serverHistory.length) {
          setAiHistory(serverHistory);
        } else if (reply) {
          setAiHistory((current) => [...current, { role: 'assistant', content: reply }]);
        }

        if (productsChanged) {
          await loadData();
        }
      } else {
        throw new Error('Пустой ответ AI-сервиса');
      }
    } catch (err) {
      const errorMessage = err.message || 'Не удалось обработать запрос. Попробуйте позже.';
      setAiError(errorMessage);
      setAiHistory((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'Не получилось обработать команду. Попробуйте еще раз или сформулируйте иначе.',
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleRetryAIMessage = () => {
    if (lastAIPrompt && !aiLoading) {
      triggerHaptic('light');
      handleSendAIMessage(lastAIPrompt);
    }
  };

  // Product handlers
  const handleSubmitProduct = async () => {
    if (saving) return;

    if (productAbortControllerRef.current) {
      productAbortControllerRef.current.abort();
    }
    productAbortControllerRef.current = new AbortController();

    setSaving(true);

    try {
      if (!formData.name || !formData.price) {
        return;
      }

      const price = Number(formData.price);
      const stockValue =
        formData.stock === '' || formData.stock === null || formData.stock === undefined
          ? undefined
          : Number(formData.stock);

      const payload = {
        ...formData,
        price: Number.isFinite(price) ? price : formData.price,
        stock: stockValue,
        stockQuantity: stockValue,
        is_preorder: formData.is_preorder,
      };

      if (editingProduct) {
        await fetchApi(`/products/${editingProduct.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          signal: productAbortControllerRef.current.signal,
        });
      } else {
        if (!myShop?.id) {
          await alert('Не удалось определить магазин');
          return;
        }
        await fetchApi('/products', {
          method: 'POST',
          body: JSON.stringify({ ...payload, shopId: myShop.id }),
          signal: productAbortControllerRef.current.signal,
        });
      }

      triggerHaptic('success');
      await loadData();
      setShowForm(false);
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: '', stock: '', is_available: true });
    } catch (err) {
      if (err.name === 'AbortError') return;
      await alert(err.message || 'Ошибка сохранения товара');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (productAbortControllerRef.current) {
      productAbortControllerRef.current.abort();
    }
    productAbortControllerRef.current = new AbortController();

    try {
      await fetchApi(`/products/${productId}`, {
        method: 'DELETE',
        signal: productAbortControllerRef.current.signal,
      });

      triggerHaptic('success');
      await loadData();
    } catch (err) {
      if (err.name === 'AbortError') return;
      await alert(err.message || 'Ошибка удаления товара');
    }
  };

  const handleEditProduct = (p) => {
    const mapped = mapProduct(p);
    setEditingProduct(mapped);
    setFormData({
      name: mapped.name || '',
      description: mapped.description || '',
      price: mapped.price || '',
      stock: mapped.stock ?? mapped.stock_quantity ?? '',
      is_available: mapped.is_available ?? true,
      is_preorder: mapped.is_preorder ?? false,
    });
    setShowForm(true);
  };

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    loadData(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error || 'Failed to load data');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to load data');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadData]);

  const handleAddProduct = () => {
    if (limitStatus && limitStatus.canAdd) {
      triggerHaptic('light');
      setShowForm(true);
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        price: '',
        stock: '',
        is_available: true,
        is_preorder: false,
      });
    } else {
      alert(`Лимит достигнут! Доступно: ${limitStatus?.tier}`);
    }
  };

  const handleCreateShop = () => {
    alert('Создание магазина через бота');
  };

  // Error state
  if (!loading && error) {
    return (
      <AnimatePresence>
        {isOpen && !showAIChat && (
          <ProductErrorState
            error={error}
            onRetry={handleRetry}
            onClose={handleClose}
            triggerHaptic={triggerHaptic}
          />
        )}
      </AnimatePresence>
    );
  }

  // No shop state
  if (!loading && !myShop && !error) {
    return (
      <AnimatePresence>
        {isOpen && !showAIChat && (
          <NoShopState
            onClose={handleClose}
            onCreateShop={handleCreateShop}
            triggerHaptic={triggerHaptic}
          />
        )}
      </AnimatePresence>
    );
  }

  // Main render
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-dark-bg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <PageHeader title="Мои товары" onBack={handleClose} variant="close" />
          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 100px)',
              maxHeight: '100vh',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-6 space-y-4">
              {/* Add product button */}
              {!showForm && !loading && (
                <AddProductButton
                  onClick={handleAddProduct}
                  disabled={limitStatus && !limitStatus.canAdd}
                  canAdd={limitStatus && limitStatus.canAdd}
                />
              )}

              {/* Product form */}
              <AnimatePresence>
                {showForm && (
                  <ProductForm
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleSubmitProduct}
                    saving={saving}
                    editingProduct={editingProduct}
                  />
                )}
              </AnimatePresence>

              {/* Products list */}
              {loading ? (
                <ProductLoadingState />
              ) : products.length > 0 ? (
                <ProductList
                  products={products}
                  onEdit={handleEditProduct}
                  onDelete={handleDeleteProduct}
                  t={t}
                />
              ) : (
                !showForm && <ProductEmptyState onOpenAIChat={handleOpenAIChat} />
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* AI Chat Panel */}
      {isOpen && showAIChat && (
        <AIChatPanel
          onClose={handleCloseAIChat}
          aiHistory={aiHistory}
          aiLoading={aiLoading}
          aiError={aiError}
          onSendMessage={handleSendAIMessage}
          onRetry={handleRetryAIMessage}
        />
      )}
    </AnimatePresence>
  );
}
