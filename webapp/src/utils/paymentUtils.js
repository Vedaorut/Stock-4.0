/**
 * Payment utilities for crypto transactions
 */

// Generate mock crypto wallet addresses
export const generateWalletAddress = (crypto) => {
  const randomSuffix = () => Math.random().toString(36).substring(2, 15);

  const addresses = {
    BTC: `bc1q${randomSuffix()}${randomSuffix()}`,
    USDT: `0x${randomSuffix()}${randomSuffix()}`.toUpperCase(),
    LTC: `ltc1q${randomSuffix()}${randomSuffix()}`,
    ETH: `0x${randomSuffix()}${randomSuffix()}`.toUpperCase()
  };

  return addresses[crypto] || addresses.BTC;
};

// Crypto metadata with icons and network info
export const CRYPTO_OPTIONS = [
  {
    id: 'BTC',
    name: 'Bitcoin',
    network: 'Bitcoin Network',
    icon: '₿',
    gradient: 'from-[#F7931A] to-[#FFA500]',
    color: '#F7931A'
  },
  {
    id: 'USDT',
    name: 'Tether',
    network: 'TRC20',
    icon: '₮',
    gradient: 'from-[#26A17B] to-[#3DD598]',
    color: '#26A17B'
  },
  {
    id: 'LTC',
    name: 'Litecoin',
    network: 'Litecoin Network',
    icon: 'Ł',
    gradient: 'from-[#345D9D] to-[#5B8FD8]',
    color: '#345D9D'
  },
  {
    id: 'ETH',
    name: 'Ethereum',
    network: 'ERC20',
    icon: 'Ξ',
    gradient: 'from-[#627EEA] to-[#8FA5F0]',
    color: '#627EEA'
  }
];

// Validate transaction hash
export const validateTxHash = (hash) => {
  if (!hash || typeof hash !== 'string') return false;

  // Remove whitespace
  const cleanHash = hash.trim();

  // Basic validation: at least 40 characters
  return cleanHash.length >= 40;
};

// Format transaction hash for display
export const formatTxHash = (hash, length = 16) => {
  if (!hash || hash.length <= length) return hash;

  const start = hash.slice(0, length / 2);
  const end = hash.slice(-length / 2);

  return `${start}...${end}`;
};

// Generate unique order ID
export const generateOrderId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);

  return `ORDER-${timestamp}-${random}`.toUpperCase();
};

// Calculate crypto amount (mock conversion)
export const calculateCryptoAmount = (usdAmount, crypto) => {
  // Mock conversion rates (for demo only)
  const rates = {
    BTC: 0.000024,  // ~$42,000 per BTC
    USDT: 1.0,      // 1:1 with USD
    LTC: 0.011,     // ~$90 per LTC
    ETH: 0.00042    // ~$2,400 per ETH
  };

  const amount = usdAmount * (rates[crypto] || 1);

  // Format based on crypto type
  if (crypto === 'BTC') return amount.toFixed(8);
  if (crypto === 'USDT') return amount.toFixed(2);
  if (crypto === 'LTC') return amount.toFixed(5);
  if (crypto === 'ETH') return amount.toFixed(6);

  return amount.toFixed(8);
};
