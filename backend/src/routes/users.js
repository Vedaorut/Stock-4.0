import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { shopSubscriberController } from '../controllers/shopSubscriberController.js';
import { userQueries } from '../database/queries/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * @route   GET /api/users/subscriptions
 * @desc    Get current user's shop subscriptions
 * @access  Private
 */
router.get('/subscriptions', verifyToken, shopSubscriberController.getMySubscriptions);

/**
 * @route   PUT /api/users/onboarding-completed
 * @desc    Mark user's onboarding as completed
 * @access  Private
 */
router.put('/onboarding-completed', verifyToken, async (req, res) => {
  try {
    const user = await userQueries.markOnboardingCompleted(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    logger.info('Onboarding completed', { userId: req.user.id });

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error('Failed to mark onboarding completed', {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to update onboarding status',
    });
  }
});

export default router;
