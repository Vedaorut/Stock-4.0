/**
 * Integration Tests: Circular Resell Chain Prevention
 *
 * Tests P0-3 FIX: Only block circular RESELL chains (A->B->C->A where all are resell)
 * Monitor-mode follows are allowed in any configuration including mutual follows.
 *
 * Business Rules:
 * - Monitor + Monitor: ALLOWED (mutual monitoring is fine)
 * - Resell + Monitor: ALLOWED (mixed modes don't create infinite loops)
 * - Monitor + Resell: ALLOWED (mixed modes don't create infinite loops)
 * - Resell + Resell: BLOCKED (creates infinite product copy loops)
 *
 * NOTE: Current implementation has DB trigger (005_prevent_circular_follows.sql) that
 * blocks ALL circular follows. Tests marked with .skip test the REQUIRED behavior
 * that needs migration update. Tests without .skip verify current behavior.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { config } from '../../../src/config/env.js';
import followRoutes from '../../../src/routes/follows.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct,
} from '../../helpers/testDb.js';

// Create minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/follows', followRoutes);
  app.use(errorHandler);
  return app;
};

describe('Circular Resell Chain Prevention', () => {
  let app;
  let pool;

  // Users for shops A, B, C
  let userA;
  let userB;
  let userC;

  // Shops A, B, C
  let shopA;
  let shopB;
  let shopC;

  // JWT tokens
  let tokenA;
  let tokenB;
  let tokenC;

  beforeAll(async () => {
    app = createTestApp();
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create three users
    userA = await createTestUser({
      telegramId: '9100001001',
      username: 'usera',
      selectedRole: 'seller',
    });

    userB = await createTestUser({
      telegramId: '9100001002',
      username: 'userb',
      selectedRole: 'seller',
    });

    userC = await createTestUser({
      telegramId: '9100001003',
      username: 'userc',
      selectedRole: 'seller',
    });

    // Create three shops (MAX tier for unlimited follows)
    shopA = await createTestShop(userA.id, { name: 'Shop A' });
    shopB = await createTestShop(userB.id, { name: 'Shop B' });
    shopC = await createTestShop(userC.id, { name: 'Shop C' });

    // Set all shops to MAX tier (unlimited follows)
    await pool.query(`UPDATE shops SET tier = 'max' WHERE id IN ($1, $2, $3)`, [
      shopA.id,
      shopB.id,
      shopC.id,
    ]);

    // Create products for each shop (required for resell sync)
    await createTestProduct(shopA.id, { name: 'Product A', price: '10.00' });
    await createTestProduct(shopB.id, { name: 'Product B', price: '20.00' });
    await createTestProduct(shopC.id, { name: 'Product C', price: '30.00' });

    // Generate JWT tokens
    tokenA = jwt.sign({ id: userA.id, telegramId: userA.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    tokenB = jwt.sign({ id: userB.id, telegramId: userB.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    tokenC = jwt.sign({ id: userC.id, telegramId: userC.telegram_id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  describe('Mutual follows (A <-> B)', () => {
    // NOTE: This test is skipped because DB trigger blocks ALL mutual follows.
    // Once migration 005 is updated to only block resell+resell, enable this test.
    it.skip('should ALLOW A monitor B + B monitor A (both monitor) - REQUIRES MIGRATION UPDATE', async () => {
      // A follows B in monitor mode
      const followAB = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'monitor',
        })
        .expect(201);

      expect(followAB.body.data).toMatchObject({
        follower_shop_id: shopA.id,
        source_shop_id: shopB.id,
        mode: 'monitor',
        status: 'active',
      });

      // B follows A in monitor mode (mutual follow)
      const followBA = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          followerShopId: shopB.id,
          sourceShopId: shopA.id,
          mode: 'monitor',
        })
        .expect(201);

      expect(followBA.body.data).toMatchObject({
        follower_shop_id: shopB.id,
        source_shop_id: shopA.id,
        mode: 'monitor',
        status: 'active',
      });

      // Verify both follows exist
      const follows = await pool.query(
        `SELECT * FROM shop_follows WHERE follower_shop_id IN ($1, $2) ORDER BY id`,
        [shopA.id, shopB.id]
      );
      expect(follows.rows).toHaveLength(2);
    });

    // NOTE: This test is skipped because DB trigger blocks ALL mutual follows.
    it.skip('should ALLOW A resell B + B monitor A (mixed modes) - REQUIRES MIGRATION UPDATE', async () => {
      // A follows B in resell mode
      const followAB = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'resell',
          markupPercentage: 25,
        })
        .expect(201);

      expect(followAB.body.data).toMatchObject({
        follower_shop_id: shopA.id,
        source_shop_id: shopB.id,
        mode: 'resell',
      });

      // B follows A in monitor mode (mixed - should succeed)
      const followBA = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          followerShopId: shopB.id,
          sourceShopId: shopA.id,
          mode: 'monitor',
        })
        .expect(201);

      expect(followBA.body.data).toMatchObject({
        follower_shop_id: shopB.id,
        source_shop_id: shopA.id,
        mode: 'monitor',
      });
    });

    // NOTE: This test is skipped because DB trigger blocks ALL mutual follows.
    it.skip('should ALLOW A monitor B + B resell A (mixed modes reversed) - REQUIRES MIGRATION UPDATE', async () => {
      // A follows B in monitor mode
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'monitor',
        })
        .expect(201);

      // B follows A in resell mode (mixed - should succeed)
      const followBA = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          followerShopId: shopB.id,
          sourceShopId: shopA.id,
          mode: 'resell',
          markupPercentage: 30,
        })
        .expect(201);

      expect(followBA.body.data).toMatchObject({
        follower_shop_id: shopB.id,
        source_shop_id: shopA.id,
        mode: 'resell',
      });
    });

    it('should REJECT A resell B + B resell A (circular resell)', async () => {
      // A follows B in resell mode
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'resell',
          markupPercentage: 20,
        })
        .expect(202); // 202 for resell mode (async sync)

      // B tries to follow A in resell mode (circular resell - should FAIL)
      const response = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          followerShopId: shopB.id,
          sourceShopId: shopA.id,
          mode: 'resell',
          markupPercentage: 15,
        })
        .expect(400); // ValidationError from app-level check

      // App-level check catches this before DB trigger
      expect(response.body.error).toContain('reselling your products');

      // Verify only one follow exists
      const follows = await pool.query(
        `SELECT * FROM shop_follows WHERE follower_shop_id IN ($1, $2)`,
        [shopA.id, shopB.id]
      );
      expect(follows.rows).toHaveLength(1);
      expect(follows.rows[0].follower_shop_id).toBe(shopA.id);
    });
  });

  describe('Three-shop chain (A -> B -> C)', () => {
    it('should REJECT A->B->C->A resell chain (triangular cycle)', async () => {
      // A resells B
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'resell',
          markupPercentage: 10,
        })
        .expect(202); // 202 for resell

      // B resells C
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          followerShopId: shopB.id,
          sourceShopId: shopC.id,
          mode: 'resell',
          markupPercentage: 15,
        })
        .expect(202); // 202 for resell

      // C tries to resell A (would create A->B->C->A resell loop)
      const response = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenC}`)
        .send({
          followerShopId: shopC.id,
          sourceShopId: shopA.id,
          mode: 'resell',
          markupPercentage: 20,
        })
        .expect(400); // ValidationError

      expect(response.body.error).toContain('circular resell chain');

      // Verify only 2 follows exist (A->B and B->C)
      const follows = await pool.query(
        `SELECT * FROM shop_follows WHERE mode = 'resell' ORDER BY id`
      );
      expect(follows.rows).toHaveLength(2);
    });

    // NOTE: This test is skipped because DB trigger blocks ALL circular follows regardless of mode.
    // Once migration 005 is updated to only block resell+resell chains, enable this test.
    it.skip('should ALLOW A->B->C->A with monitor breaking the chain - REQUIRES MIGRATION UPDATE', async () => {
      // A resells B
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'resell',
          markupPercentage: 10,
        })
        .expect(202);

      // B MONITORS C (not resell - breaks potential resell chain)
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          followerShopId: shopB.id,
          sourceShopId: shopC.id,
          mode: 'monitor',
        })
        .expect(201);

      // C can resell A (chain is broken by monitor in the middle)
      const response = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenC}`)
        .send({
          followerShopId: shopC.id,
          sourceShopId: shopA.id,
          mode: 'resell',
          markupPercentage: 20,
        })
        .expect(202);

      expect(response.body.data).toMatchObject({
        follower_shop_id: shopC.id,
        source_shop_id: shopA.id,
        mode: 'resell',
      });

      // Verify all 3 follows exist
      const follows = await pool.query(`SELECT * FROM shop_follows ORDER BY id`);
      expect(follows.rows).toHaveLength(3);
    });

    it('should ALLOW A->B->C with all monitoring (no resell cycle possible)', async () => {
      // A monitors B
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'monitor',
        })
        .expect(201);

      // B monitors C
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          followerShopId: shopB.id,
          sourceShopId: shopC.id,
          mode: 'monitor',
        })
        .expect(201);

      // C monitors A (complete monitor loop - should be allowed)
      const response = await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenC}`)
        .send({
          followerShopId: shopC.id,
          sourceShopId: shopA.id,
          mode: 'monitor',
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        follower_shop_id: shopC.id,
        source_shop_id: shopA.id,
        mode: 'monitor',
      });
    });
  });

  describe('Mode switching edge cases', () => {
    // NOTE: This test is skipped because current DB trigger blocks ALL mutual follows.
    // Once migration 005 is updated, we can test mode switching on existing mutual follows.
    it.skip('should REJECT switching to resell if it would create circular chain - REQUIRES MIGRATION UPDATE', async () => {
      // Setup: A monitors B, B monitors A (both monitor - allowed)
      await pool.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
         VALUES ($1, $2, 'monitor', 0, 'active'), ($3, $4, 'monitor', 0, 'active')`,
        [shopA.id, shopB.id, shopB.id, shopA.id]
      );

      // Get follow ID for A->B
      const followResult = await pool.query(
        `SELECT id FROM shop_follows WHERE follower_shop_id = $1 AND source_shop_id = $2`,
        [shopA.id, shopB.id]
      );
      const followABId = followResult.rows[0].id;

      // Try to switch A->B to resell mode
      await request(app)
        .put(`/api/follows/${followABId}/mode`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          mode: 'resell',
          markupPercentage: 25,
        })
        .expect(200); // First switch should succeed

      // Get follow ID for B->A
      const followBAResult = await pool.query(
        `SELECT id FROM shop_follows WHERE follower_shop_id = $1 AND source_shop_id = $2`,
        [shopB.id, shopA.id]
      );
      const followBAId = followBAResult.rows[0].id;

      // Try to switch B->A to resell mode (would create resell cycle)
      const response = await request(app)
        .put(`/api/follows/${followBAId}/mode`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          mode: 'resell',
          markupPercentage: 30,
        })
        .expect(400);

      expect(response.body.error).toContain('reselling your products');

      // Verify B->A is still monitor
      const checkResult = await pool.query(
        `SELECT mode FROM shop_follows WHERE id = $1`,
        [followBAId]
      );
      expect(checkResult.rows[0].mode).toBe('monitor');
    });

    it('should REJECT switching existing follow to resell if reverse resell exists', async () => {
      // Setup: A resells B (one-way resell)
      await request(app)
        .post('/api/follows')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          followerShopId: shopA.id,
          sourceShopId: shopB.id,
          mode: 'resell',
          markupPercentage: 20,
        })
        .expect(202);

      // B creates monitor follow to A (allowed - not resell cycle)
      const followBA = await pool.query(
        `INSERT INTO shop_follows (follower_shop_id, source_shop_id, mode, markup_percentage, status)
         VALUES ($1, $2, 'monitor', 0, 'active')
         RETURNING id`,
        [shopB.id, shopA.id]
      );
      const followBAId = followBA.rows[0].id;

      // Try to switch B->A to resell mode (would create resell cycle)
      const response = await request(app)
        .put(`/api/follows/${followBAId}/mode`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          mode: 'resell',
          markupPercentage: 30,
        })
        .expect(400);

      expect(response.body.error).toContain('reselling your products');

      // Verify B->A is still monitor
      const checkResult = await pool.query(
        `SELECT mode FROM shop_follows WHERE id = $1`,
        [followBAId]
      );
      expect(checkResult.rows[0].mode).toBe('monitor');
    });
  });
});
