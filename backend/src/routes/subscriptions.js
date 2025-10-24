/**
 * Subscription Routes
 * 
 * Defines API endpoints for shop subscription management
 */

import express from 'express';
import * as subscriptionController from '../controllers/subscriptionController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * All subscription routes require authentication
 */
router.use(verifyToken);

/**
 * GET /api/subscriptions
 * Get user subscriptions (buyer view)
 *
 * Returns all shops the user is subscribed to
 */
router.get('/', subscriptionController.getUserSubscriptions);

/**
 * POST /api/subscriptions/pay
 * Pay for monthly subscription (renewal or new)
 *
 * Body: {
 *   shopId: number,
 *   tier: 'free' | 'pro',
 *   txHash: string,
 *   currency: 'BTC' | 'ETH' | 'USDT' | 'TON',
 *   paymentAddress: string
 * }
 */
router.post('/pay', subscriptionController.paySubscription);

/**
 * POST /api/subscriptions/upgrade
 * Upgrade shop from free to PRO tier
 * 
 * Body: {
 *   shopId: number,
 *   txHash: string,
 *   currency: 'BTC' | 'ETH' | 'USDT' | 'TON',
 *   paymentAddress: string
 * }
 */
router.post('/upgrade', subscriptionController.upgradeShop);

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

export default router;
