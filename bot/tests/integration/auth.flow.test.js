/**
 * Authentication flow integration test
 *
 * Verifies that bot auth middleware:
 * - Calls internal auth endpoint with secret header
 * - Stores token/user in session
 * - Reuses token on subsequent requests (no extra auth calls)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { commandUpdate } from '../helpers/updateFactories.js';

let createTestBot;
let api;
let botConfig;
let internalSecret;

describe('Bot auth middleware', () => {
  let testBot;
  let mock;

  beforeAll(async () => {
    process.env.BACKEND_URL = 'http://localhost:3000';
    process.env.INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'test-internal-secret';

    ({ createTestBot } = await import('../helpers/testBot.js'));
    ({ api } = await import('../../src/utils/api.js'));
    ({ default: botConfig } = await import('../../src/config/index.js'));

    internalSecret = botConfig.internalSecret || process.env.INTERNAL_SECRET;
  });

  beforeEach(() => {
    testBot = createTestBot();
    mock = new MockAdapter(api);

    mock.onPost('/internal/auth/bot-register').reply((config) => {
      expect(config.headers['x-internal-secret']).toBe(internalSecret);

      return [
        200,
        {
          token: 'jwt-test-token',
          user: {
            id: 11484,
            telegram_id: 8137738270,
            username: 'testuser',
          },
        },
      ];
    });

    mock.onGet('/shops/my').reply((config) => {
      const authHeader = config.headers?.Authorization || config.headers?.authorization;
      expect(authHeader).toBe('Bearer jwt-test-token');
      return [200, { data: [] }];
    });

    mock.onGet('/shops/workspace').reply(200, { data: [] });
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('stores token in session and reuses it without re-auth', async () => {
    await testBot.handleUpdate(commandUpdate('start'));

    const session = testBot.getSession();
    expect(session.token).toBe('jwt-test-token');
    expect(session.user?.id).toBe(11484);
    expect(Date.parse(session.tokenCreatedAt)).not.toBeNaN();

    // Second command should reuse existing token (no extra auth call)
    await testBot.handleUpdate(commandUpdate('start'));

    const authCalls = mock.history.post.filter((req) => req.url === '/internal/auth/bot-register');
    expect(authCalls.length).toBe(1);
  });

  it('backfills missing tokenCreatedAt without re-authenticating legacy sessions', async () => {
    testBot = createTestBot({
      mockSession: {
        token: 'legacy-token',
        user: { id: 11484, telegram_id: 8137738270 },
        shopId: 14437,
      },
    });
    mock = new MockAdapter(api);

    // Legacy sessions should skip auth and just set tokenCreatedAt
    mock.onPost('/internal/auth/bot-register').reply(() => {
      throw new Error('Auth should not be called for legacy session with token');
    });
    mock.onGet('/shops/my').reply(200, { data: [] });
    mock.onGet('/shops/workspace').reply(200, { data: [] });

    await testBot.handleUpdate(commandUpdate('start'));

    const session = testBot.getSession();
    expect(session.token).toBe('legacy-token');
    expect(Date.parse(session.tokenCreatedAt)).not.toBeNaN();

    const authCalls = mock.history.post.filter((req) => req.url === '/internal/auth/bot-register');
    expect(authCalls.length).toBe(0);
  });

  it('does not nullify existing token when re-auth fails', async () => {
    // Force refresh by providing stale tokenCreatedAt
    testBot = createTestBot({
      mockSession: {
        token: 'stale-token',
        tokenCreatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        user: { id: 11484, telegram_id: 8137738270 },
        shopId: 14437,
      },
    });
    mock = new MockAdapter(api);

    mock.onPost('/internal/auth/bot-register').reply(500, { error: 'fail' });

    await testBot.handleUpdate(commandUpdate('start'));

    const session = testBot.getSession();
    expect(session.token).toBe('stale-token'); // should NOT be overwritten with null
    expect(session.authError).toBeDefined();
  });
});
