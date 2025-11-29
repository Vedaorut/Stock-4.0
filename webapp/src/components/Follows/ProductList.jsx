import React from 'react';
import { motion } from 'framer-motion';
import { CubeIcon } from '@heroicons/react/24/outline';

const ProductList = ({ products, mode, onLoadMore, hasMore, loadingMore, markupType = 'percentage' }) => {
  // Spring animation preset
  const controlSpring = { type: 'spring', stiffness: 400, damping: 32 };

  const sectionTitle = mode === 'monitor' ? 'ОТСЛЕЖИВАЕМЫЕ ТОВАРЫ' : 'СИНХРОНИЗИРОВАННЫЕ ТОВАРЫ';

  if (!products || products.length === 0) {
    return (
      <div>
        {/* Section Header */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-4">
          {sectionTitle}
        </h3>

        {/* Empty State */}
        <motion.div
          className="glass-card rounded-2xl p-12 text-center border border-white/5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={controlSpring}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <CubeIcon className="w-8 h-8 text-gray-500" />
          </div>
          <div className="text-white font-medium mb-1">Нет товаров</div>
          <div className="text-gray-400 text-sm">
            {mode === 'monitor'
              ? 'Товары появятся здесь когда магазин добавит их'
              : 'Товары будут синхронизированы автоматически'}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      {/* Section Header */}
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-4">
        {sectionTitle}
      </h3>

      {/* Products List */}
      <div className="space-y-3 pb-24">
        {products.map((product, index) => {
          if (mode === 'monitor') {
            // Monitor mode: показываем оригинальные товары
            return (
              <motion.div
                key={product.id || index}
                className="group relative overflow-hidden rounded-xl border border-white/5 p-4 transition-colors duration-200 glass-card hover:border-white/10 hover:bg-white/[0.04]"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, ...controlSpring }}
              >
                <span
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ boxShadow: '0 18px 38px rgba(255, 107, 0, 0.12)' }}
                  aria-hidden="true"
                />

                <div className="relative flex items-center justify-between gap-4">
                  {/* Product Name */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-white text-base font-semibold"
                      style={{
                        letterSpacing: '-0.01em',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                      }}
                    >
                      {product.name}
                    </h3>
                    {/* Preorder Badge */}
                    {(product.is_preorder || product.availability === 'preorder') && (
                      <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-400/50 bg-blue-500/15 text-[10px] font-semibold text-blue-200 uppercase tracking-wider">
                        <span>🔖</span>
                        <span>Предзаказ</span>
                      </div>
                    )}
                  </div>

                  {/* Price & Stock */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div
                      className="text-white text-xl font-bold tabular-nums"
                      style={{ letterSpacing: '-0.02em' }}
                    >
                      ${product.price}
                    </div>
                    <div className="bg-white/5 px-2.5 py-1 rounded-lg">
                      <span className="text-gray-400 text-xs font-medium">
                        {product.stock_quantity} шт
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          } else {
            // Resell mode: показываем source + synced
            const sourceProduct = product.source_product || {};
            const syncedProduct = product.synced_product || {};
            const sourcePrice = Number(sourceProduct.price);
            const followerPrice = Number(syncedProduct.price);
            const hasMarkup =
              Number.isFinite(sourcePrice) && sourcePrice > 0 && Number.isFinite(followerPrice);
            
            // Calculate markup display based on type
            const priceDiff = followerPrice - sourcePrice;
            const markupPercent = hasMarkup
              ? Math.round(((followerPrice - sourcePrice) / sourcePrice) * 100)
              : null;
            const markupFixed = hasMarkup ? priceDiff.toFixed(2) : null;

            return (
              <motion.div
                key={product.id || index}
                className="group relative overflow-hidden rounded-xl border border-white/5 p-5 transition-colors duration-200 glass-card hover:border-orange-primary/20 hover:bg-white/[0.04]"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, ...controlSpring }}
              >
                <span
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ boxShadow: '0 18px 38px rgba(255, 107, 0, 0.12)' }}
                  aria-hidden="true"
                />

                {/* Product Header - название */}
                <div className="relative mb-3">
                  <h3
                    className="text-white text-base font-semibold"
                    style={{
                      letterSpacing: '-0.01em',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                    }}
                  >
                    {sourceProduct.name || syncedProduct.name}
                  </h3>
                  {/* Preorder Badge */}
                  {(sourceProduct.is_preorder ||
                    sourceProduct.availability === 'preorder' ||
                    syncedProduct.is_preorder ||
                    syncedProduct.availability === 'preorder') && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-400/50 bg-blue-500/15 text-[10px] font-semibold text-blue-200 uppercase tracking-wider">
                      <span>🔖</span>
                      <span>Предзаказ</span>
                    </div>
                  )}
                </div>

                {/* Price + Stock - одна чистая строка */}
                <div className="relative flex items-center justify-between">
                  {/* Цены - исходная и ваша */}
                  <div className="flex flex-col gap-0.5">
                    {/* Цена магазина - серая, мелкая */}
                    <div className="text-xs text-gray-400">
                      Цена магазина: <span className="font-medium">${sourceProduct.price}</span>
                    </div>
                    {/* Ваша цена - крупно, оранжевая */}
                    <div className="flex items-center gap-2">
                      <div
                        className="text-orange-primary text-xl font-bold tabular-nums"
                        style={{ letterSpacing: '-0.02em' }}
                      >
                        ${syncedProduct.price}
                      </div>
                      {hasMarkup && (
                        <span className="text-xs font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                          {markupType === 'fixed'
                            ? `+$${markupFixed}`
                            : `+${markupPercent}%`
                          }
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Количество - компактно справа */}
                  <div className="bg-white/5 px-2.5 py-1 rounded-lg">
                    <span className="text-gray-400 text-xs font-medium">
                      {syncedProduct.stock_quantity} шт
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          }
        })}
      </div>

      {/* Load More button */}
      {hasMore && (
        <motion.button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="glass-card w-full py-3.5 rounded-xl text-orange-primary font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: loadingMore ? 1 : 0.98 }}
        >
          {loadingMore ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-orange-primary border-t-transparent rounded-full animate-spin" />
              <span>Загрузка...</span>
            </div>
          ) : (
            'Загрузить еще'
          )}
        </motion.button>
      )}
    </div>
  );
};

export default ProductList;
