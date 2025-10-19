import express from 'express';
import { subscriptionController } from '../controllers/subscriptionController.js';
import { verifyToken } from '../middleware/auth.js';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validation.js';

const router = express.Router();

/**
 * @route   POST /api/subscriptions
 * @desc    Subscribe to a shop
 * @access  Private
 */
router.post(
  '/',
  verifyToken,
  [
    body('shopId')
      .isInt({ min: 1 })
      .withMessage('Valid shop ID is required'),
    validate
  ],
  subscriptionController.subscribe
);

/**
 * @route   GET /api/subscriptions
 * @desc    Get current user's subscriptions
 * @access  Private
 */
router.get(
  '/',
  verifyToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    validate
  ],
  subscriptionController.getMySubscriptions
);

/**
 * @route   GET /api/subscriptions/shop/:shopId
 * @desc    Get shop subscribers (shop owner only)
 * @access  Private
 */
router.get(
  '/shop/:shopId',
  verifyToken,
  [
    param('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    validate
  ],
  subscriptionController.getShopSubscribers
);

/**
 * @route   GET /api/subscriptions/check/:shopId
 * @desc    Check if user is subscribed to shop
 * @access  Private
 */
router.get(
  '/check/:shopId',
  verifyToken,
  [
    param('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    validate
  ],
  subscriptionController.checkSubscription
);

/**
 * @route   DELETE /api/subscriptions/:shopId
 * @desc    Unsubscribe from a shop
 * @access  Private
 */
router.delete(
  '/:shopId',
  verifyToken,
  [
    param('shopId').isInt({ min: 1 }).withMessage('Valid shop ID is required'),
    validate
  ],
  subscriptionController.unsubscribe
);

export default router;
