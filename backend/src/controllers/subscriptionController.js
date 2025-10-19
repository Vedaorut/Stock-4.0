import { subscriptionQueries, shopQueries } from '../models/db.js';
import logger from '../utils/logger.js';

/**
 * Subscription Controller
 */
export const subscriptionController = {
  /**
   * Subscribe to a shop
   */
  subscribe: async (req, res) => {
    try {
      const { shopId } = req.body;

      // Check if shop exists
      const shop = await shopQueries.findById(shopId);

      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      if (!shop.is_active) {
        return res.status(400).json({
          success: false,
          error: 'Shop is not active'
        });
      }

      // Check if user is subscribing to their own shop
      if (shop.owner_id === req.user.id) {
        return res.status(400).json({
          success: false,
          error: 'Cannot subscribe to your own shop'
        });
      }

      // Create subscription
      const subscription = await subscriptionQueries.create(req.user.id, shopId);

      if (!subscription) {
        return res.status(400).json({
          success: false,
          error: 'Already subscribed to this shop'
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Successfully subscribed to shop',
        data: subscription
      });

    } catch (error) {
      logger.error('Subscribe error:', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to subscribe'
      });
    }
  },

  /**
   * Get current user's subscriptions
   */
  getMySubscriptions: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const subscriptions = await subscriptionQueries.findByUserId(
        req.user.id,
        limit,
        offset
      );

      return res.status(200).json({
        success: true,
        data: subscriptions,
        pagination: {
          page,
          limit,
          total: subscriptions.length
        }
      });

    } catch (error) {
      logger.error('Get subscriptions error:', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get subscriptions'
      });
    }
  },

  /**
   * Get shop subscribers (shop owner only)
   */
  getShopSubscribers: async (req, res) => {
    try {
      const { shopId } = req.params;

      // Check if shop exists and belongs to user
      const shop = await shopQueries.findById(shopId);

      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      if (shop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only view your own shop subscribers'
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const subscribers = await subscriptionQueries.findByShopId(
        shopId,
        limit,
        offset
      );

      const count = await subscriptionQueries.countByShopId(shopId);

      return res.status(200).json({
        success: true,
        data: subscribers,
        pagination: {
          page,
          limit,
          total: count
        }
      });

    } catch (error) {
      logger.error('Get shop subscribers error:', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get shop subscribers'
      });
    }
  },

  /**
   * Unsubscribe from a shop
   */
  unsubscribe: async (req, res) => {
    try {
      const { shopId } = req.params;

      const subscription = await subscriptionQueries.delete(req.user.id, parseInt(shopId));

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'Subscription not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Successfully unsubscribed from shop'
      });

    } catch (error) {
      logger.error('Unsubscribe error:', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to unsubscribe'
      });
    }
  },

  /**
   * Check subscription status
   */
  checkSubscription: async (req, res) => {
    try {
      const { shopId } = req.params;

      const exists = await subscriptionQueries.exists(req.user.id, parseInt(shopId));

      return res.status(200).json({
        success: true,
        data: {
          subscribed: exists
        }
      });

    } catch (error) {
      logger.error('Check subscription error:', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to check subscription'
      });
    }
  }
};

export default subscriptionController;
