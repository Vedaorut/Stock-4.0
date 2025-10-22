/**
 * Auth Controller Tests
 * Tests for user registration, login, profile, and role switching
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './helpers/testApp.js';
import { 
  getTestPool, 
  closeTestDb, 
  cleanupTestData,
  createTestUser,
  getUserByTelegramId
} from './helpers/testDb.js';

const app = createTestApp();
let testPool;

beforeAll(() => {
  testPool = getTestPool();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('POST /api/auth/register', () => {
  it('should register a new user and return JWT token', async () => {
    const userData = {
      telegram_id: '9000123456',
      username: 'newuser',
      first_name: 'New',
      last_name: 'User',
    };

    const response = await request(app)
      .post('/api/auth/register')
      .send(userData)
      .expect(201);

    // Check response structure
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.telegram_id).toBe(userData.telegram_id);
    expect(response.body.user.username).toBe(userData.username);

    // Verify JWT token
    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(decoded).toHaveProperty('id');
    expect(decoded.telegram_id).toBe(userData.telegram_id);

    // Verify user in database
    const dbUser = await getUserByTelegramId(userData.telegram_id);
    expect(dbUser).toBeTruthy();
    expect(dbUser.username).toBe(userData.username);
  });

  it('should return existing user if already registered', async () => {
    // Create user first
    const existingUser = await createTestUser({
      telegram_id: '9000111222',
      username: 'existing',
    });

    // Try to register again
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        telegram_id: '9000111222',
        username: 'different_username', // Different username
        first_name: 'Test',
      })
      .expect(200); // 200, not 201 for existing user

    // Should return existing user (not create new one)
    expect(response.body.user.id).toBe(existingUser.id);
    expect(response.body.user.username).toBe('existing'); // Original username
  });

  it('should reject registration without telegram_id', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        first_name: 'Test',
      })
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });
});

describe('GET /api/auth/profile', () => {
  it('should return user profile with valid token', async () => {
    // Create test user
    const user = await createTestUser({
      telegram_id: 'test_profile_123',
      username: 'profileuser',
    });

    // Generate token
    const token = jwt.sign(
      { id: user.id, telegram_id: user.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.user.id).toBe(user.id);
    expect(response.body.user.telegram_id).toBe(user.telegram_id);
    expect(response.body.user.username).toBe(user.username);
  });

  it('should reject request without token', async () => {
    const response = await request(app)
      .get('/api/auth/profile')
      .expect(401);

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
      telegram_id: 'test_role_456',
      selected_role: 'buyer',
    });

    const token = jwt.sign(
      { id: user.id, telegram_id: user.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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
      telegram_id: 'test_role_789',
      selected_role: 'seller',
    });

    const token = jwt.sign(
      { id: user.id, telegram_id: user.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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

    const token = jwt.sign(
      { id: user.id, telegram_id: user.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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

    const token = jwt.sign(
      { id: user.id, telegram_id: user.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Try accessing protected route (e.g., /api/shops/my)
    const response = await request(app)
      .get('/api/shops/my')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toBeDefined();
  });

  it('should block access to protected route without token', async () => {
    const response = await request(app)
      .get('/api/shops/my')
      .expect(401);

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
