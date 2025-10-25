import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';

// Follow Card Component
function FollowCard({ follow, onModeSwitch, onDelete }) {
  const { triggerHaptic, confirm } = useTelegram();
  const [switching, setSwitching] = useState(false);

  const handleModeSwitch = async () => {
    setSwitching(true);
    triggerHaptic('light');
    await onModeSwitch(follow, follow.mode === 'monitor' ? 'resell' : 'monitor');
    setSwitching(false);
  };

  const handleDelete = async () => {
    triggerHaptic('medium');
    const confirmed = await confirm(`Отписаться от "${follow.shop?.name || 'магазина'}"?`);
    if (confirmed) {
      triggerHaptic('success');
      onDelete(follow.id);
    }
  };

  const modeColors = {
    monitor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    resell: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <motion.div
      className="glass-card rounded-2xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold mb-1 truncate">
            {follow.shop?.name || `Магазин #${follow.target_shop_id}`}
          </h3>
          {follow.shop?.description && (
            <p className="text-sm text-gray-400 truncate">
              {follow.shop.description}
            </p>
          )}
        </div>
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

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${modeColors[follow.mode]}`}>
            {follow.mode === 'monitor' ? 'Мониторинг' : 'Реселл'}
          </span>
          {follow.mode === 'resell' && follow.markup_percentage && (
            <span className="text-xs text-gray-400">
              +{follow.markup_percentage}%
            </span>
          )}
        </div>
        <motion.button
          onClick={handleModeSwitch}
          disabled={switching}
          className="px-3 py-1 rounded-lg text-xs font-medium text-orange-primary disabled:opacity-50"
          style={{
            background: 'rgba(255, 107, 0, 0.1)',
            border: '1px solid rgba(255, 107, 0, 0.2)'
          }}
          whileTap={!switching ? { scale: 0.95 } : {}}
        >
          {switching ? '...' : follow.mode === 'monitor' ? '→ Реселл' : '→ Монитор'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// Main Modal Component
export default function FollowsModal({ isOpen, onClose }) {
  const { triggerHaptic, alert } = useTelegram();
  const { fetchApi } = useApi();

  const [follows, setFollows] = useState([]);
  const [limitInfo, setLimitInfo] = useState(null);
  const [myShop, setMyShop] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const shopsRes = await fetchApi('/shops/my');
      const shopsPayload = shopsRes?.data ?? shopsRes ?? [];
      const shop = Array.isArray(shopsPayload) ? shopsPayload[0] : null;

      setMyShop(shop || null);

      if (!shop) {
        setIsPro(false);
        setFollows([]);
        setLimitInfo(null);
        return;
      }

      const proTier = (shop.tier || '').toLowerCase() === 'pro';
      setIsPro(proTier);

      const [followsRes, limitRes] = await Promise.all([
        fetchApi(`/follows/my?shopId=${shop.id}`),
        fetchApi(`/follows/check-limit?shopId=${shop.id}`)
      ]);

      const followsPayload = followsRes?.data ?? followsRes ?? {};
      const followsData = followsPayload?.data ?? followsPayload ?? [];
      setFollows(Array.isArray(followsData) ? followsData : []);

      const limitPayload = limitRes?.data ?? limitRes ?? null;
      const limitData = limitPayload?.data ?? limitPayload ?? null;
      if (limitData) {
        setLimitInfo({
          ...limitData,
          count: limitData.count != null ? Number(limitData.count) : 0,
          limit: limitData.limit === null || limitData.limit === undefined ? null : Number(limitData.limit),
          remaining: limitData.remaining === null || limitData.remaining === undefined ? null : Number(limitData.remaining)
        });
      } else {
        setLimitInfo(null);
      }
    } catch (error) {
      console.error('Error loading follows:', error);
      setFollows([]);
      setLimitInfo(null);
      setIsPro(false);
      setMyShop(null);
    } finally {
      setLoading(false);
    }
  };

  const handleModeSwitch = async (follow, newMode) => {
    try {
      const requestBody = { mode: newMode };

      if (newMode === 'resell') {
        const defaultMarkup = follow.markup_percentage || 15;
        const input = window.prompt('Наценка для реселла (1-500%)', defaultMarkup);

        if (input === null) {
          return false;
        }

        const parsed = Number.parseFloat(String(input).trim().replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
          await alert('Наценка должна быть от 1 до 500%');
          return false;
        }

        requestBody.markupPercentage = parsed;
      }

      await fetchApi(`/follows/${follow.id}/mode`, {
        method: 'PUT',
        body: JSON.stringify(requestBody)
      });

      triggerHaptic('success');
      await loadData();
      return true;
    } catch (error) {
      await alert(error.message || 'Ошибка смены режима');
      return false;
    }
  };

  const handleDeleteFollow = async (followId) => {
    try {
      await fetchApi(`/follows/${followId}`, {
        method: 'DELETE'
      });

      triggerHaptic('success');
      await loadData();
    } catch (error) {
      await alert(error.message || 'Ошибка удаления подписки');
    }
  };

  const handleSearchShop = async () => {
    if (!searchQuery.trim()) {
      await alert('Введите название магазина или @username');
      return;
    }

    setSearching(true);
    try {
      const res = await fetchApi(`/shops/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(res.data || []);
      if (res.data.length === 0) {
        await alert('Магазины не найдены');
      }
    } catch (error) {
      await alert(error.message || 'Ошибка поиска');
    } finally {
      setSearching(false);
    }
  };

  const handleAddFollow = async (shopId) => {
    if (!myShop) {
      await alert('Сначала создайте магазин');
      return;
    }

    try {
      await fetchApi('/follows', {
        method: 'POST',
        body: JSON.stringify({
          followerShopId: myShop.id,
          sourceShopId: shopId,
          mode: 'monitor'
        })
      });

      triggerHaptic('success');
      setShowAddForm(false);
      setSearchQuery('');
      setSearchResults([]);
      await loadData();
      await alert('Подписка добавлена!');
    } catch (error) {
      await alert(error.message || 'Ошибка добавления подписки');
    }
  };

  const handleClose = () => {
    setShowAddForm(false);
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  const canCreateFollow = limitInfo ? (limitInfo.canFollow !== false && !limitInfo.reached) : true;

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
            <PageHeader title="Follows" onBack={handleClose} />
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-white mb-2">
                    У вас ещё нет магазина
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Создайте магазин, чтобы управлять подписками Follows
                  </p>
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
          <PageHeader
            title="Follows"
            onBack={handleClose}
            action={
              !showAddForm && (
                <motion.button
                  onClick={() => {
                    if (canCreateFollow) {
                      triggerHaptic('light');
                      setShowAddForm(true);
                    } else {
                      alert(`Лимит достигнут! Тариф: ${limitInfo?.tier || 'BASIC'}`);
                    }
                  }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-orange-primary"
                  style={{
                    background: 'rgba(255, 107, 0, 0.1)',
                    border: '1px solid rgba(255, 107, 0, 0.2)'
                  }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </motion.button>
              )
            }
          />
          <div className="min-h-screen pb-24 pt-20">
            <div className="px-4 py-6 space-y-4">
        {/* Add Follow Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              className="glass-card rounded-2xl p-4 space-y-3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Поиск магазина
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchShop()}
                    placeholder="Название или @username"
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
                  />
                  <motion.button
                    onClick={handleSearchShop}
                    disabled={searching || !searchQuery.trim()}
                    className="px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                    style={{
                      background: searchQuery.trim()
                        ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
                        : 'rgba(255, 255, 255, 0.1)'
                    }}
                    whileTap={searchQuery.trim() ? { scale: 0.95 } : {}}
                  >
                    {searching ? '...' : 'Найти'}
                  </motion.button>
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map((shop) => (
                    <motion.div
                      key={shop.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{shop.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {shop.description || `ID: ${shop.id}`}
                        </p>
                      </div>
                      <motion.button
                        onClick={() => handleAddFollow(shop.id)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
                        style={{
                          background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
                        }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Подписаться
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              )}

              <motion.button
                onClick={() => {
                  triggerHaptic('light');
                  setShowAddForm(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="w-full h-11 rounded-xl font-medium text-gray-300"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                whileTap={{ scale: 0.98 }}
              >
                Отмена
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info card */}
        {!showAddForm && (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm text-white font-medium mb-1">
                  Мониторинг магазинов
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  • <strong>Мониторинг</strong>: Отслеживайте товары конкурентов<br />
                  • <strong>Реселл</strong>: Автоматическое копирование товаров с наценкой
                </p>
                {limitInfo && (
                  <p className="text-xs text-orange-primary">
                    Лимит: {limitInfo.count ?? 0} / {limitInfo.limit === null ? '∞' : limitInfo.limit}
                    {limitInfo.tier ? ` (${limitInfo.tier})` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Follows list */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : follows.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 px-2">
              Подписки ({follows.length})
            </h3>
            <AnimatePresence mode="popLayout">
              {follows.map((follow) => (
                <FollowCard
                  key={follow.id}
                  follow={follow}
                  onModeSwitch={handleModeSwitch}
                  onDelete={handleDeleteFollow}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h3 className="text-lg font-bold text-white mb-2">
              Нет подписок
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Используйте бота для подписки на магазины
            </p>
            <p className="text-xs text-gray-500">
              Команда: /search_shop
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
