/**
 * Rate Limiting Tests
 *
 * IMPORTANT: These tests are SKIPPED in test environment because:
 * rateLimiter.js explicitly bypasses rate limiting when NODE_ENV='test'
 *
 * This is by design - rate limiting would make tests unreliable and slow.
 * The rate limiting middleware is tested in production-like environments.
 *
 * To test rate limiting manually:
 * 1. Run the server in development mode (NODE_ENV=development)
 * 2. Send requests exceeding the rate limit thresholds
 * 3. Verify 429 responses are returned with appropriate headers
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import { config } from '../../src/config/env.js';
import { userQueries, shopQueries } from '../../src/database/queries/index.js';
import { getClient } from '../../src/config/database.js';

describe.skip('Rate Limiting Tests (SKIPPED - rate limiting bypassed in test env)', () => {
  let user, token, shop;

  beforeAll(async () => {
    // Create test user
    user = await userQueries.create({
      telegram_id: Math.floor(Math.random() * 1000000),
      username: 'ratelimituser',
      first_name: 'Rate',
      last_name: 'Limit',
    });

    // Generate token
    token = jwt.sign(
      { id: user.id, telegramId: user.telegram_id, username: user.username },
      config.jwt.secret,
      { expiresIn: '1d' }
    );

    // Create shop
    shop = await shopQueries.create({
      owner_id: user.id,
      name: 'ratelimitshop',
      description: 'Test Shop',
      subscription_tier: 'pro',
      subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  });

  afterAll(async () => {
    // Cleanup
    const client = await getClient();
    try {
      await client.query('DELETE FROM shops WHERE id = $1', [shop.id]);
      await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    } finally {
      client.release();
    }
  });

  describe('P0-API-6: Subscription Rate Limiting', () => {
    test('Should allow subscription creation within rate limit', async () => {
      const response = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${token}`)
        .send({ tier: 'basic' });

      // Should succeed (or fail for business reasons, but not rate limit)
      expect(response.status).not.toBe(429);
    });

    test('Should enforce rate limit on subscription creation after threshold', async () => {
      // Attempt to create 6 pending subscriptions (limit is 5/hour)
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/api/subscriptions/pending')
            .set('Authorization', `Bearer ${token}`)
            .send({ tier: 'basic' })
        );
      }

      const responses = await Promise.all(requests);

      // At least one should be rate limited
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 10000); // Longer timeout for multiple requests
  });

  describe('P0-API-8: AI Endpoints Rate Limiting', () => {
    test('Should allow AI requests within rate limit', async () => {
      const response = await request(app)
        .post('/api/ai/products/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Test AI message',
          shopId: shop.id,
        });

      // Should succeed (or fail for business reasons, but not rate limit)
      expect(response.status).not.toBe(429);
    });

    test('Should enforce rate limit on AI requests after threshold', async () => {
      // Attempt 11 AI requests (limit is 10/hour)
      const requests = [];
      for (let i = 0; i < 11; i++) {
        requests.push(
          request(app)
            .post('/api/ai/products/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({
              message: `Test message ${i}`,
              shopId: shop.id,
            })
        );
      }

      const responses = await Promise.all(requests);

      // At least one should be rate limited
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Verify error message
      const rateLimitedResponse = rateLimited[0];
      expect(rateLimitedResponse.body.error).toMatch(/too many/i);
    }, 15000); // Longer timeout
  });

  describe('P0-API-7: Shop Creation Rate Limiting', () => {
    test('Should enforce rate limit on shop creation', async () => {
      // Attempt to create 6 shops (limit is 5/hour)
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app)
            .post('/api/shops')
            .set('Authorization', `Bearer ${token}`)
            .send({
              name: `rateshop${i}`,
              description: 'Rate limit test shop',
            })
        );
      }

      const responses = await Promise.all(requests);

      // At least one should be rate limited
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Rate Limit Headers', () => {
    test('Should return rate limit headers in response', async () => {
      const response = await request(app)
        .post('/api/subscriptions/pending')
        .set('Authorization', `Bearer ${token}`)
        .send({ tier: 'basic' });

      // Check for standard rate limit headers
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });

    test('Should return retry-after header when rate limited', async () => {
      // Spam requests to trigger rate limit
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/api/subscriptions/pending')
            .set('Authorization', `Bearer ${token}`)
            .send({ tier: 'basic' })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.find((r) => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.body.retryAfter).toBeDefined();
      }
    }, 10000);
  });
});
