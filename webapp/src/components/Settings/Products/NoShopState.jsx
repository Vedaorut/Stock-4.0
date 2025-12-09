import { motion } from 'framer-motion';
import PageHeader from '../../common/PageHeader';
import { useTranslation } from '../../../i18n/useTranslation';

/**
 * NoShopState - State when user has no shop
 */
function NoShopState({ onClose, onCreateShop, triggerHaptic }) {
  const { t } = useTranslation();

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-dark-bg"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <PageHeader title={t('products.title')} onBack={onClose} variant="close" />
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
            <h3 className="text-xl font-bold text-white mb-2">{t('products.noShop')}</h3>
            <p className="text-gray-400 text-sm mb-6">{t('products.noShopDesc')}</p>
            <motion.button
              onClick={() => {
                triggerHaptic('medium');
                onCreateShop();
              }}
              className="h-12 px-6 rounded-xl font-semibold text-white"
              style={{
                background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)',
              }}
              whileTap={{ scale: 0.98 }}
            >
              {t('products.createShop')}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default NoShopState;
