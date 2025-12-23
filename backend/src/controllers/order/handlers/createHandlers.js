import { getClient } from '../../../config/database.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import { ValidationError } from '../../../utils/errors.js';
import { validateCartItems, validateProductsForOrder } from '../../../validators/orderValidator.js';
import { createOrderWithItems, updateOrderStatusWithStockLogic } from '../../../services/orderService.js';
import { orderQueries } from '../../../database/queries/index.js';
import {
  INVOICE_EXPIRY_SECONDS,
  MAX_PENDING_ORDERS_PER_USER,
} from '../../../config/payments.js';
import { getCancellationCooldown } from '../../../services/orderAbuseService.js';
import { broadcast } from '../../../utils/websocket.js';

/**
 * Create new order (supports multi-item)
 */
export const create = asyncHandler(async (req, res) => {
  const { deliveryAddress } = req.body;
  const userId = req.user.id;

  const cartItems = validateCartItems(req.body);

  logger.debug('Creating order with cart', {
    userId,
    itemCount: cartItems.length,
    items: cartItems,
  });

  const buildPendingOrderResponse = (order) => {
    const baseTime = order.updated_at || order.created_at;
    const expiresAt = baseTime
      ? new Date(new Date(baseTime).getTime() + INVOICE_EXPIRY_SECONDS * 1000).toISOString()
      : null;
    const expiresIn = baseTime
      ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      : null;

    return {
      id: order.id,
      status: order.status,
      total_price: order.total_price,
      currency: order.currency,
      payment_address: order.payment_address,
      crypto_amount: order.crypto_amount,
      crypto_currency: order.crypto_currency,
      payment_hash: order.payment_hash,
      shop_id: order.shop_id,
      shop_name: order.shop_name,
      product_name: order.product_name,
      expiresAt,
      expiresIn,
      updated_at: order.updated_at,
      created_at: order.created_at,
    };
  };

  const client = await getClient();
  const autoCancelledIds = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');

    // Abuse protection: cancellation cooldown
    const cooldown = await getCancellationCooldown(userId);
    if (cooldown.blocked) {
      throw new ValidationError(
        `Too many cancelled orders. Try again in ${cooldown.remainingMinutes} minutes.`,
        { code: 'CANCELLATION_COOLDOWN', retryAfter: cooldown.remainingSeconds }
      );
    }

    const pendingPaid = await orderQueries.findPendingWithPaymentHashByBuyer(userId, client);
    if (pendingPaid) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'You already have a pending payment under verification',
        order: buildPendingOrderResponse(pendingPaid),
      });
    }

    const pendingToCancel = await orderQueries.findCancellablePendingByBuyer(
      userId,
      client
    );

    if (pendingToCancel.length > 0) {
      for (const pending of pendingToCancel) {
        await updateOrderStatusWithStockLogic(
          pending.id,
          'cancelled',
          pending.status,
          client
        );
        autoCancelledIds.push(pending.id);
      }
    }

    // Pending order limit (re-check after auto-cancel)
    const pendingCount = await orderQueries.countPendingByBuyer(
      userId,
      INVOICE_EXPIRY_SECONDS,
      client
    );
    if (pendingCount >= MAX_PENDING_ORDERS_PER_USER) {
      throw new ValidationError('Complete or cancel your pending orders first', {
        code: 'PENDING_LIMIT',
      });
    }

    const validatedData = await validateProductsForOrder(cartItems, client);

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

    const order = await createOrderWithItems(userId, validatedData, deliveryAddress, client);

    await client.query('COMMIT');

    if (autoCancelledIds.length > 0) {
      autoCancelledIds.forEach((orderId) => {
        broadcast('order_status', {
          orderId,
          status: 'cancelled',
        });
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        ...order,
        items: validatedData.items,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
