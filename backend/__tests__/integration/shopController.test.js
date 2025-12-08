/**
 * Integration tests for shopController
 * Tests shop name validation and uniqueness
 *
 * FIXED: Each test creates a NEW user because backend allows only 1 shop per user (P0 constraint)
 */

import request from 'supertest';
import app from '../../src/server.js';
import { query } from '../../src/config/database.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Helper: Generate test JWT token
function generateToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

// Helper: Create test user
async function createTestUser(telegramId = Math.floor(Math.random() * 1000000)) {
  const result = await query(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES ($1, $2, $3)
     RETURNING id, telegram_id, username, first_name`,
    [telegramId, `testuser_${telegramId}`, 'Test User']
  );
  return result.rows[0];
}

// Helper: Clean up test data
async function cleanupTestData() {
  await query('DELETE FROM shops WHERE name LIKE $1', ['test_shop_%']);
  await query('DELETE FROM users WHERE username LIKE $1', ['testuser_%']);
}

describe('POST /api/shops - Shop Name Validation', () => {
  beforeAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Alphanumeric Validation', () => {
    test('should accept valid shop name (letters, numbers, underscore)', async () => {
      const testUser = await createTestUser();
      const authToken = generateToken(testUser.id);

      const response = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test_shop_123',
          description: 'Test shop',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('test_shop_123');
    });

    test('should accept shop name with spaces', async () => {
      const testUser = await createTestUser();
      const authToken = generateToken(testUser.id);

      const response = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test shop valid',
          description: 'Test shop',
        });

      // Spaces are now allowed in shop names
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('test shop valid');
    });

    test('should reject shop name with special characters', async () => {
      const testUser = await createTestUser();
      const authToken = generateToken(testUser.id);

      const response = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test-shop@#$',
          description: 'Test shop',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            message: 'Shop name must contain only Latin letters, numbers, spaces, underscore and dash',
          }),
        ])
      );
    });

    test('should reject shop name shorter than 3 characters', async () => {
      const testUser = await createTestUser();
      const authToken = generateToken(testUser.id);

      const response = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'ab',
          description: 'Test shop',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            message: 'Shop name must be 3-100 characters',
          }),
        ])
      );
    });

    test('should reject shop name longer than 100 characters', async () => {
      const testUser = await createTestUser();
      const authToken = generateToken(testUser.id);

      // Create a name that's 101+ characters
      const longName = 'test_shop_' + 'a'.repeat(95);

      const response = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: longName,
          description: 'Test shop',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            message: 'Shop name must be 3-100 characters',
          }),
        ])
      );
    });
  });

  describe('Uniqueness Validation', () => {
    test('should reject duplicate shop name (exact match)', async () => {
      const shopName = 'test_shop_unique_1';

      // User 1 creates first shop
      const testUser1 = await createTestUser();
      const authToken1 = generateToken(testUser1.id);

      const response1 = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          name: shopName,
          description: 'First shop',
        });

      expect(response1.status).toBe(201);

      // User 2 tries to create shop with same name
      const testUser2 = await createTestUser();
      const authToken2 = generateToken(testUser2.id);

      const response2 = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          name: shopName,
          description: 'Duplicate shop',
        });

      expect(response2.status).toBe(409);
      expect(response2.body.success).toBe(false);
      expect(response2.body.error).toBe('Shop name already taken. Try another one');
    });

    test('should reject duplicate shop name (case-insensitive)', async () => {
      const shopName = 'test_shop_unique_2';

      // User 1 creates shop with lowercase name
      const testUser1 = await createTestUser();
      const authToken1 = generateToken(testUser1.id);

      const response1 = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          name: shopName.toLowerCase(),
          description: 'First shop',
        });

      expect(response1.status).toBe(201);

      // User 2 tries to create with uppercase
      const testUser2 = await createTestUser();
      const authToken2 = generateToken(testUser2.id);

      const response2 = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          name: shopName.toUpperCase(),
          description: 'Duplicate shop',
        });

      expect(response2.status).toBe(409);
      expect(response2.body.success).toBe(false);
      expect(response2.body.error).toBe('Shop name already taken. Try another one');
    });

    test('should reject duplicate shop name (mixed case)', async () => {
      const shopName = 'test_shop_unique_3';

      // User 1 creates shop
      const testUser1 = await createTestUser();
      const authToken1 = generateToken(testUser1.id);

      const response1 = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          name: shopName,
          description: 'First shop',
        });

      expect(response1.status).toBe(201);

      // User 2 tries to create with different case: Test_Shop_Unique_3
      const testUser2 = await createTestUser();
      const authToken2 = generateToken(testUser2.id);

      const response2 = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          name: 'Test_Shop_Unique_3',
          description: 'Duplicate shop',
        });

      expect(response2.status).toBe(409);
      expect(response2.body.success).toBe(false);
      expect(response2.body.error).toBe('Shop name already taken. Try another one');
    });
  });
});

describe('PUT /api/shops/:id - Update Shop Name Validation', () => {
  let testUser;
  let authToken;
  let testShop;

  beforeAll(async () => {
    await cleanupTestData();
    testUser = await createTestUser();
    authToken = generateToken(testUser.id);

    // Create test shop
    const response = await request(app)
      .post('/api/shops')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'test_shop_update',
        description: 'Test shop for updates',
      });

    testShop = response.body.data;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  test('should allow updating shop name to a unique name', async () => {
    const response = await request(app)
      .put(`/api/shops/${testShop.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'test_shop_updated_name',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('test_shop_updated_name');
  });

  test('should reject updating shop name to an existing name', async () => {
    // Create another user and shop with different name
    const testUser2 = await createTestUser();
    const authToken2 = generateToken(testUser2.id);

    await request(app).post('/api/shops').set('Authorization', `Bearer ${authToken2}`).send({
      name: 'test_shop_existing',
      description: 'Existing shop',
    });

    // Try to update original testShop to existing name
    const response = await request(app)
      .put(`/api/shops/${testShop.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'test_shop_existing',
      });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Shop name already taken. Try another one');
  });

  test('should allow updating shop name to same name (no change)', async () => {
    // Update testShop.name first to ensure we have current name
    const currentShop = await request(app)
      .get(`/api/shops/${testShop.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    const response = await request(app)
      .put(`/api/shops/${testShop.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: currentShop.body.data.name, // Same name
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should reject invalid shop name format on update', async () => {
    const response = await request(app)
      .put(`/api/shops/${testShop.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'invalid name@#$!', // Contains special characters (spaces are allowed now)
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'name',
          message: 'Shop name must contain only Latin letters, numbers, spaces, underscore and dash',
        }),
      ])
    );
  });
});
