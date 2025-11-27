/**
 * Simple crypto address validation using regex patterns
 * Lightweight alternative to full crypto library validation
 */

/**
 * Validate cryptocurrency address format
 * @param {string} address - Address to validate
 * @param {string} chain - Chain type: BTC, ETH, LTC, TRX
 * @returns {boolean} - True if address format is valid
 */
export function validateAddress(address, chain) {
  if (!address || typeof address !== 'string') {
    return false;
  }

  const trimmed = address.trim();

  switch (chain.toUpperCase()) {
    case 'BTC':
    case 'BITCOIN':
      // Bitcoin: Legacy (1...), SegWit (3...), Native SegWit (bc1...)
      return /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-z0-9]{39,59})$/i.test(trimmed);

    case 'ETH':
    case 'ETHEREUM':
      // Ethereum: 0x followed by 40 hex characters
      return /^0x[a-fA-F0-9]{40}$/.test(trimmed);

    case 'LTC':
    case 'LITECOIN':
      // Litecoin: Legacy (L...), SegWit (M...), Native SegWit (ltc1...)
      return /^([LM][1-9A-HJ-NP-Za-km-z]{26,33}|ltc1[a-z0-9]{39,59})$/i.test(trimmed);

    case 'TRX':
    case 'TRON':
      // TRON: T followed by 33 base58 characters
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);

    default:
      // Unknown chain - accept any non-empty string as fallback
      return trimmed.length > 10;
  }
}

export default { validateAddress };
