import { motion } from 'framer-motion';
import { WarningIcon, LoadingSpinner, InfoItem } from './MigrationIcons';
import { getDaysLabel } from './useMigration';
import { useTranslation } from '../../../i18n/useTranslation';

/**
 * Error display with retry button
 * @param {{ message: string, onRetry: function, t: function }} props
 */
function ErrorDisplay({ message, onRetry, t }) {
  return (
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
          <p className="text-red-400 text-sm">{message}</p>
          <motion.button
            onClick={onRetry}
            className="mt-2 text-sm text-orange-500 font-medium flex items-center gap-1"
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('common.retry')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Rate limit warning with progress bar
 * @param {{ daysUntilNext: number, t: function }} props
 */
function RateLimitWarning({ daysUntilNext, t }) {
  return (
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
            {t('migration.availableIn', { days: daysUntilNext, daysLabel: getDaysLabel(daysUntilNext) })}
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
  );
}

/**
 * Migration Hero Screen (Step 1)
 * @param {Object} props
 * @param {boolean} props.loading - Loading state
 * @param {string|null} props.errorMessage - Error message to display
 * @param {Object|null} props.eligibility - Eligibility data
 * @param {number} props.subscriberCount - Number of subscribers
 * @param {number} props.daysUntilNext - Days until next migration
 * @param {boolean} props.canMigrate - Whether migration is allowed
 * @param {function} props.onRetry - Retry eligibility check
 * @param {function} props.onContinue - Continue to next step
 */
export function MigrationHero({
  loading,
  errorMessage,
  eligibility,
  subscriberCount,
  daysUntilNext,
  canMigrate,
  onRetry,
  onContinue,
}) {
  const { t } = useTranslation();

  return (
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
              {t('migration.channelBlocked')}
            </motion.h1>

            <motion.p
              className="text-gray-400 text-sm max-w-[280px]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {t('migration.notifySubscribers')}
            </motion.p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <ErrorDisplay message={errorMessage} onRetry={onRetry} t={t} />
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
                text={t('migration.subscribersWillGet', { count: subscriberCount })}
                variant="success"
              />
              <InfoItem
                icon="&#10003;"
                text={t('migration.channelSaved')}
                variant="success"
              />
            </motion.div>
          )}

          {/* Rate Limit Warning */}
          {daysUntilNext > 0 && (
            <RateLimitWarning daysUntilNext={daysUntilNext} t={t} />
          )}

          {/* CTA Button */}
          <motion.button
            onClick={onContinue}
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
              ? t('migration.availableIn', { days: daysUntilNext, daysLabel: getDaysLabel(daysUntilNext) })
              : t('migration.startMigration')}
          </motion.button>
        </>
      )}
    </motion.div>
  );
}
