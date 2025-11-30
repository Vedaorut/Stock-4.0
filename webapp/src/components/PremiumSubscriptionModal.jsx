import React from 'react';
import { CheckIcon, BoltIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

/**
 * Premium Subscription Modal
 * 
 * Design Philosophy:
 * - Dark aesthetic (Deep Graphite/Black)
 * - Glassmorphism & Metallic textures
 * - "Apple Card" / "Revolut Metal" vibes
 * - Mobile-first, single screen (no scroll)
 */
const PremiumSubscriptionModal = ({ isOpen = true, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with deep blur */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-sm overflow-hidden rounded-[32px] border border-white/10 bg-[#0D0D0F] shadow-2xl"
      >
        {/* Background Ambient Glows */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-amber-500/10 blur-[100px]" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 pt-6">
          <div>
            <h2 className="text-xl font-semibold text-white tracking-tight">Membership</h2>
            <p className="text-xs text-white/40">Manage your access level</p>
          </div>
          <button 
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content Stack */}
        <div className="relative flex flex-col gap-4 p-6">
          
          {/* BASIC CARD (Standard) */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-5 transition-all active:scale-[0.98]">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
                  <BoltIcon className="h-4 w-4" />
                </div>
                <span className="font-medium text-white/90">Basic</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-white">$25</span>
                <span className="text-xs text-white/40">/mo</span>
              </div>
            </div>
            
            <ul className="space-y-2">
              <FeatureItem text="Standard Market Analytics" />
              <FeatureItem text="5 Active Alerts" />
              <FeatureItem text="Community Access" />
            </ul>
          </div>

          {/* PRO CARD (Premium/Metal) */}
          <div className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#1C1910] via-[#0D0D0F] to-[#000000] p-5 shadow-[0_0_40px_-10px_rgba(212,175,55,0.15)]">
            {/* Metal Sheen Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#D4AF37]/5 to-transparent opacity-50" />
            
            <div className="relative flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-[#D4AF37] to-[#8A6E1C] text-black shadow-lg shadow-amber-900/40">
                  <SparklesIcon className="h-4 w-4" />
                </div>
                <div>
                  <span className="block font-bold text-[#E8DCC0]">PRO</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#D4AF37] drop-shadow-sm">Current Plan</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-[#E8DCC0] drop-shadow-sm">$35</span>
                <span className="text-xs text-[#D4AF37]/60">/mo</span>
              </div>
            </div>

            <ul className="relative space-y-2 mb-4">
              <FeatureItem text="Real-time AI Predictions" active />
              <FeatureItem text="Unlimited Watchlist" active />
              <FeatureItem text="Priority Support 24/7" active />
            </ul>

            {/* Active Status Indicator - Integrated */}
            <div className="relative mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37]/10 py-2.5 text-xs font-semibold text-[#D4AF37] border border-[#D4AF37]/20">
               <div className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.8)] animate-pulse" />
               MEMBERSHIP ACTIVE
            </div>
          </div>

        </div>

        {/* Footer / Action */}
        <div className="p-6 pt-0">
          <p className="text-center text-[10px] text-white/30">
            Next billing date: December 30, 2025
          </p>
        </div>
      </motion.div>
    </div>
  );
};

// Helper Component for features
const FeatureItem = ({ text, active = false }) => (
  <li className="flex items-center gap-3">
    <CheckIcon className={`h-3.5 w-3.5 ${active ? "text-[#D4AF37]" : "text-white/40"}`} />
    <span className={`text-xs ${active ? "text-white/90" : "text-white/60"}`}>{text}</span>
  </li>
);

export default PremiumSubscriptionModal;
