/**
 * Backend Infrastructure Smoke Tests
 *
 * Fast critical tests to verify backend services are operational:
 * 1. Health endpoint responds
 * 2. Database connection is alive
 * 3. Redis connection (if configured)
 * 4. Auth middleware works
 * 5. Critical API routes respond
 *
 * Run: npm run test:smoke
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../helpers/testApp.js';
import {
  closeTestDb,
  cleanupTestData,
  createTestUser,
  getTestPool,
} from '../helpers/testDb.js';

const app = createTestApp();

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await cleanupTestData();
});

describe('Backend Infrastructure Smoke Tests', () => {
  /**
   * Test 1: Health Endpoint
   */
  describe('Health Check', () => {
    it('should return OK status from /health', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });
  });

  /**
   * Test 2: Database Connection
   */
  describe('Database Connection', () => {
    it('should connect to PostgreSQL and run basic query', async () => {
      const pool = getTestPool();

      // Simple query to verify connection
      const result = await pool.query('SELECT NOW() as time, current_database() as db');

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toHaveProperty('time');
      expect(result.rows[0]).toHaveProperty('db');
    });

    it('should have required tables', async () => {
      const pool = getTestPool();

      const tables = ['users', 'shops', 'products', 'orders', 'payments'];

      for (const table of tables) {
        const result = await pool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = $1
          ) as exists`,
          [table]
        );
        expect(result.rows[0].exists).toBe(true);
      }
    });
  });

  /**
   * Test 3: Auth Middleware
   */
  describe('Auth Middleware', () => {
    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/orders');

      expect(response.status).toBe(401);
    });

    it('should accept valid JWT token', async () => {
      const user = await createTestUser();
      const token = jwt.sign(
        { id: user.id, telegramId: user.telegram_id },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`);

      // Should not be 401 - may be 200 or other valid response
      expect(response.status).not.toBe(401);
    });
  });

  /**
   * Test 4: Critical API Routes
   */
  describe('Critical API Routes', () => {
    let authToken;
    let testUser;

    beforeEach(async () => {
      testUser = await createTestUser();
      authToken = jwt.sign(
        { id: testUser.id, telegramId: testUser.telegram_id },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );
    });

    it('GET /api/orders should respond', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204]).toContain(response.status);
    });

    it('GET /api/products should respond', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204]).toContain(response.status);
    });

    it('GET /api/shops should respond', async () => {
      const response = await request(app)
        .get('/api/shops')
        .set('Authorization', `Bearer ${authToken}`);

      // 200/204 = success, 404 = no shops found
      expect([200, 204, 404]).toContain(response.status);
    });
  });

  /**
   * Test 5: Error Handling
   */
  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent-route');

      expect(response.status).toBe(404);
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      // Should return error, not crash
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
