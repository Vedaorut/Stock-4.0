import { productQueries, shopQueries } from '../models/db.js';
import { dbErrorHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * Product Controller
 */
export const productController = {
  /**
   * Create new product
   */
  create: async (req, res) => {
    try {
      const {
        shopId,
        name,
        description,
        price
      } = req.body;
      const stockQuantity = req.body.stockQuantity ?? req.body.stock ?? 0;
      // Currency is now legacy field - products are priced in USD only
      const currency = req.body.currency || 'USD';

      // Verify shop belongs to user
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
          error: 'You can only add products to your own shops'
        });
      }

      const product = await productQueries.create({
        shopId,
        name,
        description,
        price,
        currency,
        stockQuantity
      });

      return res.status(201).json({
        success: true,
        data: product
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

      logger.error('Create product error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to create product'
      });
    }
  },

  /**
   * Get product by ID
   */
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      const product = await productQueries.findById(id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: product
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

      logger.error('Get product error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get product'
      });
    }
  },

  /**
   * List products with filters
   */
  list: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const filters = {
        shopId: req.query.shopId ? parseInt(req.query.shopId) : undefined,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : true,
        limit,
        offset
      };

      const products = await productQueries.list(filters);

      return res.status(200).json({
        success: true,
        data: products,
        pagination: {
          page,
          limit,
          total: products.length
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

      logger.error('List products error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to list products'
      });
    }
  },

  /**
   * Update product
   */
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        price,
        isActive
      } = req.body;
      const stockQuantity = req.body.stockQuantity ?? req.body.stock;

      // Check if product exists and belongs to user's shop
      const existingProduct = await productQueries.findById(id);

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      if (existingProduct.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only update your own products'
        });
      }

      const product = await productQueries.update(id, {
        name,
        description,
        price,
        stockQuantity,
        isActive
      });

      return res.status(200).json({
        success: true,
        data: product
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

      logger.error('Update product error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update product'
      });
    }
  },

  /**
   * Delete product
   */
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if product exists and belongs to user's shop
      const existingProduct = await productQueries.findById(id);

      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      if (existingProduct.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only delete your own products'
        });
      }

      await productQueries.delete(id);

      return res.status(200).json({
        success: true,
        message: 'Product deleted successfully'
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

      logger.error('Delete product error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete product'
      });
    }
  },

  /**
   * Bulk delete all products from a shop
   */
  bulkDeleteAll: async (req, res) => {
    try {
      const { shopId } = req.body;

      // Verify shop belongs to user
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
          error: 'You can only delete products from your own shops'
        });
      }

      const deletedProducts = await productQueries.bulkDeleteByShopId(shopId);

      return res.status(200).json({
        success: true,
        message: `${deletedProducts.length} product(s) deleted successfully`,
        data: {
          deletedCount: deletedProducts.length,
          deletedProducts
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

      logger.error('Bulk delete all products error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete products'
      });
    }
  },

  /**
   * Bulk delete specific products by IDs
   */
  bulkDeleteByIds: async (req, res) => {
    try {
      const { shopId, productIds } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'productIds must be a non-empty array'
        });
      }

      // Verify shop belongs to user
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
          error: 'You can only delete products from your own shops'
        });
      }

      const deletedProducts = await productQueries.bulkDeleteByIds(productIds, shopId);

      return res.status(200).json({
        success: true,
        message: `${deletedProducts.length} product(s) deleted successfully`,
        data: {
          deletedCount: deletedProducts.length,
          deletedProducts
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

      logger.error('Bulk delete products error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete products'
      });
    }
  }
};

export default productController;
