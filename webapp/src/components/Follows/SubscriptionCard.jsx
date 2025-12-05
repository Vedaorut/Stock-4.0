import React from 'react';
import { motion } from 'framer-motion';
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '../../i18n/useTranslation';

const SubscriptionCard = ({ subscription, onClick }) => {
  const { t } = useTranslation();
  const isActive = subscription.shop_is_active;

  return (
    <motion.button
      type="button"
      className="group relative block w-full text-left focus:outline-none"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-4 transition-all duration-300 hover:border-[#FF6B00]/30">
        {/* Hover Effect Glow */}
        <div className="absolute inset-0 bg-[#FF6B00]/0 transition-colors duration-300 group-hover:bg-[#FF6B00]/[0.03]" />

        <div className="relative flex items-center gap-4">
          {/* Shop Icon */}
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#2A2A2A] border border-white/5 shadow-inner text-white/40 group-hover:text-white transition-colors">
            <BuildingStorefrontIcon className="h-6 w-6" />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <h3 className="mb-1.5 truncate text-[17px] font-bold text-white tracking-tight group-hover:text-[#FF6B00] transition-colors">
              {subscription.shop_name}
            </h3>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              {/* Subscribed Badge */}
              <div className="flex items-center gap-1 rounded-lg px-2 py-1 bg-[#2ECC71]/10 text-[#2ECC71] border border-[#2ECC71]/20">
                <span>{t('shop.subscribed')}</span>
              </div>

              {/* Inactive Badge */}
              {!isActive && (
                <div className="flex items-center gap-1 rounded-lg px-2 py-1 bg-white/5 text-white/40 border border-white/10">
                  <span>{t('shop.inactive')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/30 transition-all duration-300 group-hover:bg-[#FF6B00] group-hover:text-white group-hover:translate-x-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </motion.button>
  );
};

export default SubscriptionCard;
