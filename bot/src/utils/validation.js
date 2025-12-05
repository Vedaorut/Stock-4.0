/**
 * Validation Utilities
 *
 * Crypto address validation and other input validation
 */

import WAValidator from 'wallet-validator';
import logger from './logger.js';
import { t } from '../i18n/index.js';

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
      btc: 'bitcoin',
      eth: 'ethereum',
      usdt: 'tron', // USDT uses Tron TRC-20 (TR... addresses)
      ltc: 'litecoin',
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
      crypto,
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

  // BTC: P2PKH (1...) = 25-34 chars, P2SH (3...) = 34 chars, Bech32 (bc1...) = 42-62 chars
  // More strict: only base58 chars for legacy, only lowercase alphanumeric for bech32
  if (/^1[1-9A-HJ-NP-Za-km-z]{25,33}$/.test(trimmed)) {
    return 'BTC';
  }
  if (/^3[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    return 'BTC';
  }
  if (/^bc1[a-z0-9]{39,59}$/.test(trimmed)) {
    return 'BTC';
  }

  // ETH: starts with 0x and exactly 40 hex characters (total 42 chars)
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return 'ETH';
  }

  // USDT (Tron TRC-20): starts with T and exactly 33 base58 characters (total 34 chars)
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    return 'USDT';
  }

  // LTC: L/M legacy (34 chars) or ltc1 bech32 (43-63 chars)
  if (/^[LM][1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    return 'LTC';
  }
  if (/^ltc1[a-z0-9]{39,59}$/.test(trimmed)) {
    return 'LTC';
  }

  return null;
}

/**
 * Get user-friendly validation error message
 * @param {string} crypto - Cryptocurrency type
 * @param {string} lang - Language code
 * @returns {string} - Error message with examples
 */
export function getCryptoValidationError(crypto, lang = 'ru') {
  return t(`validation.invalidCrypto${crypto}`, {}, lang);
}
