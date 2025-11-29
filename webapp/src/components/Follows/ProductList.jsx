import React from 'react';
import { motion } from 'framer-motion';
import { CubeIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';

const ProductList = ({
  products,
  mode,
  onLoadMore,
  hasMore,
  loadingMore,
  markupType = 'percentage',
  onEditProductMarkup,
  globalMarkup = { percentage: 0, fixed: 0 },
}) => {
  const sectionTitle = mode === 'monitor' ? 'Отслеживаемые товары' : 'Синхронизированные товары';

  // Empty state
  if (!products || products.length === 0) {
    return (
      <div className="py-8">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-4">
          {sectionTitle}
        </h3>

        <motion.div
          className="glass-card rounded-2xl p-12 text-center border border-white/5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <CubeIcon className="w-8 h-8 text-gray-500" />
          </div>
          <div className="text-white font-medium mb-1">Нет товаров</div>
          <div className="text-gray-400 text-sm">
            {mode === 'monitor'
              ? 'Товары появятся когда магазин их добавит'
              : 'Товары будут синхронизированы автоматически'}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {sectionTitle}
        </h3>
        <span className="text-xs text-gray-500">
          {products.length} шт
        </span>
      </div>

      {/* Products List */}
      <div className="space-y-3 pb-24">
        {products.map((product, index) => {
          if (mode === 'monitor') {
            // Monitor mode - simple display
            return (
              <motion.div
                key={product.id || index}
                className="glass-card rounded-xl border border-white/5 p-4 transition-colors hover:border-white/10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Product Name */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-white text-sm font-medium"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {product.name}
                    </h3>
                    {(product.is_preorder || product.availability === 'preorder') && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold text-blue-400 bg-blue-500/10">
                        Предзаказ
                      </span>
                    )}
                  </div>

                  {/* Price & Stock */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-lg font-bold text-white">
                      ${product.price}
                    </span>
                    <div className="bg-white/5 px-2 py-1 rounded-lg">
                      <span className="text-gray-400 text-xs">
                        {product.stock_quantity} шт
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          } else {
            // Resell mode - show source + synced with markup
            const sourceProduct = product.source_product || {};
            const syncedProduct = product.synced_product || {};
            const sourcePrice = Number(sourceProduct.price);
            const followerPrice = Number(syncedProduct.price);
            const hasMarkup = Number.isFinite(sourcePrice) && sourcePrice > 0 && Number.isFinite(followerPrice);

            const customMarkup = product.custom_markup || {};
            const hasCustomMarkup = customMarkup.type !== null && customMarkup.type !== undefined;

            const priceDiff = followerPrice - sourcePrice;
            const markupPercent = hasMarkup ? Math.round(((followerPrice - sourcePrice) / sourcePrice) * 100) : null;
            const markupFixedDisplay = hasMarkup ? priceDiff.toFixed(2) : null;
            const effectiveMarkupType = hasCustomMarkup ? customMarkup.type : markupType;

            return (
              <motion.div
                key={product.id || index}
                className="glass-card rounded-xl border border-white/5 p-4 transition-colors hover:border-orange-primary/20"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                {/* Custom markup indicator */}
                {hasCustomMarkup && (
                  <div className="mb-3 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">
                      Своя наценка
                    </span>
                  </div>
                )}

                {/* Product Name */}
                <h3
                  className="text-white text-sm font-medium mb-3"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {sourceProduct.name || syncedProduct.name}
                </h3>

                {(sourceProduct.is_preorder || syncedProduct.is_preorder) && (
                  <span className="inline-block mb-3 px-2 py-0.5 rounded text-[10px] font-semibold text-blue-400 bg-blue-500/10">
                    Предзаказ
                  </span>
                )}

                {/* Price Row */}
                <div className="flex items-end justify-between">
                  {/* Prices */}
                  <div className="flex flex-col gap-1">
                    {/* Source price */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Магазин:</span>
                      <span className="text-sm text-gray-400 line-through">
                        ${sourceProduct.price}
                      </span>
                    </div>

                    {/* Your price */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Ваша:</span>
                      <span className="text-xl font-bold text-orange-primary">
                        ${syncedProduct.price}
                      </span>
                      {hasMarkup && (
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            hasCustomMarkup
                              ? 'text-purple-400 bg-purple-500/10'
                              : 'text-green-400 bg-green-500/10'
                          }`}
                        >
                          {effectiveMarkupType === 'fixed'
                            ? `+$${markupFixedDisplay}`
                            : `+${markupPercent}%`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock + Edit */}
                  <div className="flex items-center gap-2">
                    <div className="bg-white/5 px-2 py-1 rounded-lg">
                      <span className="text-gray-400 text-xs">
                        {syncedProduct.stock_quantity} шт
                      </span>
                    </div>

                    {onEditProductMarkup && (
                      <motion.button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProductMarkup(product);
                        }}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:bg-orange-primary/10 hover:text-orange-primary transition-all"
                        whileTap={{ scale: 0.95 }}
                      >
                        <AdjustmentsHorizontalIcon className="w-4 h-4" />
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          }
        })}
      </div>

      {/* Load More */}
      {hasMore && (
        <motion.button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl bg-white/5 text-orange-primary font-semibold disabled:opacity-50 hover:bg-white/10 transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.98 }}
        >
          {loadingMore ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-orange-primary border-t-transparent rounded-full animate-spin" />
              <span>Загрузка...</span>
            </div>
          ) : (
            'Загрузить ещё'
          )}
        </motion.button>
      )}
    </div>
  );
};

export default ProductList;
