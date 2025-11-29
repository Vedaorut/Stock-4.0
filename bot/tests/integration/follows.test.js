/**
 * Follow flows with auth middleware
 *
 * Verifies that:
 * - Internal auth is used and token stored in session
 * - Follow APIs receive Authorization header to avoid 401 errors
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { callbackUpdate, textUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

let internalSecret;
let botConfig;

describe('Follow flows with internal auth', () => {
  let testBot;
  let mock;

  beforeAll(async () => {
    process.env.BACKEND_URL = 'http://localhost:3000';
    process.env.INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'test-internal-secret';
    ({ default: botConfig } = await import('../../src/config/index.js'));
    internalSecret = process.env.INTERNAL_SECRET || botConfig.internalSecret || 'test-internal-secret';
  });

  beforeEach(() => {
    testBot = createTestBot({
      mockSession: {
        shopId: 14437,
        shopName: 'Seller Shop',
        role: 'seller',
      },
    });
    mock = new MockAdapter(api);

    mock.onPost('/internal/auth/bot-register').reply((config) => {
      expect(config.headers['x-internal-secret']).toBe(internalSecret);

      return [
        200,
        {
          token: 'jwt-follow-token',
          user: {
            id: 11484,
            telegram_id: 8137738270,
            username: 'saver_hub',
          },
        },
      ];
    });
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('opens follows list without 401 by sending Authorization header', async () => {
    mock.onGet('/follows/my').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer jwt-follow-token');
      return [200, { data: [] }];
    });

    await testBot.handleUpdate(callbackUpdate('seller:follows'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(testBot.getSession().token).toBe('jwt-follow-token');

    const authCalls = mock.history.post.filter((req) => req.url === '/internal/auth/bot-register');
    expect(authCalls.length).toBe(1);
    expect(authCalls[0].headers['x-internal-secret']).toBe(internalSecret);
  });

  it('creates monitor follow using auth token for every API call', async () => {
    mock.onGet('/shops/14437').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer jwt-follow-token');
      return [200, { data: { id: 14437, name: 'Seller Shop', owner_id: 11484 } }];
    });

    mock.onGet('/follows/check-limit').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer jwt-follow-token');
      return [200, { data: { reached: false, count: 0, limit: 2 } }];
    });

    mock.onGet(/\/shops\/search/).reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer jwt-follow-token');
      return [200, { data: [{ id: 200, name: 'SourceShop', sellerId: 2 }] }];
    });

    // Called twice: existence check + name fetch
    mock.onGet('/shops/200').reply(200, { data: { id: 200, name: 'SourceShop', seller_id: 2 } });

    mock.onPost('/follows/validate-circular').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer jwt-follow-token');
      return [200, { data: { valid: true } }];
    });

    let createFollowCalled = false;
    mock.onPost('/follows').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer jwt-follow-token');
      const body = JSON.parse(config.data);
      expect(body.mode).toBe('monitor');
      expect(body.followerShopId).toBe(14437);
      expect(body.sourceShopId).toBe(200);
      createFollowCalled = true;

      return [200, { data: { id: 77, mode: 'monitor' } }];
    });

    await testBot.handleUpdate(callbackUpdate('follows:create'));
    await new Promise((resolve) => setImmediate(resolve));

    await testBot.handleUpdate(textUpdate('SourceShop'));
    await new Promise((resolve) => setImmediate(resolve));

    await testBot.handleUpdate(callbackUpdate('select_shop:200'));
    await new Promise((resolve) => setImmediate(resolve));

    await testBot.handleUpdate(callbackUpdate('mode:monitor'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(createFollowCalled).toBe(true);
    expect(testBot.getSession().token).toBe('jwt-follow-token');
  });
});
