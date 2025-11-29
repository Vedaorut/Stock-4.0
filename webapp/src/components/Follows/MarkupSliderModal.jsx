import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';

const MarkupSliderModal = ({
  isOpen,
  onClose,
  onConfirm,
  currentMarkup = 25,
  currentMarkupType = 'percentage',
  currentMarkupFixed = 0,
}) => {
  const [markup, setMarkup] = useState(currentMarkup);
  const [markupType, setMarkupType] = useState(currentMarkupType);
  const [markupFixed, setMarkupFixed] = useState(currentMarkupFixed);
  const examplePrice = 100; // Example price for preview

  const calculatedPrice =
    markupType === 'percentage'
      ? (examplePrice * (1 + markup / 100)).toFixed(2)
      : (examplePrice + markupFixed).toFixed(2);

  // BackButton integration
  useBackButton(isOpen ? onClose : null);

  useEffect(() => {
    if (isOpen) {
      setMarkup(currentMarkup);
      setMarkupType(currentMarkupType || 'percentage');
      setMarkupFixed(currentMarkupFixed || 0);
    }
  }, [isOpen, currentMarkup, currentMarkupType, currentMarkupFixed]);

  const handleConfirm = () => {
    onConfirm({
      markupType,
      markupPercentage: markupType === 'percentage' ? markup : 0,
      markupFixed: markupType === 'fixed' ? markupFixed : 0,
    });
    onClose();
  };

  const handleFixedInputChange = (e) => {
    const value = e.target.value;
    // Allow empty string for typing, or valid numbers 0-1000
    if (value === '') {
      setMarkupFixed(0);
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 1000) {
        setMarkupFixed(numValue);
      }
    }
  };

  // Spring animation preset
  const sheetSpring = { type: 'spring', damping: 30, stiffness: 300 };
  const controlSpring = { type: 'spring', stiffness: 400, damping: 32 };

  // Quick select values based on type
  const percentageQuickValues = [10, 25, 50, 100];
  const fixedQuickValues = [5, 10, 25, 50];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[32px] bg-[#1a1a1a]"
            style={{
              maxHeight: 'calc(100vh - env(safe-area-inset-top) - 32px)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetSpring}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center py-3 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header (fixed) */}
            <div className="px-6 pb-4 border-b border-white/10 flex-shrink-0">
              <h3 className="text-white text-xl font-bold tracking-tight">Настройка наценки</h3>
              <p className="text-gray-400 text-sm mt-1">
                {markupType === 'percentage'
                  ? 'Установите процент наценки для перепродажи товаров'
                  : 'Установите фиксированную сумму наценки в долларах'}
              </p>
            </div>

            {/* Content (scrollable) */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-6 py-4"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}
            >
              {/* Type Toggle */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex bg-white/5 rounded-xl p-1">
                  <button
                    onClick={() => setMarkupType('percentage')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      markupType === 'percentage'
                        ? 'bg-orange-primary text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setMarkupType('fixed')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      markupType === 'fixed'
                        ? 'bg-orange-primary text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    $
                  </button>
                </div>
              </div>

              {/* Markup Value Display */}
              <div className="text-center mb-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={markupType}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {markupType === 'percentage' ? (
                      <>
                        <div className="text-6xl font-bold text-orange-primary mb-1">{markup}%</div>
                        <div className="text-gray-400 text-sm">Наценка</div>
                      </>
                    ) : (
                      <>
                        <div className="text-6xl font-bold text-orange-primary mb-1">
                          ${markupFixed}
                        </div>
                        <div className="text-gray-400 text-sm">Наценка</div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Slider or Input based on type */}
              <AnimatePresence mode="wait">
                {markupType === 'percentage' ? (
                  <motion.div
                    key="percentage-slider"
                    className="mb-6"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="relative">
                      {/* Track Background */}
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        {/* Active Track */}
                        <motion.div
                          className="h-full bg-gradient-to-r from-orange-primary to-orange-light"
                          style={{ width: `${((markup - 1) / 499) * 100}%` }}
                          initial={false}
                          animate={{ width: `${((markup - 1) / 499) * 100}%` }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                        />
                      </div>

                      {/* Range Input */}
                      <input
                        type="range"
                        min="1"
                        max="500"
                        step="1"
                        value={markup}
                        onChange={(e) => setMarkup(Number(e.target.value))}
                        className="absolute inset-0 w-full h-12 opacity-0 cursor-pointer"
                        style={{
                          WebkitAppearance: 'none',
                          appearance: 'none',
                          zIndex: 10,
                        }}
                      />

                      {/* Custom Thumb */}
                      <motion.div
                        className="absolute w-10 h-10 bg-white rounded-full shadow-lg cursor-grab active:cursor-grabbing"
                        style={{
                          left: `${((markup - 1) / 499) * 100}%`,
                          top: '50%',
                          transform: 'translateY(-50%) translateX(-50%)',
                          boxShadow:
                            '0 0 0 4px rgba(255, 107, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3)',
                        }}
                        initial={false}
                        animate={{
                          left: `${((markup - 1) / 499) * 100}%`,
                          scale: 1,
                        }}
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Min/Max Labels */}
                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                      <span>1%</span>
                      <span>500%</span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="fixed-input"
                    className="mb-6"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-orange-primary text-xl font-bold">$</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        step="0.01"
                        value={markupFixed || ''}
                        onChange={handleFixedInputChange}
                        placeholder="0"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-10 pr-4 text-white text-2xl font-semibold text-center focus:outline-none focus:border-orange-primary focus:ring-1 focus:ring-orange-primary transition-all"
                      />
                    </div>

                    {/* Min/Max Labels */}
                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                      <span>$0</span>
                      <span>$1000</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Price Preview */}
              <div className="glass-card rounded-xl p-4 mb-6 border border-white/5">
                <div className="text-gray-400 text-xs mb-2">Пример расчёта:</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-400 text-sm">Цена поставщика</div>
                    <div className="text-white text-lg font-semibold">${examplePrice}</div>
                  </div>

                  <motion.svg
                    className="w-6 h-6 text-orange-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    initial={{ x: -5, opacity: 0.5 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </motion.svg>

                  <div className="text-right">
                    <div className="text-gray-400 text-sm">Ваша цена</div>
                    <motion.div
                      className="text-orange-primary text-lg font-bold"
                      key={calculatedPrice}
                      initial={{ scale: 1.05 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      ${calculatedPrice}
                    </motion.div>
                  </div>
                </div>
              </div>

              {/* Quick Select Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {markupType === 'percentage'
                  ? percentageQuickValues.map((value) => (
                      <motion.button
                        key={value}
                        onClick={() => setMarkup(value)}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          markup === value
                            ? 'bg-orange-primary text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={controlSpring}
                      >
                        {value}%
                      </motion.button>
                    ))
                  : fixedQuickValues.map((value) => (
                      <motion.button
                        key={value}
                        onClick={() => setMarkupFixed(value)}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          markupFixed === value
                            ? 'bg-orange-primary text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={controlSpring}
                      >
                        ${value}
                      </motion.button>
                    ))}
              </div>
            </div>

            {/* Footer buttons (fixed) */}
            <div
              className="px-6 pt-4 pb-6 border-t border-white/10 flex-shrink-0 bg-[#1a1a1a]"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
            >
              <div className="flex gap-3">
                <motion.button
                  onClick={onClose}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-semibold transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={controlSpring}
                >
                  Отмена
                </motion.button>
                <motion.button
                  onClick={handleConfirm}
                  className="flex-1 bg-gradient-to-r from-orange-primary to-orange-light text-white py-3 rounded-xl font-semibold shadow-lg"
                  whileHover={{
                    scale: 1.02,
                    boxShadow: '0 8px 24px rgba(255, 107, 0, 0.3)',
                  }}
                  whileTap={{
                    scale: 0.98,
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3)',
                  }}
                  transition={controlSpring}
                >
                  Применить
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MarkupSliderModal;
