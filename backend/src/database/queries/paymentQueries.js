import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * Payment database queries
 */
export const paymentQueries = {
  // Create payment record
  // Atomic upsert - prevents race condition with ON CONFLICT
  create: async (paymentData, client = null) => {
    const {
      orderId = null,
      subscriptionId = null,
      txHash,
      amount,
      currency,
      status,
    } = paymentData;
    const queryFn = client ? client.query.bind(client) : query;

    // Atomic INSERT with ON CONFLICT for race-safe upsert
    // xmax = 0 means row was inserted, xmax != 0 means row was updated (conflict)
    const result = await queryFn(
      `INSERT INTO payments (order_id, subscription_id, tx_hash, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tx_hash) WHERE tx_hash IS NOT NULL DO UPDATE SET
         status = CASE
           WHEN payments.status = 'pending' AND EXCLUDED.status = 'confirmed' THEN 'confirmed'
           WHEN payments.status = 'failed' AND EXCLUDED.status IN ('pending', 'confirmed') THEN EXCLUDED.status
           ELSE payments.status
         END,
         updated_at = NOW()
       RETURNING *, (xmax = 0) as is_new`,
      [orderId, subscriptionId, txHash, amount, currency, status]
    );

    const payment = result.rows[0];

    // PROD GUARDRAIL: Flag and log if conflict occurred with different order_id
    if (!payment.is_new && payment.order_id !== orderId) {
      payment._conflictDetected = true;
      logger.warn('[GUARDRAIL] tx_hash conflict detected in create()', {
        txHash: txHash?.substring(0, 20),
        attemptedOrderId: orderId,
        existingOrderId: payment.order_id,
        paymentId: payment.id,
      });
    }

    return payment;
  },

  // Find payment by transaction hash
  findByTxHash: async (txHash, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn('SELECT * FROM payments WHERE tx_hash = $1', [txHash]);
    return result.rows[0];
  },

  // Find payments by order ID
  findByOrderId: async (orderId) => {
    const result = await query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId]
    );
    return result.rows;
  },

  // Update payment status
  updateStatus: async (id, status, confirmations = null, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE payments
       SET status = $2::VARCHAR,
           confirmations = COALESCE($3::INT, confirmations),
           verified_at = CASE WHEN $2 = 'confirmed' THEN NOW() ELSE verified_at END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, confirmations]
    );
    return result.rows[0];
  },

  // Update verification status
  updateVerificationStatus: async (id, { status, confirmations, error }) => {
    const result = await query(
      `UPDATE payments 
       SET verification_status = $2,
           blockchain_confirmations = COALESCE($3, blockchain_confirmations),
           verification_error = $4,
           last_checked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, confirmations, error]
    );
    return result.rows[0];
  },

  // Create payment for direct crypto
  // Atomic upsert - prevents race condition with ON CONFLICT
  createForDirectCrypto: async ({ orderId, txHash, amount, currency, recipientAddress, expectedCryptoAmount }) => {
    // Atomic INSERT with ON CONFLICT for race-safe upsert
    // xmax = 0 means row was inserted, xmax != 0 means row was updated (conflict)
    const result = await query(
      `INSERT INTO payments (order_id, tx_hash, amount, currency, status, verification_status, recipient_address, expected_crypto_amount)
       VALUES ($1, $2, $3, $4, 'pending', 'pending', $5, $6)
       ON CONFLICT (tx_hash) WHERE tx_hash IS NOT NULL DO UPDATE SET
         updated_at = NOW()
       RETURNING *, (xmax = 0) as is_new`,
      [orderId, txHash, amount, currency, recipientAddress, expectedCryptoAmount]
    );

    const payment = result.rows[0];

    // PROD GUARDRAIL: Flag and log if conflict occurred (potential fraud or duplicate tx_hash)
    if (!payment.is_new && payment.order_id !== orderId) {
      payment._conflictDetected = true;
      logger.warn('[GUARDRAIL] tx_hash conflict detected in createForDirectCrypto()', {
        txHash: txHash?.substring(0, 20),
        attemptedOrderId: orderId,
        existingOrderId: payment.order_id,
        paymentId: payment.id,
        currency,
      });
    }

    return payment;
  },
};

export default paymentQueries;
