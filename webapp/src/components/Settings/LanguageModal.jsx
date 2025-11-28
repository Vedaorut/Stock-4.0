import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useBackButton } from '../../hooks/useBackButton';
import { useTranslation } from '../../i18n/useTranslation';

const LANGUAGES = [
  {
    id: 'ru',
    name: 'Русский',
    flag: '🇷🇺',
    enabled: true,
  },
  {
    id: 'en',
    name: 'English',
    flag: '🇬🇧',
    enabled: true,
  },
];

export default function LanguageModal({ isOpen, onClose }) {
  const { triggerHaptic } = useTelegram();
  const { t, lang, setLanguage } = useTranslation();

  // Используем Telegram BackButton API для закрытия модалки
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useBackButton(isOpen ? handleClose : null);

  const handleSelectLanguage = async (languageId) => {
    triggerHaptic('light');

    if (languageId === lang) {
      onClose();
      return;
    }

    // Применить новый язык и закрыть модальное окно
    await setLanguage(languageId);
    onClose();
  };

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
          <PageHeader title={t('language.title')} onBack={handleClose} variant="close" />
          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 24px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-6 space-y-3">
              {LANGUAGES.map((language) => (
                <motion.button
                  key={language.id}
                  onClick={() => language.enabled && handleSelectLanguage(language.id)}
                  disabled={!language.enabled}
                  className="w-full p-4 rounded-2xl text-left flex items-center justify-between disabled:opacity-50"
                  style={{
                    background:
                      lang === language.id
                        ? 'linear-gradient(135deg, rgba(255, 107, 0, 0.1) 0%, rgba(255, 133, 51, 0.1) 100%)'
                        : 'rgba(255, 255, 255, 0.03)',
                    border:
                      lang === language.id
                        ? '1px solid rgba(255, 107, 0, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                  whileTap={language.enabled ? { scale: 0.98 } : {}}
                  whileHover={language.enabled ? { scale: 1.01 } : {}}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{language.flag}</span>
                    <div>
                      <p className="text-white font-semibold text-lg">{language.name}</p>
                      {!language.enabled && (
                        <p className="text-gray-500 text-xs mt-0.5">{t('language.comingSoon')}</p>
                      )}
                    </div>
                  </div>

                  {lang === language.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center justify-center w-8 h-8 rounded-full"
                      style={{
                        background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                      }}
                    >
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
