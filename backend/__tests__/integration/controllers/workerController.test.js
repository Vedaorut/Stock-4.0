import request from 'supertest';
import app from '../../../src/server.js';
import { query } from '../../../src/config/database.js';

/**
 * Integration tests for WorkerController
 * Tests PRO tier check and authorization fixes
 */
describe('WorkerController Integration Tests', () => {
  let testUser1, testUser2, testUser3;
  let proShop, freeShop;
  let authToken1, authToken2, authToken3;

  beforeAll(async () => {
    // Create test users
    const user1Res = await query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE SET username = $2
       RETURNING *`,
      [111111, 'owner_pro', 'Owner Pro']
    );
    testUser1 = user1Res.rows[0];

    const user2Res = await query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE SET username = $2
       RETURNING *`,
      [222222, 'owner_free', 'Owner Free']
    );
    testUser2 = user2Res.rows[0];

    const user3Res = await query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE SET username = $2
       RETURNING *`,
      [333333, 'worker_user', 'Worker User']
    );
    testUser3 = user3Res.rows[0];

    // Create PRO shop
    const proShopRes = await query(
      `INSERT INTO shops (owner_id, name, description, tier, subscription_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [testUser1.id, 'Pro Shop', 'Test PRO shop', 'pro', 'active']
    );
    proShop = proShopRes.rows[0];

    // Create FREE shop
    const freeShopRes = await query(
      `INSERT INTO shops (owner_id, name, description, tier, subscription_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [testUser2.id, 'Free Shop', 'Test FREE shop', 'basic', 'active']
    );
    freeShop = freeShopRes.rows[0];

    // Generate JWT tokens (simplified - в продакшене используйте реальный JWT)
    authToken1 = `Bearer test_token_user_${testUser1.id}`;
    authToken2 = `Bearer test_token_user_${testUser2.id}`;
    authToken3 = `Bearer test_token_user_${testUser3.id}`;
  });

  afterAll(async () => {
    // Cleanup
    await query('DELETE FROM shop_workers WHERE shop_id IN ($1, $2)', [proShop.id, freeShop.id]);
    await query('DELETE FROM shops WHERE id IN ($1, $2)', [proShop.id, freeShop.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2, $3)', [testUser1.id, testUser2.id, testUser3.id]);
  });

  describe('POST /api/shops/:shopId/workers', () => {
    it('should allow PRO shop owner to add worker', async () => {
      const response = await request(app)
        .post(`/api/shops/${proShop.id}/workers`)
        .set('Authorization', authToken1)
        .send({ telegram_id: testUser3.telegram_id })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.worker_user_id).toBe(testUser3.id);
    });

    it('should reject FREE shop owner from adding worker (BUG-W1 fix)', async () => {
      const response = await request(app)
        .post(`/api/shops/${freeShop.id}/workers`)
        .set('Authorization', authToken2)
        .send({ telegram_id: testUser3.telegram_id })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('PRO subscription');
    });

    it('should reject non-owner from adding worker', async () => {
      const response = await request(app)
        .post(`/api/shops/${proShop.id}/workers`)
        .set('Authorization', authToken3)
        .send({ telegram_id: testUser2.telegram_id })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Only shop owner');
    });

    it('should reject adding non-existent user', async () => {
      const response = await request(app)
        .post(`/api/shops/${proShop.id}/workers`)
        .set('Authorization', authToken1)
        .send({ telegram_id: 999999999 })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('User not found');
    });

    it('should reject adding owner as worker', async () => {
      const response = await request(app)
        .post(`/api/shops/${proShop.id}/workers`)
        .set('Authorization', authToken1)
        .send({ telegram_id: testUser1.telegram_id })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('owner cannot be added as worker');
    });
  });

  describe('GET /api/shops/:shopId/workers', () => {
    it('should return list of workers for shop owner', async () => {
      const response = await request(app)
        .get(`/api/shops/${proShop.id}/workers`)
        .set('Authorization', authToken1)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should reject non-owner from viewing workers', async () => {
      const response = await request(app)
        .get(`/api/shops/${proShop.id}/workers`)
        .set('Authorization', authToken2)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/shops/:shopId/workers/:workerId', () => {
    let workerToDelete;

    beforeEach(async () => {
      // Add worker for deletion test
      const workerRes = await query(
        `INSERT INTO shop_workers (shop_id, worker_user_id, added_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [proShop.id, testUser3.id, testUser1.id]
      );
      workerToDelete = workerRes.rows[0];
    });

    it('should allow shop owner to remove worker', async () => {
      const response = await request(app)
        .delete(`/api/shops/${proShop.id}/workers/${workerToDelete.id}`)
        .set('Authorization', authToken1)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject non-owner from removing worker', async () => {
      const response = await request(app)
        .delete(`/api/shops/${proShop.id}/workers/${workerToDelete.id}`)
        .set('Authorization', authToken2)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });
});
