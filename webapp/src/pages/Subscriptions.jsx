import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Layout/Header';
import { useShopApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n/useTranslation';

export default function Subscriptions() {
  const [loading, setLoading] = useState(true);
  const { subscriptions, setSubscriptions } = useStore();
  const { getSubscriptions } = useShopApi();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  useEffect(() => {
    // Используем mock данные вместо API
    setLoading(false);
    // loadSubscriptions(); // Закомментировано для демо
  }, []);

  const loadSubscriptions = async () => {
    setLoading(true);
    const { data, error } = await getSubscriptions();

    if (data) {
      setSubscriptions(data);
    }

    setLoading(false);
  };

  const handleShopClick = (shop) => {
    triggerHaptic('medium');
    const { setCurrentShop, setActiveTab } = useStore.getState();
    setCurrentShop(shop);
    setActiveTab('catalog');
  };

  const handleUnsubscribe = (e, shopId) => {
    e.stopPropagation(); // Prevent shop click
    triggerHaptic('medium');
    // TODO: Implement unsubscribe API call
    console.log('Unsubscribe from shop:', shopId);
    // После реализации API, обновить список подписок
    // setSubscriptions(subscriptions.filter(sub => sub.shopId !== shopId));
  };

  return (
    <div className="min-h-screen pb-24 pt-20">
      <Header title={t('subscriptions.title')} />

      <div className="px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">{t('subscriptions.empty')}</h3>
            <p className="text-sm text-gray-500 mb-6">{t('subscriptions.emptyDesc')}</p>
            <motion.button
              onClick={() => useStore.getState().setActiveTab('catalog')}
              className="touch-target bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 rounded-xl transition-colors duration-300"
              whileTap={{ scale: 0.95 }}
            >
              {t('catalog.goToSubscriptions')}
            </motion.button>
          </div>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((subscription) => (
              <motion.div
                key={subscription.id}
                onClick={() => handleShopClick(subscription.shop)}
                className="glass-card rounded-2xl p-4 cursor-pointer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-4">
                  {subscription.shop?.image && (
                    <div className="w-16 h-16 rounded-xl bg-dark-elevated overflow-hidden flex-shrink-0">
                      <img
                        src={subscription.shop.image}
                        alt={subscription.shop.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-1">
                      {subscription.shop?.name}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {new Date(subscription.subscribedAt).toLocaleDateString('ru-RU')}
                    </p>
                    {subscription.shop?.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                        {subscription.shop.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.button
                      onClick={(e) => handleUnsubscribe(e, subscription.shopId)}
                      className="touch-target bg-dark-elevated hover:bg-dark-card text-gray-400 font-semibold px-3 py-2 rounded-xl transition-colors text-sm"
                      whileTap={{ scale: 0.95 }}
                    >
                      {t('subscriptions.unsubscribe')}
                    </motion.button>
                    <svg className="w-6 h-6 text-orange-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
