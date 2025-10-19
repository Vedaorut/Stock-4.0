import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

const cryptoOptions = [
  {
    id: 'usdt-trc20',
    name: 'USDT',
    network: 'TRC20',
    icon: '₮',
    color: '#26A17B',
  },
  {
    id: 'usdt-erc20',
    name: 'USDT',
    network: 'ERC20',
    icon: '₮',
    color: '#26A17B',
  },
  {
    id: 'btc',
    name: 'Bitcoin',
    network: 'BTC',
    icon: '₿',
    color: '#F7931A',
  },
  {
    id: 'eth',
    name: 'Ethereum',
    network: 'ETH',
    icon: 'Ξ',
    color: '#627EEA',
  },
  {
    id: 'ton',
    name: 'TON',
    network: 'TON',
    icon: '💎',
    color: '#0088CC',
  },
];

export default function CryptoSelector({ onSelect, selectedCrypto }) {
  const { triggerHaptic } = useTelegram();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (crypto) => {
    triggerHaptic('light');
    onSelect(crypto);
    setIsOpen(false);
  };

  const handleToggle = () => {
    triggerHaptic('light');
    setIsOpen(!isOpen);
  };

  const selected = cryptoOptions.find(c => c.id === selectedCrypto) || cryptoOptions[0];

  return (
    <div className="relative">
      {/* Selected Crypto Button */}
      <motion.button
        onClick={handleToggle}
        className="w-full glass-card rounded-xl p-4 flex items-center justify-between touch-target"
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-2xl"
            style={{ backgroundColor: selected.color + '20' }}
          >
            {selected.icon}
          </div>
          <div className="text-left">
            <div className="text-white font-semibold">{selected.name}</div>
            <div className="text-xs text-gray-400">{selected.network}</div>
          </div>
        </div>

        <motion.svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute top-full left-0 right-0 mt-2 glass-elevated rounded-xl overflow-hidden z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {cryptoOptions.map((crypto, index) => (
              <motion.button
                key={crypto.id}
                onClick={() => handleSelect(crypto.id)}
                className={`w-full p-4 flex items-center gap-3 touch-target transition-colors ${
                  crypto.id === selectedCrypto
                    ? 'bg-orange-primary/20'
                    : 'hover:bg-white/5'
                } ${index !== cryptoOptions.length - 1 ? 'border-b border-white/5' : ''}`}
                whileTap={{ scale: 0.98 }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ backgroundColor: crypto.color + '20' }}
                >
                  {crypto.icon}
                </div>
                <div className="text-left flex-1">
                  <div className="text-white font-semibold">{crypto.name}</div>
                  <div className="text-xs text-gray-400">{crypto.network}</div>
                </div>
                {crypto.id === selectedCrypto && (
                  <svg className="w-5 h-5 text-orange-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
