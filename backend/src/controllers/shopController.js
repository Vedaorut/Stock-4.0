import { shopQueries } from '../models/db.js';
import logger from '../utils/logger.js';

/**
 * Shop Controller
 */
export const shopController = {
  /**
   * Create new shop
   * Any user can create a shop - they become a seller by creating one
   */
  create: async (req, res) => {
    try {
      const { name, description, logo } = req.body;

      const shop = await shopQueries.create({
        ownerId: req.user.id,
        name,
        description,
        logo
      });

      return res.status(201).json({
        success: true,
        data: shop
      });

    } catch (error) {
      logger.error('Create shop error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to create shop'
      });
    }
  },

  /**
   * Get shop by ID
   */
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      const shop = await shopQueries.findById(id);

      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: shop
      });

    } catch (error) {
      logger.error('Get shop error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get shop'
      });
    }
  },

  /**
   * Get shops by seller (current user)
   * Any user can check if they have shops - having a shop makes them a seller
   */
  getMyShops: async (req, res) => {
    try {
      const shops = await shopQueries.findByOwnerId(req.user.id);

      return res.status(200).json({
        success: true,
        data: shops
      });

    } catch (error) {
      logger.error('Get my shops error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get shops'
      });
    }
  },

  /**
   * Update shop
   */
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, logo, isActive } = req.body;

      // Check if shop exists and belongs to user
      const existingShop = await shopQueries.findById(id);

      if (!existingShop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      if (existingShop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only update your own shops'
        });
      }

      const shop = await shopQueries.update(id, {
        name,
        description,
        logo,
        isActive
      });

      return res.status(200).json({
        success: true,
        data: shop
      });

    } catch (error) {
      logger.error('Update shop error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update shop'
      });
    }
  },

  /**
   * Delete shop
   */
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if shop exists and belongs to user
      const existingShop = await shopQueries.findById(id);

      if (!existingShop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      if (existingShop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only delete your own shops'
        });
      }

      await shopQueries.delete(id);

      return res.status(200).json({
        success: true,
        message: 'Shop deleted successfully'
      });

    } catch (error) {
      logger.error('Delete shop error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete shop'
      });
    }
  },

  /**
   * List all active shops
   */
  listActive: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const shops = await shopQueries.listActive(limit, offset);

      return res.status(200).json({
        success: true,
        data: shops,
        pagination: {
          page,
          limit,
          total: shops.length
        }
      });

    } catch (error) {
      logger.error('List shops error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to list shops'
      });
    }
  }
};

export default shopController;
