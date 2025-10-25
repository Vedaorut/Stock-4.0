/**
 * Integration Tests: Shop Follow Controller
 * Tests BUG-F1 fix: PRO users get unlimited follows, FREE users limited to 2
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { config } from '../../src/config/env.js';
import followRoutes from '../../src/routes/follows.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop
} from '../helpers/testDb.js';

// Create minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/follows', followRoutes);
  app.use(errorHandler);
  return app;
};

describe('Shop Follow Controller - Integration Tests', () => {
  let app;
  let pool;
  let freeUser;
  let proUser;
  let freeShop;
  let proShop;
  let sourceShop1;
  let sourceShop2;
  let sourceShop3;
  let freeToken;
  let proToken;

  beforeAll(async () => {
    app = createTestApp();
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create FREE tier user
    freeUser = await createTestUser({
      telegramId: '9000002001',
      username: 'freeuser',
      selectedRole: 'seller'
    });

    // Create PRO tier user
    proUser = await createTestUser({
      telegramId: '9000002002',
      username: 'prouser',
      selectedRole: 'seller'
    });

    // Create shops for FREE user
    freeShop = await createTestShop(freeUser.id, {
      name: 'Free User Shop',
      description: 'FREE tier follower shop'
    });

    // Create shops for PRO user
    proShop = await createTestShop(proUser.id, {
      name: 'Pro User Shop',
      description: 'PRO tier follower shop'
    });

    // Upgrade PRO shop to PRO tier
    await pool.query(
      `UPDATE shops SET tier = 'pro' WHERE id = $1`,
      [proShop.id]
    );

    // Create source shops to follow
    const sourceUser = await createTestUser({
      telegramId: '9000002003',
      username: 'sourceowner'
    });

    sourceShop1 = await createTestShop(sourceUser.id, {
      name: 'Source Shop 1'
    });

    sourceShop2 = await createTestShop(sourceUser.id, {
      name: 'Source Shop 2'
    });

    sourceShop3 = await createTestShop(sourceUser.id, {
      name: 'Source Shop 3'
    });

    // Generate JWT tokens
    freeToken = jwt.sign(
      { id: freeUser.id, telegramId: freeUser.telegram_id },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    proToken = jwt.sign(
      { id: proUser.id, telegramId: proUser.telegram_id },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  describe('GET /api/follows/check-limit', () => {
    describe('BUG-F1: PRO users unlimited follows', () => {
      it('should return unlimited limit for PRO tier shop', async () => {
        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: proShop.id })
          .set('Authorization', `Bearer ${proToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: null, // null = unlimited
          count: 0,
          remaining: null, // null = unlimited
          reached: false,
          canFollow: true,
          tier: 'PRO'
        });
      });

      it('should return limited (2) for FREE tier shop', async () => {
        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: freeShop.id })
          .set('Authorization', `Bearer ${freeToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 0,
          remaining: 2,
          reached: false,
          canFollow: true,
          tier: 'FREE'
        });
      });

      it('should show correct remaining count for FREE tier', async () => {
        // Create 1 follow
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
           VALUES ($1, $2, 'monitor', 'active')`,
          [freeShop.id, sourceShop1.id]
        );

        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: freeShop.id })
          .set('Authorization', `Bearer ${freeToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 1,
          remaining: 1,
          reached: false,
          canFollow: true,
          tier: 'FREE'
        });
      });

      it('should show limit reached for FREE tier with 2 follows', async () => {
        // Create 2 follows
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
           VALUES ($1, $2, 'monitor', 'active'), ($3, $4, 'monitor', 'active')`,
          [freeShop.id, sourceShop1.id, freeShop.id, sourceShop2.id]
        );

        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: freeShop.id })
          .set('Authorization', `Bearer ${freeToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 2,
          remaining: 0,
          reached: true,
          canFollow: false,
          tier: 'FREE'
        });
      });

      it('should allow PRO tier to have 3+ follows', async () => {
        // Create 3 follows for PRO user
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
           VALUES ($1, $2, 'monitor', 'active'),
                  ($1, $3, 'monitor', 'active'),
                  ($1, $4, 'monitor', 'active')`,
          [proShop.id, sourceShop1.id, sourceShop2.id, sourceShop3.id]
        );

        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: proShop.id })
          .set('Authorization', `Bearer ${proToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: null,
          count: 3,
          remaining: null,
          reached: false,
          canFollow: true,
          tier: 'PRO'
        });
      });
    });
  });

  describe('POST /api/follows', () => {
    describe('BUG-F1: Follow creation limits by tier', () => {
      it('should allow FREE tier to create first follow', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'monitor'
          })
          .expect(201);

        expect(response.body.data).toMatchObject({
          follower_shop_id: freeShop.id,
          source_shop_id: sourceShop1.id,
          mode: 'monitor',
          status: 'active'
        });

        // Verify in database
        const follows = await pool.query(
          'SELECT * FROM shop_follows WHERE follower_shop_id = $1',
          [freeShop.id]
        );
        expect(follows.rows).toHaveLength(1);
      });

      it('should allow FREE tier to create second follow', async () => {
        // Create first follow
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
           VALUES ($1, $2, 'monitor', 'active')`,
          [freeShop.id, sourceShop1.id]
        );

        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: sourceShop2.id,
            mode: 'monitor'
          })
          .expect(201);

        expect(response.body.data).toMatchObject({
          follower_shop_id: freeShop.id,
          source_shop_id: sourceShop2.id
        });
      });

      it('should reject FREE tier third follow (limit reached)', async () => {
        // Create 2 follows (at limit)
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
           VALUES ($1, $2, 'monitor', 'active'), ($1, $3, 'monitor', 'active')`,
          [freeShop.id, sourceShop1.id, sourceShop2.id]
        );

        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: sourceShop3.id,
            mode: 'monitor'
          })
          .expect(402); // 402 Payment Required

        expect(response.body.error).toBe('FREE tier limit reached');
        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 2,
          remaining: 0,
          reached: true,
          canFollow: false
        });

        // Verify third follow was NOT created
        const follows = await pool.query(
          'SELECT * FROM shop_follows WHERE follower_shop_id = $1',
          [freeShop.id]
        );
        expect(follows.rows).toHaveLength(2); // Still 2
      });

      it('should allow PRO tier to create 3+ follows', async () => {
        // Create 3 follows
        const follow1 = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'monitor'
          })
          .expect(201);

        const follow2 = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop2.id,
            mode: 'monitor'
          })
          .expect(201);

        const follow3 = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop3.id,
            mode: 'monitor'
          })
          .expect(201);

        expect(follow1.body.data).toMatchObject({ follower_shop_id: proShop.id });
        expect(follow2.body.data).toMatchObject({ follower_shop_id: proShop.id });
        expect(follow3.body.data).toMatchObject({ follower_shop_id: proShop.id });

        // Verify 3 follows created
        const follows = await pool.query(
          'SELECT * FROM shop_follows WHERE follower_shop_id = $1',
          [proShop.id]
        );
        expect(follows.rows).toHaveLength(3);
      });

      it('should allow PRO tier unlimited follows (10+ test)', async () => {
        // Create 10 source shops
        const sourceUser = await createTestUser({
          telegramId: '9000002099',
          username: 'manysources'
        });

        const sourceShops = [];
        for (let i = 0; i < 10; i++) {
          const shop = await createTestShop(sourceUser.id, {
            name: `Source ${i}`
          });
          sourceShops.push(shop);
        }

        // Create 10 follows for PRO user
        for (const shop of sourceShops) {
          await request(app)
            .post('/api/follows')
            .set('Authorization', `Bearer ${proToken}`)
            .send({
              followerShopId: proShop.id,
              sourceShopId: shop.id,
              mode: 'monitor'
            })
            .expect(201);
        }

        // Verify 10 follows created
        const follows = await pool.query(
          'SELECT * FROM shop_follows WHERE follower_shop_id = $1',
          [proShop.id]
        );
        expect(follows.rows.length).toBeGreaterThanOrEqual(10);
      });
    });

    describe('Follow validation (existing tests)', () => {
      it('should reject if follower shop not found', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: 999999,
            sourceShopId: sourceShop1.id,
            mode: 'monitor'
          })
          .expect(404);

        expect(response.body.error).toBe('Follower shop not found');
      });

      it('should reject if source shop not found', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: 999999,
            mode: 'monitor'
          })
          .expect(404);

        expect(response.body.error).toBe('Source shop not found');
      });

      it('should reject self-follow', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: freeShop.id,
            mode: 'monitor'
          })
          .expect(400);

        expect(response.body.error).toBe('Cannot follow your own shop');
      });

      it('should reject duplicate follow', async () => {
        // Create first follow
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
           VALUES ($1, $2, 'monitor', 'active')`,
          [freeShop.id, sourceShop1.id]
        );

        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'monitor'
          })
          .expect(409);

        expect(response.body.error).toBe('Already following this shop');
      });

      it('should require markup percentage for resell mode', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'resell'
            // Missing markupPercentage
          })
          .expect(400);

        expect(response.body.error).toContain('Markup percentage is required');
      });

      it('should validate markup percentage range', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${freeToken}`)
          .send({
            followerShopId: freeShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'resell',
            markupPercentage: 600 // Too high
          })
          .expect(400);

        expect(response.body.error).toContain('Markup must be between 1% and 500%');
      });
    });
  });

  describe('GET /api/follows/my-follows', () => {
    it('should return list of active follows', async () => {
      // Create follows
      await pool.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, status)
         VALUES ($1, $2, 'monitor', 'active'), ($1, $3, 'resell', 'active')`,
        [freeShop.id, sourceShop1.id, sourceShop2.id]
      );

      // Update markup for resell follow
      await pool.query(
        `UPDATE shop_follows SET markup_percentage = 50
         WHERE follower_shop_id = $1 AND source_shop_id = $2`,
        [freeShop.id, sourceShop2.id]
      );

      const response = await request(app)
        .get('/api/follows/my')
        .query({ shopId: freeShop.id })
        .set('Authorization', `Bearer ${freeToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        follower_shop_id: freeShop.id,
        mode: 'monitor',
        status: 'active'
      });
    });
  });
});
