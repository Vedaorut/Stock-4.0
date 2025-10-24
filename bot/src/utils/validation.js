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
 * @param {string} crypto - Cryptocurrency type (BTC, ETH, USDT, TON)
 * @returns {boolean} - True if valid
 */
export function validateCryptoAddress(address, crypto) {
  try {
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
 * @returns {string|null} - Detected crypto type (BTC, ETH, USDT, TON) or null
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

  // TON: starts with EQ or UQ
  if (/^(EQ|UQ)[A-Za-z0-9_-]{46,48}$/.test(trimmed)) {
    return 'TON';
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
    TON: 'EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ (начинается с EQ или UQ)'
  };

  return `❌ Неверный формат ${crypto} адреса\n\nПример:\n${examples[crypto] || 'проверьте формат адреса'}`;
}
