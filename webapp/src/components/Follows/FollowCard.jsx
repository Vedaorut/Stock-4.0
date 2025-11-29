import React from 'react';
import { motion } from 'framer-motion';
import { EyeIcon, ArrowPathIcon, BuildingStorefrontIcon } from '@heroicons/react/24/outline';

const FollowCard = ({ follow, onClick }) => {
  const modeLabel = follow.mode === 'monitor' ? 'Мониторинг' : 'Перепродажа';
  const ModeIcon = follow.mode === 'monitor' ? EyeIcon : ArrowPathIcon;

  // Spring animation preset
  const controlSpring = { type: 'spring', stiffness: 400, damping: 32 };

  return (
    <motion.button
      type="button"
      className="group relative block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      transition={controlSpring}
    >
      <div className="glass-card relative overflow-hidden rounded-2xl border border-white/10 p-5 transition-all duration-200 group-hover:border-orange-primary/35 group-hover:bg-white/[0.05]">
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ boxShadow: '0 20px 45px rgba(255, 107, 0, 0.14)' }}
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-4">
          {/* Shop Icon */}
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/5">
            <BuildingStorefrontIcon className="h-6 w-6 text-gray-400" />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <h3
              className="mb-1 truncate text-base font-bold text-white"
              style={{ letterSpacing: '-0.01em' }}
            >
              {follow.source_shop_name}
            </h3>

            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5 text-gray-400">
                <ModeIcon className="h-4 w-4" />
                <span>{modeLabel}</span>
              </div>

              {follow.mode === 'resell' && (follow.markup_percentage || follow.markup_fixed) && (
                <div className="flex items-center gap-1 rounded-md bg-orange-primary/10 px-2 py-0.5">
                  <span className="text-xs font-semibold text-orange-primary">
                    {follow.markup_type === 'fixed'
                      ? `+$${follow.markup_fixed || 0}`
                      : `+${follow.markup_percentage || 0}%`
                    }
                  </span>
                </div>
              )}

              <div className="text-gray-400">
                <span className="font-medium text-white">{follow.source_products_count || 0}</span>{' '}
                товаров
              </div>
            </div>
          </div>

          {/* Arrow */}
          <svg
            className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-200 group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.button>
  );
};

export default FollowCard;
