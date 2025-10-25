/**
 * Integration Tests: Product Controller
 * Tests BUG-W2 fix: Worker authorization for product CRUD operations
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js'; // Use full server app
import { config } from '../../src/config/env.js';
import {
  getTestPool,
  closeTestDb,
  cleanupTestData,
  createTestUser,
  createTestShop,
  createTestProduct
} from '../helpers/testDb.js';

describe('Product Controller - Integration Tests', () => {
  let pool;
  let ownerUser;
  let workerUser;
  let unauthorizedUser;
  let shop;
  let product;
  let ownerToken;
  let workerToken;
  let unauthorizedToken;

  beforeAll(async () => {
    pool = getTestPool();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create owner user
    ownerUser = await createTestUser({
      telegramId: '9000001001',
      username: 'productowner',
      selectedRole: 'seller'
    });

    // Create worker user
    workerUser = await createTestUser({
      telegramId: '9000001002',
      username: 'productworker',
      selectedRole: 'seller'
    });

    // Create unauthorized user
    unauthorizedUser = await createTestUser({
      telegramId: '9000001003',
      username: 'unauthorized',
      selectedRole: 'buyer'
    });

    // Create shop
    shop = await createTestShop(ownerUser.id, {
      name: 'Product Test Shop'
    });

    // Upgrade shop to PRO tier (needed for workers)
    await pool.query(
      `UPDATE shops SET tier = 'pro' WHERE id = $1`,
      [shop.id]
    );

    // Add worker to shop
    await pool.query(
      `INSERT INTO shop_workers (shop_id, worker_user_id, telegram_id, added_by)
       VALUES ($1, $2, $3, $4)`,
      [shop.id, workerUser.id, workerUser.telegram_id, ownerUser.id]
    );

    // Create a test product
    product = await createTestProduct(shop.id, {
      name: 'Test Product',
      price: '50.00'
    });

    // Generate JWT tokens
    ownerToken = jwt.sign(
      { id: ownerUser.id, telegramId: ownerUser.telegram_id, username: ownerUser.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    workerToken = jwt.sign(
      { id: workerUser.id, telegramId: workerUser.telegram_id, username: workerUser.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    unauthorizedToken = jwt.sign(
      { id: unauthorizedUser.id, telegramId: unauthorizedUser.telegram_id },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeTestDb();
  });

  describe('POST /api/products', () => {
    const productData = {
      shopId: null, // Will be set in tests
      name: 'New Product',
      description: 'New product description',
      price: '29.99',
      currency: 'USD',
      stockQuantity: 100
    };

    describe('BUG-W2: Worker authorization for product creation', () => {
      it('should allow shop owner to create product', async () => {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ ...productData, shopId: shop.id })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
          name: 'New Product',
          price: '29.99',
          shop_id: shop.id
        });

        // Verify in database
        const result = await pool.query(
          'SELECT * FROM products WHERE id = $1',
          [response.body.data.id]
        );
        expect(result.rows).toHaveLength(1);
      });

      it('should allow shop worker to create product', async () => {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${workerToken}`)
          .send({ ...productData, shopId: shop.id })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toMatchObject({
          name: 'New Product',
          shop_id: shop.id
        });

        // Verify in database
        const result = await pool.query(
          'SELECT * FROM products WHERE id = $1',
          [response.body.data.id]
        );
        expect(result.rows).toHaveLength(1);
      });

      it('should reject unauthorized user from creating product', async () => {
        const response = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${unauthorizedToken}`)
          .send({ ...productData, shopId: shop.id })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('own or manage as a worker');
      });
    });
  });

  describe('PUT /api/products/:id', () => {
    describe('BUG-W2: Worker authorization for product updates', () => {
      it('should allow shop owner to update product', async () => {
        const response = await request(app)
          .put(`/api/products/${product.id}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            name: 'Updated Product',
            price: '99.99'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Updated Product');
        expect(response.body.data.price).toBe('99.99');

        // Verify in database
        const result = await pool.query(
          'SELECT * FROM products WHERE id = $1',
          [product.id]
        );
        expect(result.rows[0].name).toBe('Updated Product');
      });

      it('should allow shop worker to update product', async () => {
        const response = await request(app)
          .put(`/api/products/${product.id}`)
          .set('Authorization', `Bearer ${workerToken}`)
          .send({
            name: 'Worker Updated Product',
            description: 'Updated by worker'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Worker Updated Product');
        expect(response.body.data.description).toBe('Updated by worker');
      });

      it('should reject unauthorized user from updating product', async () => {
        const response = await request(app)
          .put(`/api/products/${product.id}`)
          .set('Authorization', `Bearer ${unauthorizedToken}`)
          .send({
            name: 'Hacked Product'
          })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('own or manage as a worker');

        // Verify product was NOT updated
        const result = await pool.query(
          'SELECT * FROM products WHERE id = $1',
          [product.id]
        );
        expect(result.rows[0].name).toBe('Test Product'); // Original name
      });
    });
  });

  describe('DELETE /api/products/:id', () => {
    describe('BUG-W2: Worker authorization for product deletion', () => {
      it('should allow shop owner to delete product', async () => {
        const response = await request(app)
          .delete(`/api/products/${product.id}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Product deleted successfully');

        // Verify product is deleted
        const result = await pool.query(
          'SELECT * FROM products WHERE id = $1',
          [product.id]
        );
        expect(result.rows).toHaveLength(0);
      });

      it('should allow shop worker to delete product', async () => {
        const response = await request(app)
          .delete(`/api/products/${product.id}`)
          .set('Authorization', `Bearer ${workerToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);

        // Verify product is deleted
        const result = await pool.query(
          'SELECT * FROM products WHERE id = $1',
          [product.id]
        );
        expect(result.rows).toHaveLength(0);
      });

      it('should reject unauthorized user from deleting product', async () => {
        const response = await request(app)
          .delete(`/api/products/${product.id}`)
          .set('Authorization', `Bearer ${unauthorizedToken}`)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('own or manage as a worker');

        // Verify product still exists
        const result = await pool.query(
          'SELECT * FROM products WHERE id = $1',
          [product.id]
        );
        expect(result.rows).toHaveLength(1);
      });
    });
  });

  describe('POST /api/products/bulk-delete-all', () => {
    beforeEach(async () => {
      // Create multiple products
      await createTestProduct(shop.id, { name: 'Product 2' });
      await createTestProduct(shop.id, { name: 'Product 3' });
    });

    it('should allow shop owner to bulk delete all products', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-all')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ shopId: shop.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBeGreaterThanOrEqual(3);

      // Verify all products deleted
      const result = await pool.query(
        'SELECT * FROM products WHERE shop_id = $1',
        [shop.id]
      );
      expect(result.rows).toHaveLength(0);
    });

    it('should allow shop worker to bulk delete all products', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-all')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ shopId: shop.id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBeGreaterThanOrEqual(3);
    });

    it('should reject unauthorized user from bulk deleting', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-all')
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({ shopId: shop.id })
        .expect(403);

      expect(response.body.error).toContain('own or manage as a worker');

      // Verify products still exist
      const result = await pool.query(
        'SELECT * FROM products WHERE shop_id = $1',
        [shop.id]
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('POST /api/products/bulk-delete-by-ids', () => {
    let product2;
    let product3;

    beforeEach(async () => {
      product2 = await createTestProduct(shop.id, { name: 'Product 2' });
      product3 = await createTestProduct(shop.id, { name: 'Product 3' });
    });

    it('should allow shop owner to bulk delete specific products', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-by-ids')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          shopId: shop.id,
          productIds: [product2.id, product3.id]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(2);

      // Verify specific products deleted
      const result = await pool.query(
        'SELECT * FROM products WHERE id = ANY($1::int[])',
        [[product2.id, product3.id]]
      );
      expect(result.rows).toHaveLength(0);

      // Verify original product still exists
      const originalResult = await pool.query(
        'SELECT * FROM products WHERE id = $1',
        [product.id]
      );
      expect(originalResult.rows).toHaveLength(1);
    });

    it('should allow shop worker to bulk delete specific products', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-by-ids')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          shopId: shop.id,
          productIds: [product2.id]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(1);
    });

    it('should reject unauthorized user from bulk deleting by IDs', async () => {
      const response = await request(app)
        .post('/api/products/bulk-delete-by-ids')
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .send({
          shopId: shop.id,
          productIds: [product2.id, product3.id]
        })
        .expect(403);

      expect(response.body.error).toContain('own or manage as a worker');

      // Verify products still exist
      const result = await pool.query(
        'SELECT * FROM products WHERE id = ANY($1::int[])',
        [[product2.id, product3.id]]
      );
      expect(result.rows).toHaveLength(2);
    });
  });
});
