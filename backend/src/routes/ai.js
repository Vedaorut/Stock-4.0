import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { aiProductController } from '../controllers/aiProductController.js';
import { aiRequestLimiter } from '../middleware/rateLimiter.js';
import { aiValidation } from '../middleware/validation.js';

const router = express.Router();

/**
 * @route   POST /api/ai/products/chat
 * @desc    Chat with AI for product management
 * @access  Private (Shop owner only - verified in controller)
 * @security Rate limited to 10 req/hour, max 1000 chars per message
 * @note    Daily cost limit of $5/user enforced in service layer
 */
router.post(
  '/products/chat',
  verifyToken,
  aiRequestLimiter,
  aiValidation.chat,
  aiProductController.chat
);

/**
 * @route   GET /api/ai/usage
 * @desc    Get current AI usage stats for authenticated user
 * @access  Private
 * @returns {Object} Daily cost, limit, remaining, token counts
 */
router.get(
  '/usage',
  verifyToken,
  aiProductController.getUsage
);

export default router;
