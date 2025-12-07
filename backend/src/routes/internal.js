import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { config } from '../config/env.js';
import { userQueries } from '../database/queries/index.js';

const router = express.Router();

// Internal secret for protecting broadcast endpoint
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
// Bot token for cryptographic signature verification (proves request comes from bot)
const BOT_TOKEN = config.telegram?.botToken;

if (!INTERNAL_SECRET) {
  throw new Error('INTERNAL_SECRET environment variable is required');
}

if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required for internal auth signature verification');
}

// Allowed IPs for internal API (localhost ONLY - no Docker networks for security)
const ALLOWED_INTERNAL_IPS = [
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
];

// Optional additional secret for internal API access (defense in depth)
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

function isAllowedIP(ip) {
  if (!ip) {return false;}

  // Exact match only - no regex, no partial matching
  return ALLOWED_INTERNAL_IPS.includes(ip);
}

/**
 * Middleware to verify internal requests with HMAC signature
 *
 * Security layers (defense in depth):
 * 1. IP whitelist - only localhost allowed (127.0.0.1, ::1, ::ffff:127.0.0.1)
 * 2. INTERNAL_API_SECRET (optional) - if env var set, requires X-Internal-Api-Secret header
 * 3. INTERNAL_SECRET - always required via X-Internal-Secret header
 * 4. HMAC signature (for /auth/* routes) - X-Internal-Signature + X-Internal-Timestamp
 *
 * Headers:
 * - X-Internal-Api-Secret: optional additional secret (if INTERNAL_API_SECRET env is set)
 * - X-Internal-Secret: shared secret (required)
 * - X-Internal-Timestamp: request timestamp (required for /auth/* routes)
 * - X-Internal-Signature: HMAC-SHA256(body + timestamp, BOT_TOKEN) (required for /auth/* routes)
 */
