import { orderQueries, productQueries, shopQueries } from '../models/db.js';
import { dbErrorHandler } from '../middleware/errorHandler.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';

/**
 * Order Controller
 */
export const orderController = {
  /**
   * Create new order
   */
  create: async (req, res) => {
    try {
      const { productId, quantity, deliveryAddress } = req.body;

      // Get product details
      const product = await productQueries.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      if (!product.is_active) {
        return res.status(400).json({
          success: false,
          error: 'Product is not available'
        });
      }

      // Check stock
      if (product.stock_quantity < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Available: ${product.stock_quantity}`
        });
      }

      // Calculate total price
      const totalPrice = product.price * quantity;

      // Create order
      const order = await orderQueries.create({
        buyerId: req.user.id,
        productId,
        quantity,
        totalPrice,
        currency: product.currency,
        deliveryAddress
      });

      // Decrease product stock
      await productQueries.updateStock(productId, -quantity);

      // Notify seller about new order
      try {
        await telegramService.notifyNewOrder(product.owner_id, {
          id: order.id,
          product_name: product.name,
          total_price: totalPrice,
          currency: product.currency,
          buyer_username: req.user.username
        });
      } catch (notifError) {
        logger.error('Notification error', { error: notifError.message, stack: notifError.stack });
        // Don't fail the order creation if notification fails
      }

      return res.status(201).json({
        success: true,
        data: order
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

      logger.error('Create order error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to create order'
      });
    }
  },

  /**
   * Get order by ID
   */
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      const order = await orderQueries.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Check if user has access to this order
      if (order.buyer_id !== req.user.id && order.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      return res.status(200).json({
        success: true,
        data: order
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

      logger.error('Get order error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get order'
      });
    }
  },

  /**
   * Get orders for current user
   */
  getMyOrders: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const type = req.query.type; // 'buyer' or 'seller'

      let orders;

      if (type === 'seller') {
        // Get orders as seller - only if user has shops
        const shops = await shopQueries.findByOwnerId(req.user.id);

        if (!shops || shops.length === 0) {
          return res.status(403).json({
            success: false,
            error: 'You need to create a shop first to view seller orders'
          });
        }

        orders = await orderQueries.findByOwnerId(req.user.id, limit, offset);
      } else {
        // Get orders as buyer (default)
        orders = await orderQueries.findByBuyerId(req.user.id, limit, offset);
      }

      return res.status(200).json({
        success: true,
        data: orders,
        pagination: {
          page,
          limit,
          total: orders.length
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

      logger.error('Get my orders error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get orders'
      });
    }
  },

  /**
   * Update order status
   */
  updateStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Get order
      const existingOrder = await orderQueries.findById(id);

      if (!existingOrder) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Only seller can update order status (except cancellation)
      if (status !== 'cancelled' && existingOrder.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Only seller can update order status'
        });
      }

      // Buyer can cancel their own pending orders
      if (status === 'cancelled' && existingOrder.buyer_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only cancel your own orders'
        });
      }

      const order = await orderQueries.updateStatus(id, status);

      // Notify buyer about status update
      try {
        await telegramService.notifyOrderStatusUpdate(existingOrder.buyer_telegram_id, {
          id: order.id,
          status: order.status,
          product_name: existingOrder.product_name
        });
      } catch (notifError) {
        logger.error('Notification error', { error: notifError.message, stack: notifError.stack });
      }

      return res.status(200).json({
        success: true,
        data: order
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

      logger.error('Update order status error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update order status'
      });
    }
  }
};

export default orderController;
