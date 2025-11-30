import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useBackButton } from '../../hooks/useBackButton';
import { useApi } from '../../hooks/useApi';

// Animated Warning Icon
function WarningIcon({ className }) {
  return (
    <motion.div
      className={className}
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
    >
      <motion.div
        className="w-24 h-24 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.2) 0%, rgba(255, 107, 0, 0.3) 100%)',
          boxShadow: '0 0 40px rgba(255, 140, 0, 0.3), 0 0 80px rgba(255, 107, 0, 0.15)',
        }}
        animate={{
          boxShadow: [
            '0 0 40px rgba(255, 140, 0, 0.3), 0 0 80px rgba(255, 107, 0, 0.15)',
            '0 0 60px rgba(255, 140, 0, 0.4), 0 0 100px rgba(255, 107, 0, 0.2)',
            '0 0 40px rgba(255, 140, 0, 0.3), 0 0 80px rgba(255, 107, 0, 0.15)',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.svg
          className="w-12 h-12 text-orange-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </motion.svg>
      </motion.div>
    </motion.div>
  );
}

// Animated Success Checkmark
function SuccessCheckmark() {
  return (
    <motion.div
      className="relative"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
    >
      <motion.div
        className="w-28 h-28 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.3) 100%)',
          boxShadow: '0 0 40px rgba(34, 197, 94, 0.3), 0 0 80px rgba(34, 197, 94, 0.15)',
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.svg
          className="w-14 h-14 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }}
        >
          <motion.path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 13l4 4L19 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          />
        </motion.svg>
      </motion.div>

      {/* Burst particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-green-400"
          style={{
            top: '50%',
            left: '50%',
          }}
          initial={{ x: '-50%', y: '-50%', scale: 0 }}
          animate={{
            x: `calc(-50% + ${Math.cos((i * Math.PI * 2) / 8) * 60}px)`,
            y: `calc(-50% + ${Math.sin((i * Math.PI * 2) / 8) * 60}px)`,
            scale: [0, 1, 0],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 0.6, delay: 0.3 + i * 0.03 }}
        />
      ))}
    </motion.div>
  );
}

// Loading Spinner
function LoadingSpinner() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="relative w-16 h-16">
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-orange-500/20"
        />
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-orange-500"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <motion.p
        className="mt-4 text-gray-400 text-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Проверяем права на миграцию...
      </motion.p>
    </motion.div>
  );
}

// Info Card Item
function InfoItem({ icon, text, variant = 'default' }) {
  const variants = {
    default: 'text-gray-300',
    success: 'text-green-400',
    warning: 'text-orange-400',
  };

  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <span className={`text-lg ${variants[variant]}`}>{icon}</span>
      <span className={`text-sm ${variants[variant]}`}>{text}</span>
    </motion.div>
  );
}

export default function MigrationModal({ isOpen, onClose }) {
  const { triggerHaptic, confirm, alert } = useTelegram();
  const { get, post } = useApi();
  const [step, setStep] = useState(1); // 1: info, 2: input, 3: result
  const [newChannel, setNewChannel] = useState('');
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [shop, setShop] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [migrationError, setMigrationError] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [channelError, setChannelError] = useState(null);
  const [isChannelValid, setIsChannelValid] = useState(false);

  // AbortController ref for migrate operation
  const migrateAbortControllerRef = useRef(null);

  /**
   * Get proper Russian declension for "days"
   */
  const getDaysLabel = (count) => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
      return 'дней';
    }

    if (lastDigit === 1) {
      return 'день';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return 'дня';
    }

    return 'дней';
  };

  /**
   * Parse and validate Telegram channel input
   */
  const parseChannelInput = (input) => {
    if (!input || !input.trim()) {
      return {
        isValid: false,
        cleaned: '',
        error: 'Введите название канала',
      };
    }

    // Remove common prefixes
    let cleaned = input.trim();
    cleaned = cleaned.replace(/^https?:\/\//, '');
    cleaned = cleaned.replace(/^t\.me\//, '');
    cleaned = cleaned.replace(/^@/, '');

    // Validate format: 5-32 characters, alphanumeric + underscore
    const channelRegex = /^[a-zA-Z0-9_]{5,32}$/;

    if (!channelRegex.test(cleaned)) {
      let error = 'Неверный формат канала';

      if (cleaned.length < 5) {
        error = 'Минимум 5 символов';
      } else if (cleaned.length > 32) {
        error = 'Максимум 32 символа';
      } else {
        error = 'Только латиница, цифры и _';
      }

      return {
        isValid: false,
        cleaned,
        error,
      };
    }

    return {
      isValid: true,
      cleaned: `@${cleaned}`,
      error: null,
    };
  };

  // Back button support
  useBackButton(isOpen, () => {
    if (step > 1 && step < 3) {
      setStep(step - 1);
      setMigrationError(null);
    } else {
      onClose();
    }
  });

  // Check eligibility function
  const checkEligibility = useCallback(async (signal) => {
    try {
      const { data: shopsResponse, error: shopsError } = await get('/shops/my', {
        signal,
        timeout: 10000,
      });

      if (signal?.aborted) return { status: 'aborted' };

      if (shopsError) {
        setErrorMessage('Ошибка загрузки магазина. Попробуйте позже.');
        setStep(1);
        return { status: 'error' };
      }

      const shops = Array.isArray(shopsResponse?.data) ? shopsResponse.data : [];

      if (!shops.length) {
        setErrorMessage('У вас нет магазина. Создайте магазин через бота.');
        setStep(1);
        return { status: 'error' };
      }

      const primaryShop = shops[0];
      setShop(primaryShop);

      const { data: eligibilityData, error: eligibilityError } = await get(
        `/shops/${primaryShop.id}/migration/check`,
        { signal, timeout: 10000 }
      );

      if (signal?.aborted) return { status: 'aborted' };

      if (eligibilityError) {
        // Show actual error message from API (e.g., "Channel migration is a PRO feature")
        setErrorMessage(eligibilityError);
        setStep(1);
        return { status: 'error' };
      }

      setEligibility(eligibilityData);

      if (!eligibilityData?.eligible) {
        const reason = eligibilityData?.reason || eligibilityData?.message || 'Миграция недоступна';
        setErrorMessage(reason);
        setStep(1);
        return { status: 'error' };
      }

      setStep(1); // Stay on step 1 for hero screen
      return { status: 'success' };
    } catch (err) {
      if (signal?.aborted) return { status: 'aborted' };
      console.error('Eligibility check failed:', err);
      // Show actual error message if available
      const message = err?.message || 'Ошибка проверки прав. Попробуйте позже.';
      setErrorMessage(message);
      setStep(1);
      return { status: 'error' };
    }
  }, [get]);

  // Check eligibility when opening modal
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setErrorMessage(null);

    const controller = new AbortController();

    checkEligibility(controller.signal)
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, checkEligibility]);

  // Cleanup migrate request when modal closes
  useEffect(() => {
    if (!isOpen && migrateAbortControllerRef.current) {
      migrateAbortControllerRef.current.abort();
      migrateAbortControllerRef.current = null;
    }

    return () => {
      if (migrateAbortControllerRef.current) {
        migrateAbortControllerRef.current.abort();
        migrateAbortControllerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleMigrate = async () => {
    setMigrationError(null);

    const { isValid, cleaned, error } = parseChannelInput(newChannel);

    if (!isValid) {
      setChannelError(error);
      await alert(error || 'Неверный формат канала');
      return;
    }

    const confirmed = await confirm(
      `Отправить уведомления всем ${eligibility?.subscriberCount || 0} подписчикам о миграции на новый канал?`
    );

    if (!confirmed) return;

    if (migrateAbortControllerRef.current) {
      migrateAbortControllerRef.current.abort();
    }
    migrateAbortControllerRef.current = new AbortController();

    setLoading(true);

    try {
      const { data, error: postError } = await post(`/shops/${shop.id}/migration`, {
        newChannelUrl: cleaned,
        oldChannelUrl: shop.channel_url,
        signal: migrateAbortControllerRef.current.signal,
      });

      if (migrateAbortControllerRef.current?.signal.aborted) return;

      if (postError) {
        setMigrationError(postError || 'Ошибка миграции');
        setLoading(false);
        return;
      }

      setMigrationResult(data);
      setStep(3);
      triggerHaptic('success');

      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }

      setCountdown(3);
      const countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            onClose();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Migration failed:', err);
      setMigrationError('Ошибка миграции. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  // Handle channel input change with validation
  const handleChannelChange = (e) => {
    const value = e.target.value;
    setNewChannel(value);

    if (value) {
      const { isValid, error: validationError } = parseChannelInput(value);
      setChannelError(validationError);
      setIsChannelValid(isValid);
    } else {
      setChannelError(null);
      setIsChannelValid(false);
    }
  };

  const subscriberCount = eligibility?.subscriberCount || 0;
  const daysUntilNext = eligibility?.limits?.daysUntilNext || 0;
  const canMigrate = daysUntilNext === 0 && !errorMessage;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-[#181818] overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <PageHeader
            title={step === 3 ? 'Готово' : 'Миграция'}
            onBack={step === 1 || step === 3 ? onClose : () => setStep(step - 1)}
            variant="close"
          />

          <div
            className="px-4 pb-8"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 72px)' }}
          >
            <AnimatePresence mode="wait">
              {/* STEP 1: Hero Screen */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  className="flex flex-col"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {loading ? (
                    <LoadingSpinner />
                  ) : (
                    <>
                      {/* Hero Section */}
                      <div className="flex flex-col items-center text-center pt-4 pb-6">
                        <WarningIcon className="mb-6" />

                        <motion.h1
                          className="text-2xl font-bold text-white mb-2"
                          style={{ letterSpacing: '-0.02em' }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          Канал заблокирован?
                        </motion.h1>

                        <motion.p
                          className="text-gray-400 text-sm max-w-[280px]"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                        >
                          Уведомим всех подписчиков о новом канале
                        </motion.p>
                      </div>

                      {/* Error Message */}
                      {errorMessage && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-red-400 text-sm">{errorMessage}</p>
                              <motion.button
                                onClick={() => {
                                  setErrorMessage(null);
                                  triggerHaptic('light');
                                  setLoading(true);
                                  const controller = new AbortController();
                                  checkEligibility(controller.signal).finally(() => {
                                    setLoading(false);
                                  });
                                }}
                                className="mt-2 text-sm text-orange-500 font-medium flex items-center gap-1"
                                whileTap={{ scale: 0.95 }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Попробовать снова
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Info Card */}
                      {!errorMessage && eligibility && (
                        <motion.div
                          className="p-4 rounded-2xl space-y-3"
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                        >
                          <InfoItem
                            icon="&#10003;"
                            text={`${subscriberCount} подписчиков получат уведомление`}
                            variant="success"
                          />
                          <InfoItem
                            icon="&#10003;"
                            text="Новый канал будет сохранен в магазине"
                            variant="success"
                          />
                        </motion.div>
                      )}

                      {/* Rate Limit Warning */}
                      {daysUntilNext > 0 && (
                        <motion.div
                          className="mt-4 p-4 rounded-2xl"
                          style={{
                            background: 'rgba(255, 170, 0, 0.08)',
                            border: '1px solid rgba(255, 170, 0, 0.15)',
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.5 }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-orange-400 text-sm font-medium">
                                Доступно через {daysUntilNext} {getDaysLabel(daysUntilNext)}
                              </p>
                              <div className="mt-2 w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ background: 'linear-gradient(90deg, #FF6B00, #FF8C42)' }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${((30 - daysUntilNext) / 30) * 100}%` }}
                                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.6 }}
                                />
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* CTA Button */}
                      <motion.button
                        onClick={() => {
                          triggerHaptic('light');
                          setStep(2);
                        }}
                        disabled={!canMigrate}
                        className="mt-6 w-full h-14 rounded-2xl font-semibold text-white text-base disabled:opacity-40"
                        style={{
                          background: canMigrate
                            ? 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)'
                            : 'rgba(255, 255, 255, 0.1)',
                          boxShadow: canMigrate ? '0 4px 20px rgba(255, 107, 0, 0.3)' : 'none',
                        }}
                        whileTap={canMigrate ? { scale: 0.98 } : {}}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        {daysUntilNext > 0
                          ? `Доступно через ${daysUntilNext} ${getDaysLabel(daysUntilNext)}`
                          : 'Начать миграцию'}
                      </motion.button>
                    </>
                  )}
                </motion.div>
              )}

              {/* STEP 2: Input Screen */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  className="flex flex-col"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Title */}
                  <motion.h2
                    className="text-xl font-bold text-white mb-6"
                    style={{ letterSpacing: '-0.02em' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    Новый канал
                  </motion.h2>

                  {/* Migration Error */}
                  {migrationError && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-red-400 text-sm">{migrationError}</p>
                          <motion.button
                            onClick={async () => {
                              setMigrationError(null);
                              triggerHaptic('light');
                              await handleMigrate();
                            }}
                            disabled={loading || !newChannel.trim() || channelError !== null}
                            className="mt-2 text-sm text-orange-500 font-medium flex items-center gap-1 disabled:opacity-50"
                            whileTap={{ scale: 0.95 }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Попробовать снова
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Input Field */}
                  <motion.div
                    className="relative"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <input
                      type="text"
                      value={newChannel}
                      onChange={handleChannelChange}
                      placeholder="@channel"
                      autoFocus
                      className="w-full h-14 px-4 pr-12 rounded-2xl text-white text-base placeholder-gray-500 outline-none transition-all"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: channelError
                          ? '2px solid rgba(239, 68, 68, 0.5)'
                          : isChannelValid
                            ? '2px solid rgba(34, 197, 94, 0.5)'
                            : '2px solid rgba(255, 255, 255, 0.1)',
                      }}
                    />

                    {/* Validation Icon */}
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <AnimatePresence mode="wait">
                        {isChannelValid && (
                          <motion.div
                            key="valid"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </motion.div>
                        )}
                        {channelError && newChannel && (
                          <motion.div
                            key="invalid"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>

                  {/* Error Message */}
                  <AnimatePresence>
                    {channelError && newChannel && (
                      <motion.p
                        className="mt-2 text-red-400 text-sm"
                        initial={{ opacity: 0, y: -5, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -5, height: 0 }}
                      >
                        {channelError}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* Valid Channel Preview */}
                  <AnimatePresence>
                    {isChannelValid && (
                      <motion.div
                        className="mt-3 p-3 rounded-xl"
                        style={{
                          background: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                        }}
                        initial={{ opacity: 0, y: -5, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -5, height: 0 }}
                      >
                        <p className="text-green-400 text-sm">
                          Канал: <span className="font-semibold">{parseChannelInput(newChannel).cleaned}</span>
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Subscriber Count Info */}
                  <motion.div
                    className="mt-4 p-4 rounded-2xl flex items-center gap-3"
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </div>
                    <p className="text-gray-300 text-sm">
                      <span className="text-white font-semibold">{subscriberCount}</span> подписчиков получат уведомление
                    </p>
                  </motion.div>

                  {/* CTA Button */}
                  <motion.button
                    onClick={handleMigrate}
                    disabled={loading || !newChannel.trim() || channelError !== null}
                    className="mt-6 w-full h-14 rounded-2xl font-semibold text-white text-base disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{
                      background: !loading && isChannelValid
                        ? 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)'
                        : 'rgba(255, 255, 255, 0.1)',
                      boxShadow: !loading && isChannelValid ? '0 4px 20px rgba(255, 107, 0, 0.3)' : 'none',
                    }}
                    whileTap={!loading && isChannelValid ? { scale: 0.98 } : {}}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    {loading ? (
                      <>
                        <motion.div
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        />
                        Отправка...
                      </>
                    ) : (
                      'Отправить уведомления'
                    )}
                  </motion.button>
                </motion.div>
              )}

              {/* STEP 3: Success Screen */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  className="flex flex-col items-center text-center pt-8"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Success Animation */}
                  <SuccessCheckmark />

                  <motion.h1
                    className="mt-6 text-2xl font-bold text-white"
                    style={{ letterSpacing: '-0.02em' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    Миграция запущена!
                  </motion.h1>

                  <motion.p
                    className="mt-2 text-gray-400 text-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    Уведомления отправляются подписчикам
                  </motion.p>

                  {/* Result Card */}
                  {migrationResult && (
                    <motion.div
                      className="mt-6 w-full p-4 rounded-2xl space-y-3"
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-gray-400 text-sm">Новый канал</span>
                        <span className="text-white font-semibold">{migrationResult.newChannelUrl}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-gray-400 text-sm">Отправлено</span>
                        <span className="text-green-400 font-semibold">{migrationResult.notificationsSent || 0} уведомлений</span>
                      </div>
                    </motion.div>
                  )}

                  {/* Countdown */}
                  {countdown !== null && (
                    <motion.div
                      className="mt-6 flex items-center gap-2 text-gray-500 text-sm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                    >
                      <span>Закроется через</span>
                      <motion.span
                        key={countdown}
                        className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white font-semibold text-xs"
                        initial={{ scale: 1.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      >
                        {countdown}
                      </motion.span>
                    </motion.div>
                  )}

                  {/* Close Button */}
                  <motion.button
                    onClick={() => {
                      setCountdown(null);
                      onClose();
                    }}
                    className="mt-6 w-full h-14 rounded-2xl font-semibold text-white text-base"
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    Закрыть
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