function verifyInternalSecret(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  const timestamp = req.headers['x-internal-timestamp'];
  const signature = req.headers['x-internal-signature'];
  const clientIP = req.ip || req.connection?.remoteAddress;

  // 1. Check IP whitelist (defense in depth)
  if (!isAllowedIP(clientIP)) {
    logger.warn('Internal API access from non-whitelisted IP', {
      ip: clientIP,
      path: req.path,
    });
    return res.status(403).json({
      success: false,
      error: 'Forbidden - IP not allowed',
    });
  }

  // 2. Check INTERNAL_API_SECRET if configured (additional layer of security)
  if (INTERNAL_API_SECRET) {
    const providedApiSecret = req.headers['x-internal-api-secret'];
    if (!providedApiSecret || providedApiSecret !== INTERNAL_API_SECRET) {
      logger.warn('Internal API access with invalid/missing API secret', {
        ip: clientIP,
        path: req.path,
        hasSecret: !!providedApiSecret,
      });
      return res.status(403).json({
        success: false,
        error: 'Invalid internal API secret',
      });
    }
  }

  // 3. Check secret
  if (secret !== INTERNAL_SECRET) {
    logger.warn('Unauthorized internal API access attempt', {
      ip: clientIP,
      path: req.path,
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  // 3. For auth endpoints, require HMAC signature (additional security)
  if (req.path.includes('/auth/')) {
    // Check timestamp (±5 minutes window, anti-replay)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);

    if (!timestamp || isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
      logger.warn('Internal API request with invalid/expired timestamp', {
        ip: clientIP,
        path: req.path,
        receivedTimestamp: timestamp || 'MISSING',
        requestTime: requestTime || 'NaN',
        serverNow: now,
        diff: Math.abs(now - requestTime),
      });
      return res.status(401).json({
        success: false,
        error: 'Request expired or invalid timestamp',
      });
    }

    // Check HMAC signature
    if (!signature) {
      logger.warn('Internal API auth request without signature', {
        ip: clientIP,
        path: req.path,
      });
      return res.status(401).json({
        success: false,
        error: 'Missing signature',
      });
    }

    // Use BOT_TOKEN for HMAC - proves request comes from bot (not just someone with INTERNAL_SECRET)
    // Even if INTERNAL_SECRET leaks, attacker cannot forge signature without BOT_TOKEN
    const payload = JSON.stringify(req.body) + timestamp;
    const expectedSignature = crypto
      .createHmac('sha256', BOT_TOKEN)
      .update(payload)
      .digest('hex');

    // Timing-safe comparison
    const sigBuffer = Buffer.from(signature || '');
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      logger.warn('Internal API request with invalid signature', {
        ip: clientIP,
        path: req.path,
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid signature',
      });
    }
  }

  next();
}

/**
 * POST /api/internal/broadcast
 * Broadcast message to all connected WebSocket clients
 *
 * Body: { type: string, ...data }
 * Headers: { x-internal-secret: string }
 *
 * Example:
 * {
 *   "type": "product_added",
 *   "shopId": 123,
 *   "productId": 456
 * }
 */
router.post('/broadcast', verifyInternalSecret, (req, res) => {
  try {
    const { type, ...data } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing type parameter',
      });
    }

    // Use global broadcast function from server.js
    if (typeof global.broadcastUpdate === 'function') {
      global.broadcastUpdate({ type, ...data });

      logger.info('Broadcast sent', { type, data });

      res.json({
        success: true,
        message: 'Broadcast sent',
        type,
      });
    } else {
      logger.error('broadcastUpdate function not available');
      res.status(500).json({
        success: false,
        error: 'WebSocket server not initialized',
      });
    }
  } catch (error) {
    logger.error('Broadcast error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/internal/health
 * Internal health check with detailed info
 */
router.get('/health', verifyInternalSecret, (req, res) => {
  res.json({
    success: true,
    data: {
      environment: config.nodeEnv,
      websocket: typeof global.broadcastUpdate === 'function',
      bot: !!global.botInstance,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /api/internal/auth/bot-register
 * Authenticate user from Telegram Bot (not WebApp)
 * Uses INTERNAL_SECRET for security instead of initData
 *
 * Headers: { x-internal-secret: string }
 * Body: { telegramId: number, username?: string, firstName?: string, lastName?: string }
 *
 * Returns: { token: string, user: object }
 */
router.post('/auth/bot-register', verifyInternalSecret, async (req, res) => {
  try {
    const { telegramId, username, firstName, lastName } = req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'telegramId is required',
      });
    }

    // Check if user exists
    let user = await userQueries.findByTelegramId(telegramId);
    let isNewUser = false;

    if (!user) {
      // Create new user
      user = await userQueries.create({
        telegramId,
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
      });
      isNewUser = true;
      logger.info(`[Internal] New user registered via bot: ${telegramId} (@${username})`);
    } else {
      logger.info(`[Internal] Existing user authenticated via bot: ${telegramId} (@${username})`);
    }

    // Generate JWT token (explicit algorithm to prevent algorithm confusion attacks)
    const token = jwt.sign(
      {
        id: user.id,
        telegram_id: Number(user.telegram_id),
        username: user.username,
        jti: crypto.randomBytes(16).toString('hex'),
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn, algorithm: 'HS256' }
    );

    res.status(isNewUser ? 201 : 200).json({
      success: true,
      token,
      user: {
        id: user.id,
        telegram_id: Number(user.telegram_id),
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        selected_role: user.selected_role,
        language: user.language || null, // FIX: Don't default - let bot show language selection
        created_at: user.created_at,
      },
    });
  } catch (error) {
    logger.error('[Internal] Bot auth error:', {
      error: error.message,
      telegramId: req.body.telegramId,
    });

    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      details: error.message,
    });
  }
});

/**
 * GET /api/internal/subscriptions/:telegramId
 * Get user subscriptions by telegram_id (for bot)
 *
 * Headers: { x-internal-secret: string }
 * Returns: { success: true, data: [...subscriptions] }
 */
router.get('/subscriptions/:telegramId', verifyInternalSecret, async (req, res) => {
  try {
    const { telegramId } = req.params;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'telegramId is required',
      });
    }

    // Find user by telegram_id
    const user = await userQueries.findByTelegramId(telegramId);

    if (!user) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Get subscriptions from subscriptions table (buyer subscriptions)
    const { query } = await import('../config/database.js');
    const result = await query(
      `SELECT
         sub.id,
         sub.shop_id,
         s.name as shop_name,
         s.logo as shop_logo,
         s.description as shop_description,
         sub.created_at
       FROM subscriptions sub
       LEFT JOIN shops s ON sub.shop_id = s.id
       WHERE sub.user_id = $1
       ORDER BY sub.created_at DESC`,
      [user.id]
    );

    logger.info('[Internal] User subscriptions fetched', {
      telegramId,
      userId: user.id,
      count: result.rows.length,
    });

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error('[Internal] Get subscriptions error:', {
      error: error.message,
      telegramId: req.params.telegramId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get subscriptions',
      details: error.message,
    });
  }
});

