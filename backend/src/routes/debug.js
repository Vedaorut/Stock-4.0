/**
 * Debug Routes
 *
 * Development endpoints for debugging invoice and subscription issues.
 * Protected by authentication middleware AND ownership verification.
 *
 * Endpoints:
 * - GET /api/debug/invoice/:id - Detailed invoice inspection (owner only)
 * - GET /api/debug/subscription/:id/invoices - All invoices for a subscription (owner only)
 * - GET /api/debug/shop/:id/subscription - Shop subscription status (owner only)
 *
 * SECURITY:
 * - Requires BOTH conditions to be true:
 *   1. NODE_ENV !== 'production'
 *   2. DEBUG_ENDPOINTS_ENABLED === 'true' (explicit opt-in)
 * - If either condition is false, returns 404 for all requests
 * - Requires authentication (JWT token)
 * - Requires ownership verification (user must own the shop)
 */

import express from 'express';
import { query } from '../config/database.js';
import auth from '../middleware/auth.js';
const { verifyToken: authenticateToken } = auth;
import logger from '../utils/logger.js';
import { subscriptionQueries } from '../database/queries/subscriptionQueries.js';
import { shopQueries } from '../database/queries/shopQueries.js';
// Note: invoiceQueries not imported - we use direct query() for invoice ownership check
// to avoid extra JOIN in the main query

const router = express.Router();

// ============================================
// STRICT DEBUG PROTECTION
// Debug endpoints are ONLY available when:
// 1. NODE_ENV is NOT 'production'
// 2. DEBUG_ENDPOINTS_ENABLED is explicitly set to 'true'
// ============================================
const isDebugEnabled = process.env.NODE_ENV !== 'production' &&
                       process.env.DEBUG_ENDPOINTS_ENABLED === 'true';

if (!isDebugEnabled) {
  router.all('*', (req, res) => {
    // Log attempts in non-production environments for debugging
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[Debug] Debug endpoints disabled. Set DEBUG_ENDPOINTS_ENABLED=true to enable.', {
        path: req.path,
        method: req.method,
        nodeEnv: process.env.NODE_ENV,
        debugEnabled: process.env.DEBUG_ENDPOINTS_ENABLED,
      });
    } else {
      logger.warn('[Debug] Attempt to access debug endpoints in production', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }
    return res.status(404).json({ error: 'Not Found' });
  });
}

// ============================================
// Helper: Get owner_id from invoice via subscription -> shop chain
// ============================================
async function getInvoiceOwnerId(invoiceId) {
  const result = await query(
    `SELECT s.owner_id
     FROM invoices i
     JOIN shop_subscriptions ss ON i.subscription_id = ss.id
     JOIN shops s ON ss.shop_id = s.id
     WHERE i.id = $1`,
    [invoiceId]
  );
  return result.rows[0]?.owner_id || null;
}

// ============================================
// Helper: Get owner_id from shop_subscription via shop
// ============================================
async function getSubscriptionOwnerId(subscriptionId) {
  const subscription = await subscriptionQueries.findShopSubscriptionById(subscriptionId);
  return subscription?.owner_id || null;
}

// ============================================
// Helper: Get owner_id from shop
// ============================================
async function getShopOwnerId(shopId) {
  const shop = await shopQueries.findById(shopId);
  return shop?.owner_id || null;
}

