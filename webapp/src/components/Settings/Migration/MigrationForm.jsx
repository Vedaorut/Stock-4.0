import { motion, AnimatePresence } from 'framer-motion';
import { parseChannelInput } from './useMigration';

/**
 * Migration Error display with retry
 * @param {{ error: string, onRetry: function, loading: boolean, disabled: boolean }} props
 */
function MigrationError({ error, onRetry, loading, disabled }) {
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
          <p className="text-red-400 text-sm">{error}</p>
          <motion.button
            onClick={onRetry}
            disabled={loading || disabled}
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
  );
}

/**
 * Channel Input Field with validation
 * @param {{ value: string, onChange: function, channelError: string|null, isValid: boolean }} props
 */
function ChannelInput({ value, onChange, channelError, isValid }) {
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder="@mychannel (мин. 5 символов)"
        autoFocus
        className="w-full h-14 px-4 pr-12 rounded-2xl text-white text-base placeholder-gray-500 outline-none transition-all"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: channelError
            ? '2px solid rgba(239, 68, 68, 0.5)'
            : isValid
              ? '2px solid rgba(34, 197, 94, 0.5)'
              : '2px solid rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* Validation Icon */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <AnimatePresence mode="wait">
          {isValid && (
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
          {channelError && value && (
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
  );
}

/**
 * Valid channel preview
 * @param {{ value: string }} props
 */
function ChannelPreview({ value }) {
  const { cleaned } = parseChannelInput(value);
  
  return (
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
        Канал: <span className="font-semibold">{cleaned}</span>
      </p>
    </motion.div>
  );
}

/**
 * Subscriber count info card
 * @param {{ count: number }} props
 */
function SubscriberInfo({ count }) {
  return (
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
        <span className="text-white font-semibold">{count}</span> подписчиков получат уведомление
      </p>
    </motion.div>
  );
}

/**
 * Submit button with loading state
 * @param {{ loading: boolean, disabled: boolean, isValid: boolean, onClick: function }} props
 */
function SubmitButton({ loading, disabled, isValid, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="mt-6 w-full h-14 rounded-2xl font-semibold text-white text-base disabled:opacity-40 flex items-center justify-center gap-2"
      style={{
        background: !loading && isValid
          ? 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)'
          : 'rgba(255, 255, 255, 0.1)',
        boxShadow: !loading && isValid ? '0 4px 20px rgba(255, 107, 0, 0.3)' : 'none',
      }}
      whileTap={!loading && isValid ? { scale: 0.98 } : {}}
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
  );
}

/**
 * Migration Form Screen (Step 2)
 * @param {Object} props
 * @param {string} props.newChannel - Channel input value
 * @param {function} props.onChannelChange - Channel change handler
 * @param {string|null} props.channelError - Channel validation error
 * @param {boolean} props.isChannelValid - Channel validation state
 * @param {string|null} props.migrationError - Migration error message
 * @param {boolean} props.loading - Loading state
 * @param {number} props.subscriberCount - Number of subscribers
 * @param {function} props.onSubmit - Submit handler
 */
export function MigrationForm({
  newChannel,
  onChannelChange,
  channelError,
  isChannelValid,
  migrationError,
  loading,
  subscriberCount,
  onSubmit,
}) {
  const isDisabled = loading || !newChannel.trim() || channelError !== null;

  return (
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
        <MigrationError
          error={migrationError}
          onRetry={onSubmit}
          loading={loading}
          disabled={!newChannel.trim() || channelError !== null}
        />
      )}

      {/* Input Field */}
      <ChannelInput
        value={newChannel}
        onChange={onChannelChange}
        channelError={channelError}
        isValid={isChannelValid}
      />

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
          <ChannelPreview value={newChannel} />
        )}
      </AnimatePresence>

      {/* Subscriber Count Info */}
      <SubscriberInfo count={subscriberCount} />

      {/* CTA Button */}
      <SubmitButton
        loading={loading}
        disabled={isDisabled}
        isValid={isChannelValid}
        onClick={onSubmit}
      />
    </motion.div>
  );
}
