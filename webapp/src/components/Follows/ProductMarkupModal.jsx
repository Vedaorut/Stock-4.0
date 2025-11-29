import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useBackButton } from '../../hooks/useBackButton';

/**
 * ProductMarkupModal - Neo-Terminal Trading Style
 *
 * Design: Price configuration panel like a trading order form
 * - Monospace numbers
 * - Sharp visual feedback
 * - Terminal-style controls
 */
const ProductMarkupModal = ({
  isOpen,
  onClose,
  onConfirm,
  onReset,
  product,
  globalMarkup = { type: 'percentage', percentage: 25, fixed: 0 },
}) => {
  const [markupType, setMarkupType] = useState('percentage');
  const [markupPercentage, setMarkupPercentage] = useState(25);
  const [markupFixed, setMarkupFixed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Product data
  const sourcePrice = Number(product?.source_product?.price || product?.pricing?.source_price || 0);
  const productName = product?.source_product?.name || product?.synced_product?.name || 'Product';
  const hasCustomMarkup = product?.custom_markup?.type !== null && product?.custom_markup?.type !== undefined;

  // Calculate preview price
  const calculatedPrice =
    markupType === 'percentage'
      ? (sourcePrice * (1 + markupPercentage / 100)).toFixed(2)
      : (sourcePrice + markupFixed).toFixed(2);

  // BackButton integration
  useBackButton(isOpen ? onClose : null);

  useEffect(() => {
    if (isOpen && product) {
      if (hasCustomMarkup) {
        setMarkupType(product.custom_markup.type);
        setMarkupPercentage(product.custom_markup.percentage || 25);
        setMarkupFixed(product.custom_markup.fixed || 0);
      } else {
        setMarkupType(globalMarkup.type || 'percentage');
        setMarkupPercentage(globalMarkup.percentage || 25);
        setMarkupFixed(globalMarkup.fixed || 0);
      }
    }
  }, [isOpen, product, hasCustomMarkup, globalMarkup]);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await onConfirm({
        markupType,
        markupPercentage: markupType === 'percentage' ? markupPercentage : 0,
        markupFixed: markupType === 'fixed' ? markupFixed : 0,
      });
      onClose();
    } catch (error) {
      console.error('Error saving product markup:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await onReset();
      onClose();
    } catch (error) {
      console.error('Error resetting product markup:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFixedInputChange = (e) => {
    const value = e.target.value;
    if (value === '') {
      setMarkupFixed(0);
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 1000) {
        setMarkupFixed(numValue);
      }
    }
  };

  if (!isOpen) return null;

  const spring = { type: 'spring', stiffness: 500, damping: 30 };
  const percentageQuickValues = [10, 25, 50, 100];
  const fixedQuickValues = [5, 10, 25, 50];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative rounded-t-3xl sm:rounded-xl bg-[#0a0a0a] border border-[#1a1a1a] w-full sm:max-w-md"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={spring}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scanline overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
            }}
          />

          {/* Handle bar for mobile */}
          <div className="flex justify-center pt-3 pb-2 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-[#252525]" />
          </div>

          {/* Header */}
          <div className="relative px-5 py-4 border-b border-[#1a1a1a]">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h3
                  className="text-white text-lg font-bold mb-1"
                  style={{ fontFamily: "'Sora', sans-serif" }}
                >
                  SET MARKUP
                </h3>
                <p
                  className="text-gray-500 text-sm truncate"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                  title={productName}
                >
                  {productName}
                </p>
              </div>
              <motion.button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1a1a1a] border border-[#252525] text-gray-400 hover:text-white hover:border-gray-500 transition-all flex-shrink-0"
                whileTap={{ scale: 0.95 }}
              >
                <XMarkIcon className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Custom markup indicator */}
            {hasCustomMarkup && (
              <motion.div
                className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#9333EA]/10 border border-[#9333EA]/20"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9333EA] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9333EA]" />
                </span>
                <span
                  className="text-[11px] font-bold text-[#A855F7] tracking-wider"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  CUSTOM MARKUP ACTIVE
                </span>
              </motion.div>
            )}
          </div>

          <div className="relative p-5">
            {/* Type Toggle */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex bg-[#0d0d0d] rounded-lg p-1 border border-[#1a1a1a]">
                <button
                  onClick={() => setMarkupType('percentage')}
                  className={`px-5 py-2.5 rounded-md text-sm font-bold transition-all ${
                    markupType === 'percentage'
                      ? 'bg-[#FF6B00] text-white'
                      : 'text-gray-500 hover:text-white'
                  }`}
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  % PCT
                </button>
                <button
                  onClick={() => setMarkupType('fixed')}
                  className={`px-5 py-2.5 rounded-md text-sm font-bold transition-all ${
                    markupType === 'fixed'
                      ? 'bg-[#FF6B00] text-white'
                      : 'text-gray-500 hover:text-white'
                  }`}
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  $ FIXED
                </button>
              </div>
            </div>

            {/* Markup Value Display */}
            <div className="text-center mb-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={markupType}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="text-5xl font-bold text-[#FF6B00]"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  {markupType === 'percentage' ? `${markupPercentage}%` : `$${markupFixed}`}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Slider or Input */}
            <AnimatePresence mode="wait">
              {markupType === 'percentage' ? (
                <motion.div
                  key="percentage-slider"
                  className="mb-5"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Native range slider with CSS styling */}
                  <div className="px-2">
                    <input
                      type="range"
                      min="1"
                      max="500"
                      step="1"
                      value={markupPercentage}
                      onChange={(e) => setMarkupPercentage(Number(e.target.value))}
                      className="markup-slider w-full h-2 cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #FF6B00 0%, #FF8C42 ${((markupPercentage - 1) / 499) * 100}%, #1a1a1a ${((markupPercentage - 1) / 499) * 100}%, #1a1a1a 100%)`,
                      }}
                    />
                  </div>

                  <div
                    className="flex justify-between px-2 mt-2 text-[10px] text-gray-600"
                    style={{ fontFamily: "'Space Mono', monospace" }}
                  >
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
                      <span
                        className="text-[#FF6B00] text-xl font-bold"
                        style={{ fontFamily: "'Space Mono', monospace" }}
                      >
                        $
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={markupFixed || ''}
                      onChange={handleFixedInputChange}
                      placeholder="0"
                      className="w-full bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg py-4 pl-10 pr-4 text-white text-xl font-bold text-center focus:outline-none focus:border-[#FF6B00] transition-all appearance-none"
                      style={{ fontFamily: "'Space Mono', monospace" }}
                    />
                  </div>

                  <div
                    className="flex justify-between mt-2 text-[10px] text-gray-600"
                    style={{ fontFamily: "'Space Mono', monospace" }}
                  >
                    <span>$0</span>
                    <span>$1000</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick Select Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              {markupType === 'percentage'
                ? percentageQuickValues.map((value) => (
                    <motion.button
                      key={value}
                      onClick={() => setMarkupPercentage(value)}
                      className={`py-2.5 rounded-lg text-sm font-bold transition-all ${
                        markupPercentage === value
                          ? 'bg-[#FF6B00] text-white'
                          : 'bg-[#0d0d0d] border border-[#1a1a1a] text-gray-500 hover:border-[#FF6B00]/30 hover:text-white'
                      }`}
                      style={{ fontFamily: "'Space Mono', monospace" }}
                      whileTap={{ scale: 0.95 }}
                      transition={spring}
                    >
                      {value}%
                    </motion.button>
                  ))
                : fixedQuickValues.map((value) => (
                    <motion.button
                      key={value}
                      onClick={() => setMarkupFixed(value)}
                      className={`py-2.5 rounded-lg text-sm font-bold transition-all ${
                        markupFixed === value
                          ? 'bg-[#FF6B00] text-white'
                          : 'bg-[#0d0d0d] border border-[#1a1a1a] text-gray-500 hover:border-[#FF6B00]/30 hover:text-white'
                      }`}
                      style={{ fontFamily: "'Space Mono', monospace" }}
                      whileTap={{ scale: 0.95 }}
                      transition={spring}
                    >
                      ${value}
                    </motion.button>
                  ))}
            </div>

            {/* Price Preview - Terminal style */}
            <div className="bg-[#0d0d0d] rounded-lg border border-[#1a1a1a] p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className="text-[10px] text-gray-600 mb-1 uppercase tracking-wider"
                    style={{ fontFamily: "'Space Mono', monospace" }}
                  >
                    SOURCE
                  </div>
                  <div
                    className="text-white text-lg font-bold"
                    style={{ fontFamily: "'Space Mono', monospace" }}
                  >
                    ${sourcePrice.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-lg">→</span>
                </div>

                <div className="text-right">
                  <div
                    className="text-[10px] text-[#FF6B00] mb-1 uppercase tracking-wider"
                    style={{ fontFamily: "'Space Mono', monospace" }}
                  >
                    YOUR PRICE
                  </div>
                  <motion.div
                    className="text-[#FF6B00] text-lg font-bold"
                    style={{ fontFamily: "'Space Mono', monospace" }}
                    key={calculatedPrice}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    ${calculatedPrice}
                  </motion.div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pb-4">
              <motion.button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="w-full bg-[#FF6B00] text-white py-4 rounded-xl font-bold disabled:opacity-50 transition-all hover:bg-[#FF8C42]"
                style={{ fontFamily: "'Space Mono', monospace" }}
                whileTap={{ scale: 0.98 }}
                transition={spring}
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Сохраняю...</span>
                  </div>
                ) : (
                  'Применить'
                )}
              </motion.button>

              <motion.button
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full bg-[#1a1a1a] border border-[#252525] text-gray-300 py-3.5 rounded-xl font-medium transition-all hover:border-gray-500 hover:text-white disabled:opacity-50"
                style={{ fontFamily: "'Space Mono', monospace" }}
                whileTap={{ scale: 0.98 }}
                transition={spring}
              >
                Отмена
              </motion.button>

              {hasCustomMarkup && (
                <motion.button
                  onClick={handleReset}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 text-gray-500 py-2 text-sm transition-all hover:text-white disabled:opacity-50"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  Сбросить к глобальной
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProductMarkupModal;