// ============================================
// Helper: Log unauthorized access attempt
// ============================================
function logUnauthorizedAccess(endpoint, resourceId, userId, ownerId) {
  logger.warn('[Debug] Unauthorized access attempt (IDOR blocked)', {
    endpoint,
    resourceId,
    attemptedByUserId: userId,
    actualOwnerId: ownerId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/debug/invoice/:id
 * Get detailed invoice information for debugging
 * 
 * Returns:
 * - Full invoice details from database
 * - Related subscription information
 * - Related shop information
 * - Validation checks (is active, time until expiry, etc.)
 * - Server configuration (timezone, environment)
 * 
 * Use case: Debug why invoice is not being found or processed
 */
router.get('/invoice/:id', authenticateToken, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);

    if (isNaN(invoiceId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid invoice ID - must be a number',
        invoiceId: req.params.id
      });
    }

    // SECURITY: Verify ownership before returning data
    const ownerId = await getInvoiceOwnerId(invoiceId);
    
    if (!ownerId) {
      return res.status(404).json({ 
        success: false,
        error: 'Invoice not found', 
        invoiceId 
      });
    }

    if (ownerId !== req.user.id) {
      logUnauthorizedAccess('/invoice/:id', invoiceId, req.user.id, ownerId);
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only debug your own invoices.',
      });
    }

    // Get invoice details with related subscription and shop info
    const invoiceResult = await query(
      `SELECT 
        i.*,
        ss.status as subscription_status,
        ss.tier as subscription_tier,
        ss.period_start as subscription_period_start,
        ss.period_end as subscription_period_end,
        s.name as shop_name,
        s.tier as shop_tier,
        s.is_active as shop_is_active,
        s.subscription_status as shop_subscription_status,
        NOW() as current_server_time,
        (i.expires_at > NOW()) as is_active_by_time,
        EXTRACT(EPOCH FROM (i.expires_at - NOW())) as seconds_until_expiry,
        EXTRACT(EPOCH FROM (NOW() - i.created_at)) as invoice_age_seconds
      FROM invoices i
      LEFT JOIN shop_subscriptions ss ON i.subscription_id = ss.id
      LEFT JOIN shops s ON ss.shop_id = s.id
      WHERE i.id = $1`,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Invoice not found', 
        invoiceId 
      });
    }

    const invoice = invoiceResult.rows[0];

    // Perform validation checks
    const checks = {
      hasSubscriptionId: invoice.subscription_id !== null,
      hasOrderId: invoice.order_id !== null,
      invoiceType: invoice.subscription_id ? 'subscription' : (invoice.order_id ? 'order' : 'unknown'),
      statusIsPending: invoice.status === 'pending',
      statusIsPaid: invoice.status === 'paid',
      statusIsExpired: invoice.status === 'expired',
      isActiveByTime: invoice.is_active_by_time,
      expiresAt: invoice.expires_at,
      currentTime: invoice.current_server_time,
      secondsUntilExpiry: parseFloat(invoice.seconds_until_expiry),
      invoiceAgeSeconds: parseFloat(invoice.invoice_age_seconds),
      isExpiredByTime: invoice.expires_at < invoice.current_server_time,
      wouldBeFoundByActiveQuery: 
        invoice.subscription_id !== null &&
        invoice.status === 'pending' &&
        invoice.is_active_by_time,
      hasWebhook: invoice.tatum_subscription_id !== null,
      blockchainChain: invoice.chain,
      expectedAmount: invoice.expected_amount,
      cryptoAmount: invoice.crypto_amount,
      currency: invoice.currency,
    };

    // Human-readable status
    let statusExplanation = '';
    if (checks.statusIsPaid) {
      statusExplanation = 'Invoice has been paid successfully';
    } else if (checks.statusIsExpired) {
      statusExplanation = 'Invoice has expired';
    } else if (checks.statusIsPending && checks.isActiveByTime) {
      statusExplanation = 'Invoice is active and waiting for payment';
    } else if (checks.statusIsPending && !checks.isActiveByTime) {
      statusExplanation = 'Invoice is pending but expired by time';
    } else {
      statusExplanation = `Invoice status: ${invoice.status}`;
    }

    logger.info('[Debug] Invoice inspection', {
      invoiceId,
      userId: req.user.id,
      checks,
      status: invoice.status,
    });

    res.json({
      success: true,
      invoice,
      checks,
      statusExplanation,
      debug: {
        timezone: process.env.TZ || 'system default',
        nodeEnv: process.env.NODE_ENV,
        databaseTimezone: 'UTC (default PostgreSQL)',
        requestTimestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('[Debug] Error inspecting invoice:', {
      error: error.message,
      stack: error.stack,
      invoiceId: req.params.id,
      userId: req.user?.id,
    });
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/debug/subscription/:id/invoices
 * List all invoices for a subscription
 * 
 * Returns:
 * - All invoices (pending, paid, expired) for this subscription
 * - Sorted by creation date (newest first)
 * - Includes validity period calculation
 * 
 * Use case: Debug subscription payment history and invoice lifecycle
 */
router.get('/subscription/:id/invoices', authenticateToken, async (req, res) => {
  try {
    const subscriptionId = parseInt(req.params.id, 10);

    if (isNaN(subscriptionId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid subscription ID - must be a number',
        subscriptionId: req.params.id
      });
    }

    // SECURITY: Verify ownership before returning data
    const ownerId = await getSubscriptionOwnerId(subscriptionId);
    
    if (!ownerId) {
      return res.status(404).json({ 
        success: false,
        error: 'Subscription not found', 
        subscriptionId 
      });
    }

    if (ownerId !== req.user.id) {
      logUnauthorizedAccess('/subscription/:id/invoices', subscriptionId, req.user.id, ownerId);
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only debug your own subscriptions.',
      });
    }

    // Get all invoices for this subscription
    const result = await query(
      `SELECT 
        id,
        chain,
        address,
        expected_amount,
        crypto_amount,
        usd_rate,
        currency,
        status,
        expires_at,
        created_at,
        updated_at,
        tatum_subscription_id,
        (expires_at > NOW()) as is_active,
        EXTRACT(EPOCH FROM (expires_at - created_at)) as validity_period_seconds,
        EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry
      FROM invoices
      WHERE subscription_id = $1
      ORDER BY created_at DESC`,
      [subscriptionId]
    );

    // Get subscription details
    const subscriptionResult = await query(
      `SELECT 
        ss.*,
        s.name as shop_name,
        s.tier as shop_tier,
        s.is_active as shop_is_active
      FROM shop_subscriptions ss
      LEFT JOIN shops s ON ss.shop_id = s.id
      WHERE ss.id = $1`,
      [subscriptionId]
    );

    const subscription = subscriptionResult.rows[0] || null;

    logger.info('[Debug] Subscription invoices listed', {
      subscriptionId,
      userId: req.user.id,
      invoiceCount: result.rows.length,
    });

    res.json({
      success: true,
      subscriptionId,
      subscription,
      count: result.rows.length,
      invoices: result.rows,
      summary: {
        pending: result.rows.filter(inv => inv.status === 'pending').length,
        paid: result.rows.filter(inv => inv.status === 'paid').length,
        expired: result.rows.filter(inv => inv.status === 'expired').length,
        active: result.rows.filter(inv => inv.is_active && inv.status === 'pending').length,
      },
    });
  } catch (error) {
    logger.error('[Debug] Error listing subscription invoices:', {
      error: error.message,
      stack: error.stack,
      subscriptionId: req.params.id,
      userId: req.user?.id,
    });
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/debug/shop/:id/subscription
 * Get shop subscription status and related invoices
 * 
 * Returns:
 * - Shop details
 * - Current subscription status
 * - All subscription records
 * - All invoices for this shop's subscriptions
 * 
 * Use case: Complete overview of shop's subscription state
 */
router.get('/shop/:id/subscription', authenticateToken, async (req, res) => {
  try {
    const shopId = parseInt(req.params.id, 10);

    if (isNaN(shopId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid shop ID - must be a number',
        shopId: req.params.id
      });
    }

    // SECURITY: Verify ownership before returning data
    const ownerId = await getShopOwnerId(shopId);
    
    if (!ownerId) {
      return res.status(404).json({ 
        success: false,
        error: 'Shop not found', 
        shopId 
      });
    }

    if (ownerId !== req.user.id) {
      logUnauthorizedAccess('/shop/:id/subscription', shopId, req.user.id, ownerId);
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only debug your own shops.',
      });
    }

    // Get shop details
    const shopResult = await query(
      `SELECT 
        id,
        name,
        tier,
        is_active,
        subscription_status,
        next_payment_due,
        grace_period_until,
        registration_paid,
        created_at
      FROM shops
      WHERE id = $1`,
      [shopId]
    );

    if (shopResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Shop not found', 
        shopId 
      });
    }

    const shop = shopResult.rows[0];

    // Get all subscriptions for this shop
    const subscriptionsResult = await query(
      `SELECT * FROM shop_subscriptions
       WHERE shop_id = $1
       ORDER BY created_at DESC`,
      [shopId]
    );

    // Get all invoices related to this shop's subscriptions
    const invoicesResult = await query(
      `SELECT 
        i.*,
        ss.tier as subscription_tier,
        (i.expires_at > NOW()) as is_active
      FROM invoices i
      JOIN shop_subscriptions ss ON i.subscription_id = ss.id
      WHERE ss.shop_id = $1
      ORDER BY i.created_at DESC`,
      [shopId]
    );

    logger.info('[Debug] Shop subscription status retrieved', {
      shopId,
      userId: req.user.id,
      shopTier: shop.tier,
      subscriptionCount: subscriptionsResult.rows.length,
      invoiceCount: invoicesResult.rows.length,
    });

    res.json({
      success: true,
      shop,
      subscriptions: {
        count: subscriptionsResult.rows.length,
        records: subscriptionsResult.rows,
        summary: {
          active: subscriptionsResult.rows.filter(s => s.status === 'active').length,
          expired: subscriptionsResult.rows.filter(s => s.status === 'expired').length,
          cancelled: subscriptionsResult.rows.filter(s => s.status === 'cancelled').length,
        },
      },
      invoices: {
        count: invoicesResult.rows.length,
        records: invoicesResult.rows,
        summary: {
          pending: invoicesResult.rows.filter(inv => inv.status === 'pending').length,
          paid: invoicesResult.rows.filter(inv => inv.status === 'paid').length,
          expired: invoicesResult.rows.filter(inv => inv.status === 'expired').length,
          active: invoicesResult.rows.filter(inv => inv.is_active && inv.status === 'pending').length,
        },
      },
    });
  } catch (error) {
    logger.error('[Debug] Error getting shop subscription status:', {
      error: error.message,
      stack: error.stack,
      shopId: req.params.id,
      userId: req.user?.id,
    });
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
