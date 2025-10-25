import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';

// Worker Card Component
function WorkerCard({ worker, onRemove, isOwner }) {
  const { triggerHaptic, confirm } = useTelegram();

  const handleRemove = async () => {
    triggerHaptic('medium');
    const confirmed = await confirm(`Удалить сотрудника @${worker.username || worker.telegram_id}?`);
    if (confirmed) {
      triggerHaptic('success');
      onRemove(worker.id);
    }
  };

  return (
    <motion.div
      className="glass-card rounded-xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-full bg-orange-primary/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            {worker.username && (
              <p className="text-white font-medium">@{worker.username}</p>
            )}
            <p className="text-sm text-gray-400 font-mono truncate">
              ID: {worker.telegram_id}
            </p>
          </div>
        </div>
        {!isOwner && (
          <motion.button
            onClick={handleRemove}
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
        )}
      </div>
    </motion.div>
  );
}

// Main Modal Component
export default function WorkspaceModal({ isOpen, onClose }) {
  const { triggerHaptic, alert } = useTelegram();
  const { fetchApi } = useApi();

  const [myShop, setMyShop] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [telegramId, setTelegramId] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get shop
      const shopsRes = await fetchApi('/shops/my');
      const shop = shopsRes?.data?.[0] || null;
      setMyShop(shop);

      if (shop) {
        const proTier = shop.tier === 'pro';
        setIsPro(proTier);

        if (proTier) {
          const workersRes = await fetchApi(`/shops/${shop.id}/workers`);
          setWorkers(workersRes.data || []);
        } else {
          setWorkers([]);
          setShowForm(false);
        }
      } else {
        setIsPro(false);
        setWorkers([]);
        setShowForm(false);
      }
    } catch (error) {
      console.error('Error loading workers:', error);
      setIsPro(false);
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWorker = async () => {
    if (!myShop) {
      await alert('Сначала создайте магазин');
      return;
    }

    if (!isPro) {
      await alert('Работники доступны только на тарифе PRO');
      return;
    }

    const input = telegramId.trim();
    if (!input) {
      await alert('Введите Telegram ID');
      return;
    }

    const numericId = Number.parseInt(input, 10);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      await alert('Telegram ID должен быть положительным числом');
      return;
    }

    try {
      await fetchApi(`/shops/${myShop.id}/workers`, {
        method: 'POST',
        body: JSON.stringify({ telegram_id: numericId })
      });

      triggerHaptic('success');
      setTelegramId('');
      setShowForm(false);
      await loadData();
    } catch (error) {
      await alert(error.message || 'Ошибка добавления сотрудника');
    }
  };

  const handleRemoveWorker = async (workerId) => {
    try {
      await fetchApi(`/shops/${myShop.id}/workers/${workerId}`, {
        method: 'DELETE'
      });

      triggerHaptic('success');
      await loadData();
    } catch (error) {
      await alert(error.message || 'Ошибка удаления сотрудника');
    }
  };

  const handleClose = () => {
    setShowForm(false);
    setTelegramId('');
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
            <PageHeader title="Workspace" onBack={handleClose} />
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-white mb-2">
                    У вас еще нет магазина
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Создайте магазин для управления сотрудниками
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
          <PageHeader title="Workspace" onBack={handleClose} />
          <div className="min-h-screen pb-24 pt-20">
            <div className="px-4 py-6 space-y-4">
        {/* Info / Upgrade card */}
        {isPro ? (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm text-white font-medium mb-1">
                  Сотрудники могут
                </p>
                <p className="text-xs text-gray-400">
                  Добавлять, редактировать и удалять товары в вашем магазине.
                  Полные права администратора.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-orange-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm text-white font-medium mb-1">
                  Доступно только на PRO
                </p>
                <p className="text-xs text-gray-400">
                  Апгрейд до PRO ($35/мес) откроет совместную работу: сотрудники смогут управлять товарами и продажами. Перейдите в раздел «Подписка», чтобы обновить тариф.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Add worker button */}
        {isPro && !showForm && !loading && (
          <motion.button
            onClick={() => {
              triggerHaptic('light');
              setShowForm(true);
            }}
            className="w-full h-14 rounded-2xl font-semibold text-white"
            style={{
              background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
              boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)'
            }}
            whileTap={{ scale: 0.98 }}
          >
            + Добавить сотрудника
          </motion.button>
        )}

        {/* Add worker form */}
        {isPro && (
          <AnimatePresence>
            {showForm && (
              <motion.div
                className="glass-card rounded-2xl p-4 space-y-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">
                    Telegram ID сотрудника
                  </label>
                  <input
                    type="text"
                    value={telegramId}
                    onChange={(e) => setTelegramId(e.target.value)}
                    placeholder="123456789"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-orange-primary transition-colors"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Сотрудник может узнать свой ID через бота @userinfobot
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <motion.button
                    onClick={() => {
                      triggerHaptic('light');
                      setShowForm(false);
                      setTelegramId('');
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
                    onClick={handleAddWorker}
                    disabled={!telegramId.trim()}
                    className="flex-1 h-11 rounded-xl font-semibold text-white disabled:opacity-50"
                    style={{
                      background: telegramId.trim()
                        ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
                        : 'rgba(255, 255, 255, 0.1)'
                    }}
                    whileTap={telegramId.trim() ? { scale: 0.98 } : {}}
                  >
                    Добавить
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Workers list */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          isPro && (
            workers.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-400 px-2">
                  Сотрудники ({workers.length})
                </h3>
                <AnimatePresence mode="popLayout">
                  {workers.map((worker) => (
                    <WorkerCard
                      key={worker.id}
                      worker={worker}
                      onRemove={handleRemoveWorker}
                      isOwner={worker.user_id === myShop.owner_id}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              !showForm && (
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <p className="text-gray-400 text-sm">
                    Пока нет сотрудников
                  </p>
                </div>
              )
            )
          )
        )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
