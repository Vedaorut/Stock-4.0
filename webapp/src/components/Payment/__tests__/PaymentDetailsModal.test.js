/**
 * PaymentDetailsModal Unit Tests
 *
 * Tests for pure logic functions and utilities used by PaymentDetailsModal.
 * Focuses on:
 * - Payment amount formatting (formatCryptoAmount)
 * - CRYPTO_OPTIONS lookup and validation
 * - Copy to clipboard mock behavior
 * - Payment data validation logic
 * - QR code data generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CRYPTO_OPTIONS,
  formatCryptoAmount,
  calculateCryptoAmount,
  validateTxHash,
  extractHashFromInput,
  formatTxHash,
  generateOrderId,
  generateWalletAddress,
} from '../../../utils/paymentUtils';

// =============================================================================
// CRYPTO_OPTIONS Tests
// =============================================================================

describe('CRYPTO_OPTIONS', () => {
  it('should contain all supported cryptocurrencies', () => {
    const expectedIds = ['BTC', 'ETH', 'USDT_TRC20', 'LTC'];
    const actualIds = CRYPTO_OPTIONS.map((c) => c.id);

    expectedIds.forEach((id) => {
      expect(actualIds).toContain(id);
    });
  });

  it('should have required fields for each crypto option', () => {
    CRYPTO_OPTIONS.forEach((crypto) => {
      expect(crypto).toHaveProperty('id');
      expect(crypto).toHaveProperty('name');
      expect(crypto).toHaveProperty('network');
      expect(crypto).toHaveProperty('icon');
      expect(crypto).toHaveProperty('gradient');
      expect(crypto).toHaveProperty('color');
    });
  });

  it('should have valid hex color codes', () => {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

    CRYPTO_OPTIONS.forEach((crypto) => {
      expect(crypto.color).toMatch(hexColorRegex);
    });
  });

  it('should find BTC by id', () => {
    const btc = CRYPTO_OPTIONS.find((c) => c.id === 'BTC');

    expect(btc).toBeDefined();
    expect(btc.name).toBe('Bitcoin');
    expect(btc.network).toBe('Bitcoin Network');
  });

  it('should find ETH by id', () => {
    const eth = CRYPTO_OPTIONS.find((c) => c.id === 'ETH');

    expect(eth).toBeDefined();
    expect(eth.name).toBe('Ethereum');
    expect(eth.network).toBe('Ethereum');
  });

  it('should find USDT_TRC20 by id', () => {
    const usdt = CRYPTO_OPTIONS.find((c) => c.id === 'USDT_TRC20');

    expect(usdt).toBeDefined();
    expect(usdt.name).toBe('Tether');
    expect(usdt.network).toBe('TRC20');
  });

  it('should find LTC by id', () => {
    const ltc = CRYPTO_OPTIONS.find((c) => c.id === 'LTC');

    expect(ltc).toBeDefined();
    expect(ltc.name).toBe('Litecoin');
    expect(ltc.network).toBe('Litecoin Network');
  });

  it('should return undefined for unknown crypto', () => {
    const unknown = CRYPTO_OPTIONS.find((c) => c.id === 'DOGE');

    expect(unknown).toBeUndefined();
  });
});

// =============================================================================
// formatCryptoAmount Tests
// =============================================================================

describe('formatCryptoAmount', () => {
  describe('BTC formatting (8 decimals)', () => {
    it('should format small BTC amounts correctly', () => {
      expect(formatCryptoAmount(0.00001234, 'BTC')).toBe('0.00001234');
    });

    it('should format larger BTC amounts correctly', () => {
      expect(formatCryptoAmount(1.23456789, 'BTC')).toBe('1.23456789');
    });

    it('should pad BTC amounts to 8 decimals', () => {
      expect(formatCryptoAmount(0.5, 'BTC')).toBe('0.50000000');
    });

    it('should handle zero BTC', () => {
      expect(formatCryptoAmount(0, 'BTC')).toBe('0.00000000');
    });

    it('should truncate excess BTC decimals', () => {
      expect(formatCryptoAmount(0.123456789123, 'BTC')).toBe('0.12345679');
    });
  });

  describe('ETH formatting (6 decimals)', () => {
    it('should format ETH amounts correctly', () => {
      expect(formatCryptoAmount(0.001234, 'ETH')).toBe('0.001234');
    });

    it('should pad ETH amounts to 6 decimals', () => {
      expect(formatCryptoAmount(1.5, 'ETH')).toBe('1.500000');
    });

    it('should handle zero ETH', () => {
      expect(formatCryptoAmount(0, 'ETH')).toBe('0.000000');
    });
  });

  describe('USDT formatting (2 decimals)', () => {
    it('should format USDT amounts correctly', () => {
      expect(formatCryptoAmount(100.5, 'USDT')).toBe('100.50');
    });

    it('should format USDT_TRC20 amounts correctly', () => {
      expect(formatCryptoAmount(99.99, 'USDT_TRC20')).toBe('99.99');
    });

    it('should handle whole number USDT', () => {
      expect(formatCryptoAmount(50, 'USDT')).toBe('50.00');
    });

    it('should handle zero USDT', () => {
      expect(formatCryptoAmount(0, 'USDT')).toBe('0.00');
    });
  });

  describe('LTC formatting (5 decimals)', () => {
    it('should format LTC amounts correctly', () => {
      expect(formatCryptoAmount(0.12345, 'LTC')).toBe('0.12345');
    });

    it('should pad LTC amounts to 5 decimals', () => {
      expect(formatCryptoAmount(5, 'LTC')).toBe('5.00000');
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined amount (returns 0)', () => {
      expect(formatCryptoAmount(undefined, 'BTC')).toBe('0.00000000');
    });

    it('should handle null amount (returns 0)', () => {
      expect(formatCryptoAmount(null, 'BTC')).toBe('0.00000000');
    });

    it('should handle NaN amount (returns 0)', () => {
      expect(formatCryptoAmount(NaN, 'BTC')).toBe('0.00000000');
    });

    it('should handle string number amount', () => {
      expect(formatCryptoAmount('0.5', 'BTC')).toBe('0.50000000');
    });

    it('should handle unknown crypto (default 8 decimals)', () => {
      expect(formatCryptoAmount(1.5, 'UNKNOWN')).toBe('1.50000000');
    });

    it('should handle negative amounts', () => {
      expect(formatCryptoAmount(-0.5, 'BTC')).toBe('-0.50000000');
    });

    it('should handle very small amounts', () => {
      expect(formatCryptoAmount(0.00000001, 'BTC')).toBe('0.00000001');
    });

    it('should handle very large amounts', () => {
      expect(formatCryptoAmount(1000000.12345678, 'BTC')).toBe('1000000.12345678');
    });
  });
});

// =============================================================================
// calculateCryptoAmount Tests
// =============================================================================

describe('calculateCryptoAmount', () => {
  it('should calculate BTC amount from USD', () => {
    const result = parseFloat(calculateCryptoAmount(100, 'BTC'));
    // Rate is 0.000024, so 100 * 0.000024 = 0.0024
    expect(result).toBeCloseTo(0.0024, 6);
  });

  it('should calculate ETH amount from USD', () => {
    const result = parseFloat(calculateCryptoAmount(100, 'ETH'));
    // Rate is 0.00042, so 100 * 0.00042 = 0.042
    expect(result).toBeCloseTo(0.042, 5);
  });

  it('should return 1:1 for USDT', () => {
    const result = parseFloat(calculateCryptoAmount(50, 'USDT'));
    expect(result).toBe(50);
  });

  it('should return 1:1 for USDT_TRC20', () => {
    const result = parseFloat(calculateCryptoAmount(75.50, 'USDT_TRC20'));
    expect(result).toBeCloseTo(75.50, 2);
  });

  it('should calculate LTC amount from USD', () => {
    const result = parseFloat(calculateCryptoAmount(100, 'LTC'));
    // Rate is 0.011, so 100 * 0.011 = 1.1
    expect(result).toBeCloseTo(1.1, 4);
  });

  it('should handle zero USD amount', () => {
    const result = parseFloat(calculateCryptoAmount(0, 'BTC'));
    expect(result).toBe(0);
  });

  it('should return correct decimal format for each crypto', () => {
    // BTC: 8 decimals
    expect(calculateCryptoAmount(100, 'BTC')).toMatch(/^\d+\.\d{8}$/);

    // ETH: 6 decimals
    expect(calculateCryptoAmount(100, 'ETH')).toMatch(/^\d+\.\d{6}$/);

    // USDT: 2 decimals
    expect(calculateCryptoAmount(100, 'USDT')).toMatch(/^\d+\.\d{2}$/);

    // LTC: 5 decimals
    expect(calculateCryptoAmount(100, 'LTC')).toMatch(/^\d+\.\d{5}$/);
  });
});

// =============================================================================
// validateTxHash Tests
// =============================================================================

describe('validateTxHash', () => {
  it('should validate correct 64-char hex hash', () => {
    const validHash = 'a'.repeat(64);
    expect(validateTxHash(validHash)).toBe(true);
  });

  it('should validate hash with 0x prefix', () => {
    const validHash = '0x' + 'b'.repeat(64);
    expect(validateTxHash(validHash)).toBe(true);
  });

  it('should validate mixed case hash', () => {
    // Valid 64-char hex hash with mixed case (exactly 64 chars)
    const validHash = 'aAbBcCdDeEfF00112233445566778899aabbccddeeff00112233445566778899';
    expect(validateTxHash(validHash)).toBe(true);
  });

  it('should reject empty string', () => {
    expect(validateTxHash('')).toBe(false);
  });

  it('should reject null', () => {
    expect(validateTxHash(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(validateTxHash(undefined)).toBe(false);
  });

  it('should reject hash that is too short', () => {
    const shortHash = 'a'.repeat(63);
    expect(validateTxHash(shortHash)).toBe(false);
  });

  it('should reject hash with invalid prefix (no word boundary)', () => {
    // 'g' before hex breaks word boundary - regex won't match
    const hashWithInvalidPrefix = 'g' + 'a'.repeat(64);
    expect(validateTxHash(hashWithInvalidPrefix)).toBe(false);
  });

  it('should accept hash with valid separator prefix', () => {
    // Space before hash allows word boundary to match
    const hashWithSpace = ' ' + 'a'.repeat(64);
    expect(validateTxHash(hashWithSpace)).toBe(true);
  });

  it('should reject string with no valid 64-char hex substring', () => {
    // All invalid hex characters
    const invalidHash = 'g'.repeat(65);
    expect(validateTxHash(invalidHash)).toBe(false);
  });

  it('should reject non-hex characters only', () => {
    const invalidHash = 'g'.repeat(64);
    expect(validateTxHash(invalidHash)).toBe(false);
  });

  it('should validate hash embedded in URL', () => {
    const url = 'https://etherscan.io/tx/0x' + 'a'.repeat(64);
    expect(validateTxHash(url)).toBe(true);
  });
});

// =============================================================================
// extractHashFromInput Tests
// =============================================================================

describe('extractHashFromInput', () => {
  it('should extract raw hash', () => {
    const hash = 'a'.repeat(64);
    expect(extractHashFromInput(hash)).toBe(hash);
  });

  it('should extract hash with 0x prefix', () => {
    const hash = '0x' + 'b'.repeat(64);
    expect(extractHashFromInput(hash)).toBe(hash);
  });

  it('should extract hash from Etherscan URL', () => {
    const rawHash = 'c'.repeat(64);
    const url = `https://etherscan.io/tx/0x${rawHash}`;
    expect(extractHashFromInput(url)).toBe('0x' + rawHash);
  });

  it('should extract hash from blockchain explorer URL', () => {
    const rawHash = 'd'.repeat(64);
    const url = `https://blockchair.com/bitcoin/transaction/${rawHash}`;
    expect(extractHashFromInput(url)).toBe(rawHash);
  });

  it('should return null for invalid input', () => {
    expect(extractHashFromInput('not-a-hash')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractHashFromInput('')).toBeNull();
  });

  it('should return null for null input', () => {
    expect(extractHashFromInput(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(extractHashFromInput(undefined)).toBeNull();
  });

  it('should return null for short hash', () => {
    expect(extractHashFromInput('a'.repeat(32))).toBeNull();
  });
});

// =============================================================================
// formatTxHash Tests
// =============================================================================

describe('formatTxHash', () => {
  it('should truncate long hash with ellipsis', () => {
    const hash = 'abcdefgh12345678abcdefgh12345678abcdefgh12345678abcdefgh12345678';
    const formatted = formatTxHash(hash, 16);
    expect(formatted).toBe('abcdefgh...12345678');
  });

  it('should return short hash unchanged', () => {
    const hash = 'abc123';
    expect(formatTxHash(hash, 16)).toBe('abc123');
  });

  it('should handle exactly 16 char hash', () => {
    const hash = 'abcdefgh12345678';
    expect(formatTxHash(hash, 16)).toBe('abcdefgh12345678');
  });

  it('should use default length of 16', () => {
    const hash = 'a'.repeat(64);
    const formatted = formatTxHash(hash);
    expect(formatted).toBe('aaaaaaaa...aaaaaaaa');
  });

  it('should handle custom length', () => {
    const hash = 'a'.repeat(64);
    const formatted = formatTxHash(hash, 20);
    expect(formatted).toBe('aaaaaaaaaa...aaaaaaaaaa');
  });

  it('should return falsy value unchanged', () => {
    expect(formatTxHash(null)).toBeNull();
    expect(formatTxHash(undefined)).toBeUndefined();
    expect(formatTxHash('')).toBe('');
  });
});

// =============================================================================
// generateOrderId Tests
// =============================================================================

describe('generateOrderId', () => {
  it('should generate order ID with ORDER prefix', () => {
    const orderId = generateOrderId();
    expect(orderId).toMatch(/^ORDER-/);
  });

  it('should be uppercase', () => {
    const orderId = generateOrderId();
    expect(orderId).toBe(orderId.toUpperCase());
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateOrderId());
    }
    expect(ids.size).toBe(100);
  });

  it('should contain timestamp and random parts', () => {
    const orderId = generateOrderId();
    const parts = orderId.split('-');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('ORDER');
    expect(parts[1].length).toBeGreaterThan(0); // timestamp
    expect(parts[2].length).toBeGreaterThan(0); // random
  });
});

// =============================================================================
// generateWalletAddress Tests
// =============================================================================

describe('generateWalletAddress', () => {
  it('should generate BTC address with bc1q prefix', () => {
    const address = generateWalletAddress('BTC');
    expect(address).toMatch(/^bc1q/);
  });

  it('should generate ETH address with 0x prefix and uppercase', () => {
    const address = generateWalletAddress('ETH');
    expect(address).toMatch(/^0X[0-9A-Z]+$/);
  });

  it('should generate USDT address with 0x prefix', () => {
    const address = generateWalletAddress('USDT');
    expect(address).toMatch(/^0X[0-9A-Z]+$/);
  });

  it('should generate LTC address with ltc1q prefix', () => {
    const address = generateWalletAddress('LTC');
    expect(address).toMatch(/^ltc1q/);
  });

  it('should generate different addresses on each call', () => {
    const addresses = new Set();
    for (let i = 0; i < 10; i++) {
      addresses.add(generateWalletAddress('BTC'));
    }
    expect(addresses.size).toBe(10);
  });

  it('should default to BTC format for unknown crypto', () => {
    const address = generateWalletAddress('UNKNOWN');
    expect(address).toMatch(/^bc1q/);
  });
});

// =============================================================================
// PaymentDetailsModal Logic Tests (Pure Functions)
// =============================================================================

describe('PaymentDetailsModal Logic', () => {
  describe('Payment validation', () => {
    // Returns boolean true/false for validation
    const isValidPaymentData = (paymentWallet, cryptoAmount) => {
      return Boolean(paymentWallet && cryptoAmount && cryptoAmount > 0);
    };

    it('should validate complete payment data', () => {
      expect(isValidPaymentData('bc1qtest123', 0.001)).toBe(true);
    });

    it('should reject missing wallet', () => {
      expect(isValidPaymentData(null, 0.001)).toBe(false);
      expect(isValidPaymentData('', 0.001)).toBe(false);
      expect(isValidPaymentData(undefined, 0.001)).toBe(false);
    });

    it('should reject zero or negative amount', () => {
      expect(isValidPaymentData('bc1qtest123', 0)).toBe(false);
      expect(isValidPaymentData('bc1qtest123', -1)).toBe(false);
    });

    it('should reject missing amount', () => {
      expect(isValidPaymentData('bc1qtest123', null)).toBe(false);
      expect(isValidPaymentData('bc1qtest123', undefined)).toBe(false);
    });
  });

  describe('Crypto lookup', () => {
    const getCryptoInfo = (selectedCrypto) => {
      return CRYPTO_OPTIONS.find((c) => c.id === selectedCrypto);
    };

    it('should return crypto info for valid crypto', () => {
      const btc = getCryptoInfo('BTC');
      expect(btc).toBeDefined();
      expect(btc.name).toBe('Bitcoin');
    });

    it('should return undefined for unknown crypto', () => {
      expect(getCryptoInfo('DOGE')).toBeUndefined();
      expect(getCryptoInfo(null)).toBeUndefined();
      expect(getCryptoInfo('')).toBeUndefined();
    });
  });

  describe('Modal state logic', () => {
    const isModalOpen = (paymentStep) => paymentStep === 'details';
    const isLoading = (paymentStep, isGeneratingInvoice) =>
      paymentStep === 'details' && isGeneratingInvoice;

    it('should be open when paymentStep is details', () => {
      expect(isModalOpen('details')).toBe(true);
    });

    it('should be closed for other steps', () => {
      expect(isModalOpen('method')).toBe(false);
      expect(isModalOpen('hash')).toBe(false);
      expect(isModalOpen(null)).toBe(false);
    });

    it('should show loading when open and generating invoice', () => {
      expect(isLoading('details', true)).toBe(true);
    });

    it('should not show loading when closed', () => {
      expect(isLoading('method', true)).toBe(false);
    });

    it('should not show loading when not generating', () => {
      expect(isLoading('details', false)).toBe(false);
    });
  });

  describe('Copy text formatting', () => {
    const formatCopyText = (cryptoAmount, selectedCrypto) => {
      return `${cryptoAmount} ${selectedCrypto}`;
    };

    it('should format copy text correctly', () => {
      expect(formatCopyText(0.00123456, 'BTC')).toBe('0.00123456 BTC');
      expect(formatCopyText(100.5, 'USDT_TRC20')).toBe('100.5 USDT_TRC20');
    });
  });

  describe('Item count extraction', () => {
    const getItemCount = (currentOrder) => currentOrder?.quantity || 1;

    it('should return quantity from order', () => {
      expect(getItemCount({ quantity: 5 })).toBe(5);
    });

    it('should default to 1 when no quantity', () => {
      expect(getItemCount({})).toBe(1);
      expect(getItemCount(null)).toBe(1);
      expect(getItemCount(undefined)).toBe(1);
    });
  });

  describe('Price formatting', () => {
    const formatUsdPrice = (totalPrice) => {
      return parseFloat(totalPrice || 0).toFixed(2);
    };

    it('should format price to 2 decimals', () => {
      expect(formatUsdPrice(99.999)).toBe('100.00');
      expect(formatUsdPrice(50)).toBe('50.00');
      expect(formatUsdPrice(0.1)).toBe('0.10');
    });

    it('should handle missing price', () => {
      expect(formatUsdPrice(null)).toBe('0.00');
      expect(formatUsdPrice(undefined)).toBe('0.00');
    });

    it('should handle string price', () => {
      expect(formatUsdPrice('25.5')).toBe('25.50');
    });
  });

  describe('QR Code size calculation', () => {
    const getQrSize = (isIOS) => (isIOS ? 140 : 160);

    it('should return 140 for iOS', () => {
      expect(getQrSize(true)).toBe(140);
    });

    it('should return 160 for non-iOS', () => {
      expect(getQrSize(false)).toBe(160);
    });
  });
});

// =============================================================================
// Clipboard Mock Tests
// =============================================================================

describe('Clipboard functionality', () => {
  let originalNavigator;

  beforeEach(() => {
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    global.navigator = originalNavigator;
    vi.restoreAllMocks();
  });

  // Mock implementation matching the component's copyToClipboard
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback logic would go here in real implementation
      return false;
    }
  };

  it('should return true when clipboard.writeText succeeds', async () => {
    global.navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };

    const result = await copyToClipboard('test text');
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
  });

  it('should return false when clipboard.writeText fails', async () => {
    global.navigator = {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
      },
    };

    const result = await copyToClipboard('test text');
    expect(result).toBe(false);
  });

  it('should handle wallet address copy', async () => {
    const wallet = 'bc1qtest123456789abcdef';
    global.navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };

    const result = await copyToClipboard(wallet);
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(wallet);
  });

  it('should handle amount with crypto copy', async () => {
    const amount = '0.00123456 BTC';
    global.navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };

    const result = await copyToClipboard(amount);
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(amount);
  });
});

// =============================================================================
// Timer/Timeout Logic Tests
// =============================================================================

describe('Copy state timeout logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should reset copied state after 2000ms', () => {
    let copied = false;
    const setCopied = (value) => {
      copied = value;
    };

    // Simulate copy action
    setCopied(true);
    expect(copied).toBe(true);

    // Set timeout like component does
    setTimeout(() => setCopied(false), 2000);

    // Fast-forward 1999ms - still copied
    vi.advanceTimersByTime(1999);
    expect(copied).toBe(true);

    // Fast-forward 1ms more - reset
    vi.advanceTimersByTime(1);
    expect(copied).toBe(false);
  });

  it('should clear previous timeout before setting new one', () => {
    const timeouts = [];
    let copied = false;

    const handleCopy = () => {
      copied = true;
      // Clear previous
      if (timeouts.length > 0) {
        clearTimeout(timeouts[timeouts.length - 1]);
      }
      // Set new
      const timeout = setTimeout(() => {
        copied = false;
      }, 2000);
      timeouts.push(timeout);
    };

    // First copy
    handleCopy();
    expect(copied).toBe(true);

    // Advance 1000ms
    vi.advanceTimersByTime(1000);
    expect(copied).toBe(true);

    // Second copy (resets timer)
    handleCopy();
    expect(copied).toBe(true);

    // Advance 1500ms (total 2500ms from first, but only 1500ms from second)
    vi.advanceTimersByTime(1500);
    expect(copied).toBe(true);

    // Advance remaining 500ms
    vi.advanceTimersByTime(500);
    expect(copied).toBe(false);
  });
});
