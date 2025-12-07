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
    ETH: `0x${randomSuffix()}${randomSuffix()}`.toUpperCase(),
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
    gradient: 'from-[#F7931A] to-[#FFB74D]',
    color: '#F7931A',
  },
  {
    id: 'ETH',
    name: 'Ethereum',
    network: 'Ethereum',
    icon: 'Ξ',
    gradient: 'from-[#627EEA] to-[#8FA5F0]',
    color: '#627EEA',
  },
  {
    id: 'USDT_TRC20',
    name: 'Tether',
    network: 'TRC20',
    icon: '₮',
    gradient: 'from-[#26A17B] to-[#50AF95]',
    color: '#26A17B',
  },
  {
    id: 'LTC',
    name: 'Litecoin',
    network: 'Litecoin Network',
    icon: 'Ł',
    gradient: 'from-[#345D9D] to-[#5A7FB8]',
    color: '#345D9D',
  },
];

// Helper regex for hash extraction
// Supports: 64-char hex (ETH/BTC/LTC/TRON), with optional 0x prefix
// Also matches shorter hashes (32+ chars) for edge cases
const HASH_REGEX_64 = /\b(0x)?[a-fA-F0-9]{64}\b/;
const HASH_REGEX_FLEXIBLE = /\b(0x)?[a-fA-F0-9]{32,66}\b/;

// Extract hash from any text (URL or raw hash)
export const extractHashFromInput = (input) => {
  if (!input || typeof input !== 'string') return null;

  // First try exact 64-char match
  const match64 = input.match(HASH_REGEX_64);
  if (match64) return match64[0];

  // Fallback to flexible match
  const matchFlex = input.match(HASH_REGEX_FLEXIBLE);
  return matchFlex ? matchFlex[0] : null;
};

// Validate transaction hash (or input containing one)
// More lenient: accepts any hex string 32-66 chars (covers most blockchains)
export const validateTxHash = (hash) => {
  if (!hash || typeof hash !== 'string') return false;

  const trimmed = hash.trim();

  // If very short, reject
  if (trimmed.length < 10) return false;

  // Check if it looks like a blockchain explorer URL (valid even without exact hash match)
  const explorerPatterns = [
    /blockchair\.com/i,
    /blockchain\.com/i,
    /etherscan\.io/i,
    /tronscan\.org/i,
    /blockcypher\.com/i,
    /btc\.com/i,
    /blockstream\.info/i,
    /mempool\.space/i,
  ];

  for (const pattern of explorerPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  // Check if input contains a valid hash (64 chars or 32+ chars hex)
  return HASH_REGEX_FLEXIBLE.test(trimmed);
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
    BTC: 0.000024, // ~$42,000 per BTC
    USDT: 1.0, // 1:1 with USD
    USDT_TRC20: 1.0, // 1:1 with USD
    LTC: 0.011, // ~$90 per LTC
    ETH: 0.00042, // ~$2,400 per ETH
  };

  const amount = usdAmount * (rates[crypto] || 1);

  // Format based on crypto type
  if (crypto === 'BTC') return amount.toFixed(8);
  if (crypto === 'USDT' || crypto === 'USDT_TRC20') return amount.toFixed(2);
  if (crypto === 'LTC') return amount.toFixed(5);
  if (crypto === 'ETH') return amount.toFixed(6);

  return amount.toFixed(8);
};

/**
 * Generate payment URI for QR code (includes amount)
 * BIP21 for BTC, EIP-681 for ETH, standard for others
 * @param {string} address - Wallet address
 * @param {number|string} amount - Crypto amount
 * @param {string} crypto - Cryptocurrency type
 * @returns {string} Payment URI for QR code
 */
export const generatePaymentQRValue = (address, amount, crypto) => {
  if (!address) return '';

  const numAmount = parseFloat(amount) || 0;

  switch (crypto) {
    case 'BTC':
      // BIP21 format: bitcoin:address?amount=X
      return `bitcoin:${address}?amount=${numAmount.toFixed(8)}`;
    case 'ETH':
      // EIP-681 format: ethereum:address?value=X (value in wei, but we use simple format)
      return `ethereum:${address}?value=${numAmount.toFixed(6)}`;
    case 'LTC':
      // Litecoin uses same BIP21 format
      return `litecoin:${address}?amount=${numAmount.toFixed(5)}`;
    case 'USDT_TRC20':
      // TRON USDT - just address (no standard URI scheme widely supported)
      // Users need to copy address and enter amount manually
      return address;
    default:
      return address;
  }
};

/**
 * Format crypto amount with proper decimal places
 * @param {number} amount - The crypto amount (guaranteed NUMBER from Store)
 * @param {string} crypto - The cryptocurrency type (BTC, ETH, USDT, USDT_TRC20, LTC)
 * @returns {string} Formatted amount as string
 */
export const formatCryptoAmount = (amount, crypto) => {
  // Safely parse amount to avoid crashes on undefined/NaN
  const numAmount = parseFloat(amount) || 0;

  // Format based on crypto type
  if (crypto === 'BTC') return numAmount.toFixed(8);
  if (crypto === 'USDT' || crypto === 'USDT_TRC20') return numAmount.toFixed(2);
  if (crypto === 'LTC') return numAmount.toFixed(5);
  if (crypto === 'ETH') return numAmount.toFixed(6);

  // Default fallback
  return numAmount.toFixed(8);
};
