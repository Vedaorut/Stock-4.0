import { motion } from 'framer-motion';
import { useTranslation } from '../../../i18n/useTranslation';

/**
 * ProductEmptyState - Empty state when no products exist
 */
function ProductEmptyState({ onOpenAIChat: _onOpenAIChat }) {
  const { t } = useTranslation();

  return (
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
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
      <h3 className="text-xl font-bold text-white mb-2">{t('products.management')}</h3>
      <p className="text-gray-400 text-sm mb-1">
        {t('products.addEditHere')}
      </p>
      <p className="text-gray-400 text-sm mb-6">
        {t('products.buyersWillSee')}
      </p>

      <p className="text-gray-400 text-sm mb-6">
        {t('products.buyersWillSee')}
      </p>
    </div>
  );
}

export default ProductEmptyState;
