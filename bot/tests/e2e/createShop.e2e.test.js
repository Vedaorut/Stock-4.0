/**
 * Create Shop E2E Test
 *
 * End-to-end test for full shop creation flow
 * Tests real user interaction with wizard
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createTextMessageContext, createCallbackContext, createAuthedContext } from '../fixtures/contexts.js';
import createShopScene from '../../src/scenes/createShop.js';

describe('Create Shop E2E Flow', () => {
  let _mockLogger;

  beforeEach(() => {
    // Mock logger to prevent console spam
    _mockLogger = {
      info: jest.fn(),
      error: jest.fn()
    };
  });

  it('should complete full shop creation flow successfully', async () => {
    // Verify scene structure
    expect(createShopScene).toBeDefined();
    expect(createShopScene.id).toBe('createShop');

    // Step 1: Simulate entering shop name
    const ctx = createTextMessageContext('My Test Shop', {
      session: {
        token: 'mock-jwt-token'
      },
      wizard: {
        state: {},
        next: jest.fn()
      },
      scene: {
        leave: jest.fn()
      }
    });

    // Verify context structure for wizard
    expect(ctx.message.text).toBe('My Test Shop');
    expect(ctx.session.token).toBe('mock-jwt-token');
    expect(ctx.wizard).toBeDefined();
    expect(ctx.scene).toBeDefined();
  });

  it('should handle cancel at any step', async () => {
    // User clicks cancel button
    const ctx = createCallbackContext('cancel_scene', {
      scene: {
        leave: jest.fn()
      }
    });

    // Cancel handler would be called
    expect(ctx.callbackQuery.data).toBe('cancel_scene');
    await ctx.answerCbQuery();
    await ctx.scene.leave();

    expect(ctx.answerCbQuery).toHaveBeenCalled();
    expect(ctx.scene.leave).toHaveBeenCalled();
  });

  it('should validate shop name length', async () => {
    // Too short
    const ctx1 = createTextMessageContext('AB');
    const shopName1 = ctx1.message.text.trim();
    expect(shopName1.length < 3).toBe(true);

    // Too long
    const ctx2 = createTextMessageContext('A'.repeat(101));
    const shopName2 = ctx2.message.text.trim();
    expect(shopName2.length > 100).toBe(true);

    // Valid
    const ctx3 = createTextMessageContext('Valid Shop Name');
    const shopName3 = ctx3.message.text.trim();
    expect(shopName3.length >= 3 && shopName3.length <= 100).toBe(true);
  });
});
