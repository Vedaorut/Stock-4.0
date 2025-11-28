import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import app from '../../src/server.js';
import { getTestPool, closeTestDb } from '../helpers/testDb.js';

/**
 * Integration tests for /api/auth/telegram-validate endpoint
 * Tests HMAC-SHA256 signature verification with real HTTP requests
 */
describe('POST /api/auth/telegram-validate - Integration', () => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-bot-token-12345';

  /**
   * Helper to create valid initData
   */
  function createValidInitData(user, authDate = Math.floor(Date.now() / 1000)) {
    const params = new URLSearchParams();
    params.set('user', JSON.stringify(user));
    params.set('auth_date', authDate.toString());
    params.set('query_id', 'AAHdF6IQAAAAAN0XohDhrOrc');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    params.set('hash', hash);

    return params.toString();
  }

  beforeAll(async () => {
    // Clean up test users before tests
    const pool = getTestPool();
    await pool.query('DELETE FROM users WHERE telegram_id IN (111111111, 222222222, 333333333)');
  });

  afterAll(async () => {
    // Clean up test users after tests
    const pool = getTestPool();
    await pool.query('DELETE FROM users WHERE telegram_id IN (111111111, 222222222, 333333333)');
    await closeTestDb();
  });

  describe('Valid requests', () => {
    it('should create new user and return JWT token (201 Created)', async () => {
      const user = {
        id: 111111111,
        username: 'newuser_test',
        first_name: 'New',
        last_name: 'User',
      };

      const initData = createValidInitData(user);

      const response = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        token: expect.any(String),
        user: {
          telegram_id: 111111111,
          username: 'newuser_test',
          first_name: 'New',
          last_name: 'User',
          selected_role: null,
        },
      });

      // Verify JWT token structure
      expect(response.body.token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should login existing user and return JWT token (200 OK)', async () => {
      const user = {
        id: 222222222,
        username: 'existinguser_test',
        first_name: 'Existing',
        last_name: 'User',
      };

      const initData = createValidInitData(user);

      // First request: create user
      const firstResponse = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData)
        .expect(201);

      expect(firstResponse.body.success).toBe(true);

      // Second request: login existing user
      const secondResponse = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData)
        .expect(200);

      expect(secondResponse.body).toMatchObject({
        success: true,
        token: expect.any(String),
        user: {
          telegram_id: 222222222,
          username: 'existinguser_test',
        },
      });

      // Tokens should be different (different issue time)
      expect(firstResponse.body.token).not.toBe(secondResponse.body.token);
    });

    it('should update user info if changed', async () => {
      const user = {
        id: 333333333,
        username: 'updatable_user',
        first_name: 'Old',
        last_name: 'Name',
      };

      const initData1 = createValidInitData(user);

      // First request: create user
      const response1 = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData1)
        .expect(201);

      expect(response1.body.user.first_name).toBe('Old');

      // Second request: updated user info
      const updatedUser = {
        id: 333333333,
        username: 'updatable_user',
        first_name: 'New',
        last_name: 'Name',
      };

      const initData2 = createValidInitData(updatedUser);

      const response2 = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData2)
        .expect(200);

      expect(response2.body.user.first_name).toBe('New');
    });
  });

  describe('Security: Invalid signatures', () => {
    it('should REJECT request with tampered hash (401 Unauthorized)', async () => {
      const user = { id: 444444444, username: 'hacker', first_name: 'Hacker' };
      const initData = createValidInitData(user);

      // Tamper with hash
      const tamperedInitData = initData.replace(/hash=([a-f0-9]+)/, 'hash=deadbeef1234567890');

      const response = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', tamperedInitData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid'),
      });
    });

    it('should REJECT request with tampered user ID (401 Unauthorized)', async () => {
      const user = { id: 555555555, username: 'victim', first_name: 'Victim' };
      const initData = createValidInitData(user);

      // Try to impersonate another user (properly parse URLSearchParams first)
      const params = new URLSearchParams(initData);
      const originalUserJson = params.get('user');
      const tamperedUserJson = originalUserJson.replace(/"id":555555555/, '"id":999999999');
      params.set('user', tamperedUserJson);
      // Keep original hash (invalid for tampered data)
      const tamperedInitData = params.toString();

      const response = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', tamperedInitData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should REJECT request without hash (401 Unauthorized)', async () => {
      const initData = `user={"id":666666666,"username":"test"}&auth_date=${Math.floor(Date.now() / 1000)}`;

      const response = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Security: Expired initData', () => {
    it('should REJECT expired initData (older than 24 hours)', async () => {
      const user = { id: 777777777, username: 'olduser', first_name: 'Old' };
      const oldAuthDate = Math.floor(Date.now() / 1000) - 25 * 60 * 60; // 25 hours ago

      const initData = createValidInitData(user, oldAuthDate);

      const response = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('expired'),
      });
    });
  });

  describe('Security: Missing headers', () => {
    it('should REJECT request without x-telegram-init-data header', async () => {
      const response = await request(app).post('/api/auth/telegram-validate').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Unauthorized'),
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle user without username (optional field)', async () => {
      const user = {
        id: 888888888,
        first_name: 'NoUsername',
      };

      const initData = createValidInitData(user);

      const response = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData)
        .expect(201);

      expect(response.body.user.username).toBeNull();
      expect(response.body.user.first_name).toBe('NoUsername');

      // Cleanup
      const pool = getTestPool();
      await pool.query('DELETE FROM users WHERE telegram_id = 888888888');
    });

    it('should handle Cyrillic names correctly', async () => {
      const pool = getTestPool();

      // Use unique telegram_id for this test to avoid conflicts
      const telegramId = 9000777777 + Date.now() % 100000;

      // Cleanup any existing user first
      await pool.query('DELETE FROM users WHERE telegram_id = $1', [telegramId]);

      const user = {
        id: telegramId,
        username: 'ivan_cyrillic',
        first_name: 'Иван',
        last_name: 'Петров',
      };

      const initData = createValidInitData(user);

      const response = await request(app)
        .post('/api/auth/telegram-validate')
        .set('x-telegram-init-data', initData)
        .expect(201);

      expect(response.body.user.first_name).toBe('Иван');
      expect(response.body.user.last_name).toBe('Петров');

      // Cleanup
      await pool.query('DELETE FROM users WHERE telegram_id = $1', [telegramId]);
    });
  });
});
