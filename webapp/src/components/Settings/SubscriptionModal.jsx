import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useTranslation } from '../../i18n/useTranslation';

// Compact Plan Card
function PlanCard({ name, price, features, isActive, onSelect, delay = 0, t, currentTier }) {
  const { triggerHaptic } = useTelegram();
  const shouldReduceMotion = useReducedMotion();
  const isMax = name === 'max';
  const isPro = name === 'pro';
  const isPremiumTier = isMax || isPro;
  // Disable Pro selection when user has Max tier (prevent downgrade)
  const isDowngrade = isPro && currentTier === 'max';

  return (
    <motion.div
      className="relative flex flex-col h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      {/* Card */}
      <div
        className={`relative flex-1 rounded-2xl p-4 overflow-hidden ${isMax ? 'bg-gradient-to-br from-purple-500/20 via-purple-600/10 to-transparent' : isPro ? 'bg-gradient-to-br from-orange-500/20 via-orange-600/10 to-transparent' : 'bg-white/5'
          }`}
        style={{
          border: isActive
            ? '2px solid rgba(34, 197, 94, 0.5)'
            : isMax
              ? '1px solid rgba(168, 85, 247, 0.3)'
              : isPro
                ? '1px solid rgba(255, 107, 0, 0.3)'
                : '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Active badge */}
        {isActive && (
          <motion.div
            className="absolute -top-px -right-px"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: delay + 0.2 }}
          >
            <div className="px-2 py-1 text-[10px] font-bold text-white bg-green-500 rounded-bl-lg rounded-tr-xl">
              ACTIVE
            </div>
          </motion.div>
        )}

        {/* PRO/MAX shine effect */}
        {isPremiumTier && !shouldReduceMotion && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.05) 50%, transparent 55%)',
            }}
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
          />
        )}

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${isMax
              ? 'bg-gradient-to-br from-purple-400 to-purple-600'
              : isPro
                ? 'bg-gradient-to-br from-orange-400 to-orange-600'
                : 'bg-gray-600/50'
              }`}
          >
            {isMax ? (
              <span className="text-sm">👑</span>
            ) : isPro ? (
              <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            )}
          </div>
          <span className={`text-base font-bold uppercase tracking-wide ${isMax ? 'text-purple-400' : isPro ? 'text-orange-400' : 'text-gray-300'}`}>
            {name}
          </span>
        </div>

        {/* Price */}
        <div className="mb-3">
          <span className="text-2xl font-black text-white">${price}</span>
          <span className="text-xs text-gray-500 ml-1">/mo</span>
        </div>

        {/* Features - compact */}
        <ul className="space-y-1.5 mb-4">
          {features.slice(0, 4).map((feature, i) => (
            <motion.li
              key={i}
              className="flex items-start gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: delay + 0.1 * i }}
            >
              <svg
                className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isMax ? 'text-purple-400' : isPro ? 'text-orange-400' : 'text-gray-500'}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] text-gray-400 leading-tight">{t(feature)}</span>
            </motion.li>
          ))}
        </ul>

        {/* Action */}
        {isActive ? (
          <div className="w-full py-2.5 rounded-xl text-xs font-bold text-center text-green-400 bg-green-500/10 border border-green-500/20">
            {t('subscription.activePlan')}
          </div>
        ) : isDowngrade ? (
          <div className="w-full py-2.5 rounded-xl text-xs font-bold text-center text-gray-500 bg-white/5 border border-white/10">
            {t('subscription.yourTierIsHigher')}
          </div>
        ) : (
          <motion.button
            onClick={() => {
              triggerHaptic('medium');
              onSelect?.();
            }}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${isMax
              ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/25'
              : isPro
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                : 'bg-white/10 text-gray-300 hover:bg-white/15'
              }`}
            whileTap={{ scale: 0.97 }}
          >
            {isMax ? t('subscription.switchToMax') : isPro ? t('subscription.switchToPro') : t('subscription.select')}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// Main Component
