import { query } from '../../config/database.js';

/**
 * Invoice database queries for CrystalPay payment gateway
 */
export const invoiceQueries = {
  /**
   * Create CrystalPay invoice (no address needed - external payment gateway)
   * @param {Object} params
   * @param {number} params.subscriptionId - Subscription ID
   * @param {string} params.purpose - Payment purpose
   * @param {string} params.currency - Currency (USD)
   * @param {number} params.amount - Amount to pay
   * @returns {Promise<Object>} Created invoice
   */
  createForCrystalPay: async ({ subscriptionId, purpose, currency, amount }) => {
    const result = await query(
      `INSERT INTO invoices (subscription_id, chain, address, address_index,
       expected_amount, currency, expires_at, status, purpose)
       VALUES ($1, 'CRYSTALPAY', NULL, NULL, $2, $3, NOW() + INTERVAL '1 hour', 'pending', $4)
       RETURNING *`,
      [subscriptionId, amount, currency, purpose]
    );
    return result.rows[0];
  },

  // Find invoice by ID
  findById: async (id) => {
    const result = await query('SELECT * FROM invoices WHERE id = $1', [id]);
    return result.rows[0];
  },

  // Find invoice by order ID
  findByOrderId: async (orderId) => {
    const result = await query(
      'SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );
    return result.rows[0];
  },

  /**
   * Find invoice by CrystalPay invoice ID
   * @param {string} crystalPayId - CrystalPay external invoice ID
   * @param {Object} client - Optional pg client for transactions
   */
  findByCrystalPayId: async (crystalPayId, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      'SELECT * FROM invoices WHERE crystalpay_id = $1',
      [crystalPayId]
    );
    return result.rows[0];
  },

  /**
   * Set CrystalPay invoice ID on existing invoice
   * @param {number} invoiceId - Our internal invoice ID
   * @param {string} crystalPayId - CrystalPay external invoice ID
   */
  setCrystalPayId: async (invoiceId, crystalPayId, client = null) => {
    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      'UPDATE invoices SET crystalpay_id = $2 WHERE id = $1 RETURNING *',
      [invoiceId, crystalPayId]
    );
    return result.rows[0];
  },

  // Update invoice status
  updateStatus: async (id, status, txHash = null, client = null) => {
    const normalizedStatus = String(status);
    const isPaid = normalizedStatus === 'paid';

    const queryFn = client ? client.query.bind(client) : query;
    const result = await queryFn(
      `UPDATE invoices
       SET status = $2::VARCHAR,
           paid_at = CASE WHEN $4::BOOLEAN THEN NOW() ELSE paid_at END,
           tx_hash = COALESCE($3::VARCHAR, tx_hash),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, normalizedStatus, txHash, isPaid]
    );
    return result.rows[0];
  },

  // Find expired invoices (for cleanup)
  findExpired: async () => {
    const result = await query(
      `SELECT * FROM invoices
       WHERE status = 'pending'
       AND expires_at < NOW()`,
      []
    );
    return result.rows;
  },
};

export default invoiceQueries;
