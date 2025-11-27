import { orderQueries, shopQueries, invoiceQueries } from '../database/queries/index.js';
import { getClient } from '../config/database.js';
import { asyncHandler, dbErrorHandler } from '../middleware/errorHandler.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';
import { validateStatusTransition } from '../utils/orderStateValidator.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import {
  validateCartItems,
  validateProductsForOrder,
  validateOrderAccess,
  validateStatusUpdate,
} from '../validators/orderValidator.js';
import {
  createOrderWithItems,
  updateOrderStatusWithStockLogic,
  getOrderAnalytics,
} from '../services/orderService.js';

/**
 * Order Controller
 */
const VALID_ORDER_STATUSES = new Set(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']);
const STATUS_ALIASES = new Map([
  ['completed', 'delivered'],
  ['complete', 'delivered'],
  ['active', 'confirmed'],
]);

const parseStatusFilter = (statusParam) => {
  if (!statusParam) {
    return [];
  }

  const normalized = new Set();

  statusParam
    .split(',')
    .map((status) => status.trim().toLowerCase())
    .filter(Boolean)
    .forEach((status) => {
      const mapped = STATUS_ALIASES.get(status) || status;
      if (VALID_ORDER_STATUSES.has(mapped)) {
        normalized.add(mapped);
      }
    });

  return Array.from(normalized);
};

export const orderController = {
  /**
   * Create new order
   * ✅ MULTI-ITEM SUPPORT: Now accepts either single item or multiple items
   *
   * Request body formats:
   * 1. Legacy (backward compatible):
   *    { productId: 1, quantity: 5, deliveryAddress: null }
   *
   * 2. Multi-item (new):
   *    { items: [{ productId: 1, quantity: 5 }, { productId: 2, quantity: 3 }], deliveryAddress: null }
   */
  create: asyncHandler(async (req, res) => {
    const { deliveryAddress } = req.body;
    const userId = req.user.id;

    // Parse and validate cart items (throws ValidationError if invalid)
    const cartItems = validateCartItems(req.body);

    logger.debug('Creating order with cart', {
      userId,
      itemCount: cartItems.length,
      items: cartItems,
    });

    const client = await getClient();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Validate products (fetch, lock, check stock/shop/currency)
      const validatedData = await validateProductsForOrder(cartItems, client);

      // Prevent self-ordering (buyer = seller)
      const ownerResult = await client.query('SELECT owner_id FROM shops WHERE id = $1', [
        validatedData.shopId,
      ]);
      const ownerId = ownerResult.rows[0]?.owner_id;
      if (ownerId && ownerId === userId) {
        throw new ValidationError('You cannot order your own products');
      }

      logger.info('All products validated', {
        shopId: validatedData.shopId,
        productCount: validatedData.items.length,
        totalPrice: validatedData.totalPrice,
        currency: validatedData.currency,
      });

      // Create order with items
      const order = await createOrderWithItems(userId, validatedData, deliveryAddress, client);

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        data: {
          ...order,
          items: validatedData.items,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error; // asyncHandler forwards to errorHandler
    } finally {
      client.release();
    }
  }),

  /**
   * Get order by ID
   */
  getById: asyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await orderQueries.findById(id);

    if (!order) {
      throw new NotFoundError('Order');
    }

    // Check access (throws UnauthorizedError if denied)
    validateOrderAccess(order, req.user.id);

    return res.json({
      success: true,
      data: order,
    });
  }),

  /**
   * Get orders for current user
   * P0-DB-3 FIX: Add MAX_LIMIT to prevent unbounded queries
   */
  getMyOrders: asyncHandler(async (req, res) => {
      // P0-DB-3 FIX: Enforce maximum limit to prevent memory exhaustion
      const MAX_LIMIT = 1000;
      const requestedLimit = parseInt(req.query.limit, 10) || 50;
      const limit = Math.min(requestedLimit, MAX_LIMIT);

      const page = parseInt(req.query.page, 10) || 1;
      const offset = (page - 1) * limit;
      const type = req.query.type; // 'buyer' or 'seller'
      const hasShopFilter = typeof req.query.shop_id !== 'undefined';
      const shopId = hasShopFilter ? parseInt(req.query.shop_id, 10) : null;
      const statusFilter = parseStatusFilter(req.query.status);

      let orders;

      if (hasShopFilter) {
        if (!Number.isInteger(shopId) || shopId <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid shop_id',
          });
        }

        const shop = await shopQueries.findById(shopId);

        if (!shop) {
          return res.status(404).json({
            success: false,
            error: 'Shop not found',
          });
        }

        if (shop.owner_id !== req.user.id) {
          return res.status(403).json({
            success: false,
            error: 'You can only view your own shop orders',
          });
        }

        orders = await orderQueries.findByShopId(shopId, {
          limit,
          offset,
          statuses: statusFilter,
        });
      } else if (type === 'seller') {
        // Get orders as seller - only if user has shops
        const shops = await shopQueries.findByOwnerId(req.user.id);

        if (!shops || shops.length === 0) {
          return res.status(403).json({
            success: false,
            error: 'You need to create a shop first to view seller orders',
          });
        }

        orders = await orderQueries.findByOwnerId(req.user.id, {
          limit,
          offset,
          statuses: statusFilter,
        });
      } else {
        // Get orders as buyer (default)
        orders = await orderQueries.findByBuyerId(req.user.id, limit, offset);
      }

      return res.json({
        success: true,
        data: orders,
        pagination: {
          page,
          limit,
          maxLimit: MAX_LIMIT,
          hasMore: orders.length === limit,
        },
      });
  }),

  /**
   * Update order status
   * ✅ БАГ #6 FIX: Returns stock when cancelling confirmed orders
   */
  updateStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status: newStatus } = req.body;
    const userId = req.user.id;

    const client = await getClient();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Get order
      const order = await orderQueries.findById(id, client);
      if (!order) {
        throw new NotFoundError('Order');
      }

      // Validate access and status update (throws if invalid)
      const transition = await validateStatusUpdate(order, newStatus, userId);

      // Handle idempotent update (same status requested)
      if (transition.idempotent) {
        await client.query('ROLLBACK');
        logger.info(`Idempotent status update for order ${id}: already in status ${newStatus}`);
        return res.json({
          success: true,
          idempotent: true,
          message: `Order is already in status ${newStatus}`,
          data: order,
        });
      }

      // Update status with stock logic
      await updateOrderStatusWithStockLogic(id, newStatus, order.status, client);

      await client.query('COMMIT');

      // Fetch updated order
      const updatedOrder = await orderQueries.findById(id);

      // Notify buyer about status update
      try {
        await telegramService.notifyOrderStatusUpdate(order.buyer_telegram_id, {
          id: updatedOrder.id,
          status: updatedOrder.status,
          product_name: order.product_name,
        });
      } catch (notifError) {
        logger.error('Notification error', { error: notifError.message });
      }

      return res.json({
        success: true,
        data: updatedOrder,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }),

  /**
   * Get count of active orders (confirmed status)
   */
  getActiveCount: asyncHandler(async (req, res) => {
    const { shop_id: shopId } = req.query;

    if (!shopId) {
      throw new ValidationError('shop_id required');
    }

    // Verify shop ownership
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      throw new NotFoundError('Shop');
    }
    if (shop.owner_id !== req.user.id) {
      throw new UnauthorizedError('Access denied');
    }

    // Count confirmed orders only
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT COUNT(*) as count
         FROM orders o
         JOIN products p ON o.product_id = p.id
         WHERE p.shop_id = $1 AND o.status = 'confirmed'`,
        [shopId]
      );

      const count = parseInt(result.rows[0].count);
      return res.json({
        success: true,
        data: { count },
      });
    } finally {
      client.release();
    }
  }),

  /**
   * Bulk update order status
   */
  bulkUpdateStatus: async (req, res) => {
    const client = await getClient();

    try {
      const { order_ids, status } = req.body;
      const userId = req.user.id;

      // Start transaction - SERIALIZABLE not needed for bulk updates (state validation handles race conditions)
      await client.query('BEGIN');

      // Get all orders with ownership check
      const ordersResult = await client.query(
        `SELECT o.id, o.status as current_status, o.buyer_id,
                p.shop_id, s.owner_id, p.name as product_name,
                u.username as buyer_username, u.telegram_id as buyer_telegram_id
         FROM orders o
         JOIN products p ON o.product_id = p.id
         JOIN shops s ON p.shop_id = s.id
         JOIN users u ON o.buyer_id = u.id
         WHERE o.id = ANY($1::int[])`,
        [order_ids]
      );

      const foundOrders = ordersResult.rows;

      // Check if all orders were found
      if (foundOrders.length !== order_ids.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'One or more orders not found',
        });
      }

      // Verify user owns all shops (authorization check)
      const unauthorized = foundOrders.find((order) => order.owner_id !== userId);
      if (unauthorized) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update these orders',
        });
      }

      // Validate state transitions for all orders before updating
      const invalidTransitions = [];
      for (const order of foundOrders) {
        const transition = validateStatusTransition(order.current_status, status);
        if (!transition.valid && !transition.idempotent) {
          invalidTransitions.push({
            order_id: order.id,
            current_status: order.current_status,
            requested_status: status,
            error: transition.error,
          });
        }
      }

      if (invalidTransitions.length > 0) {
        await client.query('ROLLBACK');
        logger.warn(`Bulk update rejected due to invalid transitions:`, invalidTransitions);
        return res.status(422).json({
          success: false,
          error: 'One or more orders cannot transition to the requested status',
          code: 'INVALID_STATUS_TRANSITIONS',
          details: invalidTransitions,
        });
      }

      // Bulk update status - only for orders that are not already in that status
      const updateResult = await client.query(
        `UPDATE orders
         SET status = $1, updated_at = NOW()
         WHERE id = ANY($2::int[]) AND status != $1
         RETURNING id, status, product_id, buyer_id, quantity, total_price, currency, created_at, updated_at`,
        [status, order_ids]
      );

      const updatedOrders = updateResult.rows;

      // Count idempotent updates (orders already in target status)
      const idempotentCount = foundOrders.length - updatedOrders.length;

      // Commit transaction
      await client.query('COMMIT');

      // Build response with additional details
      const ordersWithDetails = updatedOrders.map((order) => {
        const original = foundOrders.find((o) => o.id === order.id);
        return {
          id: order.id,
          status: order.status,
          product_name: original?.product_name || null,
          buyer_username: original?.buyer_username || null,
          quantity: order.quantity,
          total_price: parseFloat(order.total_price),
          currency: order.currency,
          updated_at: order.updated_at,
        };
      });

      // Send Telegram notifications (non-blocking)
      foundOrders.forEach(async (order) => {
        try {
          if (order.buyer_telegram_id) {
            await telegramService.notifyOrderStatusUpdate(order.buyer_telegram_id, {
              id: order.id,
              status,
              product_name: order.product_name,
            });
          }
        } catch (notifError) {
          logger.error('Bulk notification error', {
            orderId: order.id,
            error: notifError.message,
          });
        }
      });

      return res.status(200).json({
        success: true,
        data: {
          updated_count: updatedOrders.length,
          idempotent_count: idempotentCount,
          total_processed: foundOrders.length,
          orders: ordersWithDetails,
        },
      });
    } catch (error) {
      // Rollback on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Rollback error', { error: rollbackError.message });
      }

      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Bulk update status error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update order statuses',
      });
    } finally {
      client.release();
    }
  },

  /**
   * Generate invoice for order
   * NOTE: HD wallet system removed - order crypto payments temporarily disabled
   */
  generateInvoice: asyncHandler(async (req, res) => {
    // HD wallet system was removed - order crypto payments not available
    throw new ValidationError('Криптовалютная оплата заказов временно недоступна. Используйте другой способ оплаты.');
  }),

  /**
   * Get sales analytics for seller
   */
  getAnalytics: asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const userId = req.user.id;

    // Validate required parameters
    if (!from || !to) {
      throw new ValidationError('Missing required parameters: from and to dates (YYYY-MM-DD format)');
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      throw new ValidationError('Invalid date format. Use YYYY-MM-DD (e.g., 2025-01-01)');
    }

    // Parse dates
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Validate date range
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new ValidationError('Invalid date values');
    }

    if (fromDate > toDate) {
      throw new ValidationError('from date must be before or equal to to date');
    }

    // Check if dates are in the future
    const now = new Date();
    if (fromDate > now) {
      throw new ValidationError('from date cannot be in the future');
    }

    // Get analytics data (delegates to service)
    const analytics = await getOrderAnalytics(userId, fromDate, toDate);

    return res.json({
      success: true,
      data: {
        period: { from, to },
        ...analytics,
      },
    });
  }),
};

export default orderController;
