import { query } from '../../config/database.js';

/**
 * Payment database queries
 */
export const paymentQueries = {
  // Create payment record
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
    const result = await queryFn(
      `INSERT INTO payments (order_id, subscription_id, tx_hash, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tx_hash) DO UPDATE
       SET status = CASE
         WHEN payments.status = 'pending' AND EXCLUDED.status = 'confirmed' THEN 'confirmed'
         WHEN payments.status = 'failed' AND EXCLUDED.status IN ('pending', 'confirmed') THEN EXCLUDED.status
         ELSE payments.status
       END,
       updated_at = NOW()
       RETURNING *`,
      [orderId, subscriptionId, txHash, amount, currency, status]
    );
    return result.rows[0];
  },

  // Find payment by transaction hash
  findByTxHash: async (txHash) => {
    const result = await query('SELECT * FROM payments WHERE tx_hash = $1', [txHash]);
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
};

export default paymentQueries;
