import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';
import { CRYPTO_OPTIONS } from '../../utils/paymentUtils';
import { usePlatform } from '../../hooks/usePlatform';
import {
  getSpringPreset,
  getSurfaceStyle,
  getSheetMaxHeight,
  isAndroid,
} from '../../utils/platform';
import { useBackButton } from '../../hooks/useBackButton';

export default function PaymentMethodModal() {
  const {
    paymentStep,
    selectCrypto,
    setPaymentStep,
    currentShop,
    selectedCrypto: _selectedCrypto, // Reserved for multi-currency display
    isGeneratingInvoice,
  } = useStore();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const api = useApi();
  const toast = useToast();
  const platform = usePlatform();
  const android = isAndroid(platform);

  const [availableWallets, setAvailableWallets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [generatingStartTime, setGeneratingStartTime] = useState(null);
  const MAX_RETRIES = 3;

  const overlayStyle = useMemo(() => getSurfaceStyle('overlay', platform), [platform]);

  const sheetStyle = useMemo(() => getSurfaceStyle('surfacePanel', platform), [platform]);

  const cardBaseStyle = useMemo(() => getSurfaceStyle('glassCard', platform), [platform]);

  const sheetSpring = useMemo(() => getSpringPreset('sheet', platform), [platform]);

  const controlSpring = useMemo(() => getSpringPreset('press', platform), [platform]);

  const quickSpring = useMemo(() => getSpringPreset('quick', platform), [platform]);

  const isOpen = paymentStep === 'method';

  const handleClose = () => {
    triggerHaptic('light');
    setPaymentStep('idle');
  };

  const handleSelectCrypto = async (cryptoId) => {
    if (isGeneratingInvoice) return;

    triggerHaptic('medium');
    setGeneratingStartTime(Date.now());

    try {
      // Вызываем selectCrypto из store - создаёт order + invoice + переход к details
      await selectCrypto(cryptoId);
      // Store автоматически выставит paymentStep = 'details'
    } catch (error) {
      console.error('[PaymentMethodModal] Failed to select crypto:', error);
      triggerHaptic('error');

      // Детальные toast сообщения
      const errorMsg = error.response?.data?.error || error.message;
      if (errorMsg?.includes('order')) {
        toast.error('Не удалось создать заказ. Попробуйте снова.');
      } else if (errorMsg?.includes('invoice')) {
        toast.error('Ошибка генерации счёта. Попробуйте снова.');
      } else if (errorMsg?.includes('network') || errorMsg?.includes('timeout')) {
        toast.error('Проблема с соединением. Проверьте интернет.');
      } else {
        toast.error('Не удалось выбрать способ оплаты');
      }
    } finally {
      setGeneratingStartTime(null);
    }
  };

  useBackButton(isOpen ? handleClose : null);

  // Load shop wallets when modal opens
  useEffect(() => {
    if (!isOpen || !currentShop?.id) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    const loadWallets = async (signal) => {
      try {
        const { data, error: apiError } = await api.get(`/shops/${currentShop.id}/wallets`, {
          signal,
        });

        if (signal?.aborted) return { status: 'aborted' };

        if (apiError) {
          // Детальные toast сообщения для разных ошибок
          if (apiError.includes('404')) {
            toast.error('Магазин не найден');
          } else if (apiError.includes('network') || apiError.includes('timeout')) {
            toast.error('Проблема с соединением. Проверьте интернет.');
          } else {
            toast.error('Не удалось загрузить способы оплаты');
          }
          return { status: 'error', error: apiError };
        }

        if (!data?.data) {
          setAvailableWallets([]);
          return { status: 'success' };
        }

        // Transform API response { wallet_btc: "...", wallet_eth: null, ... } to array ["BTC", "ETH"]
        const currencies = Object.entries(data.data)
          .filter(([key, value]) => {
            return key.startsWith('wallet_') && value && typeof value === 'string' && value.trim();
          })
          .map(([key]) => key.replace('wallet_', '').toUpperCase());

        setAvailableWallets(currencies);
        setRetryCount(0);
        return { status: 'success' };
      } catch (err) {
        if (err.name === 'AbortError' || signal?.aborted) {
          return { status: 'aborted' };
        }

        console.error('[PaymentMethodModal] Failed to load wallets:', err);
        const errorMsg = err.message || 'Unknown error';

        // Детальные toast сообщения
        if (errorMsg.includes('network') || errorMsg.includes('timeout')) {
          toast.error('Нет соединения с сервером');
        } else if (errorMsg.includes('404')) {
          toast.error('Кошельки не найдены');
        } else {
          toast.error('Ошибка загрузки способов оплаты');
        }

        return { status: 'error', error: errorMsg };
      }
    };

    setLoading(true);
    setError(null);

    loadWallets(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
          setAvailableWallets([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, currentShop?.id, api, toast]);

  // Fallback: если модалка открыта но shop отсутствует
  useEffect(() => {
    if (isOpen && !currentShop?.id) {
      const timeout = setTimeout(() => {
        setPaymentStep('idle');
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [isOpen, currentShop?.id, setPaymentStep]);

  // Cleanup при unmount
  useEffect(() => {
    return () => {
      setLoading(false);
      setError(null);
    };
  }, []);

  // Фильтруем криптовалюты - показываем только те, для которых есть кошельки
  const availableCryptoOptions = useMemo(() => {
    if (loading || availableWallets.length === 0) {
      return [];
    }

    return CRYPTO_OPTIONS.filter((crypto) => availableWallets.includes(crypto.id));
  }, [availableWallets, loading]);

  // Retry loading wallets with exponential backoff and AbortController
  const handleRetry = async () => {
    if (retryCount >= MAX_RETRIES || isRetrying) {
      toast.error('Превышен лимит попыток. Попробуйте позже.');
      return;
    }

    triggerHaptic('light');
    setError(null);
    setLoading(true);
    setIsRetrying(true); // ✅ Disable button during retry

    const controller = new AbortController();

    try {
      // Increment retry count FIRST for correct exponential backoff
      const nextRetryCount = retryCount + 1;
      setRetryCount(nextRetryCount);

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.min(Math.pow(2, nextRetryCount) * 1000, 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Check if aborted during delay
      if (controller.signal.aborted) {
        return;
      }

      const { data, error: apiError } = await api.get(`/shops/${currentShop.id}/wallets`, {
        signal: controller.signal,
      });

      if (apiError) {
        setError(apiError);

        // Детальные toast сообщения
        if (apiError.includes('404')) {
          toast.error('Магазин не найден');
        } else if (apiError.includes('network') || apiError.includes('timeout')) {
          toast.error(`Нет соединения (попытка ${nextRetryCount}/${MAX_RETRIES})`);
        } else {
          toast.error(`Не удалось загрузить (попытка ${nextRetryCount}/${MAX_RETRIES})`);
        }
        setAvailableWallets([]);
        setLoading(false);
        return;
      }

      if (!data?.data) {
        setAvailableWallets([]);
        setLoading(false);
        return;
      }

      const currencies = Object.entries(data.data)
        .filter(([key, value]) => {
          return key.startsWith('wallet_') && value && typeof value === 'string' && value.trim();
        })
        .map(([key]) => key.replace('wallet_', '').toUpperCase());

      setAvailableWallets(currencies);
      setError(null);
      setRetryCount(0); // Reset on success
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }

      console.error('[PaymentMethodModal] Retry failed:', err);
      const errorMsg = err.message || 'Unknown error';
      setError(errorMsg);
      // retryCount уже был увеличен в начале try блока

      // Детальные toast сообщения
      if (errorMsg.includes('network') || errorMsg.includes('timeout')) {
        toast.error(`Нет соединения (попытка ${nextRetryCount}/${MAX_RETRIES})`);
      } else {
        toast.error(`Ошибка загрузки (попытка ${nextRetryCount}/${MAX_RETRIES})`);
      }
      setAvailableWallets([]);
    } finally {
      setLoading(false);
      setIsRetrying(false); // ✅ Re-enable button
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: android ? 0.24 : 0.2 }}
            onClick={handleClose}
            style={overlayStyle}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
            style={{ maxHeight: getSheetMaxHeight(platform, 32) }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetSpring}
          >
            <div className="rounded-t-[32px] flex flex-col" style={sheetStyle}>
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div>
                  <h2
                    className="text-2xl font-bold text-white"
                    style={{ letterSpacing: '-0.02em' }}
                  >
                    {t('payment.selectCrypto')}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">{t('payment.selectMethod')}</p>
                </div>
                <motion.button
                  onClick={handleClose}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400"
                  style={{
                    background: android ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                  whileTap={{ scale: android ? 0.94 : 0.9 }}
                  transition={controlSpring}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </motion.button>
              </div>

              {/* Crypto Options */}
              <div
                className="flex-1 overflow-y-auto px-6 pt-4"
                style={{ paddingBottom: 'calc(var(--tabbar-total) + 72px)' }}
              >
                {loading ? (
                  <div className="space-y-4 py-4">
                    {/* Loading skeleton with retry count */}
                    <div className="flex flex-col items-center justify-center py-8 gap-4">
                      <div className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
                      <div className="text-center">
                        <p className="text-white font-semibold mb-1">Загрузка...</p>
                        {retryCount > 0 && (
                          <p className="text-sm text-gray-400">
                            Попытка {retryCount + 1} из {MAX_RETRIES}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Skeleton cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="rounded-2xl p-5 animate-pulse"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          <div className="w-12 h-12 rounded-xl bg-gray-700 mb-3" />
                          <div className="h-4 bg-gray-700 rounded mb-2 w-3/4" />
                          <div className="h-3 bg-gray-700 rounded w-1/2" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : error ? (
                  // Error state - show retry button with attempt counter
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <svg
                      className="w-16 h-16 text-red-500 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <h3 className="text-lg font-semibold text-red-400 mb-2">
                      {t('payment.loadError') || 'Не удалось загрузить'}
                    </h3>
                    <p className="text-sm text-gray-500 mb-2">
                      {error || 'Проблема с соединением'}
                    </p>
                    {retryCount > 0 && retryCount < MAX_RETRIES && (
                      <p className="text-xs text-gray-600 mb-4">
                        Попытка {retryCount}/{MAX_RETRIES}
                      </p>
                    )}
                    {retryCount >= MAX_RETRIES ? (
                      <div className="space-y-3">
                        <p className="text-sm text-yellow-500 font-semibold mb-2">
                          Превышен лимит попыток
                        </p>
                        <p className="text-xs text-gray-500 mb-4">
                          Попробуйте закрыть и открыть окно снова
                        </p>
                      </div>
                    ) : (
                      <motion.button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: isRetrying
                            ? 'rgba(74, 74, 74, 0.5)'
                            : 'linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%)',
                          boxShadow: isRetrying ? 'none' : '0 4px 12px rgba(255, 107, 0, 0.3)',
                        }}
                        whileTap={!isRetrying ? { scale: android ? 0.94 : 0.95 } : {}}
                        transition={controlSpring}
                      >
                        {isRetrying
                          ? 'Повторная попытка...'
                          : t('common.tryAgain') || 'Попробовать снова'}
                      </motion.button>
                    )}
                  </div>
                ) : availableCryptoOptions.length === 0 ? (
                  // Empty state - no wallets configured
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <svg
                      className="w-16 h-16 text-gray-600 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h3 className="text-lg font-semibold text-gray-400 mb-2">
                      {t('payment.noWallets') || 'No payment methods'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {t('payment.noWalletsDesc') ||
                        "This shop hasn't configured payment wallets yet"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {availableCryptoOptions.map((crypto) => {
                      return (
                        <motion.button
                          key={crypto.id}
                          onClick={() => handleSelectCrypto(crypto.id)}
                          disabled={isGeneratingInvoice} // ✅ Prevent double-clicks
                          className="relative overflow-hidden rounded-2xl p-5 text-left"
                          style={{
                            ...cardBaseStyle,
                            background: `linear-gradient(145deg, rgba(26, 26, 26, ${android ? '0.94' : '0.9'}) 0%, rgba(20, 20, 20, ${android ? '0.96' : '0.95'}) 100%)`,
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            opacity: isGeneratingInvoice ? 0.5 : 1, // ✅ Visual feedback
                            cursor: isGeneratingInvoice ? 'not-allowed' : 'pointer',
                          }}
                          whileHover={{ scale: android ? 1.015 : 1.02, y: android ? -1 : -2 }}
                          whileTap={{ scale: android ? 0.985 : 0.98 }}
                          transition={quickSpring}
                        >
                          {/* Gradient overlay */}
                          <motion.div
                            className="absolute inset-0 opacity-0 hover:opacity-100"
                            style={{
                              background: `radial-gradient(600px circle at center, ${crypto.color}15, transparent 40%)`,
                            }}
                            transition={{ duration: 0.3 }}
                          />

                          <div className="relative space-y-3">
                            {/* Icon */}
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold"
                              style={{
                                background: `linear-gradient(135deg, ${crypto.gradient})`,
                                boxShadow: `0 4px 12px ${crypto.color}40, inset 0 1px 0 rgba(255, 255, 255, 0.2)`,
                              }}
                            >
                              {crypto.icon}
                            </div>

                            {/* Info */}
                            <div>
                              <h3
                                className="text-white font-bold text-lg"
                                style={{ letterSpacing: '-0.01em' }}
                              >
                                {crypto.name}
                              </h3>
                              <p
                                className="text-gray-400 text-xs mt-1"
                                style={{ letterSpacing: '0.01em' }}
                              >
                                {crypto.network}
                              </p>
                            </div>

                            {/* Navigation arrow */}
                            <div className="flex justify-end">
                              <svg
                                className="w-5 h-5 text-orange-primary flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Generating Invoice Overlay */}
          {isGeneratingInvoice && (
            <motion.div
              className="fixed inset-0 z-60 flex items-center justify-center"
              style={{
                background: 'rgba(10, 10, 10, 0.85)',
                backdropFilter: 'blur(8px)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-orange-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white font-semibold text-lg">Генерация счёта...</p>
                <p className="text-gray-400 text-sm mt-2">Подождите несколько секунд</p>

                {generatingStartTime && Date.now() - generatingStartTime > 15000 && (
                  <motion.button
                    onClick={() => {
                      setPaymentStep('method');
                      setGeneratingStartTime(null);
                      toast.error('Превышено время ожидания. Попробуйте снова.');
                    }}
                    className="mt-4 px-6 py-3 rounded-xl bg-red-500 text-white font-semibold"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    Отменить
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
