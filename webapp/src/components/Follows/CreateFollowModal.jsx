import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, MagnifyingGlassIcon, EyeIcon, ArrowPathIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import { useApi } from '../../hooks/useApi';
import { useTelegram } from '../../hooks/useTelegram';
import { useBackButton } from '../../hooks/useBackButton';
import { useTranslation } from '../../i18n/useTranslation';
import { useStore } from '../../store/useStore';

const STEPS = {
  SEARCH: 'search',
  MODE: 'mode',
  MARKUP: 'markup',
};

export default function CreateFollowModal({ isOpen, onClose, myShopId, onSuccess, preselectedShop }) {
  const { get, post } = useApi();
  const { triggerHaptic } = useTelegram();
  const { t } = useTranslation();

  const [step, setStep] = useState(STEPS.SEARCH);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedShop, setSelectedShop] = useState(null);
  const [mode, setMode] = useState('monitor');
  const [markupType, setMarkupType] = useState('percentage');
  const [markupPercentage, setMarkupPercentage] = useState(25);
  const [markupFixed, setMarkupFixed] = useState(5);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const searchAbortRef = useRef(null);
  const inputRef = useRef(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);

      if (preselectedShop) {
        setSelectedShop(preselectedShop);
        setStep(STEPS.MODE);
      } else {
        setSelectedShop(null);
        setStep(STEPS.SEARCH);
      }

      setMode('monitor');
      setMarkupType('percentage');
      setMarkupPercentage(25);
      setMarkupFixed(5);
      setError(null);
      // Focus input after modal animation
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    onClose();
  }, [onClose]);

  // Handle back button in wizard
  const handleBack = useCallback(() => {
    triggerHaptic('light');
    if (step === STEPS.MODE) {
      setStep(STEPS.SEARCH);
      setSelectedShop(null);
    } else if (step === STEPS.MARKUP) {
      setStep(STEPS.MODE);
    }
  }, [step, triggerHaptic]);

  const backButtonHandler = step === STEPS.SEARCH ? handleClose : handleBack;

  useBackButton(isOpen ? backButtonHandler : null);

  // Search shops
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    searchAbortRef.current = new AbortController();

    setSearching(true);
    setError(null);

    try {
      const { data, error: apiError } = await get(`/shops/search?q=${encodeURIComponent(searchQuery.trim())}`, {
        signal: searchAbortRef.current.signal,
      });

      if (apiError) {
        setError(t('follows.searchError'));
        return;
      }

      // Filter out own shop
      const filtered = (data || []).filter((shop) => shop.id !== myShopId);
      setSearchResults(filtered);

      if (filtered.length === 0) {
        setError(t('follows.notFound'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(t('follows.searchError'));
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery, myShopId, get, t]);

  // Select shop and go to mode step
  const handleSelectShop = useCallback((shop) => {
    triggerHaptic('light');
    setSelectedShop(shop);
    setStep(STEPS.MODE);
    setError(null);
  }, [triggerHaptic]);

  // Create follow
  const handleCreateFollow = useCallback(async (selectedMode = mode) => {
    if (!selectedShop || !myShopId) return;

    setCreating(true);
    setError(null);

    try {
      const payload = {
        followerShopId: myShopId,
        sourceShopId: selectedShop.id,
        mode: selectedMode,
      };

      if (selectedMode === 'resell') {
        payload.markupType = markupType;
        if (markupType === 'percentage') {
          payload.markupPercentage = markupPercentage;
        } else {
          payload.markupFixed = markupFixed;
        }
      }

      const { error: apiError } = await post('/follows', payload);

      if (apiError) {
        const errorLower = (apiError || '').toLowerCase();
        if (errorLower.includes('circular')) {
          setError(t('follows.circularError') || 'Circular dependency detected');
        } else if (errorLower.includes('already exists')) {
          setError(t('follows.alreadyExists') || 'Already following this shop');
        } else if (errorLower.includes('limit')) {
          setError(t('follows.limitReached') || 'Follow limit reached');
        } else {
          setError(apiError);
        }
        return;
      }

      triggerHaptic('success');
      useStore.getState().setHasFollows(true);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setCreating(false);
    }
  }, [selectedShop, myShopId, mode, markupType, markupPercentage, markupFixed, post, t, triggerHaptic, onSuccess, onClose]);

  // Select mode
  const handleSelectMode = useCallback((selectedMode) => {
    triggerHaptic('light');
    setMode(selectedMode);
    if (selectedMode === 'monitor') {
      // For monitor mode, create immediately
      handleCreateFollow(selectedMode);
    } else {
      // For resell, go to markup step
      setStep(STEPS.MARKUP);
    }
  }, [triggerHaptic, handleCreateFollow]);

  // Calculate preview price
  const examplePrice = 100;
  const calculatedPrice = markupType === 'percentage'
    ? Math.floor(examplePrice * (1 + markupPercentage / 100))
    : Math.floor(examplePrice + markupFixed);

  const percentageQuickValues = [10, 25, 50, 100];
  const fixedQuickValues = [5, 10, 25, 50];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[100] max-h-[85vh] flex flex-col rounded-t-[28px] bg-[#1c1c1c] border-t border-white/10 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                {step !== STEPS.SEARCH && (
                  <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={handleBack}
                    className="p-1 -ml-1 rounded-lg hover:bg-white/5"
                  >
                    <ChevronLeftIcon className="w-5 h-5 text-white/60" />
                  </motion.button>
                )}
                <h3 className="text-lg font-bold text-white">
                  {step === STEPS.SEARCH && t('follows.addFollow')}
                  {step === STEPS.MODE && t('follows.selectMode')}
                  {step === STEPS.MARKUP && t('follows.setMarkup')}
                </h3>
              </div>
              <button onClick={handleClose} className="p-2 -mr-2 rounded-lg hover:bg-white/5">
                <XMarkIcon className="w-5 h-5 text-white/60" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <AnimatePresence mode="wait">
                {/* STEP 1: Search */}
                {step === STEPS.SEARCH && (
                  <motion.div
                    key="search"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    {/* Search input */}
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                        <input
                          ref={inputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                          placeholder={t('follows.searchPlaceholder')}
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B00]/50 transition-colors"
                        />
                      </div>
                      <motion.button
                        onClick={handleSearch}
                        disabled={searching || searchQuery.trim().length < 2}
                        className="px-5 py-3 rounded-xl font-semibold text-white bg-[#FF6B00] disabled:opacity-50 disabled:bg-white/10"
                        whileTap={{ scale: 0.95 }}
                      >
                        {searching ? '...' : t('common.find')}
                      </motion.button>
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    {/* Results */}
                    {searchResults.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-white/40">{t('follows.selectShop')}</p>
                        {searchResults.map((shop) => (
                          <motion.button
                            key={shop.id}
                            onClick={() => handleSelectShop(shop)}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#FF6B00]/30 transition-colors text-left"
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="w-10 h-10 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00] font-bold">
                              {shop.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{shop.name}</p>
                              {shop.description && (
                                <p className="text-xs text-white/40 truncate">{shop.description}</p>
                              )}
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* STEP 2: Mode Selection */}
                {step === STEPS.MODE && selectedShop && (
                  <motion.div
                    key="mode"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    {/* Selected shop preview */}
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-sm text-white/40">{t('follows.followingShop')}</p>
                      <p className="text-white font-semibold">{selectedShop.name}</p>
                    </div>

                    {/* Mode cards */}
                    <div className="space-y-3">
                      {/* Monitor */}
                      <motion.button
                        onClick={() => handleSelectMode('monitor')}
                        disabled={creating}
                        className="w-full p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-colors text-left"
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <EyeIcon className="w-5 h-5 text-blue-400" />
                          </div>
                          <div>
                            <p className="text-white font-bold">{t('follows.monitorMode')}</p>
                            <p className="text-xs text-white/50">{t('follows.monitorDesc')}</p>
                          </div>
                        </div>
                      </motion.button>

                      {/* Resell */}
                      <motion.button
                        onClick={() => handleSelectMode('resell')}
                        disabled={creating}
                        className="w-full p-4 rounded-2xl bg-[#FF6B00]/10 border border-[#FF6B00]/20 hover:border-[#FF6B00]/40 transition-colors text-left"
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-xl bg-[#FF6B00]/20 flex items-center justify-center">
                            <ArrowPathIcon className="w-5 h-5 text-[#FF6B00]" />
                          </div>
                          <div>
                            <p className="text-white font-bold">{t('follows.resellMode')}</p>
                            <p className="text-xs text-white/50">{t('follows.resellDesc')}</p>
                          </div>
                        </div>
                      </motion.button>
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    {creating && (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </motion.div>
                )}

                {/* STEP 3: Markup */}
                {step === STEPS.MARKUP && (
                  <motion.div
                    key="markup"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    {/* Type toggle */}
                    <div className="flex justify-center">
                      <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/5">
                        <button
                          onClick={() => setMarkupType('percentage')}
                          className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${markupType === 'percentage' ? 'bg-[#FF6B00] text-white' : 'text-white/40'
                            }`}
                        >
                          %
                        </button>
                        <button
                          onClick={() => setMarkupType('fixed')}
                          className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${markupType === 'fixed' ? 'bg-[#FF6B00] text-white' : 'text-white/40'
                            }`}
                        >
                          $
                        </button>
                      </div>
                    </div>

                    {/* Value display */}
                    <div className="text-center py-4">
                      {markupType === 'percentage' ? (
                        <span className="text-5xl font-bold text-white">
                          {markupPercentage}<span className="text-[#FF6B00] text-3xl">%</span>
                        </span>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[#FF6B00] text-4xl font-bold">$</span>
                          <input
                            type="number"
                            value={markupFixed || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val >= 0 && val <= 1000) {
                                setMarkupFixed(val);
                              } else if (e.target.value === '') {
                                setMarkupFixed(0);
                              }
                            }}
                            className="w-28 bg-transparent text-5xl font-bold text-white text-center focus:outline-none border-b-2 border-white/10 focus:border-[#FF6B00]"
                            placeholder="0"
                          />
                        </div>
                      )}
                    </div>

                    {/* Slider for percentage */}
                    {markupType === 'percentage' && (
                      <div className="relative h-10 flex items-center">
                        <div className="absolute w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF9F00]"
                            style={{ width: `${((markupPercentage - 1) / 499) * 100}%` }}
                          />
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="500"
                          value={markupPercentage}
                          onChange={(e) => setMarkupPercentage(Number(e.target.value))}
                          className="absolute inset-0 w-full opacity-0 cursor-pointer"
                        />
                        <div
                          className="absolute h-6 w-6 bg-white rounded-full shadow-lg pointer-events-none"
                          style={{ left: `calc(${((markupPercentage - 1) / 499) * 100}% - 12px)` }}
                        />
                      </div>
                    )}

                    {/* Quick values */}
                    <div className="grid grid-cols-4 gap-2">
                      {(markupType === 'percentage' ? percentageQuickValues : fixedQuickValues).map((val) => (
                        <button
                          key={val}
                          onClick={() => markupType === 'percentage' ? setMarkupPercentage(val) : setMarkupFixed(val)}
                          className="py-2.5 rounded-xl bg-white/5 border border-white/5 text-white font-semibold hover:bg-white/10 transition-colors text-sm"
                        >
                          {markupType === 'percentage' ? `${val}%` : `$${val}`}
                        </button>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="bg-[#141414] rounded-xl p-3 border border-white/5 flex items-center justify-between">
                      <div>
                        <div className="text-white/40 text-[10px] uppercase">{t('follows.originalPrice')}</div>
                        <div className="text-base font-semibold text-white">${examplePrice}</div>
                      </div>
                      <div className="text-white/20 text-lg">→</div>
                      <div className="text-right">
                        <div className="text-[#FF6B00] text-[10px] uppercase font-bold">{t('follows.yourPrice')}</div>
                        <div className="text-2xl font-bold text-[#FF6B00]">${calculatedPrice}</div>
                      </div>
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                      </div>
                    )}

                    {/* Create button */}
                    <motion.button
                      onClick={() => handleCreateFollow('resell')}
                      disabled={creating}
                      className="w-full py-3.5 bg-[#FF6B00] text-white font-bold rounded-xl shadow-lg shadow-[#FF6B00]/25 disabled:opacity-50"
                      whileTap={{ scale: 0.98 }}
                    >
                      {creating ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {t('common.creating')}
                        </div>
                      ) : (
                        t('follows.createFollow')
                      )}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
