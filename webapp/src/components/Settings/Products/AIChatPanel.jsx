import { useState } from 'react';
import { m as motion } from 'framer-motion';
import PageHeader from '../../common/PageHeader';
import { useTelegram } from '../../../hooks/useTelegram';
import { useTranslation } from '../../../i18n/useTranslation';

/**
 * AIChatInput - Input form for AI chat
 */
function AIChatInput({ disabled, onSend }) {
  const { t } = useTranslation();
  const { triggerHaptic } = useTelegram();
  const [value, setValue] = useState('');

  const handleSubmit = (evt) => {
    evt.preventDefault();
    if (!value.trim() || disabled) return;
    triggerHaptic('light');
    onSend(value);
    setValue('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl px-4 py-3 flex items-center gap-3 border border-white/10 bg-white/5 backdrop-blur-sm"
    >
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('ai.describeTask')}
        className="flex-1 resize-none bg-transparent text-base text-white focus:outline-none placeholder:text-gray-400"
        disabled={disabled}
        autoFocus
      />
      <motion.button
        type="submit"
        disabled={disabled || !value.trim()}
        className="w-11 h-11 rounded-xl flex items-center justify-center text-white disabled:opacity-40"
        style={{
          background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
        }}
        whileTap={!disabled && value.trim() ? { scale: 0.94 } : {}}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </motion.button>
    </form>
  );
}

/**
 * AIChatPanel - AI assistant chat interface
 */
function AIChatPanel({
  onClose,
  aiHistory,
  aiLoading,
  aiError,
  onSendMessage,
  onRetry
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      key="ai-chat-panel"
      className="fixed inset-0 z-50 bg-dark-bg"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 300 }}
    >
      <PageHeader title="AI Assistant" onBack={onClose} variant="close" />
      <div
        className="flex flex-col min-h-screen"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}
      >
        <div className="flex-1 px-4 pt-6 pb-36 overflow-y-auto space-y-4">
          {aiHistory.map((entry, index) => (
            <motion.div
              key={`${entry.role}-${index}`}
              className={`max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-line leading-relaxed ${
                entry.role === 'user'
                  ? 'ml-auto bg-orange-primary/10 text-orange-primary'
                  : 'mr-auto bg-white/5 text-gray-200 border border-white/10'
              }`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {entry.content}
            </motion.div>
          ))}

          {aiLoading && (
            <motion.div
              className="flex items-center gap-2 text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-primary"></span>
              </span>
              {t('ai.thinking')}
            </motion.div>
          )}

          {aiError && (
            <motion.div
              className="flex flex-col gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-xs text-red-400">Error: {aiError}</p>
              <motion.button
                onClick={onRetry}
                disabled={aiLoading}
                className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                whileTap={!aiLoading ? { scale: 0.98 } : {}}
              >
                {aiLoading ? t('common.retrying') : t('common.retry')}
              </motion.button>
            </motion.div>
          )}
        </div>

        <div
          className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-[#0A0A0A] border-t border-white/5 z-50"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
        >
          <AIChatInput disabled={aiLoading} onSend={onSendMessage} />
        </div>
      </div>
    </motion.div>
  );
}

export default AIChatPanel;
