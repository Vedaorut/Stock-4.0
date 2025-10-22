/**
 * Utility validation functions for crypto addresses and other data
 */

/**
 * Validate crypto wallet address format
 * @param {string} address - Wallet address
 * @param {string} crypto - Cryptocurrency type (BTC, ETH, USDT, TON)
 * @returns {boolean} - True if valid format
 */
export const validateCryptoAddress = (address, crypto) => {
  if (!address || typeof address !== 'string') return false;

  switch (crypto.toUpperCase()) {
    case 'BTC':
      // BTC: Legacy (1xxx), P2SH (3xxx), or Bech32 (bc1xxx)
      // Length: 26-62 characters
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,61}$/.test(address) ||
             /^bc1[a-z0-9]{39,59}$/.test(address);

    case 'ETH':
    case 'USDT':
      // ETH/ERC-20: 0x followed by 40 hex characters
      // Total length: 42 characters
      return /^0x[a-fA-F0-9]{40}$/.test(address);

    case 'TON':
      // TON: Starts with EQ or UQ, followed by 46 base64url characters
      // Total length: 48 characters
      return /^[EU]Q[a-zA-Z0-9_-]{46}$/.test(address);

    default:
      return false;
  }
};

/**
 * Get validation error message for crypto type
 * @param {string} crypto - Cryptocurrency type
 * @returns {string} - Error message
 */
export const getCryptoValidationError = (crypto) => {
  const errors = {
    BTC: 'Invalid BTC address format. Must be Legacy (1xxx), P2SH (3xxx), or Bech32 (bc1xxx)',
    ETH: 'Invalid ETH address format. Must be 0x followed by 40 hex characters',
    USDT: 'Invalid USDT address format. Must be 0x followed by 40 hex characters',
    TON: 'Invalid TON address format. Must start with EQ or UQ followed by 46 characters'
  };
  return errors[crypto.toUpperCase()] || 'Invalid crypto address format';
};

export default {
  validateCryptoAddress,
  getCryptoValidationError
};
