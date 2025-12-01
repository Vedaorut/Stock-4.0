/**
 * Auth Middleware Tests
 *
 * Tests for authentication middleware
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createMockContext } from '../fixtures/contexts.js';
import authMiddleware from '../../src/middleware/auth.js';
import { api } from '../../src/utils/api.js';

describe('Auth Middleware Tests', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    mock.reset();
  });

  describe('Authentication flow', () => {
    it('should skip non-user updates (no ctx.from)', async () => {
      const ctx = {
        session: {},
        from: null,
      };
      const next = jest.fn();

      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.session.token).toBeUndefined();
    });

    it('should skip if already authenticated', async () => {
      const ctx = createMockContext({
        session: {
          token: 'existing-token',
          user: { id: 1, telegramId: '123456' },
        },
      });
      const next = jest.fn();

      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.session.token).toBe('existing-token');
    });

    it('should preserve existing session data when already authenticated', async () => {
      const ctx = createMockContext({
        session: {
          token: 'existing-token',
          user: { id: 1, telegramId: '123456' },
          shopId: 42,
          shopName: 'My Shop',
          customData: 'preserved',
        },
      });
      const next = jest.fn();

      await authMiddleware(ctx, next);

      expect(next).toHaveBeenCalled();
      expect(ctx.session.token).toBe('existing-token');
      expect(ctx.session.shopId).toBe(42);
      expect(ctx.session.shopName).toBe('My Shop');
      expect(ctx.session.customData).toBe('preserved');
    });
  });
});
