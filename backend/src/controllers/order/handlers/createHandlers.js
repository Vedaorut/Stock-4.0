import { getClient } from '../../../config/database.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import { ValidationError } from '../../../utils/errors.js';
import { validateCartItems, validateProductsForOrder } from '../../../validators/orderValidator.js';
import { createOrderWithItems } from '../../../services/orderService.js';

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

  const client = await getClient();
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');

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
