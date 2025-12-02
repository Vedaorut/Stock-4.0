import { motion } from 'framer-motion';

/**
 * ProductEmptyState - Empty state when no products exist
 */
function ProductEmptyState({ onOpenAIChat }) {
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
      <h3 className="text-xl font-bold text-white mb-2">Управление товарами</h3>
      <p className="text-gray-400 text-sm mb-1">
        Добавляйте и редактируйте товары здесь.
      </p>
      <p className="text-gray-400 text-sm mb-6">
        После добавления покупатели увидят их в каталоге.
      </p>

      <motion.button
        onClick={onOpenAIChat}
        className="inline-flex items-center gap-2 h-11 px-6 rounded-xl font-medium text-orange-primary"
        style={{
          background: 'rgba(255, 107, 0, 0.1)',
          border: '1px solid rgba(255, 107, 0, 0.3)',
        }}
        whileTap={{ scale: 0.98 }}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        Добавить через AI чат
      </motion.button>
    </div>
  );
}

export default ProductEmptyState;
