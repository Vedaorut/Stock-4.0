/**
 * Format Utils Tests
 *
 * Tests for price and number formatting utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  formatPrice,
  formatPriceFixed,
  formatNumber,
  formatOrderStatus
} from '../../src/utils/format.js';

describe('Format Utils Tests', () => {
  describe('formatPrice', () => {
    it('should format whole numbers without decimals', () => {
      expect(formatPrice(25)).toBe('$25');
      expect(formatPrice('25')).toBe('$25');
      expect(formatPrice(100)).toBe('$100');
    });

    it('should format prices with .00 as whole numbers', () => {
      expect(formatPrice(25.00)).toBe('$25');
      expect(formatPrice('25.00')).toBe('$25');
    });

    it('should format prices with decimals', () => {
      expect(formatPrice(25.50)).toBe('$25.5');
      expect(formatPrice('25.50')).toBe('$25.5');
      expect(formatPrice(99.99)).toBe('$99.99');
    });

    it('should format prices with single decimal', () => {
      expect(formatPrice(25.5)).toBe('$25.5');
      expect(formatPrice('25.5')).toBe('$25.5');
    });

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('$0');
      expect(formatPrice('0')).toBe('$0');
    });

    it('should handle negative numbers as $0', () => {
      expect(formatPrice(-10)).toBe('$0');
      expect(formatPrice('-10')).toBe('$0');
    });

    it('should handle invalid input as $0', () => {
      expect(formatPrice('invalid')).toBe('$0');
      expect(formatPrice(NaN)).toBe('$0');
      expect(formatPrice(undefined)).toBe('$0');
    });

    it('should handle very large numbers', () => {
      expect(formatPrice(999999.99)).toBe('$999999.99');
    });

    it('should handle very small decimals', () => {
      expect(formatPrice(0.01)).toBe('$0.01');
      expect(formatPrice(0.1)).toBe('$0.1');
    });
  });

  describe('formatPriceFixed', () => {
    it('should always format with 2 decimals', () => {
      expect(formatPriceFixed(25)).toBe('$25.00');
      expect(formatPriceFixed('25')).toBe('$25.00');
      expect(formatPriceFixed(100)).toBe('$100.00');
    });

    it('should keep existing 2 decimals', () => {
      expect(formatPriceFixed(25.50)).toBe('$25.50');
      expect(formatPriceFixed('25.50')).toBe('$25.50');
      expect(formatPriceFixed(99.99)).toBe('$99.99');
    });

    it('should round to 2 decimals', () => {
      // Note: JavaScript uses banker's rounding for .5 (rounds to nearest even)
      expect(formatPriceFixed(25.556)).toBe('$25.56');
      expect(formatPriceFixed(25.554)).toBe('$25.55');
    });

    it('should handle zero with 2 decimals', () => {
      expect(formatPriceFixed(0)).toBe('$0.00');
      expect(formatPriceFixed('0')).toBe('$0.00');
    });

    it('should handle negative numbers as $0.00', () => {
      expect(formatPriceFixed(-10)).toBe('$0.00');
      expect(formatPriceFixed('-10')).toBe('$0.00');
    });

    it('should handle invalid input as $0.00', () => {
      expect(formatPriceFixed('invalid')).toBe('$0.00');
      expect(formatPriceFixed(NaN)).toBe('$0.00');
      expect(formatPriceFixed(undefined)).toBe('$0.00');
    });

    it('should handle very large numbers with 2 decimals', () => {
      expect(formatPriceFixed(999999.99)).toBe('$999999.99');
    });

    it('should handle very small decimals', () => {
      expect(formatPriceFixed(0.01)).toBe('$0.01');
      expect(formatPriceFixed(0.1)).toBe('$0.10');
    });
  });

  describe('formatNumber', () => {
    it('should format whole numbers', () => {
      expect(formatNumber(25)).toBe('25');
      expect(formatNumber('25')).toBe('25');
      expect(formatNumber(100)).toBe('100');
    });

    it('should remove trailing zeros', () => {
      expect(formatNumber(25.00)).toBe('25');
      expect(formatNumber('25.00')).toBe('25');
      expect(formatNumber(25.50)).toBe('25.5');
    });

    it('should keep significant decimals', () => {
      expect(formatNumber(25.5)).toBe('25.5');
      expect(formatNumber(99.99)).toBe('99.99');
      expect(formatNumber(0.01)).toBe('0.01');
    });

    it('should respect maxDecimals parameter', () => {
      // Note: JavaScript uses banker's rounding for .5
      expect(formatNumber(25.556, 2)).toBe('25.56');
      expect(formatNumber(25.556, 1)).toBe('25.6');
      expect(formatNumber(25.556, 0)).toBe('26');
      expect(formatNumber(25.555, 3)).toBe('25.555');
    });

    it('should use default maxDecimals of 2', () => {
      // Note: JavaScript uses banker's rounding for .5
      expect(formatNumber(25.556)).toBe('25.56');
      expect(formatNumber(25.554)).toBe('25.55');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber('0')).toBe('0');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-10)).toBe('-10');
      expect(formatNumber(-10.50)).toBe('-10.5');
    });

    it('should handle invalid input as 0', () => {
      expect(formatNumber('invalid')).toBe('0');
      expect(formatNumber(NaN)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });

    it('should handle very large numbers', () => {
      expect(formatNumber(999999.99)).toBe('999999.99');
    });
  });

  describe('formatOrderStatus', () => {
    it('should return correct emoji for pending status', () => {
      expect(formatOrderStatus('pending')).toBe('⏳');
    });

    it('should return correct emoji for completed status', () => {
      expect(formatOrderStatus('completed')).toBe('✅');
    });

    it('should return correct emoji for cancelled status', () => {
      expect(formatOrderStatus('cancelled')).toBe('❌');
    });

    it('should return correct emoji for processing status', () => {
      expect(formatOrderStatus('processing')).toBe('📦');
    });

    it('should return default emoji for unknown status', () => {
      expect(formatOrderStatus('unknown')).toBe('📦');
      expect(formatOrderStatus('')).toBe('📦');
      expect(formatOrderStatus(null)).toBe('📦');
    });

    it('should handle case sensitivity (exact match required)', () => {
      expect(formatOrderStatus('PENDING')).toBe('📦'); // Not matched
      expect(formatOrderStatus('Completed')).toBe('📦'); // Not matched
    });
  });
});
