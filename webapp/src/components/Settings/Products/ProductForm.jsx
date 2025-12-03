import { motion } from 'framer-motion';
import { useTranslation } from '../../../i18n/useTranslation';

/**
 * ProductForm - Add/Edit product form
 */
function ProductForm({ formData, setFormData, onSubmit, saving, editingProduct }) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="glass-card rounded-2xl p-4 space-y-3"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <div>
        <label className="text-sm text-gray-400 mb-2 block">{t('products.nameLabel')}</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={t('products.namePlaceholder')}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400 mb-2 block">{t('products.priceLabel')}</label>
          <input
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            placeholder={t('products.pricePlaceholder')}
            step="0.01"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-2 block">{t('products.stockLabel')}</label>
          <input
            type="number"
            value={formData.stock}
            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
            placeholder={t('products.stockPlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-orange-primary transition-colors"
          />
        </div>
      </div>

      {/* Availability Type Toggle */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-400 mb-2">{t('products.availabilityType')}</label>
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, is_preorder: false }))}
            whileTap={{ scale: 0.98 }}
            className={`py-3 px-4 rounded-xl font-medium transition-all ${
              !formData.is_preorder
                ? 'bg-gradient-to-r from-orange-primary to-orange-light text-white shadow-lg'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t('products.inStock')}
          </motion.button>
          <motion.button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, is_preorder: true }))}
            whileTap={{ scale: 0.98 }}
            className={`py-3 px-4 rounded-xl font-medium transition-all ${
              formData.is_preorder
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {t('products.preorder')}
          </motion.button>
        </div>
        {formData.is_preorder && (
          <p className="text-xs text-blue-400 mt-2">
            {t('products.preorderHint')}
          </p>
        )}
      </div>

      {/* Inline Save Button */}
      <motion.button
        onClick={onSubmit}
        disabled={!formData.name || !formData.price || saving}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50 mt-2"
        style={{
          background:
            formData.name && formData.price
              ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
              : 'rgba(255, 255, 255, 0.1)',
        }}
        whileTap={formData.name && formData.price ? { scale: 0.98 } : {}}
      >
        {saving ? t('products.saving') : editingProduct ? t('common.save') : t('products.create')}
      </motion.button>
    </motion.div>
  );
}

export default ProductForm;
