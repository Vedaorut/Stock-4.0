import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useBackButton } from '../../hooks/useBackButton';
import { useTranslation } from '../../i18n/useTranslation';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../hooks/useToast';

const CATEGORIES = [
  { id: 'bug', icon: 'bug', labelKey: 'feedback.categories.bug' },
  { id: 'feature', icon: 'lightbulb', labelKey: 'feedback.categories.feature' },
  { id: 'question', icon: 'question', labelKey: 'feedback.categories.question' },
  { id: 'other', icon: 'dots', labelKey: 'feedback.categories.other' },
];

const MIN_CHARS = 10;
const MAX_CHARS = 1000;

export default function FeedbackModal({ isOpen, onClose }) {
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();
  const { post } = useApi();
  const toast = useToast();

  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);

  const handleCategorySelect = (categoryId) => {
    triggerHaptic('light');
    setCategory(categoryId);
  };

  const handleSubmit = async () => {
    if (message.length < MIN_CHARS) {
      triggerHaptic('error');
      toast.error(t('feedback.minCharsError', { min: MIN_CHARS }));
      return;
    }

    triggerHaptic('light');
    setSubmitting(true);

    try {
      const { error } = await post('/feedback', {
        category,
        message,
      });

      if (error) {
        throw new Error(error);
      }

      triggerHaptic('success');
      toast.success(t('feedback.success'));
      setMessage('');
      setCategory('bug');
      onClose();
    } catch (err) {
      triggerHaptic('error');
      toast.error(t('feedback.error'));
      console.error('Feedback submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = message.length >= MIN_CHARS && message.length <= MAX_CHARS;
  const charCount = message.length;

  const getCategoryIcon = (iconType) => {
    switch (iconType) {
      case 'bug':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'lightbulb':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        );
      case 'question':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'dots':
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
        );
    }
  };

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
          <PageHeader title={t('feedback.title')} onBack={handleClose} variant="close" />

          <div
            className="flex-1 flex flex-col px-4 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 60px)',
              paddingBottom: 'calc(var(--tabbar-total, 80px) + 16px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Header icon and description */}
            <motion.div
              className="text-center mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white mb-2">{t('feedback.title')}</h2>
              <p className="text-sm text-gray-400">{t('feedback.description')}</p>
            </motion.div>

            {/* Category selector */}
            <motion.div
              className="mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">{t('feedback.categoryLabel')}</p>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('feedback.categoryLabel')}>
                {CATEGORIES.map((cat) => (
                  <motion.button
                    key={cat.id}
                    role="radio"
                    aria-checked={category === cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="p-3 rounded-xl flex flex-col items-center gap-2"
                    style={{
                      background:
                        category === cat.id
                          ? 'linear-gradient(135deg, rgba(255, 107, 0, 0.15) 0%, rgba(255, 133, 51, 0.15) 100%)'
                          : 'rgba(255, 255, 255, 0.03)',
                      border:
                        category === cat.id
                          ? '1px solid rgba(255, 107, 0, 0.4)'
                          : '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span
                      className={category === cat.id ? 'text-orange-400' : 'text-gray-400'}
                    >
                      {getCategoryIcon(cat.icon)}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        category === cat.id ? 'text-orange-400' : 'text-gray-400'
                      }`}
                    >
                      {t(cat.labelKey)}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Message textarea */}
            <motion.div
              className="flex-1 flex flex-col mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">{t('feedback.messageLabel')}</p>
              <div className="relative flex-1 min-h-[150px]">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                  placeholder={t('feedback.placeholder')}
                  className="w-full h-full min-h-[150px] p-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-orange-500/50 transition-colors"
                  style={{
                    WebkitAppearance: 'none',
                  }}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <span
                    className={`text-xs ${
                      charCount < MIN_CHARS
                        ? 'text-red-400'
                        : charCount > MAX_CHARS * 0.9
                          ? 'text-orange-400'
                          : 'text-gray-500'
                    }`}
                  >
                    {charCount}/{MAX_CHARS}
                  </span>
                </div>
              </div>
              {charCount > 0 && charCount < MIN_CHARS && (
                <p className="text-xs text-red-400 mt-2">
                  {t('feedback.minCharsHint', { min: MIN_CHARS, current: charCount })}
                </p>
              )}
            </motion.div>

            {/* Submit button */}
            <motion.button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
                isValid && !submitting
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-gray-500'
              }`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              whileTap={isValid && !submitting ? { scale: 0.98 } : {}}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.div
                    className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  {t('common.loading')}
                </span>
              ) : (
                t('feedback.submit')
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
