import { motion } from 'framer-motion';
import { memo, useCallback } from 'react';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';

const ShopCard = memo(function ShopCard({ shop, onClick }) {
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const handleClick = useCallback(() => {
    triggerHaptic('light');
    onClick?.(shop);
  }, [triggerHaptic, onClick, shop]);

  return (
    <motion.div
      onClick={handleClick}
      className="glass-card rounded-2xl p-4 cursor-pointer overflow-hidden"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      {/* Shop Image */}
      {shop.image && (
        <div className="relative w-full h-40 mb-4 rounded-xl overflow-hidden bg-dark-elevated">
          <img
            src={shop.image}
            alt={shop.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          {shop.badge && (
            <div className="absolute top-2 right-2 bg-orange-primary text-white text-xs font-bold px-3 py-1 rounded-full">
              {shop.badge}
            </div>
          )}
        </div>
      )}

      {/* Shop Info */}
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-white">{shop.name}</h3>

        {shop.description && (
          <p className="text-sm text-gray-400 line-clamp-2">{shop.description}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {shop.productsCount && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <span>
                {shop.productsCount} {t('shop.products')}
              </span>
            </div>
          )}

          {shop.subscribersCount && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <span>{shop.subscribersCount}</span>
            </div>
          )}
        </div>

        {/* Price */}
        {shop.subscriptionPrice && (
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <span className="text-sm text-gray-400">{t('shop.subscribe')}</span>
            <span className="text-lg font-bold text-orange-primary">${shop.subscriptionPrice}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default ShopCard;
