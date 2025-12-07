import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../common/PageHeader';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n/useTranslation';
import { useBackButton } from '../../hooks/useBackButton';
import { useApi } from '../../hooks/useApi';

const WALLET_PATTERNS = {
  BTC: /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/,
  ETH: /^0x[a-fA-F0-9]{40}$/,
  USDT: /^T[a-zA-Z0-9]{33}$/, // USDT (TRC-20) uses TRON addresses
  LTC: /^(L|M|ltc1)[a-zA-HJ-NP-Z0-9]{26,42}$/,
};

const walletFieldMap = {
  BTC: { key: 'btc', field: 'wallet_btc' },
  ETH: { key: 'eth', field: 'wallet_eth' },
  USDT: { key: 'usdt', field: 'wallet_usdt' },
  LTC: { key: 'ltc', field: 'wallet_ltc' },
};

const orderedWalletTypes = ['BTC', 'ETH', 'USDT', 'LTC'];

function WalletCard({ wallet, onRemove, onEdit, isEditing, onStartEdit, onCancelEdit }) {
  const { triggerHaptic, confirm } = useTelegram();
  const { t } = useTranslation();
  const [editValue, setEditValue] = useState(wallet.address);
  const [saving, setSaving] = useState(false);

  const handleRemove = async () => {
    triggerHaptic('medium');
    const confirmed = await confirm(t('wallet.confirmRemove'));
    if (confirmed) {
      triggerHaptic('success');
      onRemove(wallet);
    }
  };

  const handleEdit = () => {
    triggerHaptic('medium');
    onStartEdit(wallet.type);
    setEditValue(wallet.address);
  };

  const handleCancel = () => {
    triggerHaptic('light');
    onCancelEdit();
    setEditValue(wallet.address);
  };

  const isValid = editValue.trim() ? WALLET_PATTERNS[wallet.type].test(editValue.trim()) : false;

  const handleSave = async () => {
    if (!isValid || saving) return;

    triggerHaptic('medium');
    setSaving(true);

    try {
      await onEdit(wallet.type, editValue.trim());
      onCancelEdit();
      triggerHaptic('success');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to save wallet edit:', error);
      }
    } finally {
      setSaving(false);
    }
  };

  const typeColors = {
    BTC: 'text-orange-500',
    ETH: 'text-blue-400',
    USDT: 'text-emerald-400',
    LTC: 'text-purple-400',
  };

  return (
    <motion.div
      className="glass-card rounded-2xl p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      layout
    >
      {isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${typeColors[wallet.type] || 'text-gray-400'}`}>
              {wallet.type}
            </span>
            <span className="text-blue-400 text-xs">✏️ {t('wallet.editing')}</span>
          </div>

          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={wallet.address}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-blue-400"
            autoFocus
          />

          <span className={`text-xs ${isValid ? 'text-green-500' : 'text-red-500'}`}>
            {isValid ? '✓ ' + t('wallet.valid') : '⚠️ ' + t('wallet.invalidAddress')}
          </span>

          <div className="flex gap-2">
            <motion.button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex-1 py-2.5 rounded-xl font-medium text-white disabled:opacity-50"
              style={{
                background: isValid
                  ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
              }}
              whileTap={isValid ? { scale: 0.98 } : {}}
            >
              {saving ? t('products.saving') : t('common.save')}
            </motion.button>

            <motion.button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-medium text-white"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
              }}
              whileTap={{ scale: 0.98 }}
            >
              {t('common.cancel')}
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-bold ${typeColors[wallet.type] || 'text-gray-400'}`}>
                {wallet.type}
              </span>
              <span className="text-green-500 text-xs">✓</span>
            </div>
            <p className="text-white font-mono text-sm break-all">{wallet.address}</p>
            <p className="text-gray-500 text-xs mt-1">
              {t('wallet.added', {
                date: new Date(wallet.addedAt || Date.now()).toLocaleDateString('ru-RU'),
              })}
            </p>
          </div>

          <div className="flex gap-2">
            <motion.button
              onClick={handleEdit}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-blue-400"
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
              }}
              whileTap={{ scale: 0.9 }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </motion.button>

            <motion.button
              onClick={handleRemove}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-red-400"
              style={{
                background: 'rgba(255, 59, 48, 0.1)',
                border: '1px solid rgba(255, 59, 48, 0.2)',
              }}
              whileTap={{ scale: 0.9 }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function WalletsModal({ isOpen, onClose }) {
  const { triggerHaptic, alert } = useTelegram();
  const { t } = useTranslation();
  const { get, put } = useApi();

  const [shop, setShop] = useState(null);
  const [walletMap, setWalletMap] = useState({ btc: null, eth: null, usdt: null, ltc: null });
  const [walletMeta, setWalletMeta] = useState({ updatedAt: null });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [btcAddress, setBtcAddress] = useState('');
  const [ethAddress, setEthAddress] = useState('');
  const [usdtAddress, setUsdtAddress] = useState('');
  const [ltcAddress, setLtcAddress] = useState('');
  const [editingWalletType, setEditingWalletType] = useState(null);

  // useRef-based lock to prevent race condition
  const savingLockRef = useRef(false);

  const isValidBTC = btcAddress ? WALLET_PATTERNS.BTC.test(btcAddress.trim()) : false;
  const isValidETH = ethAddress ? WALLET_PATTERNS.ETH.test(ethAddress.trim()) : false;
  const isValidUSDT = usdtAddress ? WALLET_PATTERNS.USDT.test(usdtAddress.trim()) : false;
  const isValidLTC = ltcAddress ? WALLET_PATTERNS.LTC.test(ltcAddress.trim()) : false;

  const hasValidAddress = isValidBTC || isValidETH || isValidUSDT || isValidLTC;

  const resetForm = useCallback(() => {
    setShowForm(false);
    setBtcAddress('');
    setEthAddress('');
    setUsdtAddress('');
    setLtcAddress('');
  }, []);

  const syncWalletState = useCallback((payload) => {
    if (!payload) {
      setWalletMap({ btc: null, eth: null, usdt: null, ltc: null });
      setWalletMeta({ updatedAt: null });
      return;
    }

    const data = payload.data || payload;
    setWalletMap({
      btc: data.wallet_btc ?? data.wallets?.btc ?? null,
      eth: data.wallet_eth ?? data.wallets?.eth ?? null,
      usdt: data.wallet_usdt ?? data.wallets?.usdt ?? null,
      ltc: data.wallet_ltc ?? data.wallets?.ltc ?? null,
    });
    setWalletMeta({
      updatedAt: data.updated_at || data.updatedAt || null,
    });
  }, []);

  const loadWallets = useCallback(
    async (signal) => {
      const { data: shopsResponse, error: shopsError } = await get('/shops/my', {
        signal,
        timeout: 10000, // 10 second timeout to prevent infinite loading
      });

      if (signal?.aborted) return { status: 'aborted' };

      if (shopsError) {
        return { status: 'error', error: 'Failed to load shops' };
      }

      // ✅ FIX: Already correct - but adding validation
      const shops = Array.isArray(shopsResponse?.data) ? shopsResponse.data : [];
      if (!Array.isArray(shops) || shops.length === 0) {
        setShop(null);
        syncWalletState(null);
        return { status: 'success' };
      }

      const primaryShop = shops[0];
      setShop(primaryShop);

      const { data: walletsResponse, error: walletsError } = await get(
        `/shops/${primaryShop.id}/wallets`,
        {
          signal,
          timeout: 10000, // 10 second timeout to prevent infinite loading
        }
      );

      if (signal?.aborted) return { status: 'aborted' };

      if (walletsError) {
        return { status: 'error', error: 'Failed to load wallets' };
      }

      syncWalletState(walletsResponse);
      return { status: 'success' };
    },
    [get, syncWalletState]
  );

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setErrorMessage(null);

    const controller = new AbortController();

    loadWallets(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          if (import.meta.env.DEV) {
            console.error('Failed to load wallets:', result.error);
          }
          setErrorMessage(t('wallet.loadError'));
          syncWalletState(null);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          if (import.meta.env.DEV) {
            console.error('Failed to load wallets', error);
          }
          setErrorMessage(t('wallet.loadError'));
          syncWalletState(null);
        }
      })
      .finally(() => {
        // ✅ FIX: Always reset loading, even on abort
        // This prevents infinite spinner when modal is reopened after quick close
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // ✅ FIX: Only isOpen in deps to prevent infinite loop

  const handleClose = useCallback(() => {
    resetForm();
    setErrorMessage(null); // Clear error on close
    setEditingWalletType(null); // Reset edit state
    onClose();
  }, [onClose, resetForm]);

  const handleBackButton = useCallback(() => {
    if (editingWalletType) {
      // Cancel edit mode
      triggerHaptic('light');
      setEditingWalletType(null);
    } else {
      // Close modal
      handleClose();
    }
  }, [editingWalletType, handleClose, triggerHaptic]);

  useBackButton(isOpen ? handleBackButton : null);


  const walletList = useMemo(() => {
    return orderedWalletTypes
      .map((type) => {
        const mapping = walletFieldMap[type];
        const address = walletMap[mapping.key];
        if (!address) {
          return null;
        }

        return {
          type,
          address,
          addedAt: walletMeta.updatedAt,
        };
      })
      .filter(Boolean);
  }, [walletMap, walletMeta.updatedAt]);

  // Available types to add (those not yet added)
  const availableWalletTypes = useMemo(() => {
    return orderedWalletTypes.filter((type) => {
      const mapping = walletFieldMap[type];
      return !walletMap[mapping.key]; // Show only if wallet not yet added
    });
  }, [walletMap]);

  const handleRemoveWallet = useCallback(
    async (wallet) => {
      if (!shop) {
        return;
      }

      const mapping = walletFieldMap[wallet.type];
      if (!mapping) {
        return;
      }

      setSaving(true);
      const { data: response, error } = await put(`/shops/${shop.id}/wallets`, {
        [mapping.field]: null,
      });

      if (error) {
        await alert(t('wallet.deleteError'));
        setSaving(false);
        return;
      }

      triggerHaptic('success');
      syncWalletState(response);
      setSaving(false);
    },
    [alert, put, shop, syncWalletState, t, triggerHaptic]
  );

  const handleEditWallet = useCallback(
    async (walletType, newAddress) => {
      if (!shop) {
        await alert(t('wallet.shopRequired'));
        throw new Error('No shop found');
      }

      const mapping = walletFieldMap[walletType];
      if (!mapping) {
        await alert(t('wallet.invalidAddress'));
        throw new Error('Invalid wallet type');
      }

      // Validate address format
      if (!WALLET_PATTERNS[walletType].test(newAddress)) {
        await alert(t('wallet.invalidAddress'));
        throw new Error('Invalid address format');
      }

      setSaving(true);
      const { data: response, error } = await put(`/shops/${shop.id}/wallets`, {
        [mapping.field]: newAddress,
      });

      if (error) {
        await alert(t('wallet.saveError'));
        setSaving(false);
        throw new Error('Failed to update wallet');
      }

      syncWalletState(response);
      setSaving(false);
    },
    [alert, put, shop, syncWalletState, t]
  );

  const handleSaveWallets = useCallback(async () => {
    // useRef-based lock to prevent race condition on double click
    if (savingLockRef.current) {
      return;
    }
    savingLockRef.current = true;

    try {
      setSaving(true);

      if (!shop) {
        await alert(t('wallet.shopRequired'));
        return;
      }

      if (!hasValidAddress) {
        await alert(t('wallet.invalidAll'));
        return;
      }

      const payload = {};
      if (isValidBTC) {
        payload.wallet_btc = btcAddress.trim();
      }
      if (isValidETH) {
        payload.wallet_eth = ethAddress.trim();
      }
      if (isValidUSDT) {
        payload.wallet_usdt = usdtAddress.trim();
      }
      if (isValidLTC) {
        payload.wallet_ltc = ltcAddress.trim();
      }

      if (!Object.keys(payload).length) {
        await alert(t('wallet.invalidAddresses'));
        return;
      }

      const { data: response, error } = await put(`/shops/${shop.id}/wallets`, payload);

      if (error) {
        await alert(t('wallet.saveError'));
        return;
      }

      triggerHaptic('success');
      syncWalletState(response);
      resetForm();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[WalletsModal] Error saving wallets:', err);
      }
      await alert(t('wallet.saveError'));
    } finally {
      setSaving(false);
      savingLockRef.current = false; // Always reset in finally
    }
  }, [
    alert,
    btcAddress,
    ethAddress,
    hasValidAddress,
    isValidBTC,
    isValidETH,
    isValidLTC,
    isValidUSDT,
    put,
    resetForm,
    shop,
    syncWalletState,
    t,
    ltcAddress,
    triggerHaptic,
    usdtAddress,
  ]);

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
          <PageHeader title={t('wallet.title')} onBack={handleClose} variant="close" />
          <div
            className="flex-1 overflow-y-auto"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
              paddingBottom: 'calc(var(--tabbar-total) + 20px)',
              maxHeight: '100vh',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="px-4 py-6 space-y-4">
              <motion.div
                className="glass-card rounded-2xl p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-orange-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold mb-1">
                      {t('wallet.title')}
                    </h3>
                    <p className="text-gray-400 text-sm mb-2">
                      {t('wallet.enterAddresses')}
                    </p>
                    <p className="text-gray-500 text-xs">{t('wallet.supported')}</p>
                    {shop && (
                      <p className="text-gray-500 text-xs mt-2">
                        {t('wallet.shopLabel')} <span className="text-white">{shop.name}</span>
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>

              {errorMessage && (
                <motion.div
                  className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {errorMessage}
                </motion.div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-12 h-12 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <AnimatePresence>
                    {walletList.length > 0 ? (
                      walletList.map((wallet) => (
                        <WalletCard
                          key={wallet.type}
                          wallet={wallet}
                          onRemove={handleRemoveWallet}
                          onEdit={handleEditWallet}
                          isEditing={editingWalletType === wallet.type}
                          onStartEdit={setEditingWalletType}
                          onCancelEdit={() => setEditingWalletType(null)}
                        />
                      ))
                    ) : (
                      <motion.div
                        className="glass-card rounded-2xl p-4 text-gray-400 text-sm"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {t('wallet.empty')}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Inline Add Wallet Button */}
                  {!showForm && availableWalletTypes.length > 0 && (
                    <motion.button
                      onClick={() => {
                        triggerHaptic('light');
                        setShowForm(true);
                      }}
                      className="w-full h-14 rounded-2xl font-semibold text-white mt-2"
                      style={{
                        background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                        boxShadow: '0 4px 16px rgba(255, 107, 0, 0.3)',
                      }}
                      whileTap={{ scale: 0.98 }}
                      disabled={saving}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      + {t('wallet.add')}
                    </motion.button>
                  )}

                  {/* Message when all wallets are added */}
                  {!showForm && availableWalletTypes.length === 0 && walletList.length > 0 && (
                    <motion.div
                      className="glass-card rounded-2xl p-4 text-center text-gray-400 text-sm"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {t('wallet.allAdded')}
                    </motion.div>
                  )}

                  <AnimatePresence>
                    {showForm && (
                      <motion.div
                        className="glass-card rounded-2xl p-4 space-y-4"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        {/* Show only fields for available types */}
                        {availableWalletTypes.includes('BTC') && (
                          <div>
                            <label className="text-sm text-gray-400 mb-2 block">
                              {t('wallet.currencies.BTC')}
                            </label>
                            <input
                              type="text"
                              value={btcAddress}
                              onChange={(e) => setBtcAddress(e.target.value)}
                              placeholder="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
                              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-orange-primary"
                            />
                            {btcAddress && (
                              <span
                                className={`text-sm ${isValidBTC ? 'text-green-500' : 'text-red-500'}`}
                              >
                                {isValidBTC ? '✓ ' + t('wallet.valid') : '⚠️ ' + t('wallet.invalidAddress')}
                              </span>
                            )}
                          </div>
                        )}

                        {availableWalletTypes.includes('ETH') && (
                          <div>
                            <label className="text-sm text-gray-400 mb-2 block">
                              {t('wallet.currencies.ETH')}
                            </label>
                            <input
                              type="text"
                              value={ethAddress}
                              onChange={(e) => setEthAddress(e.target.value)}
                              placeholder="0x742d35Cc6634C0532925a3b844Bc7e759f42bE1"
                              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-orange-primary"
                            />
                            {ethAddress && (
                              <span
                                className={`text-sm ${isValidETH ? 'text-green-500' : 'text-red-500'}`}
                              >
                                {isValidETH ? '✓ ' + t('wallet.valid') : '⚠️ ' + t('wallet.invalidAddress')}
                              </span>
                            )}
                          </div>
                        )}

                        {availableWalletTypes.includes('USDT') && (
                          <div>
                            <label className="text-sm text-gray-400 mb-2 block">
                              {t('wallet.currencies.USDT')}
                            </label>
                            <input
                              type="text"
                              value={usdtAddress}
                              onChange={(e) => setUsdtAddress(e.target.value)}
                              placeholder="TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS"
                              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-orange-primary"
                            />
                            {usdtAddress && (
                              <span
                                className={`text-sm ${isValidUSDT ? 'text-green-500' : 'text-red-500'}`}
                              >
                                {isValidUSDT ? '✓ ' + t('wallet.valid') : '⚠️ ' + t('wallet.invalidAddress')}
                              </span>
                            )}
                          </div>
                        )}

                        {availableWalletTypes.includes('LTC') && (
                          <div>
                            <label className="text-sm text-gray-400 mb-2 block">
                              {t('wallet.currencies.LTC')}
                            </label>
                            <input
                              type="text"
                              value={ltcAddress}
                              onChange={(e) => setLtcAddress(e.target.value)}
                              placeholder="ltc1q..."
                              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-orange-primary"
                            />
                            {ltcAddress && (
                              <span
                                className={`text-sm ${isValidLTC ? 'text-green-500' : 'text-red-500'}`}
                              >
                                {isValidLTC ? '✓ ' + t('wallet.valid') : '⚠️ ' + t('wallet.invalidAddress')}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Inline Save Button */}
                        <motion.button
                          className="w-full py-3 rounded-xl font-medium transition-all disabled:opacity-50 mt-2"
                          style={{
                            background: hasValidAddress
                              ? 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)'
                              : 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                          }}
                          onClick={handleSaveWallets}
                          disabled={saving || !hasValidAddress}
                          whileTap={hasValidAddress ? { scale: 0.98 } : {}}
                        >
                          {saving ? t('common.loading') : t('common.save')}
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
