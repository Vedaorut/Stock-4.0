/**
 * Validation Utils Tests
 *
 * Tests for crypto address validation
 */

import { describe, it, expect } from '@jest/globals';
import { validateCryptoAddress, getCryptoValidationError, detectCryptoType } from '../../src/utils/validation.js';

describe('Validation Utils Tests', () => {
  describe('validateCryptoAddress', () => {
    describe('BTC addresses', () => {
      it('should accept valid BTC P2PKH address (starts with 1)', () => {
        // Genesis block address
        const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        expect(validateCryptoAddress(address, 'BTC')).toBe(true);
      });

      it('should accept valid BTC Bech32 address (starts with bc1)', () => {
        const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
        expect(validateCryptoAddress(address, 'BTC')).toBe(true);
      });

      it('should reject invalid BTC address', () => {
        const address = 'invalid-btc-address';
        expect(validateCryptoAddress(address, 'BTC')).toBe(false);
      });

      it('should reject too short BTC address', () => {
        const address = '1A1zP1';
        expect(validateCryptoAddress(address, 'BTC')).toBe(false);
      });

      it('should handle lowercase BTC parameter', () => {
        const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        expect(validateCryptoAddress(address, 'btc')).toBe(true);
      });
    });

    describe('ETH addresses', () => {
      it('should accept valid ETH address', () => {
        // Vitalik's address
        const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        expect(validateCryptoAddress(address, 'ETH')).toBe(true);
      });

      it('should accept valid ETH address (all lowercase)', () => {
        const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
        expect(validateCryptoAddress(address, 'ETH')).toBe(true);
      });

      it('should reject invalid ETH address (no 0x prefix)', () => {
        const address = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
        expect(validateCryptoAddress(address, 'ETH')).toBe(false);
      });

      it('should reject invalid ETH address (too short)', () => {
        const address = '0x742d35';
        expect(validateCryptoAddress(address, 'ETH')).toBe(false);
      });

      it('should reject invalid characters in ETH address', () => {
        const address = '0xGGGd35Cc6634C0532925a3b844Bc7e7595f42bE1';
        expect(validateCryptoAddress(address, 'ETH')).toBe(false);
      });
    });

    describe('USDT addresses (TRC-20)', () => {
      it('should accept valid USDT TRC-20 address', () => {
        // USDT now uses Tron TRC-20 (TR... addresses)
        const address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        expect(validateCryptoAddress(address, 'USDT')).toBe(true);
      });

      it('should accept another valid USDT TRC-20 address', () => {
        const address = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs';
        expect(validateCryptoAddress(address, 'USDT')).toBe(true);
      });

      it('should reject invalid USDT address', () => {
        const address = 'invalid-usdt-address';
        expect(validateCryptoAddress(address, 'USDT')).toBe(false);
      });

      it('should reject Ethereum address for USDT', () => {
        // Ethereum 0x addresses are NOT valid for USDT anymore
        const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        expect(validateCryptoAddress(address, 'USDT')).toBe(false);
      });

      it('should handle lowercase USDT parameter', () => {
        const address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        expect(validateCryptoAddress(address, 'usdt')).toBe(true);
      });
    });

    describe('TON addresses', () => {
      it('should accept valid TON address (starts with EQ)', () => {
        const address = 'EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ';
        expect(validateCryptoAddress(address, 'TON')).toBe(true);
      });

      it('should accept valid TON address (starts with UQ)', () => {
        const address = 'UQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ';
        expect(validateCryptoAddress(address, 'TON')).toBe(true);
      });

      it('should reject invalid TON address', () => {
        const address = 'invalid-ton-address';
        expect(validateCryptoAddress(address, 'TON')).toBe(false);
      });

      it('should reject TON address with wrong prefix', () => {
        const address = 'AADhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ';
        expect(validateCryptoAddress(address, 'TON')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty address', () => {
        expect(validateCryptoAddress('', 'BTC')).toBe(false);
      });

      it('should handle whitespace address', () => {
        expect(validateCryptoAddress('   ', 'ETH')).toBe(false);
      });

      it('should handle unknown crypto type gracefully', () => {
        const address = '0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1';
        // Unknown crypto should return false (crypto-address-validator throws)
        const result = validateCryptoAddress(address, 'UNKNOWN');
        expect(result).toBe(false);
      });
    });
  });

  describe('getCryptoValidationError', () => {
    it('should return BTC error message', () => {
      const error = getCryptoValidationError('BTC');
      expect(error).toContain('BTC');
      expect(error).toContain('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(error).toContain('начинается с 1, 3, или bc1');
    });

    it('should return ETH error message', () => {
      const error = getCryptoValidationError('ETH');
      expect(error).toContain('ETH');
      expect(error).toContain('0x742d35Cc6634C0532925a3b844Bc7e7595f42bE1');
      expect(error).toContain('начинается с 0x');
    });

    it('should return USDT error message', () => {
      const error = getCryptoValidationError('USDT');
      expect(error).toContain('USDT');
      expect(error).toContain('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
      expect(error).toContain('TRC-20');
    });

    it('should return TON error message', () => {
      const error = getCryptoValidationError('TON');
      expect(error).toContain('TON');
      expect(error).toContain('EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ');
      expect(error).toContain('начинается с EQ или UQ');
    });

    it('should return generic error for unknown crypto', () => {
      const error = getCryptoValidationError('UNKNOWN');
      expect(error).toContain('UNKNOWN');
      expect(error).toContain('проверьте формат адреса');
    });
  });

  describe('detectCryptoType', () => {
    describe('BTC address detection', () => {
      it('should detect BTC P2PKH address (starts with 1)', () => {
        const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        expect(detectCryptoType(address)).toBe('BTC');
      });

      it('should detect BTC P2SH address (starts with 3)', () => {
        const address = '3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy';
        expect(detectCryptoType(address)).toBe('BTC');
      });

      it('should detect BTC Bech32 address (starts with bc1)', () => {
        const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
        expect(detectCryptoType(address)).toBe('BTC');
      });
    });

    describe('ETH address detection', () => {
      it('should detect ETH address (0x format)', () => {
        const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        expect(detectCryptoType(address)).toBe('ETH');
      });

      it('should detect ETH address (lowercase)', () => {
        const address = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
        expect(detectCryptoType(address)).toBe('ETH');
      });
    });

    describe('USDT (TRC-20) address detection', () => {
      it('should detect USDT TRC-20 address (TR format)', () => {
        const address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
        expect(detectCryptoType(address)).toBe('USDT');
      });

      it('should detect another USDT TRC-20 address', () => {
        const address = 'TRXavSGKqsNtgW8Sbqf8FNP5KEJtvyv6TN';
        expect(detectCryptoType(address)).toBe('USDT');
      });
    });

    describe('TON address detection', () => {
      it('should detect TON address (starts with EQ)', () => {
        const address = 'EQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ';
        expect(detectCryptoType(address)).toBe('TON');
      });

      it('should detect TON address (starts with UQ)', () => {
        const address = 'UQDhZLC_i-VxZfpnpsDWNR2PxNm-PPIL7uYWjL-I-Nx_T5xJ';
        expect(detectCryptoType(address)).toBe('TON');
      });
    });

    describe('Invalid addresses', () => {
      it('should return null for invalid address', () => {
        const address = 'invalid-address';
        expect(detectCryptoType(address)).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(detectCryptoType('')).toBeNull();
      });

      it('should return null for whitespace', () => {
        expect(detectCryptoType('   ')).toBeNull();
      });

      it('should return null for null input', () => {
        expect(detectCryptoType(null)).toBeNull();
      });

      it('should return null for undefined input', () => {
        expect(detectCryptoType(undefined)).toBeNull();
      });

      it('should return null for non-string input', () => {
        expect(detectCryptoType(12345)).toBeNull();
      });
    });

    describe('Edge cases', () => {
      it('should handle address with leading/trailing whitespace', () => {
        const address = '  1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa  ';
        expect(detectCryptoType(address)).toBe('BTC');
      });

      it('should reject 0x address that is too short', () => {
        const address = '0x742d35';
        expect(detectCryptoType(address)).toBeNull();
      });

      it('should reject 0x address with invalid characters', () => {
        const address = '0xGGGd35Cc6634C0532925a3b844Bc7e7595f42bE1';
        expect(detectCryptoType(address)).toBeNull();
      });
    });
  });
});
