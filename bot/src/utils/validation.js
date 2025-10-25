/**
 * Validation Utilities
 *
 * Crypto address validation and other input validation
 */

import WAValidator from 'wallet-validator';
import logger from './logger.js';

/**
 * Validate crypto wallet address
 * @param {string} address - Wallet address to validate
 * @param {string} crypto - Cryptocurrency type (BTC, ETH, USDT, LTC)
 * @returns {boolean} - True if valid
 */
export function validateCryptoAddress(address, crypto) {
  try {
    const currency = crypto.toLowerCase();

    // Map crypto names to wallet-validator currency names
    const currencyMap = {
      'btc': 'bitcoin',
      'eth': 'ethereum',
      'usdt': 'tron',      // USDT uses Tron TRC-20 (TR... addresses)
      'ltc': 'litecoin'
    };

    const validatorCurrency = currencyMap[currency];

    if (!validatorCurrency) {
      logger.warn('Unknown cryptocurrency type:', { crypto });
      return false;
    }

    return WAValidator.validate(address, validatorCurrency);
  } catch (error) {
    logger.error('Error validating crypto address:', {
      error: error.message,
      address: address.substring(0, 10) + '...',
      crypto
    });
    return false;
  }
}

/**
 * Detect cryptocurrency type from address format
 * @param {string} address - Wallet address
 * @returns {string|null} - Detected crypto type (BTC, ETH, USDT, LTC) or null
 */
export function detectCryptoType(address) {
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

  // LTC: starts with L or M (legacy), or ltc1 (bech32)
  if (/^(L|M)[a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(trimmed) || /^ltc1[a-z0-9]{39,59}$/.test(trimmed)) {
    return 'LTC';
  }

  return null;
}

/**
 * Get user-friendly validation error message
 * @param {string} crypto - Cryptocurrency type
 * @returns {string} - Error message with examples
 */
export function getCryptoValidationError(crypto) {
  const examples = {
    BTC: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa (начинается с 1, 3, или bc1)',
    ETH: '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1 (начинается с 0x)',
    USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t (TRC-20, начинается с TR)',
    LTC: 'LTC1A2B3C4D5E6F7G8H9J0K1L2M3N4P5Q6R (начинается с L, M, или ltc1)'
  };

  return `❌ Неверный формат ${crypto} адреса\n\nПример:\n${examples[crypto] || 'проверьте формат адреса'}`;
}
