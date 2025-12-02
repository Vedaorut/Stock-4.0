import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../../../hooks/useApi';

/**
 * Parse and validate Telegram channel input
 * @param {string} input - Raw channel input
 * @returns {{ isValid: boolean, cleaned: string, error: string|null }}
 */
export function parseChannelInput(input) {
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
      error = 'Telegram требует минимум 5 символов для канала';
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
}

/**
 * Get proper Russian declension for "days"
 * @param {number} count - Number of days
 * @returns {string} - Proper word form
 */
export function getDaysLabel(count) {
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
}

/**
 * @typedef {Object} MigrationState
 * @property {number} step - Current step (1: info, 2: input, 3: result)
 * @property {string} newChannel - New channel input value
 * @property {boolean} loading - Loading state
 * @property {Object|null} eligibility - Eligibility data from API
 * @property {Object|null} shop - Current shop data
 * @property {Object|null} migrationResult - Migration result from API
 * @property {string|null} errorMessage - General error message
 * @property {string|null} migrationError - Migration-specific error
 * @property {number|null} countdown - Countdown timer value
 * @property {string|null} channelError - Channel validation error
 * @property {boolean} isChannelValid - Channel validation state
 */

/**
 * @typedef {Object} MigrationActions
 * @property {function} setStep - Set current step
 * @property {function} handleChannelChange - Handle channel input change
 * @property {function} handleMigrate - Execute migration
 * @property {function} retryEligibility - Retry eligibility check
 * @property {function} clearErrors - Clear all errors
 * @property {function} stopCountdown - Stop and clear countdown
 */

/**
 * @typedef {Object} MigrationComputed
 * @property {number} subscriberCount - Number of subscribers
 * @property {number} daysUntilNext - Days until next migration allowed
 * @property {boolean} canMigrate - Whether migration is allowed
 */

/**
 * Custom hook for migration logic
 * @param {Object} options
 * @param {boolean} options.isOpen - Modal open state
 * @param {function} options.onClose - Close callback
 * @param {function} options.triggerHaptic - Haptic feedback function
 * @param {function} options.confirm - Telegram confirm dialog
 * @param {function} options.alert - Telegram alert dialog
 * @returns {{ state: MigrationState, actions: MigrationActions, computed: MigrationComputed }}
 */
export function useMigration({ isOpen, onClose, triggerHaptic, confirm, alert }) {
  const { get, post } = useApi();
  
  // State
  const [step, setStep] = useState(1);
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

  // Refs
  const migrateAbortControllerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

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

      setStep(1);
      return { status: 'success' };
    } catch (err) {
      if (signal?.aborted) return { status: 'aborted' };
      if (import.meta.env.DEV) {
        console.error('Eligibility check failed:', err);
      }
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

    checkEligibility(controller.signal).finally(() => {
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
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isOpen]);

  // Handle channel input change with validation
  const handleChannelChange = useCallback((e) => {
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
  }, []);

  // Handle migration
  const handleMigrate = useCallback(async () => {
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
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
            onClose();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (import.meta.env.DEV) {
        console.error('Migration failed:', err);
      }
      setMigrationError('Ошибка миграции. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }, [newChannel, eligibility, shop, post, triggerHaptic, confirm, alert, onClose]);

  // Retry eligibility check
  const retryEligibility = useCallback(() => {
    setErrorMessage(null);
    triggerHaptic('light');
    setLoading(true);
    const controller = new AbortController();
    checkEligibility(controller.signal).finally(() => {
      setLoading(false);
    });
  }, [checkEligibility, triggerHaptic]);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrorMessage(null);
    setMigrationError(null);
    setChannelError(null);
  }, []);

  // Stop countdown
  const stopCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  // Computed values
  const subscriberCount = eligibility?.subscriberCount || 0;
  const daysUntilNext = eligibility?.limits?.daysUntilNext || 0;
  const canMigrate = daysUntilNext === 0 && !errorMessage;

  return {
    state: {
      step,
      newChannel,
      loading,
      eligibility,
      shop,
      migrationResult,
      errorMessage,
      migrationError,
      countdown,
      channelError,
      isChannelValid,
    },
    actions: {
      setStep,
      handleChannelChange,
      handleMigrate,
      retryEligibility,
      clearErrors,
      stopCountdown,
    },
    computed: {
      subscriberCount,
      daysUntilNext,
      canMigrate,
    },
  };
}
