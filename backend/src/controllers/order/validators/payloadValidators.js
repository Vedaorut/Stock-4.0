import { ValidationError } from '../../../utils/errors.js';
import { VALID_PAYMENT_CURRENCIES } from '../constants.js';

export function validateCurrencyParam(currency) {
  if (!currency) {
    throw new ValidationError(
      `Invalid currency. Valid options: ${VALID_PAYMENT_CURRENCIES.join(', ')}`
    );
  }

  const rawCurrency = currency.toUpperCase();
  const normalized = rawCurrency === 'USDT' ? 'USDT_TRC20' : rawCurrency;

  if (!VALID_PAYMENT_CURRENCIES.includes(normalized)) {
    throw new ValidationError(
      `Invalid currency. Valid options: ${VALID_PAYMENT_CURRENCIES.join(', ')}`
    );
  }

  return normalized;
}

/**
 * Extract transaction hash from URL or return as-is if already a hash
 * Supports: Etherscan, Blockchair, TronScan, Blockchain.com, Blockstream, BscScan, etc.
 */
export function extractTxHashFromUrl(input) {
  if (!input || typeof input !== 'string') {
    return input;
  }

  const trimmed = input.trim();

  // If it doesn't look like a URL, return as-is
  if (!trimmed.includes('://') && !trimmed.includes('.')) {
    return trimmed;
  }

  // Common explorer URL patterns
  const patterns = [
    // Etherscan (ETH, tokens) - etherscan.io/tx/0x...
    /etherscan\.io\/tx\/([a-fA-F0-9x]+)/i,
    // BscScan (BSC) - bscscan.com/tx/0x...
    /bscscan\.com\/tx\/([a-fA-F0-9x]+)/i,
    // Polygonscan - polygonscan.com/tx/0x...
    /polygonscan\.com\/tx\/([a-fA-F0-9x]+)/i,
    // BUG-PAY-002 FIX: TronScan (USDT TRC20) - all TronScan domains (.org, .io, .com, etc.)
    /tronscan\.(?:org|io|com)\/#\/transaction\/([a-fA-F0-9]+)/i,
    // TronScan without hash prefix - tronscan.*/transaction/...
    /tronscan\.(?:org|io|com)\/(?:#\/)?transaction\/([a-fA-F0-9]+)/i,
    // Blockchair (multi-chain) - blockchair.com/bitcoin/transaction/...
    /blockchair\.com\/[a-z-]+\/transaction\/([a-fA-F0-9]+)/i,
    // Blockchain.com (BTC) - blockchain.com/btc/tx/...
    /blockchain\.com\/(?:btc|btc-testnet)\/tx\/([a-fA-F0-9]+)/i,
    // Blockchain.com explorer - blockchain.com/explorer/transactions/btc/...
    /blockchain\.com\/explorer\/transactions\/[a-z]+\/([a-fA-F0-9]+)/i,
    // Blockstream (BTC) - blockstream.info/tx/...
    /blockstream\.info\/(?:testnet\/)?tx\/([a-fA-F0-9]+)/i,
    // BlockCypher (BTC, LTC, etc.) - live.blockcypher.com/btc/tx/...
    /blockcypher\.com\/[a-z]+\/tx\/([a-fA-F0-9]+)/i,
    // SoChain (LTC) - sochain.com/tx/LTC/...
    /sochain\.com\/tx\/[A-Z]+\/([a-fA-F0-9]+)/i,
    // Litecoin block explorer - litecoinblockexplorer.net/tx/...
    /litecoinblockexplorer\.net\/tx\/([a-fA-F0-9]+)/i,
    // Generic /tx/ pattern as fallback
    /\/tx\/([a-fA-F0-9x]+)/i,
    // Generic /transaction/ pattern
    /\/transaction\/([a-fA-F0-9]+)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // If no pattern matched but looks like URL, try to extract last path segment
  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    // Check if last part looks like a hash (hex, at least 32 chars)
    if (lastPart && /^[a-fA-F0-9x]{32,}$/.test(lastPart)) {
      return lastPart;
    }
    // Also check hash fragment for TronScan-style URLs
    if (url.hash) {
      const hashMatch = url.hash.match(/([a-fA-F0-9]{64})/);
      if (hashMatch) {
        return hashMatch[1];
      }
    }
  } catch {
    // Not a valid URL, return as-is
  }

  return trimmed;
}

export function validateTxHash(txHash, currency = null) {
  if (!txHash || typeof txHash !== 'string' || txHash.length < 10) {
    throw new ValidationError('Valid transaction hash required');
  }

  // Extract hash from URL if provided
  const extractedHash = extractTxHashFromUrl(txHash);

  if (!extractedHash || extractedHash.length < 10) {
    throw new ValidationError('Could not extract valid transaction hash from provided input');
  }

  // BUG-PAY-001 FIX: Validate hexadecimal format to prevent non-hex characters
  // This prevents accepting arbitrary strings like "test_hash_123"
  const trimmedHash = extractedHash.trim();

  // Basic hex validation - all chains use hex format (with optional 0x prefix for ETH)
  const isHexHash = /^(0x)?[a-fA-F0-9]+$/.test(trimmedHash);
  if (!isHexHash) {
    throw new ValidationError('Transaction hash must contain only hexadecimal characters (0-9, a-f)');
  }

  // Chain-specific format validation (if currency provided)
  if (currency) {
    // Normalize USDT_TRC20 to USDT for consistent validation
    const rawCurrency = currency.toUpperCase();
    const currencyUpper = rawCurrency === 'USDT_TRC20' ? 'USDT' : rawCurrency;

    // ETH requires 0x prefix
    if (currencyUpper === 'ETH') {
      if (!trimmedHash.startsWith('0x')) {
        throw new ValidationError(
          'ETH transaction hash must start with 0x prefix'
        );
      }
      if (trimmedHash.length !== 66) {
        throw new ValidationError(
          `Invalid ETH transaction hash length (expected 66 characters with 0x prefix, got ${trimmedHash.length})`
        );
      }
    }

    // BTC/LTC must NOT have 0x prefix and must be exactly 64 hex chars
    if (currencyUpper === 'BTC' || currencyUpper === 'LTC') {
      if (trimmedHash.startsWith('0x')) {
        throw new ValidationError(
          `${currencyUpper} transaction hash must not start with 0x prefix (that's for Ethereum)`
        );
      }
      if (trimmedHash.length !== 64) {
        throw new ValidationError(
          `Invalid ${currencyUpper} transaction hash length (expected 64 characters, got ${trimmedHash.length})`
        );
      }
    }

    // USDT TRC20 (TRON) - 64 hex chars, no 0x prefix
    if (currencyUpper === 'USDT') {
      if (trimmedHash.startsWith('0x')) {
        throw new ValidationError(
          'USDT TRC20 transaction hash must not start with 0x prefix (that\'s for Ethereum)'
        );
      }
      if (trimmedHash.length !== 64) {
        throw new ValidationError(
          `Invalid USDT TRC20 transaction hash length (expected 64 characters, got ${trimmedHash.length})`
        );
      }
    }
  }

  return extractedHash;
}

export function validateDateRange(from, to) {
  if (!from || !to) {
    throw new ValidationError('Missing required parameters: from and to dates (YYYY-MM-DD format)');
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    throw new ValidationError('Invalid date format. Use YYYY-MM-DD (e.g., 2025-01-01)');
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new ValidationError('Invalid date values');
  }

  if (fromDate > toDate) {
    throw new ValidationError('from date must be before or equal to to date');
  }

  const now = new Date();
  if (fromDate > now) {
    throw new ValidationError('from date cannot be in the future');
  }

  return { fromDate, toDate };
}