/**
 * POST /api/internal/admin/recover-subscription/:subscriptionId
 * Manually create shop for paid subscription (admin recovery tool)
 *
 * Use case: When payment confirmed but shop creation failed (JWT expired, etc.)
 * Headers: { x-internal-secret: string }
 *
 * Example: curl -X POST http://localhost:3000/api/internal/admin/recover-subscription/14 \
 *   -H "x-internal-secret: YOUR_SECRET"
 */
router.post('/admin/recover-subscription/:subscriptionId', verifyInternalSecret, async (req, res) => {
  const { subscriptionId } = req.params;
  const { query, getClient } = await import('../config/database.js');

  try {
    logger.info('[Admin] Recovery attempt for subscription', { subscriptionId });

    // Get paid subscription without shop
    const subscription = await query(
      `SELECT ss.*, u.telegram_id, u.username
       FROM shop_subscriptions ss
       JOIN users u ON ss.user_id = u.id
       WHERE ss.id = $1 AND ss.status IN ('paid', 'active') AND ss.shop_id IS NULL`,
      [subscriptionId]
    );

    if (subscription.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found, already linked to shop, or not paid',
        hint: 'Only paid/active subscriptions without shop can be recovered',
      });
    }

    const sub = subscription.rows[0];

    // Check if user already has an active shop
    const existingShop = await query(
      `SELECT id, name FROM shops WHERE owner_id = $1 AND is_active = true LIMIT 1`,
      [sub.user_id]
    );

    if (existingShop.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User already has an active shop',
        existingShop: existingShop.rows[0],
      });
    }

    // Create shop with auto-generated name
    const shopName = `Shop_${sub.username || sub.telegram_id}_${Date.now()}`;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Create shop
      const shopResult = await client.query(
        `INSERT INTO shops (name, owner_id, tier, subscription_status, registration_paid, is_active)
         VALUES ($1, $2, $3, 'active', true, true)
         RETURNING id, name, tier`,
        [shopName, sub.user_id, sub.tier]
      );

      const newShop = shopResult.rows[0];

      // Calculate subscription period
      const periodStart = new Date();
      const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Link subscription to shop
      await client.query(
        `UPDATE shop_subscriptions
         SET shop_id = $1,
             status = 'active',
             period_start = $2,
             period_end = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [newShop.id, periodStart, periodEnd, subscriptionId]
      );

      // Update shop with payment due date
      await client.query(
        `UPDATE shops
         SET next_payment_due = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [periodEnd, newShop.id]
      );

      await client.query('COMMIT');

      logger.info('[Admin] Subscription recovered successfully', {
        subscriptionId,
        shopId: newShop.id,
        shopName: newShop.name,
        userId: sub.user_id,
      });

      res.json({
        success: true,
        message: 'Shop created and subscription activated',
        data: {
          subscriptionId: parseInt(subscriptionId),
          shopId: newShop.id,
          shopName: newShop.name,
          tier: newShop.tier,
          userId: sub.user_id,
          periodStart,
          periodEnd,
        },
      });
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('[Admin] Subscription recovery failed:', {
      error: error.message,
      subscriptionId,
    });

    res.status(500).json({
      success: false,
      error: 'Recovery failed',
      details: error.message,
    });
  }
});

export default router;
