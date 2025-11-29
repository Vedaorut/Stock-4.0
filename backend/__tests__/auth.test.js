/**
 * Auth Controller Tests
 * Tests for user registration, login, profile, and role switching
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createTestApp } from './helpers/testApp.js';
import {
  closeTestDb,
  cleanupTestData,
  createTestUser,
  getUserByTelegramId,
} from './helpers/testDb.js';

/**
 * Helper to create valid Telegram initData with HMAC-SHA256 signature
 * Required for register endpoint security
 */
function createValidInitData(user, authDate = Math.floor(Date.now() / 1000)) {
  const botToken = process.env.BOT_TOKEN || 'test-bot-token-12345:ABCDEFGHIJKLMNOP';
  const params = new URLSearchParams();
  params.set('user', JSON.stringify({
    id: user.id || user.telegram_id || user.telegramId,
    username: user.username,
    first_name: user.first_name || user.firstName,
    last_name: user.last_name || user.lastName,
  }));
  params.set('auth_date', authDate.toString());
  params.set('query_id', 'AAHdF6IQAAAAAN0XohDhrOrc');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}

const app = createTestApp();

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('POST /api/auth/register', () => {
  it('should register a new user and return JWT token', async () => {
    const userData = {
      telegramId: 9000123456,
      username: 'newuser',
      firstName: 'New',
      lastName: 'User',
    };

    // Create valid initData for the user
    const initData = createValidInitData(userData);

    const response = await request(app)
      .post('/api/auth/register')
      .set('x-telegram-init-data', initData)
      .send(userData) // Body is now ignored, data comes from initData
      .expect(201);

    // Check response structure
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.telegram_id).toBe(userData.telegramId);
    expect(response.body.user.username).toBe(userData.username);

    // Verify JWT token
    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(decoded).toHaveProperty('id');
    expect(decoded.telegram_id).toBe(userData.telegramId);

    // Verify user in database
    const dbUser = await getUserByTelegramId(userData.telegramId);
    expect(dbUser).toBeTruthy();
    expect(dbUser.username).toBe(userData.username);
  });

  it('should return existing user if already registered', async () => {
    // Create user first
    const existingUser = await createTestUser({
      telegram_id: 9000111222,
      username: 'existing',
    });

    // Create initData for the same telegram_id
    const initData = createValidInitData({
      telegramId: 9000111222,
      username: 'different_username', // Different username in initData
      firstName: 'Test',
    });

    // Try to register again
    const response = await request(app)
      .post('/api/auth/register')
      .set('x-telegram-init-data', initData)
      .send({})
      .expect(200); // 200, not 201 for existing user

    // Should return existing user (not create new one)
    expect(response.body.user.id).toBe(existingUser.id);
    expect(response.body.user.username).toBe('existing'); // Original username
  });

  it('should reject registration without x-telegram-init-data header', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        telegramId: 9000123456,
        username: 'testuser',
        firstName: 'Test',
      })
      .expect(401);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Telegram authentication required');
  });

  it('should reject registration with invalid initData signature', async () => {
    const userData = {
      telegramId: 9000123456,
      username: 'testuser',
      firstName: 'Test',
    };

    // Create valid initData and tamper with the hash
    const initData = createValidInitData(userData);
    const tamperedInitData = initData.replace(/hash=([a-f0-9]+)/, 'hash=deadbeef1234567890');

    const response = await request(app)
      .post('/api/auth/register')
      .set('x-telegram-init-data', tamperedInitData)
      .send(userData)
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});

describe('GET /api/auth/profile', () => {
  it('should return user profile with valid token', async () => {
    // Create test user
    const user = await createTestUser({
      telegram_id: 9000100123,
      username: 'profileuser',
    });

    // Generate token
    const token = jwt.sign({ id: user.id, telegram_id: user.telegram_id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    const response = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.user.id).toBe(user.id);
    expect(response.body.user.telegram_id).toBe(user.telegram_id);
    expect(response.body.user.username).toBe(user.username);
  });

  it('should reject request without token', async () => {
    const response = await request(app).get('/api/auth/profile').expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject request with invalid token', async () => {
    const response = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer invalid-token-123')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});

describe('PATCH /api/auth/role', () => {
  it('should switch user role from buyer to seller', async () => {
    // Create buyer user
    const user = await createTestUser({
      telegram_id: 9000100456,
      selected_role: 'buyer',
    });

    const token = jwt.sign({ id: user.id, telegram_id: user.telegram_id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    const response = await request(app)
      .patch('/api/auth/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'seller' })
      .expect(200);

    expect(response.body.user.selected_role).toBe('seller');

    // Verify in database
    const dbUser = await getUserByTelegramId(user.telegram_id);
    expect(dbUser.selected_role).toBe('seller');
  });

  it('should switch user role from seller to buyer', async () => {
    // Create seller user
    const user = await createTestUser({
      telegram_id: 9000100789,
      selected_role: 'seller',
    });

    const token = jwt.sign({ id: user.id, telegram_id: user.telegram_id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    const response = await request(app)
      .patch('/api/auth/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'buyer' })
      .expect(200);

    expect(response.body.user.selected_role).toBe('buyer');

    // Verify in database
    const dbUser = await getUserByTelegramId(user.telegram_id);
    expect(dbUser.selected_role).toBe('buyer');
  });

  it('should reject invalid role', async () => {
    const user = await createTestUser();

    const token = jwt.sign({ id: user.id, telegram_id: user.telegram_id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    const response = await request(app)
      .patch('/api/auth/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'invalid_role' })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  it('should reject request without authentication', async () => {
    const response = await request(app)
      .patch('/api/auth/role')
      .send({ role: 'seller' })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});

describe('Auth Middleware', () => {
  it('should allow access to protected route with valid token', async () => {
    const user = await createTestUser();

    const token = jwt.sign({ id: user.id, telegram_id: user.telegram_id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    // Try accessing protected route (e.g., /api/shops/my)
    const response = await request(app)
      .get('/api/shops/my')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toBeDefined();
  });

  it('should block access to protected route without token', async () => {
    const response = await request(app).get('/api/shops/my').expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should block access with expired token', async () => {
    const user = await createTestUser();

    // Create expired token (expiresIn: -1s)
    const expiredToken = jwt.sign(
      { id: user.id, telegram_id: user.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const response = await request(app)
      .get('/api/shops/my')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});
