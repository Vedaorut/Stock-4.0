/**
 * Integration Tests: Worker Controller
 * Tests BUG-W1 fix: MAX tier check for workspace feature
 *
 * REFACTORED: Uses full server app (like productController.test.js)
 * to ensure proper JWT authentication and middleware chain
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import { config } from '../../src/config/env.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
} from '../helpers/testDb.js';

describe('Worker Controller - Integration Tests', () => {
  let pool;
  let ownerUser;
  let workerUser;
  let freeShop;
  let maxShop;
  let ownerToken;

  beforeAll(async () => {
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create owner user
    ownerUser = await createTestUser({
      telegramId: '9000000001',
      username: 'owner',
      selectedRole: 'seller',
    });

    // Create worker user
    workerUser = await createTestUser({
      telegramId: '9000000002',
      username: 'worker',
      selectedRole: 'seller',
    });

    // Create FREE tier shop (default tier)
    freeShop = await createTestShop(ownerUser.id, {
      name: 'Free Shop',
      description: 'FREE tier shop',
    });

    // Create MAX tier shop
    maxShop = await createTestShop(ownerUser.id, {
      name: 'Max Shop',
      description: 'MAX tier shop',
    });

    // Upgrade maxShop to MAX tier
    await pool.query(`UPDATE shops SET tier = 'max' WHERE id = $1`, [maxShop.id]);

    // Generate JWT token for owner
    ownerToken = jwt.sign(
      {
        id: ownerUser.id,
        telegramId: ownerUser.telegram_id,
        username: ownerUser.username,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  describe('POST /api/workers/:shopId/workers', () => {
    describe('BUG-W1: MAX tier check', () => {
      it('should reject worker addition for FREE tier shop', async () => {
        const response = await request(app)
          .post(`/api/workers/${freeShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: workerUser.telegram_id })
          .expect(403);

        // Check essential properties
        expect(response.body.success).toBe(false);
        expect(response.body.error).toMatch(/MAX subscription/i);

        // Verify worker was NOT added
        const workers = await pool.query('SELECT * FROM shop_workers WHERE shop_id = $1', [
          freeShop.id,
        ]);
        expect(workers.rows).toHaveLength(0);
      });

      it('should allow worker addition for MAX tier shop', async () => {
        const response = await request(app)
          .post(`/api/workers/${maxShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: workerUser.telegram_id })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
          shop_id: maxShop.id,
          worker_user_id: workerUser.id,
          telegram_id: workerUser.telegram_id,
        });

        // Verify worker was added to database
        const workers = await pool.query(
          'SELECT * FROM shop_workers WHERE shop_id = $1 AND worker_user_id = $2',
          [maxShop.id, workerUser.id]
        );
        expect(workers.rows).toHaveLength(1);
      });

      it('should enforce MAX check before other validations', async () => {
        // Try to add owner as worker (invalid) on FREE shop
        // Should fail with MAX error, not "owner cannot be worker" error
        const response = await request(app)
          .post(`/api/workers/${freeShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: ownerUser.telegram_id })
          .expect(403);

        expect(response.body.error).toContain('MAX subscription');
      });
    });

    describe('Authorization checks', () => {
      it('should reject if user is not shop owner', async () => {
        // Create another user
        const otherUser = await createTestUser({
          telegramId: '9000000003',
          username: 'otheruser',
        });

        const otherToken = jwt.sign(
          { id: otherUser.id, telegramId: otherUser.telegram_id },
          config.jwt.secret
        );

        const response = await request(app)
          .post(`/api/workers/${maxShop.id}/workers`)
          .set('Authorization', `Bearer ${otherToken}`)
          .send({ telegram_id: workerUser.telegram_id })
          .expect(403);

        expect(response.body.error).toBe('Only shop owner can add workers');
      });

      it('should reject if shop not found', async () => {
        const response = await request(app)
          .post('/api/workers/999999/workers')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: workerUser.telegram_id })
          .expect(404);

        expect(response.body.error).toBe('Shop not found');
      });
    });

    describe('Worker validation', () => {
      it('should reject if telegram_id not provided', async () => {
        const response = await request(app)
          .post(`/api/workers/${maxShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({})
          .expect(400);

        expect(response.body.error).toBe('Telegram ID or username is required');
      });

      it('should reject if worker user not found', async () => {
        const response = await request(app)
          .post(`/api/workers/${maxShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: '8888888888' })
          .expect(404);

        expect(response.body.error).toContain('User not found');
      });

      it('should reject if owner tries to add themselves', async () => {
        const response = await request(app)
          .post(`/api/workers/${maxShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: ownerUser.telegram_id })
          .expect(400);

        expect(response.body.error).toBe('Shop owner cannot be added as worker');
      });

      it('should reject duplicate worker addition', async () => {
        // Add worker first time
        await request(app)
          .post(`/api/workers/${maxShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: workerUser.telegram_id })
          .expect(201);

        // Try to add same worker again
        const response = await request(app)
          .post(`/api/workers/${maxShop.id}/workers`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ telegram_id: workerUser.telegram_id })
          .expect(409);

        expect(response.body.error).toBe('User is already a worker in this shop');
      });
    });
  });

  describe('GET /api/workers/:shopId/workers', () => {
    it('should list workers for shop owner', async () => {
      // Add a worker first
      await pool.query(
        `INSERT INTO shop_workers (shop_id, worker_user_id, telegram_id, added_by)
         VALUES ($1, $2, $3, $4)`,
        [maxShop.id, workerUser.id, workerUser.telegram_id, ownerUser.id]
      );

      const response = await request(app)
        .get(`/api/workers/${maxShop.id}/workers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        user_id: workerUser.id,
        telegram_id: workerUser.telegram_id,
      });
    });

    it('should reject if user is not shop owner', async () => {
      const otherUser = await createTestUser({
        telegramId: '9000000004',
        username: 'other',
      });

      const otherToken = jwt.sign(
        { id: otherUser.id, telegramId: otherUser.telegram_id },
        config.jwt.secret
      );

      const response = await request(app)
        .get(`/api/workers/${maxShop.id}/workers`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.error).toBe('Only shop owner can view workers');
    });
  });

  describe('DELETE /api/workers/:shopId/workers/:workerId', () => {
    let workerId;

    beforeEach(async () => {
      // Add worker
      const result = await pool.query(
        `INSERT INTO shop_workers (shop_id, worker_user_id, telegram_id, added_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [maxShop.id, workerUser.id, workerUser.telegram_id, ownerUser.id]
      );
      workerId = result.rows[0].id;
    });

    it('should remove worker successfully', async () => {
      const response = await request(app)
        .delete(`/api/workers/${maxShop.id}/workers/${workerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Worker removed successfully');

      // Verify worker was removed
      const workers = await pool.query('SELECT * FROM shop_workers WHERE id = $1', [workerId]);
      expect(workers.rows).toHaveLength(0);
    });

    it('should reject if user is not shop owner', async () => {
      const otherUser = await createTestUser({
        telegramId: '9000000005',
        username: 'other2',
      });

      const otherToken = jwt.sign(
        { id: otherUser.id, telegramId: otherUser.telegram_id },
        config.jwt.secret
      );

      const response = await request(app)
        .delete(`/api/workers/${maxShop.id}/workers/${workerId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.error).toBe('Only shop owner can remove workers');
    });

    it('should reject if worker not found', async () => {
      const response = await request(app)
        .delete(`/api/workers/${maxShop.id}/workers/999999`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);

      expect(response.body.error).toBe('Worker in this shop not found');
    });
  });
});
