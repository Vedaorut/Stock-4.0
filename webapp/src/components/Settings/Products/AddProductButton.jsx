import { motion } from 'framer-motion';
import { useTranslation } from '../../../i18n/useTranslation';

/**
 * AddProductButton - Button to add new product
 */
function AddProductButton({ onClick, disabled, canAdd }) {
  const { t } = useTranslation();

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="w-full h-14 rounded-2xl font-semibold text-white disabled:opacity-50"
      style={{
        background: canAdd
          ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
          : 'rgba(255, 255, 255, 0.1)',
        boxShadow: canAdd
          ? '0 4px 16px rgba(255, 107, 0, 0.3)'
          : 'none',
      }}
      whileTap={canAdd ? { scale: 0.98 } : {}}
    >
      {t('products.addProduct')}
    </motion.button>
  );
}

export default AddProductButton;
