import { motion } from 'framer-motion';
import ShopCard from './ShopCard';
import { useTranslation } from '../../i18n/useTranslation';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function ShopList({ shops, onShopClick, loading = false }) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-400 mb-2">{t('subscriptions.empty')}</h3>
        <p className="text-sm text-gray-500">{t('subscriptions.emptyDesc')}</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      {shops.map((shop) => (
        <motion.div key={shop.id} variants={item}>
          <ShopCard shop={shop} onClick={onShopClick} />
        </motion.div>
      ))}
    </motion.div>
  );
}
