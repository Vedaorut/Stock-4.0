/**
 * Order Validator for Invoice Payment Processing
 *
 * Validates and locks orders for payment processing within a database transaction.
 * Uses SELECT ... FOR UPDATE to prevent concurrent modifications.
 *
 * @module invoicePayment/validators/orderValidator
 */

import { NotFoundError, UnauthorizedError } from '../../../utils/errors.js';

/**
 * Validates and locks an order for payment processing.
 *
 * Fetches the order with its associated shop owner information and applies
 * a row-level lock (FOR UPDATE) to prevent concurrent modifications.
 *
 * @param {import('pg').PoolClient} client - Database client within a transaction
 * @param {number} orderId - The order ID to validate and lock
 * @param {number|null} actorUserId - The user ID performing the action (null to skip auth check)
 * @param {Object} options - Validation options
 * @param {boolean} [options.allowSeller=false] - Whether to allow shop owner access
 * @returns {Promise<Object>} The locked order object with owner_id from shop
 * @throws {NotFoundError} If order doesn't exist
 * @throws {UnauthorizedError} If actor is not buyer or (when allowed) seller
 */
export async function validateAndLockOrder(client, orderId, actorUserId, { allowSeller = false } = {}) {
  const orderResult = await client.query(
    `SELECT o.*,
            COALESCE(s.owner_id, ps.owner_id) AS owner_id
       FROM orders o
       LEFT JOIN shops s ON s.id = o.shop_id
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN shops ps ON ps.id = p.shop_id
      WHERE o.id = $1
      FOR UPDATE OF o`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    throw new NotFoundError('Order');
  }

  const order = orderResult.rows[0];

  if (actorUserId) {
    const isBuyer = order.buyer_id === actorUserId;
    const isSeller = allowSeller && order.owner_id === actorUserId;

    if (!isBuyer && !isSeller) {
      throw new UnauthorizedError('Access denied');
    }
  }

  return order;
}
