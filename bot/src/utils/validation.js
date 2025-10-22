/**
 * Validation Utilities
 *
 * Crypto address validation and other input validation
 */

import WAValidator from 'wallet-address-validator';
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

    // TON addresses: Simple regex validation (EQ or UQ prefix, base64-like chars)
    if (currency === 'ton') {
      // TON addresses start with EQ or UQ and are ~48 chars base64
      const tonRegex = /^(EQ|UQ)[A-Za-z0-9_-]{46,48}$/;
      return tonRegex.test(address);
    }

    // USDT uses Ethereum addresses (ERC-20)
    const currencyForValidation = currency === 'usdt' ? 'ethereum' : currency;

    // Map common names to validator names
    const currencyMap = {
      'btc': 'bitcoin',
      'eth': 'ethereum'
    };

    const validatorCurrency = currencyMap[currencyForValidation] || currencyForValidation;

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
 * Get user-friendly validation error message
 * @param {string} crypto - Cryptocurrency type
 * @returns {string} - Error message with examples
 */
export function getCryptoValidationError(crypto) {
  const examples = {
    BTC: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa (начинается с 1, 3, или bc1)',
    ETH: '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1 (начинается с 0x)',
    USDT: '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1 (ERC-20, начинается с 0x)',
    TON: 'EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ (начинается с EQ или UQ)'
  };

  return `❌ Неверный формат ${crypto} адреса\n\nПример:\n${examples[crypto] || 'проверьте формат адреса'}`;
}
