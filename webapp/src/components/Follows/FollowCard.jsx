import React from 'react';
import { motion } from 'framer-motion';
import { EyeIcon, ArrowPathIcon, BuildingStorefrontIcon } from '@heroicons/react/24/outline';

const FollowCard = ({ follow, onClick }) => {
  const modeLabel = follow.mode === 'monitor' ? 'Мониторинг' : 'Перепродажа';
  const ModeIcon = follow.mode === 'monitor' ? EyeIcon : ArrowPathIcon;

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
              {follow.source_shop_name}
            </h3>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              {/* Mode Badge */}
              <div className={`flex items-center gap-1 rounded-lg px-2 py-1 ${
                follow.mode === 'monitor' 
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                  : 'bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20'
              }`}>
                <ModeIcon className="h-3.5 w-3.5" />
                <span>{modeLabel}</span>
              </div>

              {/* Markup Badge */}
              {follow.mode === 'resell' && (follow.markup_percentage || follow.markup_fixed) && (
                <div className="flex items-center gap-1 rounded-lg bg-[#2ECC71]/10 px-2 py-1 border border-[#2ECC71]/20">
                  <span className="text-[#2ECC71]">
                    {follow.markup_type === 'fixed'
                      ? `+$${follow.markup_fixed || 0}`
                      : `+${follow.markup_percentage || 0}%`
                    }
                  </span>
                </div>
              )}

              <div className="text-white/40 ml-auto">
                <span className="font-semibold text-white/80">{follow.source_products_count || 0}</span>
                <span className="ml-1">товаров</span>
              </div>
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

export default FollowCard;