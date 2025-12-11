import { handleProductAI, resolveUserShop } from '../services/aiProductService.js';
import { aiCostService } from '../services/aiCostService.js';
import logger from '../utils/logger.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';

export const aiProductController = {
  async chat(req, res) {
    try {
      const { message, history = [], shopId } = req.body || {};

      if (!message || typeof message !== 'string') {
        throw new ValidationError('Введите сообщение для AI.');
      }

      const shop = await resolveUserShop(req.user.id, shopId);
      if (!shop) {
        throw new UnauthorizedError('Магазин не найден или доступ запрещён.');
      }

      const result = await handleProductAI({
        shop,
        message,
        history,
        userId: req.user.id,
      });

      return res.status(200).json({
        success: true,
        data: {
          reply: result.reply,
          history: result.history,
          operations: result.operations,
          productsChanged: result.productsChanged,
          aiUsage: result.aiUsage,
        },
      });
    } catch (error) {
      // Handle AI cost limit error with specific status code
      if (error.name === 'AICostLimitError') {
        logger.warn('AI cost limit exceeded:', {
          userId: req.user?.id,
          error: error.message,
          details: error.details,
        });
        return res.status(429).json({
          success: false,
          error: error.message,
          code: error.code,
          details: error.details,
        });
      }

      logger.error('AI chat error:', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        error: error.message || 'Не удалось обработать запрос AI.',
      });
    }
  },

  /**
   * Get current AI usage stats for user
   */
  async getUsage(req, res) {
    try {
      const usage = await aiCostService.getDailyUsage(req.user.id);
      return res.status(200).json({
        success: true,
        data: usage,
      });
    } catch (error) {
      logger.error('Error getting AI usage:', {
        userId: req.user?.id,
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        error: 'Не удалось получить статистику AI.',
      });
    }
  },
};

export default aiProductController;
