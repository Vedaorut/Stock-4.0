import { orderQueries, shopQueries, workerQueries } from '../../../database/queries/index.js';
import { getClient } from '../../../config/database.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import telegramService from '../../../services/telegram.js';
import logger from '../../../utils/logger.js';
import { validateStatusUpdate } from '../../../validators/orderValidator.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../utils/errors.js';
import { updateOrderStatusWithStockLogic } from '../../../services/orderService.js';
import { broadcast } from '../../../utils/websocket.js';

/**
 * Update order status
 * ✅ БАГ #6 FIX: Returns stock when cancelling confirmed orders
 */
export const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: newStatus } = req.body;
  const userId = req.user.id;

  const client = await getClient();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const order = await orderQueries.findById(id, client);
    if (!order) {
      throw new NotFoundError('Order');
    }

    const transition = await validateStatusUpdate(order, newStatus, userId);

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

    await updateOrderStatusWithStockLogic(id, newStatus, order.status, client);

    await client.query('COMMIT');

    const updatedOrder = await orderQueries.findById(id);

    // Emit WebSocket event for real-time updates
    broadcast('order_status', {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      shopId: order.shop_id,
    });

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
});

/**
 * Get count of active orders (confirmed status)
 */
export const getActiveCount = asyncHandler(async (req, res) => {
  const { shop_id: shopId } = req.query;

  if (!shopId) {
    throw new ValidationError('shop_id required');
  }

  const shop = await shopQueries.findById(shopId);
  if (!shop) {
    throw new NotFoundError('Shop');
  }
  const isOwner = shop.owner_id === req.user.id;
  const isWorker = await workerQueries.findByShopAndUser(shopId, req.user.id);

  if (!isOwner && !isWorker) {
    throw new UnauthorizedError('Access denied');
  }

  const client = await getClient();
  try {
    // P1-004 FIX: Use o.shop_id directly instead of JOIN products
    // This ensures orders remain visible even if product is deleted
    const result = await client.query(
      `SELECT COUNT(*) as count
         FROM orders o
         WHERE o.shop_id = $1 AND o.status = 'confirmed'`,
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
});
