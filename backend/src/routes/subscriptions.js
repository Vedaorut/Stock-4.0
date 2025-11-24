/**
 * Subscription Routes
 *
 * Defines API endpoints for shop subscription management
 */

import express from 'express';
import * as subscriptionController from '../controllers/subscriptionController.js';
import { verifyToken } from '../middleware/auth.js';
import { subscriptionCreationLimiter } from '../middleware/rateLimiter.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * All subscription routes require authentication
 */
router.use(verifyToken);

/**
 * POST /api/subscriptions/pending
 * Create pending subscription for first-time shop creation
 *
 * Body: {
 *   tier: 'basic' | 'pro'
 * }
 *
 * @security Rate limited to 5 req/hour
 */
router.post(
  '/pending',
  subscriptionCreationLimiter,
  subscriptionController.createPendingSubscription
);

/**
 * GET /api/subscriptions/check/:shopId
 * Check if user has active subscription to shop (buyer view)
 *
 * Returns: { data: { subscribed: boolean, subscription: object|null } }
 */
router.get('/check/:shopId', subscriptionController.checkSubscription);

/**
 * GET /api/subscriptions
 * Get user subscriptions (buyer view)
 *
 * Returns all shops the user is subscribed to
 */
router.get('/', subscriptionController.getUserSubscriptions);

/**
 * GET /api/subscriptions/my-shops
 * Get shop subscriptions for current user's shops (seller view)
 *
 * Returns payment subscriptions (basic/pro tier) for shops owned by user
 */
router.get('/my-shops', subscriptionController.getMyShopSubscriptions);

/**
 * POST /api/subscriptions/pay
 * Pay for monthly subscription (renewal or new)
 *
 * Body: {
 *   shopId: number,
 *   tier: 'basic' | 'pro',
 *   txHash: string,
 *   currency: 'BTC' | 'ETH' | 'USDT' | 'LTC',
 *   paymentAddress: string
 * }
 *
 * @security Rate limited to 5 req/hour
 */
router.post('/pay', subscriptionCreationLimiter, (req, res, next) => {
  logger.warn('[DEPRECATED] /subscriptions/pay endpoint is deprecated. Use /subscriptions/:id/payment/generate + /subscriptions/:id/payment/confirm instead.', {
    userId: req.userId,
    ip: req.ip,
  });
  res.set('X-Deprecation-Warning', 'This endpoint is deprecated. Use invoice flow instead.');
  next();
}, subscriptionController.paySubscription);

/**
 * POST /api/subscriptions/upgrade
 * Upgrade shop from free to PRO tier
 *
 * Body: {
 *   shopId: number,
 *   txHash: string,
 *   currency: 'BTC' | 'ETH' | 'USDT' | 'LTC',
 *   paymentAddress: string
 * }
 *
 * @security Rate limited to 5 req/hour
 */
router.post('/upgrade', subscriptionCreationLimiter, (req, res, next) => {
  logger.warn('[DEPRECATED] /subscriptions/upgrade endpoint is deprecated. Use /subscriptions/:id/upgrade/payment/generate + /subscriptions/:id/upgrade/payment/confirm instead.', {
    userId: req.userId,
    ip: req.ip,
  });
  res.set('X-Deprecation-Warning', 'This endpoint is deprecated. Use invoice flow instead.');
  next();
}, subscriptionController.upgradeShop);

/**
 * GET /api/subscriptions/upgrade-cost/:shopId
 * Calculate prorated upgrade cost for shop
 */
router.get('/upgrade-cost/:shopId', subscriptionController.getUpgradeCost);

/**
 * GET /api/subscriptions/status/:shopId
 * Get subscription status for shop
 */
router.get('/status/:shopId', subscriptionController.getStatus);

/**
 * GET /api/subscriptions/history/:shopId?limit=10
 * Get subscription payment history for shop
 */
router.get('/history/:shopId', subscriptionController.getHistory);

/**
 * GET /api/subscriptions/pricing
 * Get subscription pricing information (free vs pro)
 */
router.get('/pricing', subscriptionController.getPricing);

/**
 * POST /api/subscriptions/:id/payment/generate
 * Generate payment invoice for subscription
 *
 * Body: {
 *   chain: 'BTC' | 'LTC' | 'ETH' | 'USDT_TRC20'
 * }
 */
router.post('/:id/payment/generate', subscriptionController.generatePaymentInvoice);

/**
 * POST /api/subscriptions/:id/upgrade/payment/generate
 * Generate upgrade invoice for active subscription
 */
router.post(
  '/:id/upgrade/payment/generate',
  subscriptionController.generateUpgradePaymentInvoice
);

/**
 * GET /api/subscriptions/:id/payment/status
 * Get payment status for subscription invoice
 */
router.get('/:id/payment/status', subscriptionController.getPaymentStatus);

/**
 * GET /api/subscriptions/:id/upgrade/payment/status
 * Get upgrade payment status for subscription invoice
 */
router.get('/:id/upgrade/payment/status', subscriptionController.getUpgradePaymentStatus);

/**
 * POST /api/subscriptions/:id/payment/confirm
 * Manually confirm payment by tx hash (on-chain verification)
 */
router.post('/:id/payment/confirm', subscriptionController.confirmPaymentWithTxHash);

/**
 * POST /api/subscriptions/:id/upgrade/payment/confirm
 * Manually confirm upgrade payment by tx hash
 */
router.post('/:id/upgrade/payment/confirm', subscriptionController.confirmUpgradePaymentWithTxHash);

export default router;
