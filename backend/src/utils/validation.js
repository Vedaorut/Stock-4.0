/**
 * Utility validation functions for crypto addresses and other data
 */

import WAValidator from 'wallet-validator';

/**
 * Validate crypto wallet address format
 * @param {string} address - Wallet address
 * @param {string} crypto - Cryptocurrency type (BTC, ETH, USDT, TON)
 * @returns {boolean} - True if valid format
 */
export const validateCryptoAddress = (address, crypto) => {
  try {
    if (!address || typeof address !== 'string') return false;

    const currency = crypto.toLowerCase();

    // TON is not supported by wallet-validator, use regex
    if (currency === 'ton') {
      // TON: starts with EQ or UQ, followed by 46-48 base64url characters
      return /^(EQ|UQ)[A-Za-z0-9_-]{46,48}$/.test(address);
    }

    // Map crypto names to wallet-validator currency names
    const currencyMap = {
      'btc': 'bitcoin',
      'eth': 'ethereum',
      'usdt': 'tron'      // USDT uses Tron TRC-20 (TR... addresses)
    };

    const validatorCurrency = currencyMap[currency];

    if (!validatorCurrency) {
      console.warn('Unknown cryptocurrency type:', crypto);
      return false;
    }

    return WAValidator.validate(address, validatorCurrency);
  } catch (error) {
    console.error('Error validating crypto address:', {
      error: error.message,
      address: address.substring(0, 10) + '...',
      crypto
    });
    return false;
  }
};

/**
 * Detect cryptocurrency type from address format
 * @param {string} address - Wallet address
 * @returns {string|null} - Detected crypto type (BTC, ETH, USDT, TON) or null
 */
export const detectCryptoType = (address) => {
  if (!address || typeof address !== 'string') {
    return null;
  }

  const trimmed = address.trim();

  // BTC: starts with 1, 3, or bc1
  if (/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(trimmed)) {
    return 'BTC';
  }

  // ETH: starts with 0x and 40 hex characters
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return 'ETH';
  }

  // USDT (Tron TRC-20): starts with TR and 32 base58 characters
  if (/^TR[1-9A-HJ-NP-Za-km-z]{32}$/.test(trimmed)) {
    return 'USDT';
  }

  // TON: starts with EQ or UQ
  if (/^(EQ|UQ)[A-Za-z0-9_-]{46,48}$/.test(trimmed)) {
    return 'TON';
  }

  return null;
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
    USDT: 'Invalid USDT address format. Must be TRC-20 Tron address (TRxxx...)',
    TON: 'Invalid TON address format. Must start with EQ or UQ followed by 46 characters'
  };
  return errors[crypto.toUpperCase()] || 'Invalid crypto address format';
};

export default {
  validateCryptoAddress,
  getCryptoValidationError,
  detectCryptoType
};
