import { motion } from 'framer-motion';
import PageHeader from '../../common/PageHeader';

/**
 * ProductErrorState - Error state with retry button
 */
function ProductErrorState({ error, onRetry, onClose, triggerHaptic }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-dark-bg"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <PageHeader title="Мои товары" onBack={onClose} variant="close" />
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
              className="w-20 h-20 mx-auto mb-4 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">Ошибка загрузки</h3>
            <p className="text-red-400 text-sm mb-6">{error}</p>
            <motion.button
              onClick={() => {
                triggerHaptic('medium');
                onRetry();
              }}
              className="h-12 px-6 rounded-xl font-semibold text-white"
              style={{
                background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)',
              }}
              whileTap={{ scale: 0.98 }}
            >
              Повторить
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default ProductErrorState;
