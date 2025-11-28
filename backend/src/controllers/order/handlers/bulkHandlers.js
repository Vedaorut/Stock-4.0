import { getClient } from '../../../config/database.js';
import { orderQueries } from '../../../database/queries/index.js';
import telegramService from '../../../services/telegram.js';
import logger from '../../../utils/logger.js';
import { validateStatusTransition } from '../../../utils/orderStateValidator.js';
import { respondWithDbError } from '../utils/errors.js';

/**
 * Bulk update order status
 */
export const bulkUpdateStatus = async (req, res) => {
  const client = await getClient();

  try {
    const { order_ids, status } = req.body;
    const userId = req.user.id;

    await client.query('BEGIN');

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

    if (foundOrders.length !== order_ids.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'One or more orders not found',
      });
    }

    const unauthorized = foundOrders.find((order) => order.owner_id !== userId);
    if (unauthorized) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update these orders',
      });
    }

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

    const updateResult = await client.query(
      `UPDATE orders
         SET status = $1, updated_at = NOW()
         WHERE id = ANY($2::int[]) AND status != $1
         RETURNING id, status, product_id, buyer_id, quantity, total_price, currency, created_at, updated_at`,
      [status, order_ids]
    );

    const updatedOrders = updateResult.rows;
    const idempotentCount = foundOrders.length - updatedOrders.length;

    await client.query('COMMIT');

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
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Rollback error', { error: rollbackError.message });
    }

    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Bulk update status error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to update order statuses',
    });
  } finally {
    client.release();
  }
};
