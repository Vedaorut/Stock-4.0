import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useStore } from '../../store/useStore';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';

// Регулярные выражения для определения типа кошелька
const WALLET_PATTERNS = {
  BTC: /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/,
  ETH: /^0x[a-fA-F0-9]{40}$/,
  USDT: /^0x[a-fA-F0-9]{40}$/, // USDT (ERC-20) использует те же адреса что и ETH
};

// Определение типа кошелька
const detectWalletType = (address) => {
  if (WALLET_PATTERNS.BTC.test(address)) return 'BTC';
  if (WALLET_PATTERNS.ETH.test(address)) return 'ETH/USDT';
  return null;
};

// Компонент карточки кошелька
function WalletCard({ wallet, onRemove }) {
  const { triggerHaptic, confirm } = useTelegram();
  const { t } = useTranslation();

  const handleRemove = async () => {
    triggerHaptic('medium');
    const confirmed = await confirm(t('wallet.confirmRemove'));
    if (confirmed) {
      triggerHaptic('success');
      onRemove(wallet.address);
    }
  };

  const typeColors = {
    'BTC': 'text-orange-500',
    'ETH/USDT': 'text-blue-500',
  };

  return (
    <motion.div
      className="glass-card rounded-2xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-bold ${typeColors[wallet.type] || 'text-gray-400'}`}>
              {wallet.type}
            </span>
            <span className="text-green-500 text-xs">✓</span>
          </div>
          <p className="text-white font-mono text-sm break-all">
            {wallet.address}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            {t('wallet.added', { date: new Date(wallet.addedAt).toLocaleDateString('ru-RU') })}
          </p>
        </div>
        <motion.button
          onClick={handleRemove}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-red-400"
          style={{
            background: 'rgba(255, 59, 48, 0.1)',
            border: '1px solid rgba(255, 59, 48, 0.2)'
          }}
          whileTap={{ scale: 0.9 }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  );
}

// Основной компонент модалки
export default function WalletsModal({ isOpen, onClose }) {
  const { wallets, addWallet, removeWallet } = useStore();
  const { triggerHaptic, alert } = useTelegram();
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [address, setAddress] = useState('');
  const [detectedType, setDetectedType] = useState(null);
  const [isValid, setIsValid] = useState(false);

  const handleAddressChange = (e) => {
    const value = e.target.value.trim();
    setAddress(value);

    if (value) {
      const type = detectWalletType(value);
      setDetectedType(type);
      setIsValid(!!type);
    } else {
      setDetectedType(null);
      setIsValid(false);
    }
  };

  const handleAddWallet = async () => {
    if (!isValid || !detectedType) {
      await alert(t('wallet.invalid'));
      return;
    }

    // Проверка на дубликат
    const exists = wallets.some(w => w.address === address);
    if (exists) {
      await alert(t('wallet.exists'));
      return;
    }

    triggerHaptic('success');
    addWallet({
      address,
      type: detectedType,
      addedAt: new Date().toISOString()
    });

    setAddress('');
    setDetectedType(null);
    setIsValid(false);
    setShowForm(false);
  };

  const handleClose = () => {
    setShowForm(false);
    setAddress('');
    setDetectedType(null);
    setIsValid(false);
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
          <PageHeader title={t('wallet.title')} onBack={handleClose} />
          <div className="min-h-screen pb-24 pt-20">
            <div className="px-4 py-6 space-y-4">
        {/* Кнопка добавления кошелька */}
        {!showForm && (
          <motion.button
            onClick={() => {
              triggerHaptic('light');
              setShowForm(true);
            }}
            className="w-full h-14 rounded-2xl font-semibold text-white"
            style={{
              background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
              boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)'
            }}
            whileTap={{ scale: 0.98 }}
          >
            + {t('wallet.add')}
          </motion.button>
        )}

        {/* Форма добавления */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              className="glass-card rounded-2xl p-4 space-y-3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  {t('wallet.addressLabel')}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={handleAddressChange}
                  placeholder={t('wallet.placeholder')}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-orange-primary transition-colors"
                />
              </div>

              {/* Индикатор типа */}
              {address && (
                <div className="flex items-center gap-2">
                  {isValid ? (
                    <>
                      <span className="text-green-500 text-xl">✓</span>
                      <span className="text-green-500 text-sm font-semibold">
                        {detectedType}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-red-500 text-xl">⚠️</span>
                      <span className="text-red-500 text-sm">
                        {t('wallet.invalid')}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Кнопки действий */}
              <div className="flex gap-2 pt-2">
                <motion.button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowForm(false);
                    setAddress('');
                    setDetectedType(null);
                    setIsValid(false);
                  }}
                  className="flex-1 h-11 rounded-xl font-medium text-gray-300"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t('common.cancel')}
                </motion.button>
                <motion.button
                  onClick={handleAddWallet}
                  disabled={!isValid}
                  className="flex-1 h-11 rounded-xl font-semibold text-white disabled:opacity-50"
                  style={{
                    background: isValid
                      ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
                      : 'rgba(255, 255, 255, 0.1)'
                  }}
                  whileTap={isValid ? { scale: 0.98 } : {}}
                >
                  {t('common.add')}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Список кошельков */}
        {wallets.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 px-2">
              {t('wallet.saved')}
            </h3>
            <AnimatePresence mode="popLayout">
              {wallets.map((wallet) => (
                <WalletCard
                  key={wallet.address}
                  wallet={wallet}
                  onRemove={removeWallet}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          !showForm && (
            <div className="text-center py-12">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              <p className="text-gray-400 text-sm">
                {t('wallet.empty')}
              </p>
            </div>
          )
        )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
