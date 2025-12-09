import { motion } from 'framer-motion';
import { SuccessCheckmark } from './MigrationIcons';
import { useTranslation } from '../../../i18n/useTranslation';

/**
 * Migration result card
 * @param {{ newChannelUrl: string, notificationsSent: number, t: function }} props
 */
function ResultCard({ newChannelUrl, notificationsSent, t }) {
  return (
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
        <span className="text-gray-400 text-sm">{t('migration.newChannelLabel')}</span>
        <span className="text-white font-semibold">{newChannelUrl}</span>
      </div>
      <div className="flex items-center justify-between py-2">
        <span className="text-gray-400 text-sm">{t('shopOrders.status.shipped')}</span>
        <span className="text-green-400 font-semibold">{t('migration.sentCount', { count: notificationsSent || 0 })}</span>
      </div>
    </motion.div>
  );
}

/**
 * Countdown display
 * @param {{ value: number, t: function }} props
 */
function Countdown({ value, t }) {
  return (
    <motion.div
      className="mt-6 flex items-center gap-2 text-gray-500 text-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
    >
      <span>{t('migration.closesIn')}</span>
      <motion.span
        key={value}
        className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white font-semibold text-xs"
        initial={{ scale: 1.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        {value}
      </motion.span>
    </motion.div>
  );
}

/**
 * Migration Success Screen (Step 3)
 * @param {Object} props
 * @param {Object|null} props.migrationResult - Migration result data
 * @param {number|null} props.countdown - Countdown value
 * @param {function} props.onClose - Close handler
 */
export function MigrationSuccess({ migrationResult, countdown, onClose }) {
  const { t } = useTranslation();

  return (
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
        {t('migration.migrationStarted')}
      </motion.h1>

      <motion.p
        className="mt-2 text-gray-400 text-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {t('migration.notificationsSending')}
      </motion.p>

      {/* Result Card */}
      {migrationResult && (
        <ResultCard
          newChannelUrl={migrationResult.newChannelUrl}
          notificationsSent={migrationResult.notificationsSent}
          t={t}
        />
      )}

      {/* Countdown */}
      {countdown !== null && (
        <Countdown value={countdown} t={t} />
      )}

      {/* Close Button */}
      <motion.button
        onClick={onClose}
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
        {t('common.close')}
      </motion.button>
    </motion.div>
  );
}
