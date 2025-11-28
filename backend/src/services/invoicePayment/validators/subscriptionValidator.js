/**
 * Subscription Validator for Invoice Payment Processing
 *
 * Validates and locks shop subscriptions for payment processing within a database transaction.
 * Uses SELECT ... FOR UPDATE to prevent concurrent modifications.
 *
 * @module invoicePayment/validators/subscriptionValidator
 */

import { NotFoundError, UnauthorizedError } from '../../../utils/errors.js';

/**
 * Validates and locks a shop subscription for payment processing.
 *
 * Fetches the subscription and applies a row-level lock (FOR UPDATE) to prevent
 * concurrent modifications. Separately fetches the shop owner_id without locking
 * the shops table (only the subscription row needs to be locked).
 *
 * @param {import('pg').PoolClient} client - Database client within a transaction
 * @param {number} subscriptionId - The subscription ID to validate and lock
 * @param {number|null} actorUserId - The user ID performing the action (null to skip auth check)
 * @returns {Promise<Object>} The locked subscription object with owner_id attached
 * @throws {NotFoundError} If subscription doesn't exist
 * @throws {UnauthorizedError} If actor is not the subscription owner
 */
export async function validateAndLockSubscription(client, subscriptionId, actorUserId) {
  // Lock the subscription row first (without join to avoid FOR UPDATE on nullable side)
  const subResult = await client.query(
    `SELECT * FROM shop_subscriptions WHERE id = $1 FOR UPDATE`,
    [subscriptionId]
  );

  if (subResult.rows.length === 0) {
    throw new NotFoundError('Subscription');
  }

  const subscription = subResult.rows[0];

  // Get owner_id separately (no lock needed for this check)
  let owner_id = subscription.user_id;
  if (subscription.shop_id) {
    const shopResult = await client.query(
      `SELECT owner_id FROM shops WHERE id = $1`,
      [subscription.shop_id]
    );
    if (shopResult.rows.length > 0) {
      owner_id = shopResult.rows[0].owner_id;
    }
  }

  subscription.owner_id = owner_id;

  if (actorUserId && subscription.owner_id !== actorUserId) {
    throw new UnauthorizedError('Not authorized to manage this subscription');
  }

  return subscription;
}
