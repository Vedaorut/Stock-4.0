import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import telegramService from '../services/telegram.js';
import { userQueries } from '../database/queries/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Valid feedback categories
 */
const VALID_CATEGORIES = [
  'Bug Report',
  'Feature Request',
  'General Feedback',
  'Payment Issue',
  'Other',
];

/**
 * @route   POST /api/feedback
 * @desc    Submit feedback to admin via Telegram
 * @access  Private (requires authentication)
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { category, message } = req.body;

    // Validate required fields
    if (!category || !message) {
      return res.status(400).json({
        success: false,
        error: 'Category and message are required',
      });
    }

    // Validate category
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Valid categories: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    // Validate message length
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 10 characters long',
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message must not exceed 2000 characters',
      });
    }

    // Get full user data for the feedback
    const user = await userQueries.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Send feedback to admin
    await telegramService.sendFeedbackToAdmin({
      category,
      message,
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });

    logger.info('Feedback submitted', {
      userId: req.user.id,
      category,
      messageLength: message.length,
    });

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
    });
  } catch (error) {
    logger.error('Failed to submit feedback', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback. Please try again later.',
    });
  }
});

/**
 * @route   GET /api/feedback/categories
 * @desc    Get list of valid feedback categories
 * @access  Private
 */
router.get('/categories', verifyToken, (req, res) => {
  res.json({
    success: true,
    data: VALID_CATEGORIES,
  });
});

export default router;
