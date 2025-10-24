/**
 * Unit Tests for Rate Limit Service
 */

import { jest } from '@jest/globals';

// Mock dependencies
const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: {
    query: mockQuery
  }
}));

const { canMigrate, isProShop, validateMigration, getMigrationHistory } = await import('../rateLimit.js');

describe('Rate Limit Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canMigrate', () => {
    it('should allow migration when under limit', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }]
      });

      const result = await canMigrate(1);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
      expect(result.used).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should block migration when limit exceeded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '2' }]
      });

      const result = await canMigrate(1);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.used).toBe(2);
    });

    it('should include reset date', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }]
      });

      const result = await canMigrate(1);

      expect(result.resetDate).toBeInstanceOf(Date);
      expect(result.resetDate.getDate()).toBe(1); // 1st of next month
    });
  });

  describe('isProShop', () => {
    it('should return true for PRO shop', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ tier: 'pro' }]
      });

      const result = await isProShop(1);

      expect(result).toBe(true);
    });

    it('should return false for free shop', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ tier: 'free' }]
      });

      const result = await isProShop(1);

      expect(result).toBe(false);
    });
  });

  describe('validateMigration', () => {
    it('should pass validation for PRO shop under limit', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ tier: 'pro' }]
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }]
      });

      const result = await validateMigration(1);

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should fail validation for free shop', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ tier: 'free' }]
      });

      const result = await validateMigration(1);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('UPGRADE_REQUIRED');
    });
  });
});