export default function SubscriptionModal({ isOpen, onClose }) {
  const { alert } = useTelegram();
  const { fetchApi } = useApi();
  const { t } = useTranslation();

  const [myShop, setMyShop] = useState(null);
  const [status, setStatus] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const handleClose = useCallback(() => onClose(), [onClose]);
  useBackButton(isOpen ? handleClose : null);

  const loadData = useCallback(async (signal) => {
    const shopsRes = await fetchApi('/shops/my', { signal, timeout: 10000 });
    if (signal?.aborted) return;

    const shops = Array.isArray(shopsRes?.data) ? shopsRes.data : [];
    if (shops.length === 0) return;

    const shop = shops[0];
    setMyShop(shop);

    const [statusRes, historyRes, pricingRes] = await Promise.all([
      fetchApi(`/subscriptions/status/${shop.id}`, { signal, timeout: 10000 }),
      fetchApi(`/subscriptions/history/${shop.id}?limit=3`, { signal, timeout: 10000 }),
      fetchApi('/subscriptions/pricing', { signal, timeout: 10000 }),
    ]);

    if (signal?.aborted) return;

    setStatus(statusRes);
    setHistory(Array.isArray(historyRes?.data) ? historyRes.data : []);
    setPricing(pricingRes);
  }, [fetchApi]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const controller = new AbortController();
    loadData(controller.signal).finally(() => setLoading(false));
    return () => controller.abort();
  }, [isOpen, loadData]);

  const handleSelectPlan = async (plan) => {
    await alert(plan === 'max'
      ? t('subscription.goToBotMax')
      : t('subscription.goToBotChange')
    );
  };

  // No shop state
  if (!loading && !myShop) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-dark-bg"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <PageHeader title="Subscription" onBack={handleClose} variant="close" />
            <div
              className="flex items-center justify-center"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 80px)' }}
            >
              <div className="text-center px-8">
                <motion.div
                  className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center"
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring' }}
                >
                  <span className="text-3xl">🏪</span>
                </motion.div>
                <p className="text-gray-400 text-sm">{t('common.createShop')}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const currentTier = status?.tier || 'pro';

  // Check for lifetime subscription (period_end is null or > 10 years in future)
  const isLifetime = (() => {
    // If period_end is null (from currentSubscription), it's lifetime
    if (status?.currentSubscription?.period_end === null) return true;
    // If expiresAt is more than 10 years in future, it's lifetime
    if (status?.expiresAt) {
      const tenYearsFromNow = new Date();
      tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
      return new Date(status.expiresAt) > tenYearsFromNow;
    }
    return false;
  })();

  const daysLeft = isLifetime
    ? null
    : status?.expiresAt
      ? Math.max(0, Math.ceil((new Date(status.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)))
      : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-dark-bg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <PageHeader title={t('settings.items.subscription')} onBack={handleClose} variant="close" />

          <div
            className="flex-1 flex flex-col px-4 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 60px)',
              paddingBottom: 'calc(var(--tabbar-total, 80px) + 16px)',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
            }}
          >
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <motion.div
                  className="w-10 h-10 rounded-full border-2 border-orange-500/30 border-t-orange-500"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            ) : (
              <>
                {/* Status bar - compact */}
                <motion.div
                  className="flex items-center justify-between py-3 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${status?.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <span className="text-white font-semibold">{currentTier.toUpperCase()}</span>
                      {isLifetime ? (
                        <span className="text-green-400 text-xs ml-2">• {t('subscription.lifetime')}</span>
                      ) : daysLeft !== null && (
                        <span className="text-gray-500 text-xs ml-2">• {daysLeft}{t('subscription.daysLeft')}</span>
                      )}
                    </div>
                  </div>
                  {currentTier === 'max' && (
                    <span className="text-lg">👑</span>
                  )}
                  {currentTier === 'pro' && (
                    <span className="text-lg">⭐</span>
                  )}
                </motion.div>

                {/* Plans grid - 2 columns */}
                <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
                  {pricing?.pro && (
                    <PlanCard
                      name="pro"
                      price={pricing.pro.pricing?.month || pricing.pro.price}
                      features={pricing.pro.features}
                      isActive={currentTier === 'pro'}
                      onSelect={() => handleSelectPlan('pro')}
                      delay={0}
                      t={t}
                      currentTier={currentTier}
                    />
                  )}
                  {pricing?.max && (
                    <PlanCard
                      name="max"
                      price={pricing.max.pricing?.month || pricing.max.price}
                      features={pricing.max.features}
                      isActive={currentTier === 'max'}
                      onSelect={() => handleSelectPlan('max')}
                      delay={0.1}
                      t={t}
                      currentTier={currentTier}
                    />
                  )}
                </div>

                {/* History - collapsible footer */}
                {history.length > 0 && (
                  <motion.div
                    className="mt-4 pt-3 border-t border-white/5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="w-full flex items-center justify-between text-xs text-gray-500 py-2"
                    >
                      <span>{t('subscription.paymentHistory')} ({history.length})</span>
                      <motion.svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        animate={{ rotate: showHistory ? 180 : 0 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </motion.svg>
                    </button>

                    <AnimatePresence>
                      {showHistory && (
                        <motion.div
                          className="space-y-2 overflow-hidden"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                        >
                          {history.map((p, _i) => (
                            <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 text-xs">
                              <div className="flex items-center gap-2">
                                <span>{p.tier === 'max' ? '👑' : p.tier === 'pro' ? '⭐' : '📦'}</span>
                                <span className="text-gray-400 capitalize">{p.tier}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-gray-500">
                                  {new Date(p.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                                </span>
                                <span className="text-white font-medium">${p.amount}</span>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
