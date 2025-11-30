import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useBackButton } from '../../hooks/useBackButton';

const ProductMarkupModal = ({
  isOpen,
  onClose,
  onConfirm,
  onReset,
  product,
  globalMarkup,
}) => {
  const [markup, setMarkup] = useState(25);
  const [markupType, setMarkupType] = useState('percentage');
  const [markupFixed, setMarkupFixed] = useState(0);
  const dragControls = useDragControls();

  // Get source price from product
  const sourcePrice = product?.source_product?.price || 0;
  const hasCustomMarkup = product?.pricing?.has_custom_markup || false;

  // Calculate preview price
  const calculatedPrice =
    markupType === 'percentage'
      ? (sourcePrice * (1 + markup / 100)).toFixed(2)
      : (sourcePrice + markupFixed).toFixed(2);

  useBackButton(isOpen ? onClose : null);

  useEffect(() => {
    if (isOpen && product) {
      // If product has custom markup, use it; otherwise use global
      if (hasCustomMarkup && product.pricing) {
        setMarkupType(product.pricing.markup_type || 'percentage');
        setMarkup(product.pricing.markup_percentage || 25);
        setMarkupFixed(product.pricing.markup_fixed || 0);
      } else if (globalMarkup) {
        setMarkupType(globalMarkup.type || 'percentage');
        setMarkup(globalMarkup.percentage || 25);
        setMarkupFixed(globalMarkup.fixed || 0);
      }
    }
  }, [isOpen, product, hasCustomMarkup, globalMarkup]);

  const handleConfirm = () => {
    onConfirm({
      markupType,
      markupPercentage: markupType === 'percentage' ? markup : 0,
      markupFixed: markupType === 'fixed' ? markupFixed : 0,
    });
    onClose();
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    }
    onClose();
  };

  const handleFixedInputChange = (e) => {
    const value = e.target.value;
    if (value === '') {
      setMarkupFixed(0);
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 10000) {
        setMarkupFixed(numValue);
      }
    }
  };

  const sheetSpring = { type: 'spring', damping: 25, stiffness: 200 };

  const percentageQuickValues = [10, 25, 50, 100];
  const fixedQuickValues = [5, 10, 25, 50];

  const productName = product?.source_product?.name || product?.synced_product?.name || 'Product';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed inset-x-0 z-[100] flex flex-col rounded-t-[28px] bg-[#1c1c1c] border-t border-white/10 shadow-2xl"
            style={{ bottom: 'var(--tabbar-total, 80px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetSpring}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(event, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center py-3 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Content */}
            <div className="px-5">
              {/* Product Name */}
              <div className="mb-3">
                <h3 className="text-white text-lg font-bold truncate">{productName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white/40 text-xs">
                    ${sourcePrice}
                  </span>
                  {hasCustomMarkup && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FF6B00]/20 text-[#FF6B00]">
                      Custom
                    </span>
                  )}
                </div>
              </div>

              {/* Type Toggle */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-white/60 text-sm">Markup type</span>
                <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/5">
                  <button
                    onClick={() => setMarkupType('percentage')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                      markupType === 'percentage'
                        ? 'bg-[#FF6B00] text-white'
                        : 'text-white/40'
                    }`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setMarkupType('fixed')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                      markupType === 'fixed'
                        ? 'bg-[#FF6B00] text-white'
                        : 'text-white/40'
                    }`}
                  >
                    $
                  </button>
                </div>
              </div>

              {/* Main Display */}
              <div className="text-center mb-4 h-14 flex items-center justify-center">
                {markupType === 'percentage' ? (
                  <span className="text-4xl font-bold text-white tracking-tighter">
                    {markup}<span className="text-[#FF6B00] text-2xl">%</span>
                  </span>
                ) : (
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-[#FF6B00] text-3xl font-bold">$</span>
                    <input
                      type="number"
                      value={markupFixed || ''}
                      onChange={handleFixedInputChange}
                      className="w-24 bg-transparent text-4xl font-bold text-white text-center focus:outline-none border-b-2 border-white/10 focus:border-[#FF6B00] transition-colors"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              {/* Slider - only for percentage */}
              {markupType === 'percentage' && (
                <div className="relative h-8 mb-4 flex items-center">
                  <div className="absolute w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF9F00]"
                      style={{ width: `${((markup - 1) / 499) * 100}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="500"
                    step="1"
                    value={markup}
                    onChange={(e) => setMarkup(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <div
                    className="absolute h-5 w-5 bg-white rounded-full shadow-[0_0_0_3px_rgba(255,107,0,0.2)] pointer-events-none z-10"
                    style={{ left: `calc(${((markup - 1) / 499) * 100}% - 10px)` }}
                  />
                </div>
              )}

              {/* Quick Buttons */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {(markupType === 'percentage' ? percentageQuickValues : fixedQuickValues).map((val) => (
                  <button
                    key={val}
                    onClick={() => markupType === 'percentage' ? setMarkup(val) : setMarkupFixed(val)}
                    className="py-2 rounded-lg bg-white/5 border border-white/5 text-white font-semibold hover:bg-white/10 transition-colors text-xs"
                  >
                    {markupType === 'percentage' ? `${val}%` : `$${val}`}
                  </button>
                ))}
              </div>

              {/* Preview */}
              <div className="bg-[#141414] rounded-xl p-3 border border-white/5 flex items-center justify-between mb-4">
                <div>
                  <div className="text-white/40 text-[10px] uppercase tracking-wider">Source</div>
                  <div className="text-base font-semibold text-white">${sourcePrice}</div>
                </div>
                <div className="text-white/20 text-lg">→</div>
                <div className="text-right">
                  <div className="text-[#FF6B00] text-[10px] uppercase tracking-wider font-bold">Sale</div>
                  <div className="text-xl font-bold text-[#FF6B00]">${calculatedPrice}</div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mb-4">
                {hasCustomMarkup && (
                  <button
                    onClick={handleReset}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/70 font-bold text-sm rounded-xl border border-white/10 transition-all active:scale-[0.98]"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={handleConfirm}
                  className={`${hasCustomMarkup ? 'flex-[2]' : 'w-full'} py-3 bg-[#FF6B00] hover:bg-[#FF8F00] text-white font-bold text-sm rounded-xl shadow-lg shadow-[#FF6B00]/25 transition-all active:scale-[0.98]`}
                >
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProductMarkupModal;
