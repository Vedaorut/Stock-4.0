import React from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useBackButton } from '../../hooks/useBackButton';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  danger = false,
}) => {
  const { t } = useTranslation();
  const controlSpring = { type: 'spring', stiffness: 350, damping: 30 };
  
  useBackButton(isOpen ? onClose : null);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
        className="fixed inset-0 bg-[#000]/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative bg-[#1c1c1c] rounded-[28px] p-6 w-full max-w-[340px] border border-white/10 shadow-2xl"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={controlSpring}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <motion.div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                danger ? 'bg-red-500/10 text-red-500' : 'bg-[#FF6B00]/10 text-[#FF6B00]'
              }`}
              initial={{ rotate: -45, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring' }}
            >
              {danger ? (
                <ExclamationTriangleIcon className="w-8 h-8" />
              ) : (
                <InformationCircleIcon className="w-8 h-8" />
              )}
            </motion.div>
          </div>

          {/* Text */}
          <div className="text-center mb-8">
            <motion.h3
              className="text-white text-xl font-bold mb-2"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {title}
            </motion.h3>
            <motion.p
              className="text-white/50 text-[15px] leading-relaxed"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {message}
            </motion.p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <motion.button
              onClick={onClose}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-3.5 rounded-xl transition-colors border border-white/5"
              whileTap={{ scale: 0.96 }}
            >
              {cancelText || t('common.cancel')}
            </motion.button>

            <motion.button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 text-white font-semibold py-3.5 rounded-xl shadow-lg ${
                  danger
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                  : 'bg-[#FF6B00] hover:bg-[#FF8F00] shadow-[#FF6B00]/20'
              }`}
              whileTap={{ scale: 0.96 }}
            >
              {confirmText || t('common.confirm')}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;