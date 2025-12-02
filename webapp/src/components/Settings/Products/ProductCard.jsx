import { motion } from 'framer-motion';
import { useTelegram } from '../../../hooks/useTelegram';
import SyncedBadge from './SyncedBadge';

/**
 * ProductCard - Single product card with edit/delete actions
 */
function ProductCard({ product, onEdit, onDelete, t }) {
  const { triggerHaptic, confirm } = useTelegram();

  const handleDelete = async () => {
    triggerHaptic('medium');
    const confirmed = await confirm(`Удалить "${product.name}"?`);
    if (confirmed) {
      triggerHaptic('success');
      onDelete(product.id);
    }
  };

  return (
    <motion.div
      className="glass-card rounded-2xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="text-white font-semibold">{product.name}</h3>
            {!product.is_available && (
              <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                Недоступен
              </span>
            )}
            {(product.is_preorder || product.availability === 'preorder') && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-200 bg-blue-500/15 px-2 py-0.5 rounded-full border border-blue-400/50">
                <span>🔖</span>
                <span>Предзаказ</span>
              </span>
            )}
            {product.is_synced && (
              <SyncedBadge sourceName={product.source_shop_name} t={t} />
            )}
          </div>
          {product.description && (
            <p className="text-gray-400 text-sm mb-2">{product.description}</p>
          )}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-orange-primary font-bold">${parseFloat(product.price || 0).toFixed(2)}</span>
            <span className="text-gray-500">В наличии: {product.stock || 0}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button
            onClick={() => !product.is_synced && onEdit(product)}
            disabled={product.is_synced}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-blue-400 ${product.is_synced ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}
            whileTap={product.is_synced ? {} : { scale: 0.9 }}
            title={product.is_synced ? t('product.syncedEditDisabled') : undefined}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </motion.button>
          <motion.button
            onClick={() => !product.is_synced && handleDelete()}
            disabled={product.is_synced}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-red-400 ${product.is_synced ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{
              background: 'rgba(255, 59, 48, 0.1)',
              border: '1px solid rgba(255, 59, 48, 0.2)',
            }}
            whileTap={product.is_synced ? {} : { scale: 0.9 }}
            title={product.is_synced ? t('product.syncedDeleteDisabled') : undefined}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

export default ProductCard;
