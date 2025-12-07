import { useState, useEffect, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useApi } from '../../hooks/useApi';
import { useBackButton } from '../../hooks/useBackButton';
import { useTranslation } from '../../i18n/useTranslation';

export default function InviteLinkModal({ isOpen, onClose }) {
  const { triggerHaptic } = useTelegram();
  const { fetchApi } = useApi();
  const { t } = useTranslation();

  const [myShop, setMyShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleClose = useCallback(() => onClose(), [onClose]);
  useBackButton(isOpen ? handleClose : null);

  const loadData = useCallback(async (signal) => {
    const shopsRes = await fetchApi('/shops/my', { signal, timeout: 10000 });
    if (signal?.aborted) return;

    const shops = Array.isArray(shopsRes?.data) ? shopsRes.data : [];
    if (shops.length > 0) {
      setMyShop(shops[0]);
    }
  }, [fetchApi]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setCopied(false);
    const controller = new AbortController();
    loadData(controller.signal).finally(() => setLoading(false));
    return () => controller.abort();
  }, [isOpen, loadData]);

  // Bot username from config or fallback
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'saveropus_bot';
  const inviteLink = myShop ? `t.me/${botUsername}?start=shop_${myShop.id}` : '';

  const handleCopy = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      triggerHaptic('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      triggerHaptic('error');
      console.error('Failed to copy:', err);
    }
  };

  // No shop state
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
            <PageHeader title={t('settings.inviteLink')} onBack={handleClose} variant="close" />
            <div
              className="flex items-center justify-center"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 80px)' }}
            >
              <div className="text-center px-8">
                <motion.div
                  className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center"
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring' }}
                >
                  <span className="text-3xl">🏪</span>
                </motion.div>
                <p className="text-gray-400 text-sm">{t('shop.createShop')}</p>
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
          className="fixed inset-0 z-50 bg-dark-bg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <PageHeader title={t('settings.inviteLink')} onBack={handleClose} variant="close" />

          <div
            className="flex-1 flex flex-col px-4"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 60px)',
              paddingBottom: 'calc(var(--tabbar-total, 80px) + 16px)',
            }}
          >
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <motion.div
                  className="w-10 h-10 rounded-full border-2 border-orange-500/30 border-t-orange-500"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {/* Icon and title */}
                <motion.div
                  className="text-center mb-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-white mb-2">{t('settings.inviteLink')}</h2>
                  <p className="text-sm text-gray-400">{t('settings.inviteLinkDescription')}</p>
                </motion.div>

                {/* Link card */}
                <motion.div
                  className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 mb-1">{t('settings.inviteLinkLabel')}</p>
                      <p
                        className="text-white font-mono text-sm truncate select-all cursor-pointer"
                        onClick={handleCopy}
                      >
                        {inviteLink}
                      </p>
                    </div>
                    <motion.button
                      onClick={handleCopy}
                      className={`flex-shrink-0 p-3 rounded-xl transition-colors ${
                        copied
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-white/10 text-gray-300 hover:bg-white/15'
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      {copied ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </motion.button>
                  </div>
                </motion.div>

                {/* Copy button */}
                <motion.button
                  onClick={handleCopy}
                  className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-orange-500 text-white'
                  }`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {copied ? t('settings.inviteLinkCopied') : t('common.copy') || 'Copy'}
                </motion.button>

                {/* Hint */}
                <motion.p
                  className="text-center text-xs text-gray-500 mt-4 px-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  {t('settings.inviteLinkHint')}
                </motion.p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
