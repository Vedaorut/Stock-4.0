import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import SegmentedControl from '../common/SegmentedControl';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';

// Plan Card Component
function PlanCard({ plan, planName, isActive, onUpgrade, canUpgrade }) {
  const { triggerHaptic } = useTelegram();
  const [period, setPeriod] = useState('month');

  const tierColors = {
    basic: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    pro: 'bg-gradient-to-r from-orange-500/20 to-purple-500/20 text-orange-400 border-orange-500/30',
  };

  // Calculate pricing based on period
  const hasPeriods = plan.pricing && (plan.pricing.month || plan.pricing.year);
  const currentPrice = hasPeriods
    ? period === 'year'
      ? plan.pricing.year
      : plan.pricing.month
    : plan.price;
  const displayPeriod = hasPeriods ? period : plan.period;

  // Calculate discount if year selected
  const yearDiscount =
    hasPeriods && period === 'year' && plan.pricing.month && plan.pricing.year
      ? Math.round((1 - plan.pricing.year / 12 / plan.pricing.month) * 100)
      : 0;

  return (
    <motion.div
      className={`glass-card rounded-2xl p-5 ${isActive ? 'border-2' : ''} ${
        isActive ? tierColors[planName] : ''
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white capitalize mb-1">{planName}</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-orange-primary">
              ${currentPrice}
              <span className="text-sm text-gray-400 font-normal">/{displayPeriod}</span>
            </p>
            {yearDiscount > 0 && (
              <motion.span
                className="px-2 py-0.5 rounded-md text-xs font-semibold bg-green-500/20 text-green-400"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                Скидка {yearDiscount}%
              </motion.span>
            )}
          </div>
        </div>
        {isActive && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
            Активен
          </span>
        )}
      </div>

      {/* Period selector - only show if pricing has both month and year */}
      {hasPeriods && (
        <div className="mb-4 flex justify-center">
          <SegmentedControl
            options={[
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ]}
            value={period}
            onChange={setPeriod}
            size="md"
          />
        </div>
      )}

      <ul className="space-y-2 mb-5">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
            <svg
              className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {canUpgrade && planName === 'pro' && (
        <motion.button
          onClick={() => {
            triggerHaptic('medium');
            onUpgrade();
          }}
          className="w-full h-11 rounded-xl font-semibold text-white"
          style={{
            background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
            boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)',
          }}
          whileTap={{ scale: 0.98 }}
        >
          Upgrade до PRO
        </motion.button>
      )}
    </motion.div>
  );
}

// Payment History Item
function PaymentHistoryItem({ payment }) {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const statusColors = {
    verified: 'bg-green-500/20 text-green-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  return (
    <motion.div
      className="glass-card rounded-xl p-4"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-semibold capitalize">{payment.tier || 'Basic'}</span>
        <span
          className={`text-xs px-2 py-1 rounded-full ${statusColors[payment.status] || statusColors.pending}`}
        >
          {payment.status}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">{formatDate(payment.created_at)}</span>
        <span className="text-orange-primary font-semibold">${payment.amount}</span>
      </div>
      {payment.tx_hash && (
        <p className="text-xs text-gray-500 mt-2 font-mono truncate">
          TX: {payment.tx_hash.substring(0, 20)}...
        </p>
      )}
    </motion.div>
  );
}

// Main Modal Component
export default function SubscriptionModal({ isOpen, onClose }) {
  const { alert } = useTelegram();
  const { fetchApi } = useApi();

  const [myShop, setMyShop] = useState(null);
  const [status, setStatus] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);

  const loadData = useCallback(
    async (signal) => {
      // 1. Load shops
      const shopsRes = await fetchApi('/shops/my', {
        signal,
        timeout: 10000, // 10 second timeout to prevent infinite loading
      });

      if (signal?.aborted) return { status: 'aborted' };

      // ✅ FIX: Safe array extraction with validation
      const shops = Array.isArray(shopsRes?.data) ? shopsRes.data : [];
      if (shops.length === 0) {
        console.error('No shop found');
        return { status: 'error', error: 'Failed to load shops' };
      }

      const shop = shops[0];
      setMyShop(shop);

      // 2. Load subscription data in parallel
      const [statusRes, historyRes] = await Promise.all([
        fetchApi(`/subscriptions/status/${shop.id}`, {
          signal,
          timeout: 10000, // 10 second timeout to prevent infinite loading
        }),
        fetchApi(`/subscriptions/history/${shop.id}?limit=10`, {
          signal,
          timeout: 10000, // 10 second timeout to prevent infinite loading
        }),
      ]);

      if (signal?.aborted) return { status: 'aborted' };

      setStatus(statusRes);
      // ✅ FIX: Safe array extraction
      const historyList = Array.isArray(historyRes?.data) ? historyRes.data : [];
      setHistory(historyList);

      // 3. Load pricing
      const pricingRes = await fetchApi('/subscriptions/pricing', {
        signal,
        timeout: 10000, // 10 second timeout to prevent infinite loading
      });

      if (signal?.aborted) return { status: 'aborted' };

      setPricing(pricingRes);

      return { status: 'success' };
    },
    [fetchApi]
  );

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);

    const controller = new AbortController();

    loadData(controller.signal).finally(() => {
      // ✅ FIX: Always reset loading, even on abort
      // This prevents infinite spinner when modal is reopened after quick close
      setLoading(false);
    });

    return () => controller.abort();
  }, [isOpen, loadData]);

  const handleUpgrade = async () => {
    await alert('Апгрейд через бота. Перейдите в бота для оплаты.');
    // TODO: Deep link to bot upgrade flow
  };

  // No shop - show empty state
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
            <PageHeader title="Подписка" onBack={handleClose} variant="close" />
            <div
              className="flex-1 overflow-y-auto"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
                paddingBottom: 'calc(var(--tabbar-total) + 24px)',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div className="px-4 py-6">
                <div className="text-center py-12">
                  <svg
                    className="w-20 h-20 mx-auto mb-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                  <h3 className="text-xl font-bold text-white mb-2">У вас еще нет магазина</h3>
                  <p className="text-gray-400 text-sm mb-6">
                    Создайте магазин для доступа к подпискам
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

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
          <PageHeader title="Подписка" onBack={handleClose} />
          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 24px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-6 space-y-6">
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <>
                  {/* Current Status */}
                  {status && (
                    <div className="glass-card rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm text-gray-400 mb-1">Текущий тариф</p>
                          <h3 className="text-2xl font-bold text-white capitalize">
                            {status.tier || 'Free'}
                          </h3>
                        </div>
                        <div
                          className={`px-4 py-2 rounded-xl font-semibold ${
                            status.isActive
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {status.isActive ? 'Активна' : 'Неактивна'}
                        </div>
                      </div>
                      {status.expiresAt && (
                        <div className="flex items-center gap-2 text-sm mb-4">
                          <svg
                            className="w-4 h-4 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="text-gray-400">
                            Действует до:{' '}
                            <span className="text-white font-medium">
                              {new Date(status.expiresAt).toLocaleDateString('ru-RU')}
                            </span>
                          </span>
                        </div>
                      )}
                      {/* Show current tier features if Basic */}
                      {status.tier === 'basic' && pricing?.basic && (
                        <ul className="space-y-2 mt-3 pt-3 border-t border-white/10">
                          {pricing.basic.features.map((feature, index) => (
                            <li
                              key={index}
                              className="flex items-start gap-2 text-sm text-gray-300"
                            >
                              <svg
                                className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Plans */}
                  {pricing && (
                    <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">
                      <h3 className="text-sm font-semibold text-gray-400 px-2">Доступные тарифы</h3>
                      {/* Only show Basic card if NOT currently on Basic */}
                      {status?.tier !== 'basic' && (
                        <PlanCard
                          plan={pricing.basic}
                          planName="basic"
                          isActive={false}
                          canUpgrade={false}
                        />
                      )}
                      {/* Always show Pro card */}
                      <PlanCard
                        plan={pricing.pro}
                        planName="pro"
                        isActive={status?.tier === 'pro'}
                        canUpgrade={status?.tier !== 'pro'}
                        onUpgrade={handleUpgrade}
                      />
                      {pricing.gracePeriod && (
                        <div className="glass-card rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <svg
                              className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <div>
                              <p className="text-sm text-white font-medium mb-1">
                                Льготный период: {pricing.gracePeriod.days} дней
                              </p>
                              <p className="text-xs text-gray-400">
                                {pricing.gracePeriod.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment History */}
                  {history.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-400 px-2">История платежей</h3>
                      <div className="space-y-2">
                        <AnimatePresence mode="popLayout">
                          {history.map((payment) => (
                            <PaymentHistoryItem key={payment.id} payment={payment} />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
