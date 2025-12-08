/**
 * Integration Tests: Shop Follow Controller
 * Tests follow limits by tier:
 * - PRO tier: 2 follows limit
 * - MAX tier: unlimited follows
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
  createTestShop,
  createTestProduct,
} from '../helpers/testDb.js';

// Create minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/follows', followRoutes);
  app.use('/api/shop-follows', followRoutes);
  app.use(errorHandler);
  return app;
};

describe('Shop Follow Controller - Integration Tests', () => {
  let app;
  let pool;
  let proUser;
  let maxUser;
  let proShop;
  let maxShop;
  let sourceShop1;
  let sourceShop2;
  let sourceShop3;
  let sourceProduct1;
  let proToken;
  let maxToken;

  beforeAll(async () => {
    app = createTestApp();
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create PRO tier user (has 2 follows limit)
    proUser = await createTestUser({
      telegramId: '9000002001',
      username: 'prouser',
      selectedRole: 'seller',
    });

    // Create MAX tier user (has unlimited follows)
    maxUser = await createTestUser({
      telegramId: '9000002002',
      username: 'maxuser',
      selectedRole: 'seller',
    });

    // Create shop for PRO user
    proShop = await createTestShop(proUser.id, {
      name: 'Pro User Shop',
      description: 'PRO tier follower shop',
    });

    // Create shop for MAX user
    maxShop = await createTestShop(maxUser.id, {
      name: 'Max User Shop',
      description: 'MAX tier follower shop',
    });

    // Set tier for PRO shop (default is already 'pro')
    await pool.query(`UPDATE shops SET tier = 'pro' WHERE id = $1`, [proShop.id]);

    // Upgrade MAX shop to MAX tier
    await pool.query(`UPDATE shops SET tier = 'max' WHERE id = $1`, [maxShop.id]);

    // Create source shops to follow
    const sourceUser = await createTestUser({
      telegramId: '9000002003',
      username: 'sourceowner',
    });

    sourceShop1 = await createTestShop(sourceUser.id, {
      name: 'Source Shop 1',
    });

    sourceShop2 = await createTestShop(sourceUser.id, {
      name: 'Source Shop 2',
    });

    sourceShop3 = await createTestShop(sourceUser.id, {
      name: 'Source Shop 3',
    });

    sourceProduct1 = await createTestProduct(sourceShop1.id, {
      name: 'Source Gadget',
      price: '50.00',
      stock_quantity: 7,
    });

    // Generate JWT tokens
    proToken = jwt.sign({ id: proUser.id, telegramId: proUser.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    maxToken = jwt.sign({ id: maxUser.id, telegramId: maxUser.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  describe('GET /api/follows/check-limit', () => {
    describe('Tier-based follow limits', () => {
      it('should return unlimited limit for MAX tier shop', async () => {
        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: maxShop.id })
          .set('Authorization', `Bearer ${maxToken}`)
          .expect(200);
        expect(response.body.data).toMatchObject({
          limit: null, // null = unlimited
          count: 0,
          remaining: null, // null = unlimited
          reached: false,
          canFollow: true,
          tier: 'MAX',
        });
      });

      it('should return limited (2) for PRO tier shop', async () => {
        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: proShop.id })
          .set('Authorization', `Bearer ${proToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 0,
          remaining: 2,
          reached: false,
          canFollow: true,
          tier: 'PRO',
        });
      });

      it('should show correct remaining count for PRO tier', async () => {
        // Create 1 follow
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
           VALUES ($1, $2, 'monitor', 0, 'active')`,
          [proShop.id, sourceShop1.id]
        );

        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: proShop.id })
          .set('Authorization', `Bearer ${proToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 1,
          remaining: 1,
          reached: false,
          canFollow: true,
          tier: 'PRO',
        });
      });

      it('should show limit reached for PRO tier with 2 follows', async () => {
        // Create 2 follows
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
           VALUES ($1, $2, 'monitor', 0, 'active'), ($1, $3, 'monitor', 0, 'active')`,
          [proShop.id, sourceShop1.id, sourceShop2.id]
        );

        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: proShop.id })
          .set('Authorization', `Bearer ${proToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 2,
          remaining: 0,
          reached: true,
          canFollow: false,
          tier: 'PRO',
        });
      });

      it('should allow MAX tier to have 3+ follows', async () => {
        // Create 3 follows for MAX user
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
           VALUES ($1, $2, 'monitor', 0, 'active'),
                  ($1, $3, 'monitor', 0, 'active'),
                  ($1, $4, 'monitor', 0, 'active')`,
          [maxShop.id, sourceShop1.id, sourceShop2.id, sourceShop3.id]
        );

        const response = await request(app)
          .get('/api/follows/check-limit')
          .query({ shopId: maxShop.id })
          .set('Authorization', `Bearer ${maxToken}`)
          .expect(200);

        expect(response.body.data).toMatchObject({
          limit: null,
          count: 3,
          remaining: null,
          reached: false,
          canFollow: true,
          tier: 'MAX',
        });
      });
    });
  });

  describe('POST /api/follows', () => {
    describe('Follow creation limits by tier', () => {
      it('should allow PRO tier to create first follow', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'monitor',
          })
          .expect(201);

        expect(response.body.data).toMatchObject({
          follower_shop_id: proShop.id,
          source_shop_id: sourceShop1.id,
          mode: 'monitor',
          status: 'active',
        });

        // Verify in database
        const follows = await pool.query('SELECT * FROM shop_follows WHERE follower_shop_id = $1', [
          proShop.id,
        ]);
        expect(follows.rows).toHaveLength(1);
      });

      it('should allow PRO tier to create second follow', async () => {
        // Create first follow
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
           VALUES ($1, $2, 'monitor', 0, 'active')`,
          [proShop.id, sourceShop1.id]
        );

        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop2.id,
            mode: 'monitor',
          })
          .expect(201);

        expect(response.body.data).toMatchObject({
          follower_shop_id: proShop.id,
          source_shop_id: sourceShop2.id,
        });
      });

      it('should reject PRO tier third follow (limit reached)', async () => {
        // Create 2 follows (at limit)
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
           VALUES ($1, $2, 'monitor', 0, 'active'), ($1, $3, 'monitor', 0, 'active')`,
          [proShop.id, sourceShop1.id, sourceShop2.id]
        );

        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop3.id,
            mode: 'monitor',
          })
          .expect(402); // 402 Payment Required

        expect(response.body.error).toBe('PRO tier limit reached');
        expect(response.body.data).toMatchObject({
          limit: 2,
          count: 2,
          remaining: 0,
          reached: true,
          canFollow: false,
        });

        // Verify third follow was NOT created
        const follows = await pool.query('SELECT * FROM shop_follows WHERE follower_shop_id = $1', [
          proShop.id,
        ]);
        expect(follows.rows).toHaveLength(2); // Still 2
      });

      it('should allow MAX tier to create 3+ follows', async () => {
        // Create 3 follows
        const follow1 = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${maxToken}`)
          .send({
            followerShopId: maxShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'monitor',
          })
          .expect(201);

        const follow2 = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${maxToken}`)
          .send({
            followerShopId: maxShop.id,
            sourceShopId: sourceShop2.id,
            mode: 'monitor',
          })
          .expect(201);

        const follow3 = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${maxToken}`)
          .send({
            followerShopId: maxShop.id,
            sourceShopId: sourceShop3.id,
            mode: 'monitor',
          })
          .expect(201);

        expect(follow1.body.data).toMatchObject({ follower_shop_id: maxShop.id });
        expect(follow2.body.data).toMatchObject({ follower_shop_id: maxShop.id });
        expect(follow3.body.data).toMatchObject({ follower_shop_id: maxShop.id });

        // Verify 3 follows created
        const follows = await pool.query('SELECT * FROM shop_follows WHERE follower_shop_id = $1', [
          maxShop.id,
        ]);
        expect(follows.rows).toHaveLength(3);
      });

      it('should allow MAX tier unlimited follows (10+ test)', async () => {
        // Create 10 source shops
        const sourceUser = await createTestUser({
          telegramId: '9000002099',
          username: 'manysources',
        });

        const sourceShops = [];
        for (let i = 0; i < 10; i++) {
          const shop = await createTestShop(sourceUser.id, {
            name: `Source ${i}`,
          });
          sourceShops.push(shop);
        }

        // Create 10 follows for MAX user
        for (const shop of sourceShops) {
          await request(app)
            .post('/api/follows')
            .set('Authorization', `Bearer ${maxToken}`)
            .send({
              followerShopId: maxShop.id,
              sourceShopId: shop.id,
              mode: 'monitor',
            })
            .expect(201);
        }

        // Verify 10 follows created
        const follows = await pool.query('SELECT * FROM shop_follows WHERE follower_shop_id = $1', [
          maxShop.id,
        ]);
        expect(follows.rows.length).toBeGreaterThanOrEqual(10);
      });
    });

    describe('Follow validation (existing tests)', () => {
      it('should reject if follower shop not found', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: 999999,
            sourceShopId: sourceShop1.id,
            mode: 'monitor',
          })
          .expect(404);

        expect(response.body.error).toBe('Follower shop not found');
      });

      it('should reject if source shop not found', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: 999999,
            mode: 'monitor',
          })
          .expect(404);

        expect(response.body.error).toBe('Source shop not found');
      });

      it('should reject self-follow', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: proShop.id,
            mode: 'monitor',
          })
          .expect(400);

        expect(response.body.error).toBe('Cannot follow your own shop');
      });

      it('should reject duplicate follow', async () => {
        // Create first follow
        await pool.query(
          `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
           VALUES ($1, $2, 'monitor', 0, 'active')`,
          [proShop.id, sourceShop1.id]
        );

        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'monitor',
          })
          .expect(409);

        expect(response.body.error).toBe('Already following this shop');
      });

      it('should require markup percentage for resell mode', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'resell',
            // Missing markupPercentage
          })
          .expect(400);

        expect(response.body.error).toContain('Markup percentage is required');
      });

      it('should validate markup percentage range', async () => {
        const response = await request(app)
          .post('/api/follows')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            followerShopId: proShop.id,
            sourceShopId: sourceShop1.id,
            mode: 'resell',
            markupPercentage: 600, // Too high
          })
          .expect(400);

        expect(response.body.error).toContain('Markup must be between 0.1% and 500%');
      });
    });
  });

  describe('GET /api/follows/my-follows', () => {
    it('should return list of active follows', async () => {
      // Create follows
      await pool.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
         VALUES ($1, $2, 'monitor', 0, 'active'), ($1, $3, 'resell', 50, 'active')`,
        [proShop.id, sourceShop1.id, sourceShop2.id]
      );

      const response = await request(app)
        .get('/api/follows/my')
        .query({ shopId: proShop.id })
        .set('Authorization', `Bearer ${proToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);

      // Find follows by mode (independent of sort order)
      const monitorFollow = response.body.data.find((f) => f.mode === 'monitor');
      const resellFollow = response.body.data.find((f) => f.mode === 'resell');

      expect(monitorFollow).toBeDefined();
      expect(monitorFollow).toMatchObject({
        follower_shop_id: proShop.id,
        source_shop_id: sourceShop1.id,
        mode: 'monitor',
        status: 'active',
      });

      expect(resellFollow).toBeDefined();
      expect(resellFollow).toMatchObject({
        follower_shop_id: proShop.id,
        source_shop_id: sourceShop2.id,
        mode: 'resell',
        status: 'active',
        markup_percentage: 50,
      });
    });
  });

  describe('GET /api/shop-follows', () => {
    it('returns follows using alias endpoint with shop_id query', async () => {
      const insertResult = await pool.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
         VALUES ($1, $2, 'monitor', 0, 'active')
         RETURNING id`,
        [proShop.id, sourceShop1.id]
      );

      const followId = insertResult.rows[0].id;

      const response = await request(app)
        .get('/api/shop-follows')
        .query({ shop_id: proShop.id })
        .set('Authorization', `Bearer ${proToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: followId,
        follower_shop_id: proShop.id,
        source_shop_id: sourceShop1.id,
      });
    });
  });

  describe('GET /api/follows/:id/products', () => {
    it('returns source products for monitor mode', async () => {
      const followResult = await pool.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
         VALUES ($1, $2, 'monitor', 0, 'active')
         RETURNING id`,
        [proShop.id, sourceShop1.id]
      );

      const followId = followResult.rows[0].id;

      const response = await request(app)
        .get(`/api/follows/${followId}/products`)
        .set('Authorization', `Bearer ${proToken}`)
        .expect(200);

      expect(response.body.data.mode).toBe('monitor');
      expect(Array.isArray(response.body.data.products)).toBe(true);
      const firstProduct = response.body.data.products[0];
      expect(firstProduct.name).toBe(sourceProduct1.name);
      expect(firstProduct.stock_quantity).toBe(Number(sourceProduct1.stock_quantity));
    });

    it('returns synced products and pricing for resell mode', async () => {
      const resellFollow = await pool.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
         VALUES ($1, $2, 'resell', 25, 'active')
         RETURNING id`,
        [proShop.id, sourceShop1.id]
      );

      const followerProduct = await createTestProduct(proShop.id, {
        name: 'Synced Gadget',
        price: '65.00',
        stock_quantity: 3,
      });

      await pool.query(
        `INSERT INTO synced_products (follow_id, synced_product_id, source_product_id, last_synced_at, conflict_status)
         VALUES ($1, $2, $3, NOW(), 'synced')`,
        [resellFollow.rows[0].id, followerProduct.id, sourceProduct1.id]
      );

      const response = await request(app)
        .get(`/api/follows/${resellFollow.rows[0].id}/products`)
        .set('Authorization', `Bearer ${proToken}`)
        .expect(200);

      expect(response.body.data.mode).toBe('resell');
      expect(response.body.data.products).toHaveLength(1);
      const product = response.body.data.products[0];
      expect(product.synced_product.id).toBe(followerProduct.id);
      expect(product.pricing.markup_percentage).toBe(25);
    });
  });
});
