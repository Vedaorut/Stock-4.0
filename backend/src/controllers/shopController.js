import { shopQueries } from '../models/db.js';
import { dbErrorHandler } from '../middleware/errorHandler.js';
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
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

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
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

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
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

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
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

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
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

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
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

      logger.error('List shops error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to list shops'
      });
    }
  },

  /**
   * Search active shops by name
   */
  search: async (req, res) => {
    try {
      const term = (req.query.q || req.query.query || '').trim();

      if (term.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters long'
        });
      }

      const limit = parseInt(req.query.limit, 10) || 10;
      const shops = await shopQueries.searchByName(
        term,
        limit,
        req.user?.id ?? null
      );

      return res.status(200).json({
        success: true,
        data: shops
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

      logger.error('Search shops error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to search shops'
      });
    }
  },

  /**
   * Get shop wallets
   */
  getWallets: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if shop exists and belongs to user
      const shop = await shopQueries.findById(id);

      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      if (shop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own shop wallets'
        });
      }

      // Return wallet data
      return res.status(200).json({
        success: true,
        data: {
          wallet_btc: shop.wallet_btc || null,
          wallet_eth: shop.wallet_eth || null,
          wallet_usdt: shop.wallet_usdt || null,
          wallet_ton: shop.wallet_ton || null
        }
      });

    } catch (error) {
      logger.error('Get wallets error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get wallets'
      });
    }
  },

  /**
   * Update shop wallets
   */
  updateWallets: async (req, res) => {
    try {
      const { id } = req.params;
      const { wallet_btc, wallet_eth, wallet_usdt, wallet_ton } = req.body;

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
          error: 'You can only update your own shop wallets'
        });
      }

      // Build update object (only include provided fields)
      const walletUpdates = {};
      if (wallet_btc !== undefined) walletUpdates.wallet_btc = wallet_btc;
      if (wallet_eth !== undefined) walletUpdates.wallet_eth = wallet_eth;
      if (wallet_usdt !== undefined) walletUpdates.wallet_usdt = wallet_usdt;
      if (wallet_ton !== undefined) walletUpdates.wallet_ton = wallet_ton;

      // Update wallets
      const shop = await shopQueries.updateWallets(id, walletUpdates);

      return res.status(200).json({
        success: true,
        data: {
          wallet_btc: shop.wallet_btc || null,
          wallet_eth: shop.wallet_eth || null,
          wallet_usdt: shop.wallet_usdt || null,
          wallet_ton: shop.wallet_ton || null
        }
      });

    } catch (error) {
      logger.error('Update wallets error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update wallets'
      });
    }
  }
};

export default shopController;
